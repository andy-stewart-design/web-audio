import { createStructuredInput, RandomCycle } from "@web-audio/patterns";
import { describe, expect, it, vi } from "vitest";
import Drome from "@/drome";
import Envelope from "@/automations/envelope";
import Lfo from "@/automations/lfo";
import { MidiCc } from "@/midi/builders";
import type { AudioParamInput } from "../parameter";
import Parameter from "../parameter";
import {
  resolveAudioParam,
  resolveAudioParamValue,
} from "../resolve-audio-param";

describe("resolveAudioParam", () => {
  it("preserves supported modulation source identity", () => {
    const envelope = new Envelope(0, 1);
    const lfo = new Lfo(0, 1);
    const midi = new MidiCc(74);

    expect(resolveAudioParam([envelope])).toBe(envelope);
    expect(resolveAudioParam([lfo])).toBe(lfo);
    expect(resolveAudioParam([midi])).toBe(midi);
  });

  it("preserves contextual MIDI schema defaults through the source", () => {
    const midi = new MidiCc(74);

    expect(resolveAudioParam([midi])).toBe(midi);
    expect(midi.getSchema("frequency")).toMatchObject({
      range: { min: 20, max: 20_000, curve: "exponential" },
      default: 1_000,
    });
  });

  it("constructs a numeric Parameter for ordinary input", () => {
    const parameter = resolveAudioParam([0.25, [0.5, 0.75]]);

    expect(parameter).toBeInstanceOf(Parameter);
    expect(parameter.getSchema()).toEqual({
      type: "static",
      cycle: [[0.25], [0.5, 0.75]],
    });
  });

  it("retains the existing random source path", () => {
    const random = new RandomCycle().steps(1).range(0, 1);
    const parameter = resolveAudioParam([random]);

    random.steps(2, 3);

    expect(parameter).toBeInstanceOf(Parameter);
    expect(parameter.getSchema()).toMatchObject({
      type: "random-number",
      valuesPerBar: [2, 3],
    });
  });

  it("keeps numeric validation deferred to Parameter serialization", () => {
    expect(() => resolveAudioParam([Number.NaN])).not.toThrow();
    expect(() => resolveAudioParam([[]])).not.toThrow();
    expect(() => resolveAudioParam([Number.NaN]).getSchema()).toThrow(
      "ValueCycle cycle[0] must contain only finite numbers",
    );
    expect(() => resolveAudioParam([[]]).getSchema()).toThrow(
      "ValueCycle cannot serialize an empty bar",
    );
  });

  it("does not unwrap tuples with unsupported shapes", () => {
    const envelope = new Envelope(0, 1);
    const invalidTuple = [envelope, 1] as unknown as AudioParamInput;
    const parameter = resolveAudioParam(invalidTuple);

    expect(parameter).toBeInstanceOf(Parameter);
    expect(parameter).not.toBe(envelope);
    expect(() => parameter.getSchema()).toThrow();
  });
});

describe("resolveAudioParamValue", () => {
  it("resolves one scalar, shorthand, or structured value", () => {
    const drome = new Drome();

    expect(resolveAudioParamValue(0.25, "[Test] value()").getSchema()).toEqual({
      type: "static",
      cycle: [[0.25]],
    });
    expect(
      resolveAudioParamValue("0.2 0.8", "[Test] value()").getSchema(),
    ).toEqual({
      type: "static",
      cycle: [[0.2, 0.8]],
    });
    expect(
      resolveAudioParamValue(drome.sh("0.2 0.8"), "[Test] value()").getSchema(),
    ).toEqual({
      type: "static",
      cycle: [[0.2, 0.8]],
    });
    expect(
      resolveAudioParamValue(
        drome.str([0.2, 0.8], 1.2),
        "[Test] value()",
      ).getSchema(),
    ).toEqual({
      type: "static",
      cycle: [[0.2, 0.8], [1.2]],
    });
    expect(
      resolveAudioParamValue(
        createStructuredInput(0.2, 0.8),
        "[Test] value()",
      ).getSchema(),
    ).toEqual({
      type: "static",
      cycle: [[0.2], [0.8]],
    });
  });

  it("rejects invalid atomic values without reading raw arrays", () => {
    const drome = new Drome();
    const read = vi.fn(() => 0.2);
    const raw = Array<unknown>(1_000_000_000);
    Object.defineProperty(raw, 0, { get: read });
    const invalid: unknown[] = [
      undefined,
      null,
      raw,
      [0.2, 0.3],
      new Parameter(0.2),
      {},
      true,
      drome.str("0.2"),
      drome.str("~"),
      drome.str([[0.2, 0.3]]),
      drome.str([]),
    ];

    for (const value of invalid) {
      expect(() =>
        Reflect.apply(resolveAudioParamValue, undefined, [
          value,
          "[Test] value()",
        ]),
      ).toThrow("[Test] value()");
    }
    expect(read).not.toHaveBeenCalled();
    expect(() => resolveAudioParamValue(Number.NaN, "[Test] value()")).toThrow(
      "[Test] value()",
    );
  });

  it("preserves direct source identity without eager schema or random sampling", () => {
    const drome = new Drome();
    const envelope = new Envelope();
    const lfo = new Lfo(0, 1);
    const midi = drome.midi.cc(74);
    const random = new RandomCycle();
    const spies = [
      vi.spyOn(envelope, "getSchema"),
      vi.spyOn(lfo, "getSchema"),
      vi.spyOn(midi, "getSchema"),
      vi.spyOn(random, "getRandomSchema"),
    ];

    expect(resolveAudioParamValue(envelope, "[Test] value()")).toBe(envelope);
    expect(resolveAudioParamValue(lfo, "[Test] value()")).toBe(lfo);
    expect(resolveAudioParamValue(midi, "[Test] value()")).toBe(midi);
    expect(resolveAudioParamValue(random, "[Test] value()")).toBeInstanceOf(
      Parameter,
    );
    expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });
});
