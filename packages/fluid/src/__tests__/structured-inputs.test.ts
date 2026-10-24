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

  it("keeps positional ADSR wrapper inputs excluded without partial updates", () => {
    const d = new Drome();
    const envelope = d.env().adsr(0.01, 0.2, 0.7, 0.3);
    const instrument = d.synth().adsr(0.01, 0.2, 0.7, 0.3);
    const previousEnvelope = envelope.getSchema();
    const previousGain = instrument.getSchema().gain;
    const wrappers = [d.str(0.2)];

    for (const wrapped of wrappers) {
      const args = [0.1, 0.3, 0.8, wrapped];
      expect(() => Reflect.apply(envelope.adsr, envelope, args)).toThrow(
        "positional structured inputs are not supported",
      );
      expect(() => Reflect.apply(instrument.adsr, instrument, args)).toThrow(
        "positional structured inputs are not supported",
      );
      expect(envelope.getSchema()).toEqual(previousEnvelope);
      expect(instrument.getSchema().gain).toEqual(previousGain);
    }

    const typeChecks = () => {
      // @ts-expect-error Static positional ADSR wrappers are deferred.
      envelope.adsr(d.str(0.2), 0.2, 0.7, 0.3);
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
