import { describe, expect, it } from "vitest";
import Drome from "./index";

describe("Drome", () => {
  describe("default schema", () => {
    it("includes a gain EnvelopeSchema with defaults when .gain() is not called", () => {
      const d = new Drome();
      d.synth("triangle").push();
      const schema = d.getSchema().instruments[0];

      expect(schema.gain.type).toBe("envelope");
      expect(schema.gain.min).toBe(0);
      expect(schema.gain.mode).toBe("bleed");
    });

    it("default gain max resolves to 1", () => {
      const d = new Drome();
      d.synth("triangle").push();
      const { gain } = d.getSchema().instruments[0];

      expect(gain.max.type).toBe("static");
      if (gain.max.type === "static") {
        expect(gain.max.cycle[0][0].value).toBe(1);
      }
    });

    it("default detune resolves to 0", () => {
      const d = new Drome();
      d.synth("triangle").push();
      const { detune } = d.getSchema().instruments[0];

      expect(detune.type).toBe("static");
      if (detune.type === "static") {
        expect(detune.cycle[0][0].value).toBe(0);
      }
    });
  });

  describe(".gain()", () => {
    it("accepts a static number and wraps it in an EnvelopeSchema", () => {
      const d = new Drome();
      d.synth("triangle").gain(0.75).push();
      const { gain } = d.getSchema().instruments[0];

      expect(gain.type).toBe("envelope");
      expect(gain.min).toBe(0);
      if (gain.max.type === "static") {
        expect(gain.max.cycle[0][0].value).toBe(0.75);
      }
    });

    it("accepts a cycling max value", () => {
      const d = new Drome();
      d.synth("triangle").gain([0.5, 1.0], [0.75, 1.25]).push();
      const { gain } = d.getSchema().instruments[0];

      expect(gain.max.type).toBe("static");
      if (gain.max.type === "static") {
        expect(gain.max.cycle).toHaveLength(2);
      }
    });

    it("accepts an Envelope instance", () => {
      const d = new Drome();
      const env = d.env(0, 0.5).adsr(0.5, 0.25, 0.8, 0.1).mode("clip");
      d.synth("triangle").gain(env).push();
      const { gain } = d.getSchema().instruments[0];

      expect(gain.type).toBe("envelope");
      expect(gain.min).toBe(0);
      expect(gain.mode).toBe("clip");
      if (gain.max.type === "static") {
        expect(gain.max.cycle[0][0].value).toBe(0.5);
      }
      if (gain.a.type === "static") {
        expect(gain.a.cycle[0][0].value).toBe(0.5);
      }
      if (gain.d.type === "static") {
        expect(gain.d.cycle[0][0].value).toBe(0.25);
      }
      if (gain.s.type === "static") {
        expect(gain.s.cycle[0][0].value).toBe(0.8);
      }
      if (gain.r.type === "static") {
        expect(gain.r.cycle[0][0].value).toBe(0.1);
      }
    });

    it("accepts a RandomCycle as max", () => {
      const d = new Drome();
      d.synth("triangle").gain(d.rand()).push();
      const { gain } = d.getSchema().instruments[0];

      expect(gain.max.type).toBe("random");
    });
  });

  describe(".detune()", () => {
    it("accepts a static number and produces a ParameterSchema", () => {
      const d = new Drome();
      d.synth("triangle").detune(100).push();
      const { detune } = d.getSchema().instruments[0];

      expect(detune.type).toBe("static");
      if (detune.type === "static") {
        expect(detune.cycle[0][0].value).toBe(100);
      }
    });

    it("accepts an Envelope instance and produces an EnvelopeSchema", () => {
      const d = new Drome();
      const env = d.env(0, 400).adsr(0.3, 0.2, 0.5, 0.1);
      d.synth("triangle").detune(env).push();
      const { detune } = d.getSchema().instruments[0];

      expect(detune.type).toBe("envelope");
      if (detune.type === "envelope") {
        expect(detune.min).toBe(0);
        if (detune.max.type === "static") {
          expect(detune.max.cycle[0][0].value).toBe(400);
        }
      }
    });
  });

  describe("d.env()", () => {
    it("returns an Envelope with correct min and max", () => {
      const d = new Drome();
      const schema = d.env(0, 0.75).getSchema();

      expect(schema.type).toBe("envelope");
      expect(schema.min).toBe(0);
      if (schema.max.type === "static") {
        expect(schema.max.cycle[0][0].value).toBe(0.75);
      }
    });

    it("defaults min to 0 and max to 1 when called with no args", () => {
      const d = new Drome();
      const schema = d.env().getSchema();

      expect(schema.min).toBe(0);
      if (schema.max.type === "static") {
        expect(schema.max.cycle[0][0].value).toBe(1);
      }
    });
  });

  describe("filter factories", () => {
    it("lpf alias matches filter('lp', ...)", () => {
      const d = new Drome();
      expect(d.lpf(800).getSchema()).toEqual(d.filter("lp", 800).getSchema());
    });

    it("hpf produces filterType hp", () => {
      const schema = new Drome().hpf(2400).getSchema();
      expect(schema.filterType).toBe("hp");
      if (schema.frequency.type === "static") {
        expect(schema.frequency.cycle[0][0].value).toBe(2400);
      }
    });

    it("bpf produces filterType bp", () => {
      const schema = new Drome().bpf(1000).getSchema();
      expect(schema.filterType).toBe("bp");
      if (schema.frequency.type === "static") {
        expect(schema.frequency.cycle[0][0].value).toBe(1000);
      }
    });
  });

  describe("effects on synthesizer", () => {
    it("no effects: effects array is empty", () => {
      const d = new Drome();
      expect(d.synth().getSchema().effects).toEqual([]);
    });

    it("single effect via fx()", () => {
      const d = new Drome();
      const schema = d.synth().fx(d.lpf(800)).getSchema();
      expect(schema.effects).toHaveLength(1);
      expect(
        schema.effects[0].type === "filter" && schema.effects[0].filterType,
      ).toBe("lp");
    });

    it("variadic fx(): order preserved", () => {
      const d = new Drome();
      const schema = d.synth().fx(d.lpf(800), d.hpf(200)).getSchema();
      expect(schema.effects).toHaveLength(2);
      expect(
        schema.effects[0].type === "filter" && schema.effects[0].filterType,
      ).toBe("lp");
      expect(
        schema.effects[1].type === "filter" && schema.effects[1].filterType,
      ).toBe("hp");
    });

    it("chained fx() calls accumulate", () => {
      const d = new Drome();
      const schema = d.synth().fx(d.lpf(800)).fx(d.hpf(200)).getSchema();
      expect(schema.effects).toHaveLength(2);
      expect(
        schema.effects[0].type === "filter" && schema.effects[0].filterType,
      ).toBe("lp");
      expect(
        schema.effects[1].type === "filter" && schema.effects[1].filterType,
      ).toBe("hp");
    });

    it("three effects", () => {
      const d = new Drome();
      const schema = d
        .synth()
        .fx(d.lpf(800))
        .fx(d.hpf(200))
        .fx(d.bpf(1000))
        .getSchema();
      expect(schema.effects).toHaveLength(3);
    });
  });

  describe(".fx()", () => {
    it("returns this", () => {
      const d = new Drome();
      const s = d.synth();
      expect(s.fx(d.lpf(800))).toBe(s);
    });

    it("variadic: accepts multiple filters at once", () => {
      const d = new Drome();
      const s = d.synth().fx(d.lpf(800), d.hpf(200));
      expect(s["_effects"]).toHaveLength(2);
    });

    it("chained calls accumulate", () => {
      const d = new Drome();
      const s = d.synth().fx(d.lpf(800)).fx(d.hpf(200));
      expect(s["_effects"]).toHaveLength(2);
    });
  });

  describe(".bpm()", () => {
    it("sets bpm in the schema", () => {
      const d = new Drome();
      d.bpm(145);
      expect(d.getSchema().bpm).toBe(145);
    });

    it("omits bpm from schema when not set", () => {
      const d = new Drome();
      expect(d.getSchema().bpm).toBeUndefined();
    });

    it("returns this for chaining", () => {
      const d = new Drome();
      expect(d.bpm(120)).toBe(d);
    });
  });

  describe("multiple instruments", () => {
    it("each instrument schema is independent", () => {
      const d = new Drome();
      d.synth("sine").gain(0.5).push();
      d.synth("triangle").gain(d.env(0, 1).mode("clip")).push();

      const [sine, triangle] = d.getSchema().instruments;

      if (sine.gain.max.type === "static") {
        expect(sine.gain.max.cycle[0][0].value).toBe(0.5);
      }
      expect(sine.gain.mode).toBe("bleed");
      expect(triangle.gain.mode).toBe("clip");
    });
  });

  describe("sampler schema round-trip", () => {
    it("d.sample('bd') produces a valid SamplerSchema", () => {
      const d = new Drome();
      d.sample("bd").push();
      const schema = d.getSchema();
      const inst = schema.instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.bank).toBe("tr909");
        expect(inst.sample).toBe("bd");
        expect(inst.loop).toBe(false);
        expect(inst.durationMode).toBe("clip");
        expect(inst.variation.type).toBe("static");
        expect(inst.notes).not.toHaveProperty("type", "fit");
      }
      expect(schema.banks).toHaveProperty("tr909");
    });

    it("notes with root and scale produce float playback rates", () => {
      const d = new Drome();
      d.sample("bd").root("A4").notes([0, 3, 7]).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler" && inst.notes.type === "static") {
        const rates = inst.notes.cycle[0].map((s) => s.value);
        // MIDI 69 (A4) root: semitone 0 → rate 1.0
        expect(rates[0]).toBeCloseTo(1.0);
        // semitone 3 → 2^(3/12) ≈ 1.189
        expect(rates[1]).toBeCloseTo(Math.pow(2, 3 / 12));
        // semitone 7 → 2^(7/12) ≈ 1.498
        expect(rates[2]).toBeCloseTo(Math.pow(2, 7 / 12));
      }
    });

    it("fit(2).loop(true) produces FitSchema with loop flag", () => {
      const d = new Drome();
      d.sample("loop").fit(2).loop(true).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.notes).toEqual({ type: "fit", bars: 2 });
        expect(inst.loop).toBe(true);
      }
    });

    it("clip(false) sets sampler duration mode to one-shot", () => {
      const d = new Drome();
      d.sample("oh").clip(false).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.durationMode).toBe("one-shot");
      }
    });

    it("clip() sets sampler duration mode to clip", () => {
      const d = new Drome();
      d.sample("oh").clip(false).clip().push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.durationMode).toBe("clip");
      }
    });

    it("clip(true) sets sampler duration mode to clip", () => {
      const d = new Drome();
      d.sample("oh").clip(false).clip(true).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.durationMode).toBe("clip");
      }
    });

    it("gain envelope and effects are present", () => {
      const d = new Drome();
      d.sample("bd").gain(d.env(0, 1)).fx(d.lpf(800)).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.gain.type).toBe("envelope");
        expect(inst.effects).toHaveLength(1);
        expect(inst.effects[0].type).toBe("filter");
      }
    });

    it("synth + sampler both appear in instruments[]", () => {
      const d = new Drome();
      d.synth("sine").push();
      d.sample("sd").push();
      const instruments = d.getSchema().instruments;

      expect(instruments).toHaveLength(2);
      expect(instruments[0].type).toBe("synthesizer");
      expect(instruments[1].type).toBe("sampler");
    });
  });

  describe("LFO schema round-trip", () => {
    it("synth with LFO on detune produces type 'lfo'", () => {
      const d = new Drome();
      d.synth("triangle").detune(d.lfo(0, 100)).push();
      const { detune } = d.getSchema().instruments[0];

      expect(detune.type).toBe("lfo");
      if (detune.type === "lfo") {
        expect(detune.outputA.type).toBe("static");
        expect(detune.outputB.type).toBe("static");
      }
    });

    it("synth with LFO on filter frequency", () => {
      const d = new Drome();
      d.synth("triangle")
        .fx(d.lpf(d.lfo(400, 1200).norm()))
        .push();
      const effect = d.getSchema().instruments[0].effects[0];

      expect(effect.type).toBe("filter");
      if (effect.type === "filter") {
        expect(effect.frequency.type).toBe("lfo");
        if (effect.frequency.type === "lfo") {
          expect(effect.frequency.norm).toBe(true);
        }
      }
    });

    it("synth with gain effect", () => {
      const d = new Drome();
      d.synth("triangle").fx(d.gain(0.5)).push();
      const effect = d.getSchema().instruments[0].effects[0];

      expect(effect.type).toBe("gain");
      if (effect.type === "gain") {
        expect(effect.gain.type).toBe("static");
      }
    });

    it("synth with mixed effects (filter + gain)", () => {
      const d = new Drome();
      d.synth("triangle")
        .fx(d.lpf(800), d.gain(d.lfo(0, 1).norm()))
        .push();
      const { effects } = d.getSchema().instruments[0];

      expect(effects).toHaveLength(2);
      expect(effects[0].type).toBe("filter");
      expect(effects[1].type).toBe("gain");
      if (effects[1].type === "gain") {
        expect(effects[1].gain.type).toBe("lfo");
      }
    });

    it("LFO with all options", () => {
      const d = new Drome();
      const lfo = d
        .lfo(400, 1200)
        .speed(2, 1)
        .wave("sawtooth", "triangle")
        .offset(0.25)
        .norm();
      d.synth("triangle").fx(d.lpf(lfo)).push();
      const effect = d.getSchema().instruments[0].effects[0];

      if (effect.type === "filter" && effect.frequency.type === "lfo") {
        expect(effect.frequency.speed).toEqual([2, 1]);
        expect(effect.frequency.waveform).toEqual(["sawtooth", "triangle"]);
        expect(effect.frequency.phase).toBe(0.25);
        expect(effect.frequency.norm).toBe(true);
      } else {
        expect.unreachable("expected filter with lfo frequency");
      }
    });

    it("same Lfo instance reused on two filters shares the same id", () => {
      const d = new Drome();
      const lfo = d.lfo(800, 400);
      d.synth("triangle").fx(d.lpf(lfo), d.hpf(lfo)).push();
      const { effects } = d.getSchema().instruments[0];

      if (
        effects[0].type === "filter" &&
        effects[0].frequency.type === "lfo" &&
        effects[1].type === "filter" &&
        effects[1].frequency.type === "lfo"
      ) {
        expect(effects[0].frequency.id).toBe(effects[1].frequency.id);
      } else {
        expect.unreachable("expected two filters with lfo frequency");
      }
    });
  });
});
