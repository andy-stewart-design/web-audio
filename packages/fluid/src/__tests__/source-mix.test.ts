import { describe, expect, expectTypeOf, it } from "vitest";
import Drome from "@/drome";
import type Synthesizer from "@/instruments/synthesizer";
import type UnisonSynthesizer from "@/instruments/unison-synthesizer";
import {
  synthEngineAliasMap,
  synthSelectorAliasMap,
  type SynthEngineAlias,
  type SynthSelector,
} from "@/inputs/waveform";

function staticValue(schema: { type: "static"; cycle: number[][] }) {
  return schema.cycle[0]![0];
}

describe("main source gain authoring", () => {
  it("keeps selector dispatch ahead of gain-string decoding", () => {
    const d = new Drome();
    const saw = d.synth("saw", 0.5).getSchema();
    const shorthand = d.synth("0.5").getSchema();
    const explicitUndefined = d.synth(undefined, 0.5).getSchema();

    expect(saw.waveform).toBe("sawtooth");
    expect(
      staticValue(saw.sourceGain! as { type: "static"; cycle: number[][] }),
    ).toBe(0.5);
    expect(shorthand.waveform).toBe("sine");
    expect(
      staticValue(
        shorthand.sourceGain! as { type: "static"; cycle: number[][] },
      ),
    ).toBe(0.5);
    expect(explicitUndefined).toEqual(shorthand);
  });

  it("canonicalizes every registered synth engine alias", () => {
    const d = new Drome();
    const aliases = Object.keys(synthEngineAliasMap) as Array<
      keyof typeof synthEngineAliasMap
    >;

    for (const alias of aliases) {
      expect(synthSelectorAliasMap[alias]).toBe(synthEngineAliasMap[alias]);
      expect(d.synth(alias).getSchema().engine).toBe("unison");
    }
  });

  it("accepts every single-slot representation and uses the gain MIDI context", () => {
    const d = new Drome();
    const midi = d.midi.cc(74);
    const schemas = [
      d.synth(0.25).getSchema(),
      d.synth(d.sh("0.25")).getSchema(),
      d.synth(d.str(0.25)).getSchema(),
      d.synth(midi).getSchema(),
    ];

    expect(schemas.slice(0, 3).map((schema) => schema.sourceGain)).toEqual([
      { type: "static", cycle: [[0.25]] },
      { type: "static", cycle: [[0.25]] },
      { type: "static", cycle: [[0.25]] },
    ]);
    expect(schemas[3]?.sourceGain).toMatchObject({
      type: "midi-cc",
      range: { min: 0, max: 1, curve: "linear" },
      default: 1,
    });
  });

  it("preserves negative and above-one static gain patterns across input forms", () => {
    const d = new Drome();
    const reusable = d.sh("-0.5 1.5");
    const structured = d.str([-0.5, 1.5]);
    const scalar = d.synth(-0.5).getSchema().sourceGain;
    const scalarAboveOne = d.synth(1.5).getSchema().sourceGain;
    const direct = d.synth("-0.5 1.5").getSchema().sourceGain;
    const reused = d.synth(reusable).getSchema().sourceGain;
    const wrapped = d.synth(structured).getSchema().sourceGain;

    expect(scalar).toEqual({ type: "static", cycle: [[-0.5]] });
    expect(scalarAboveOne).toEqual({ type: "static", cycle: [[1.5]] });
    expect(direct).toEqual({ type: "static", cycle: [[-0.5, 1.5]] });
    expect(reused).toEqual(direct);
    expect(wrapped).toEqual(direct);
    expect(reusable.source).toBe("-0.5 1.5");
    expect(structured.values).toEqual([[-0.5, 1.5]]);
  });

  it("retains concrete basic and unison types", () => {
    expectTypeOf<SynthEngineAlias>().toEqualTypeOf<"unison" | "uni">();
    const d = new Drome();
    const basic = d.synth("saw", 0.5);
    const unison = d.synth("unison", 0.5);
    const selector = "saw" as SynthSelector;
    const selectorUnion = d.synth(selector, 0.5);

    expectTypeOf(basic.type).toBeFunction();
    expectTypeOf(unison).toMatchTypeOf<UnisonSynthesizer>();
    expectTypeOf(unison.voices).toBeFunction();
    expectTypeOf(unison.spread).toBeFunction();
    expectTypeOf(unison.width).toBeFunction();
    expectTypeOf(basic.sub).toBeFunction();
    expectTypeOf(unison.sub).toBeFunction();
    expectTypeOf(selectorUnion).toEqualTypeOf<
      Synthesizer | UnisonSynthesizer
    >();

    const invalid = () => {
      // @ts-expect-error Gain-only slots reject raw arrays.
      d.synth([0.2, 0.5]);
      // @ts-expect-error Two-argument synth calls require a supported selector.
      d.synth("unknown", 0.2);
      // @ts-expect-error Source gain accepts one positional value only.
      d.synth("saw", 0.2, 0.5);
    };
    expectTypeOf(invalid).toBeFunction();
  });

  it("treats explicit undefined gain as omitted for supported selectors", () => {
    const d = new Drome();
    const basic = d.synth("saw", undefined);
    const unison = d.synth("uni", undefined);
    const defaultSynth = d.synth(undefined, undefined);

    expectTypeOf(basic).toEqualTypeOf<Synthesizer>();
    expectTypeOf(unison).toEqualTypeOf<UnisonSynthesizer>();
    expectTypeOf(defaultSynth).toEqualTypeOf<Synthesizer>();

    for (const synth of [basic, unison, defaultSynth]) {
      const schema = synth.getSchema();
      expect(schema).not.toHaveProperty("sourceGain");
    }
    expect(basic.getSchema()).toEqual(d.synth("saw").getSchema());
    expect(unison.getSchema()).toEqual(d.synth("uni").getSchema());
    expect(defaultSynth.getSchema()).toEqual(d.synth().getSchema());
  });

  it("rejects malformed gain slots without constructing a partial synth", () => {
    const d = new Drome();
    expect(() => Reflect.apply(d.synth, d, [[0.2, 0.5]])).toThrow();
    expect(() => Reflect.apply(d.synth, d, ["saw", [0.2, 0.5]])).toThrow();
    expect(() => Reflect.apply(d.synth, d, ["saw", 0.2, 0.5])).toThrow();
    expect(() => Reflect.apply(d.synth, d, ["unknown", 0.2])).toThrow();
    expect(() => Reflect.apply(d.synth, d, ["unknown", undefined])).toThrow();
    expect(() => Reflect.apply(d.synth, d, [0.5, undefined])).toThrow();
  });
});
