import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import Envelope from "@/automations/envelope";
import Lfo from "@/automations/lfo";
import { MidiCc } from "@/midi/builders";
import type { AudioParamInput } from "../parameter";
import Parameter from "../parameter";
import { resolveAudioParam } from "../resolve-audio-param";

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
