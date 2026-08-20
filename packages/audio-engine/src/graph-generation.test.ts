import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DromeSchema } from "@web-audio/schema";

vi.mock("@/buses/bus", () => {
  function MockBus(
    this: Record<string, unknown>,
    _ctx: unknown,
    _clock: unknown,
    options: { destination: unknown },
  ) {
    this.input = new FakeNode();
    this.destination = options.destination;
    this.scheduleBar = vi.fn();
    this.stop = vi.fn();
    this.connectMidi = vi.fn();
    this.disconnectMidi = vi.fn();
    this.destroy = vi.fn();
  }
  return { default: vi.fn(MockBus) };
});

function instrumentMock() {
  return function MockInstrument(
    this: Record<string, unknown>,
    _ctx: unknown,
    _clock: unknown,
    options: { destination: unknown },
  ) {
    this.destination = options.destination;
    this.scheduleBar = vi.fn();
    this.cancelFutureNotes = vi.fn();
    this.connectMidi = vi.fn();
    this.disconnectMidi = vi.fn();
    this.retire = vi.fn();
    this.destroy = vi.fn();
    this.load = vi.fn();
    this.fallbackBufferFor = vi.fn(() => null);
    let resolve!: () => void;
    this.finished = new Promise<void>((done) => {
      resolve = done;
    });
    this.resolveFinished = resolve;
  };
}

vi.mock("@/instruments/synthesizer", () => ({
  default: vi.fn(instrumentMock()),
}));
vi.mock("@/instruments/sampler", () => ({
  default: vi.fn(instrumentMock()),
}));

import Bus from "@/buses/bus";
import GraphGeneration from "./graph-generation";
import Synthesizer from "@/instruments/synthesizer";

class FakeParam {
  value = 0;
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}

class FakeNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

function schema(): DromeSchema {
  return {
    instruments: [
      {
        type: "synthesizer",
        route: "main",
        sends: {},
        ducks: {},
        effects: [],
      } as never,
    ],
    buses: {
      main: { gain: 1, effects: [] },
      drums: { gain: 0.8, effects: [] },
    },
    banks: {},
  };
}

function setup() {
  const gains: FakeGain[] = [];
  const ctx = {
    currentTime: 0,
    createGain: vi.fn(() => {
      const gain = new FakeGain();
      gains.push(gain);
      return gain;
    }),
  } as unknown as AudioContext;
  const destination = new FakeNode();
  const generation = GraphGeneration.create({
    ctx,
    schema: schema(),
    destination: destination as unknown as AudioNode,
    cache: {
      resolved: new Map(),
      promises: new Map(),
      reversed: new WeakMap(),
    },
    timing: { barDuration: 2, startingBar: 3, barStartTime: 6 },
  });
  return { ctx, destination, gains, generation };
}

type MockInstrument = {
  destination: unknown;
  scheduleBar: ReturnType<typeof vi.fn>;
  cancelFutureNotes: ReturnType<typeof vi.fn>;
  retire: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  resolveFinished: () => void;
};

function instruments() {
  return vi.mocked(Synthesizer).mock.instances as unknown as MockInstrument[];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Bus).mockImplementation(function (
    this: Record<string, unknown>,
    _ctx: unknown,
    _clock: unknown,
    options: { destination: unknown },
  ) {
    this.input = new FakeNode();
    this.destination = options.destination;
    this.scheduleBar = vi.fn();
    this.stop = vi.fn();
    this.connectMidi = vi.fn();
    this.disconnectMidi = vi.fn();
    this.destroy = vi.fn();
  } as never);
});
afterEach(() => vi.useRealTimers());

describe("GraphGeneration", () => {
  it("builds retirement, main, named buses, and instruments in graph order", () => {
    const { destination, gains } = setup();
    const buses = vi.mocked(Bus).mock.instances as unknown as Array<{
      input: unknown;
      destination: unknown;
    }>;

    expect(gains[0].connect).toHaveBeenCalledWith(destination);
    expect(buses[0].destination).toBe(gains[0]);
    expect(buses[1].destination).toBe(buses[0].input);
    expect(instruments()[0].destination).toBe(buses[0].input);
  });

  it("schedules buses before instruments and stops both owners", () => {
    const { generation } = setup();
    const buses = vi.mocked(Bus).mock.instances as unknown as Array<{
      scheduleBar: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    }>;

    generation.scheduleBar(4, 8);
    generation.stop();

    expect(buses[0].scheduleBar).toHaveBeenCalledWith(4, 8);
    expect(buses[0].scheduleBar.mock.invocationCallOrder[0]).toBeLessThan(
      instruments()[0].scheduleBar.mock.invocationCallOrder[0],
    );
    expect(buses[0].stop).toHaveBeenCalledOnce();
    expect(instruments()[0].cancelFutureNotes).toHaveBeenCalledOnce();
  });

  it("cleans completed resources when construction fails", () => {
    const mainDestroy = vi.fn();
    vi.mocked(Bus).mockImplementationOnce(function (
      this: Record<string, unknown>,
    ) {
      this.input = new FakeNode();
      this.destroy = mainDestroy;
    } as never);
    vi.mocked(Bus).mockImplementationOnce(function () {
      throw new Error("named bus failed");
    } as never);
    const ctx = {
      createGain: () => new FakeGain(),
    } as unknown as AudioContext;

    expect(() =>
      GraphGeneration.create({
        ctx,
        schema: schema(),
        destination: new FakeNode() as unknown as AudioNode,
        cache: {
          resolved: new Map(),
          promises: new Map(),
          reversed: new WeakMap(),
        },
        timing: { barDuration: 2, startingBar: 0, barStartTime: 0 },
      }),
    ).toThrow("named bus failed");

    expect(mainDestroy).toHaveBeenCalledOnce();
  });

  it("waits in audio time, then fades retirement gain for exactly 0.01 seconds", async () => {
    vi.useFakeTimers();
    const { ctx, gains, generation } = setup();
    generation.retire();
    instruments()[0].resolveFinished();
    await Promise.resolve();
    await Promise.resolve();

    Object.assign(ctx, { currentTime: 0.1 });
    await vi.advanceTimersByTimeAsync(10);
    expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 0.11);

    Object.assign(ctx, { currentTime: 0.11 });
    await vi.advanceTimersByTimeAsync(10);
    await expect(generation.finished).resolves.toBeUndefined();
  });

  it("terminal destroy cancels retirement and resolves lifecycle", async () => {
    vi.useFakeTimers();
    const { generation } = setup();
    generation.retire();
    instruments()[0].resolveFinished();
    await Promise.resolve();

    generation.destroy();

    await expect(generation.finished).resolves.toBeUndefined();
    expect(instruments()[0].destroy).toHaveBeenCalledOnce();
  });
});
