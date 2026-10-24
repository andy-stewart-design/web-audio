import { describe, expect, it } from "vitest";
import { createStructuredInput, isStructuredInput } from "@web-audio/patterns";
import type { NumberPattern } from "@web-audio/schema";
import Drome from "@/drome";
import Envelope from "@/automations/envelope";
import GainEffect from "@/effects/gain";
import Filter from "@/effects/filter";
import Sampler from "@/instruments/sampler";
import UnisonSynthesizer from "@/instruments/unison-synthesizer";

function staticCycle(pattern: { type: string; cycle?: number[][] }) {
  expect(pattern.type).toBe("static");
  if (pattern.type !== "static" || pattern.cycle === undefined) {
    throw new Error("Expected a static numeric pattern");
  }
  return pattern.cycle;
}

function samplerRegion(sampler: Sampler) {
  const region = sampler.getSchema().region;
  if (!region || region.type !== "static") {
    throw new Error("Expected a static sampler region");
  }
  return region;
}

function requiredPattern(pattern: NumberPattern | undefined) {
  if (!pattern) throw new Error("Expected a sampler region pattern");
  return pattern;
}

describe("public structured numeric inputs", () => {
  it("uses shared-package values without sharing consumer arrays", () => {
    const d = new Drome();
    const bar = [0.2, 0.1];
    const shared = createStructuredInput(bar);
    bar[0] = 0.9;
    const first = d.synth().gain(shared);
    const second = d.synth().gain(shared);

    expect(isStructuredInput(d.str(0.4))).toBe(true);
    expect(isStructuredInput(shared)).toBe(true);
    const firstCycle = staticCycle(first.getSchema().gain.max);
    firstCycle[0][0] = 0.7;
    expect(staticCycle(second.getSchema().gain.max)).toEqual([[0.2, 0.1]]);
    expect(shared.getValues()).toEqual([[0.2, 0.1]]);
  });

  it("accepts reusable values through every numeric setter and alias", () => {
    const d = new Drome();
    const values = d.str(0.2, 0.1);
    const expected = [[0.2], [0.1]];
    const envelope = d
      .env()
      .max(values)
      .a(values)
      .d(values)
      .s(values)
      .r(values);
    const synth = d.synth().gain(values).detune(values);
    const filter = d.filter("lp", values).q(values).detune(values).gain(values);
    const unison = new UnisonSynthesizer()
      .voices(values)
      .spread(values)
      .width(values);
    const samplerStart = new Sampler("bd").start(values);
    const samplerEnd = new Sampler("bd").end(values);
    const samplerDuration = new Sampler("bd").duration(values);
    const samplerAlias = new Sampler("bd").start(values).dur(values);
    const samplerInstrument = new Sampler("bd").detune(values).gain(values);
    const gain = new GainEffect(values);
    const gainFactory = d.gain(values);
    const aliases = [d.lpf(values), d.hpf(values), d.bpf(values)];

    expect(staticCycle(envelope.getSchema().max)).toEqual(expected);
    expect(staticCycle(envelope.getSchema().a)).toEqual(expected);
    expect(staticCycle(envelope.getSchema().d)).toEqual(expected);
    expect(staticCycle(envelope.getSchema().s)).toEqual(expected);
    expect(staticCycle(envelope.getSchema().r)).toEqual(expected);
    expect(staticCycle(synth.getSchema().detune)).toEqual(expected);
    expect(staticCycle(synth.getSchema().gain.max)).toEqual(expected);
    expect(staticCycle(filter.getSchema().frequency)).toEqual(expected);
    expect(staticCycle(filter.getSchema().q)).toEqual(expected);
    expect(staticCycle(filter.getSchema().detune)).toEqual(expected);
    expect(staticCycle(filter.getSchema().gain)).toEqual(expected);
    expect(staticCycle(unison.getSchema().voices)).toEqual(expected);
    expect(staticCycle(unison.getSchema().spread)).toEqual(expected);
    expect(staticCycle(unison.getSchema().width)).toEqual(expected);
    expect(
      staticCycle(requiredPattern(samplerRegion(samplerStart).start)),
    ).toEqual(expected);
    expect(staticCycle(requiredPattern(samplerRegion(samplerEnd).end))).toEqual(
      expected,
    );
    expect(
      staticCycle(requiredPattern(samplerRegion(samplerDuration).duration)),
    ).toEqual(expected);
    expect(
      staticCycle(requiredPattern(samplerRegion(samplerAlias).duration)),
    ).toEqual(expected);
    expect(staticCycle(gain.getSchema().gain)).toEqual(expected);
    expect(staticCycle(gainFactory.getSchema().gain)).toEqual(expected);
    expect(staticCycle(samplerInstrument.getSchema().detune)).toEqual(expected);
    expect(staticCycle(samplerInstrument.getSchema().gain.max)).toEqual(
      expected,
    );
    expect(
      aliases.map((alias) => staticCycle(alias.getSchema().frequency)),
    ).toEqual([expected, expected, expected]);
    const defaults = d.env();
    expect(defaults.max(values)).toBe(defaults);
    expect(defaults.max()).toBe(defaults);
    expect(staticCycle(defaults.getSchema().max)).toEqual([[1]]);
  });

  it("keeps wrapped sampler region validation and bounds semantics", () => {
    const d = new Drome();
    const valid = new Sampler("bd").start(d.str(0.2)).end(d.str(0.8));
    expect(samplerRegion(valid).start).toMatchObject({
      type: "static",
      cycle: [[0.2]],
    });
    expect(samplerRegion(valid).end).toMatchObject({
      type: "static",
      cycle: [[0.8]],
    });

    expect(() => new Sampler("bd").start(d.str(1.1)).getSchema()).toThrow(
      "in [0, 1]",
    );
    expect(() =>
      new Sampler("bd").start(d.str(0.8)).end(d.str(0.2)).getSchema(),
    ).toThrow("must be less than end");
  });

  it("preserves gain envelope state when numeric gain uses a wrapper", () => {
    const d = new Drome();
    const envelope = d
      .env(0.4, 0.8)
      .a(0.01)
      .d(0.2)
      .s(0.7)
      .r(0.3)
      .mode("bounded");
    const instrument = d.synth().gain(envelope);
    const before = instrument.getSchema().gain;

    instrument.gain(d.str(0.1, 0.2));
    const after = instrument.getSchema().gain;

    expect(after.min).toEqual(before.min);
    expect(after.a).toEqual(before.a);
    expect(after.d).toEqual(before.d);
    expect(after.s).toEqual(before.s);
    expect(after.r).toEqual(before.r);
    expect(after.mode).toBe(before.mode);
    expect(staticCycle(after.max)).toEqual([[0.1], [0.2]]);
  });

  it("fails wrapped numeric values without shorthand reinterpretation", () => {
    const d = new Drome();
    const instrument = d.synth().detune(0.75);
    const previous = instrument.getSchema().detune;
    for (const source of ["0.2", "0.2 0.1"]) {
      const wrappedString = d.str(source);
      expect(() =>
        Reflect.apply(instrument.detune, instrument, [wrappedString]),
      ).toThrow("finite number");
      expect(instrument.getSchema().detune).toEqual(previous);
    }
    expect(() => instrument.detune(d.str([]))).toThrow("cannot be empty");
    expect(instrument.getSchema().detune).toEqual(previous);
  });

  it("preserves direct random configuration through public numeric setters", () => {
    const d = new Drome();
    const random = d.rand().steps(1).range(0, 1);
    const envelope = d.env(random).a(random);
    const instrument = d.synth().gain(random).detune(random);
    const noise = d.synth().noise("pink", random);
    const gain = d.gain(random);

    random.steps(2, 0);
    const expected = random.getRandomSchema();
    expect(envelope.getSchema().max).toEqual(expected);
    expect(envelope.getSchema().a).toEqual(expected);
    expect(instrument.getSchema().gain.max).toEqual(expected);
    expect(instrument.getSchema().detune).toEqual(expected);
    expect(noise.getSchema().noise?.gain).toEqual(expected);
    expect(gain.getSchema().gain).toEqual(expected);
  });

  it("accepts one static structured value per positional ADSR field", () => {
    const d = new Drome();
    const envelope = d.env(d.str(0, 0.1), d.str(1, 0.8)).mode("bounded");
    const instrument = d.synth();
    const previousEnvelope = envelope.getSchema();
    const previousGain = instrument.getSchema().gain;
    const fields = [
      d.str(0.01, 0.02),
      d.sh("0.2 0.3"),
      0.7,
      d.str([0.2, 0.4], 0.6),
    ] as const;

    envelope.adsr(...fields);
    instrument.adsr(...fields);
    const expected = {
      a: { type: "static", cycle: [[0.01], [0.02]] },
      d: { type: "static", cycle: [[0.2, 0.3]] },
      s: { type: "static", cycle: [[0.7]] },
      r: { type: "static", cycle: [[0.2, 0.4], [0.6]] },
    };
    expect(envelope.getSchema()).toEqual({ ...previousEnvelope, ...expected });
    expect(instrument.getSchema().gain).toEqual({
      ...previousGain,
      ...expected,
    });

    const typeChecks = () => {
      // @ts-expect-error Random positional inputs are not permitted.
      instrument.adsr(d.rand(), 0.2, 0.7, 0.3);
    };
    void typeChecks;
  });
  it("leaves direct modulation sources on their existing path", () => {
    const d = new Drome();
    const envelope = new Envelope(0, 1);
    const lfo = d.lfo(0, 1);
    const midi = d.midi.cc("controller", 74);

    expect(d.synth().detune(envelope).getSchema().detune).toEqual(
      envelope.getSchema(),
    );
    expect(d.synth().detune(lfo).getSchema().detune).toEqual(lfo.getSchema());
    expect(new Filter("lp", midi).getSchema().frequency).toEqual(
      midi.getSchema("frequency"),
    );
  });
});

describe("public structured event inputs", () => {
  it("preserves note bars, chords, authored rest slots, and empty bars", () => {
    const d = new Drome();
    const notes = createStructuredInput([60, null, [64, 67]], [], [62]);
    const wrapped = d
      .synth()
      .notes(notes)
      .xox(d.str([1, 1, 1, 1]));
    const legacy = d
      .synth()
      .notes([60, null, [64, 67]], [], [62])
      .xox([1, 1, 1, 1]);
    expect(wrapped.getSchema().eventPattern).toEqual(
      legacy.getSchema().eventPattern,
    );

    const bars = d.synth().notes(d.str(60, 64)).getSchema().eventPattern;
    const steps = d
      .synth()
      .notes(d.str([60, 64]))
      .getSchema().eventPattern;
    expect(bars).toEqual(d.synth().notes(60, 64).getSchema().eventPattern);
    expect(steps).toEqual(d.synth().notes([60, 64]).getSchema().eventPattern);
    expect(bars.timing.cycle).toHaveLength(2);
    expect(steps.timing.cycle).toHaveLength(1);
  });

  it("preserves layered names, variations, rests, and the var alias", () => {
    const d = new Drome();
    const names = createStructuredInput([["bd", "hh"], null, "sd"], []);
    const variations = d.str([[0, 1], null, 2], []);
    const wrapped = new Sampler(undefined).name(names).variation(variations);
    const alias = new Sampler(undefined).name(names).var(variations);
    const legacy = new Sampler(undefined)
      .name([["bd", "hh"], null, "sd"], [])
      .variation([[0, 1], null, 2], []);
    expect(wrapped.getSchema().eventPattern).toEqual(
      legacy.getSchema().eventPattern,
    );
    expect(alias.getSchema().eventPattern).toEqual(
      legacy.getSchema().eventPattern,
    );
  });

  it("keeps structured numeric XOX distinct from direct compact notation", () => {
    const d = new Drome();
    expect(
      d
        .synth()
        .xox(d.str([1, 0, -2, 0.5], []))
        .getSchema().eventPattern,
    ).toEqual(d.synth().xox([1, 0, -2, 0.5], []).getSchema().eventPattern);

    const compact = d.synth().xox("xoxo").getSchema().eventPattern;
    expect(d.synth().xox(d.sh("xoxo")).getSchema().eventPattern).toEqual(
      compact,
    );
    expect(d.synth().xox("1 0 1 0").getSchema().eventPattern).toEqual(compact);
    expect(() =>
      Reflect.apply(d.synth().xox, d.synth(), [d.str("xoxo")]),
    ).toThrow("finite numbers");
  });

  it("reuses deep event snapshots without sharing mutable consumer output", () => {
    const d = new Drome();
    const chord = [60, 64];
    const bar = [chord, null, 67];
    const notes = d.str(bar);
    chord[0] = 99;
    bar.push(72);
    const first = d.synth().notes(notes);
    const second = d.synth().notes(notes);
    const expected = d
      .synth()
      .notes([[60, 64], null, 67])
      .getSchema().eventPattern;
    expect(first.getSchema().eventPattern).toEqual(expected);
    expect(second.getSchema().eventPattern).toEqual(expected);

    const snapshot = first.getSchema().eventPattern;
    if (snapshot.notes.type !== "static")
      throw new Error("Expected static notes");
    const firstChord = snapshot.notes.cycle[0][0];
    if (!Array.isArray(firstChord)) throw new Error("Expected a chord");
    Reflect.set(firstChord, 0, 100);
    expect(second.getSchema().eventPattern).toEqual(expected);
    expect(notes.getValues()).toEqual([[[60, 64], null, 67]]);
  });

  it("retains direct random metadata and chance when composing wrapped masks", () => {
    const d = new Drome();
    const notes = d.rand().int().steps(2, 0).range(48, 72).ribbon(7);
    const variations = d.rand().int().steps(2).range(0, 3).ribbon(11);
    const rhythm = d.rand().bin().steps(4).chance(0.25).ribbon(13);
    const wrapped = new Sampler("bd")
      .notes(notes)
      .variation(variations)
      .xox(rhythm)
      .xox(d.str([1, 0, 1, 0]));
    const legacy = new Sampler("bd")
      .notes(notes)
      .var(variations)
      .xox(rhythm)
      .xox([1, 0, 1, 0]);
    const before = wrapped.getSchema().eventPattern;
    expect(before).toEqual(legacy.getSchema().eventPattern);
    expect(before.timing.condition).toMatchObject({
      probability: 0.25,
      segments: [{ seed: 13 }],
    });

    notes.steps(1).range(0, 1).ribbon(99);
    variations.steps(1).ribbon(99);
    rhythm.steps(1).chance(1).ribbon(99);
    expect(wrapped.getSchema().eventPattern).toEqual(before);
  });

  it("constrains each public event wrapper to its consumer's atom types", () => {
    const d = new Drome();
    const sampler = new Sampler("bd");
    const typeChecks = () => {
      d.synth().notes(d.str(60, null));
      sampler.name(d.str("bd", null));
      sampler.variation(d.str(0, null));
      sampler.var(d.str(0, null));
      sampler.xox(d.str(1, 0));
      d.synth().notes(d.rand());
      sampler.variation(d.rand());
      sampler.var(d.rand());
      sampler.xox(d.rand().bin());
      // @ts-expect-error Notes require numeric atoms, not numeric strings.
      sampler.notes(d.str("60"));
      // @ts-expect-error Names require string atoms.
      sampler.name(d.str(60));
      // @ts-expect-error Variations require numeric atoms.
      sampler.variation(d.str("0"));
      // @ts-expect-error The alias retains numeric variation atom restrictions.
      sampler.var(d.str("0"));
      // @ts-expect-error Structured XOX does not accept rests as null atoms.
      sampler.xox(d.str(null));
      // @ts-expect-error Compact XOX strings are not structured numeric masks.
      sampler.xox(d.str("xoxo"));
      // @ts-expect-error Names do not accept direct random sources.
      sampler.name(d.rand());
      // @ts-expect-error A wrapper must occupy the whole notes argument list.
      sampler.notes(d.str(60), 64);
      // @ts-expect-error A wrapper cannot be mixed with other name bars.
      sampler.name(d.str("bd"), "sd");
      // @ts-expect-error A wrapper cannot be mixed with other variation bars.
      sampler.variation(d.str(0), 1);
      // @ts-expect-error The var alias requires a sole wrapper too.
      sampler.var(d.str(0), 1);
      // @ts-expect-error XOX wrappers cannot be mixed with other bars.
      sampler.xox(d.str(1), 0);
      // @ts-expect-error Wrappers cannot be nested inside raw note bars.
      sampler.notes([d.str(60)]);
    };
    void typeChecks;
  });
});
