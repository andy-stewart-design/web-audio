import type AudioClock from "@web-audio/clock";
import type {
  BankSchema,
  SamplerSchema,
  TimingSchema,
} from "@web-audio/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultSamplerSchema,
  fileBank,
  staticNumberPattern,
} from "../test-utils/schema-fixtures";
import SampleBufferCache from "./sample-buffer-cache";
import Sampler from "./sampler";

class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}

class FakeGainNode {
  static instances: FakeGainNode[] = [];
  gain = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();
  constructor() {
    FakeGainNode.instances.push(this);
  }
}

class FakeBufferSourceNode {
  static instances: FakeBufferSourceNode[] = [];
  detune = new FakeAudioParam();
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();
  constructor(
    _ctx: AudioContext,
    readonly options: AudioBufferSourceOptions,
  ) {
    FakeBufferSourceNode.instances.push(this);
  }
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  createGain() {
    return new FakeGainNode();
  }
  decodeAudioData = vi.fn();
}

const timing = (
  cycle: TimingSchema["cycle"] = [[{ offset: 0, duration: 1 }]],
): TimingSchema => ({ cycle });

function cache(entries: Record<string, AudioBuffer>) {
  const value = new SampleBufferCache(
    new FakeAudioContext() as unknown as AudioContext,
  );
  vi.spyOn(value, "get").mockImplementation((url) => entries[url] ?? null);
  vi.spyOn(value, "prepare").mockImplementation(
    async (url) => entries[url] ?? null,
  );
  return value;
}

function buffer(duration = 1) {
  return { duration } as AudioBuffer;
}

function schema(overrides: Partial<SamplerSchema> = {}) {
  return defaultSamplerSchema({
    gain: {
      type: "envelope",
      min: 0,
      max: staticNumberPattern([1]),
      a: staticNumberPattern([0]),
      d: staticNumberPattern([0]),
      s: staticNumberPattern([1]),
      r: staticNumberPattern([0]),
      mode: "bleed",
    },
    ...overrides,
  });
}

async function sampler(
  samplerSchema: SamplerSchema,
  banks: Record<string, BankSchema> = fileBank(),
  buffers = cache({ "https://example.com/bd.wav": buffer() }),
) {
  const instance = new Sampler(
    new FakeAudioContext() as unknown as AudioContext,
    { barDuration: 2 } as AudioClock,
    { schema: samplerSchema, banks, cache: buffers },
  );
  await instance.load();
  return instance;
}

beforeEach(() => {
  FakeGainNode.instances = [];
  FakeBufferSourceNode.instances = [];
  vi.stubGlobal("GainNode", FakeGainNode);
  vi.stubGlobal("AudioBufferSourceNode", FakeBufferSourceNode);
});

afterEach(() => vi.unstubAllGlobals());

describe("Sampler scheduling", () => {
  it("plays a natural-pitch sampler at rate one", async () => {
    const instance = await sampler(schema());

    instance.scheduleBar(0, 10);

    expect(FakeBufferSourceNode.instances).toHaveLength(1);
    expect(FakeBufferSourceNode.instances[0].options.playbackRate).toBe(1);
    expect(FakeBufferSourceNode.instances[0].start).toHaveBeenCalledWith(10);
  });

  it("selects the nearest source key for pitched voices", async () => {
    const banks: Record<string, BankSchema> = fileBank();
    banks.kit.samples.bd = {
      "48": [{ type: "file", src: "https://example.com/48.wav" }],
      "60": [{ type: "file", src: "https://example.com/60.wav" }],
    };
    const instance = await sampler(
      schema({
        events: {
          timing: timing(),
          notes: { type: "static", cycle: [[[62]]] },
          sampleNames: { type: "static", cycle: [[["bd"]]] },
        },
      }),
      banks,
      cache({
        "https://example.com/48.wav": buffer(),
        "https://example.com/60.wav": buffer(),
      }),
    );

    instance.scheduleBar(0, 10);

    expect(FakeBufferSourceNode.instances[0].options.playbackRate).toBeCloseTo(
      Math.pow(2, 2 / 12),
    );
  });

  it("selects source keys independently for each resolved sample name", async () => {
    const banks: Record<string, BankSchema> = fileBank();
    banks.kit.samples.piano = {
      "48": [{ type: "file", src: "https://example.com/48.wav" }],
      "60": [{ type: "file", src: "https://example.com/60.wav" }],
    };
    const instance = await sampler(
      schema({
        events: {
          timing: timing(),
          notes: { type: "static", cycle: [[[0, 62]]] },
          sampleNames: { type: "static", cycle: [[["bd", "piano"]]] },
        },
      }),
      banks,
      cache({
        "https://example.com/bd.wav": buffer(),
        "https://example.com/48.wav": buffer(),
        "https://example.com/60.wav": buffer(),
      }),
    );

    instance.scheduleBar(0, 10);

    expect(FakeBufferSourceNode.instances).toHaveLength(2);
    expect(
      FakeBufferSourceNode.instances.map(({ options }) => options.playbackRate),
    ).toEqual([1, expect.closeTo(Math.pow(2, 2 / 12))]);
  });

  it("resolves variation and processing values by final surviving hit", async () => {
    const banks = fileBank("kit", "bd", [
      "https://example.com/0.wav",
      "https://example.com/1.wav",
    ]);
    const candidateTiming = timing([
      Array.from({ length: 8 }, (_, index) => ({
        offset: index / 8,
        duration: 0.125,
      })),
    ]);
    candidateTiming.condition = {
      type: "chance",
      probability: 0.5,
      segments: [{ seed: 42 }],
      algorithm: "xor",
      order: "forward",
    };
    const instance = await sampler(
      schema({
        events: {
          timing: candidateTiming,
          sampleNames: { type: "static", cycle: [[["bd"]]] },
          variationIndices: { type: "static", cycle: [[[0], [1]]] },
        },
        detune: staticNumberPattern([10, 20]),
      }),
      banks,
      cache({
        "https://example.com/0.wav": buffer(1),
        "https://example.com/1.wav": buffer(2),
      }),
    );

    instance.scheduleBar(0, 10);

    expect(FakeBufferSourceNode.instances).toHaveLength(6);
    expect(
      FakeBufferSourceNode.instances.map(({ options }) => options.detune),
    ).toEqual([10, 20, 10, 20, 10, 20]);
    expect(
      FakeBufferSourceNode.instances.map(
        ({ options }) => options.buffer?.duration,
      ),
    ).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it("schedules layered voices with one shared event hit", async () => {
    const instance = await sampler(
      schema({
        events: {
          timing: timing(),
          notes: { type: "static", cycle: [[[60, 64]]] },
          sampleNames: { type: "static", cycle: [[["bd"]]] },
          variationIndices: { type: "static", cycle: [[[0, 0]]] },
        },
        detune: staticNumberPattern([25, 50]),
      }),
    );

    instance.scheduleBar(0, 10);

    expect(FakeBufferSourceNode.instances).toHaveLength(2);
    expect(
      FakeBufferSourceNode.instances.map(({ options }) => options.detune),
    ).toEqual([25, 25]);
  });

  it("preserves static region and clip duration behavior", async () => {
    const instance = await sampler(
      schema({
        events: {
          timing: timing([[{ offset: 0.5, duration: 0.5 }]]),
          sampleNames: { type: "static", cycle: [[["bd"]]] },
        },
        region: {
          type: "static",
          start: staticNumberPattern([0.25]),
          end: staticNumberPattern([0.75]),
        },
      }),
      fileBank(),
      cache({ "https://example.com/bd.wav": buffer(4) }),
    );

    instance.scheduleBar(0, 10);

    expect(FakeBufferSourceNode.instances[0].start).toHaveBeenCalledWith(11, 1);
    expect(FakeBufferSourceNode.instances[0].stop).toHaveBeenCalledWith(
      expect.closeTo(12.0525),
    );
  });

  it("preserves chop wrapping and fit timing", async () => {
    const instance = await sampler(
      schema({
        events: {
          timing: timing([[{ offset: 0, duration: 2 }]]),
          sampleNames: { type: "static", cycle: [[["bd"]]] },
        },
        fit: { type: "fit", bars: 2 },
        region: {
          type: "chop",
          slices: [
            { start: 0, end: 0.5 },
            { start: 0.5, end: 1 },
          ],
          sequence: staticNumberPattern([-1]),
        },
      }),
      fileBank(),
      cache({ "https://example.com/bd.wav": buffer(4) }),
    );

    instance.scheduleBar(0, 10);

    expect(FakeBufferSourceNode.instances[0].start).toHaveBeenCalledWith(10, 2);
    expect(FakeBufferSourceNode.instances[0].options.playbackRate).toBe(1);
    expect(FakeBufferSourceNode.instances[0].stop).toHaveBeenCalledWith(
      expect.closeTo(14.0525),
    );
  });

  it("skips empty timing bars without resolving resources", async () => {
    const instance = await sampler(
      schema({
        events: {
          timing: timing([[], [{ offset: 0, duration: 1 }]]),
          sampleNames: { type: "static", cycle: [[null], [["bd"]]] },
        },
      }),
    );

    instance.scheduleBar(0, 10);

    expect(FakeBufferSourceNode.instances).toHaveLength(0);
  });
});
