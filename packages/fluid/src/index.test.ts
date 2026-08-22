import { afterEach, describe, expect, it, vi } from "vitest";
import Drome from "./index";

describe("Drome", () => {
  describe("default schema", () => {
    it("emits canonical empty buses, main routes, and send maps", () => {
      const d = new Drome();
      d.synth().push();
      d.sample("bd").push();

      const schema = d.getSchema();

      expect(schema.buses).toEqual({});
      expect(
        schema.instruments.map(({ route, sends }) => ({ route, sends })),
      ).toEqual([
        { route: "main", sends: {} },
        { route: "main", sends: {} },
      ]);
    });

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
      const env = d.env(0, 0.5).adsr(0.5, 0.25, 0.8, 0.1).mode("bounded");
      d.synth("triangle").gain(env).push();
      const { gain } = d.getSchema().instruments[0];

      expect(gain.type).toBe("envelope");
      expect(gain.min).toBe(0);
      expect(gain.mode).toBe("bounded");
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

    it("sets bpm to undefined when not configured", () => {
      const d = new Drome();
      expect(d.getSchema().bpm).toBeUndefined();
    });

    it("returns this for chaining", () => {
      const d = new Drome();
      expect(d.bpm(120)).toBe(d);
    });
  });

  describe("primary routes", () => {
    it("defaults routes to main and normalizes named targets", () => {
      const d = new Drome();
      d.bus("drums");
      d.synth().push();
      d.sample("bd").route(" drums ").push();

      expect(
        d.getSchema().instruments.map((instrument) => instrument.route),
      ).toEqual(["main", "drums"]);
    });

    it("uses last-write-wins and remains fluent", () => {
      const d = new Drome();
      d.bus("drums");
      const synth = d.synth();

      expect(synth.route("main")).toBe(synth);
      synth.route("drums").push();
      expect(d.getSchema().instruments[0].route).toBe("drums");
    });

    it("validates forward references after the complete graph is assembled", () => {
      const d = new Drome();
      d.synth().route("drums").push();
      d.bus("drums");

      expect(() => d.getSchema()).not.toThrow();
    });

    it("rejects empty and unresolved route targets", () => {
      const d = new Drome();

      expect(() => d.synth().route("   ")).toThrow(
        "[Instrument] route() target cannot be empty.",
      );
      d.synth().route("missing").push();
      expect(() => d.getSchema()).toThrow(
        '[Schema] Instrument 0 route "missing" does not reference a declared bus.',
      );
    });
  });

  describe("instrument sends", () => {
    it("normalizes arrays and applies last-write-wins per target", () => {
      const d = new Drome();
      d.bus("verb");
      d.bus("delay");
      const synth = d
        .synth()
        .send([" verb ", "delay", "verb"], 0.2)
        .send("verb", 0.4);

      expect(synth.send("delay", 0.1)).toBe(synth);
      synth.push();
      expect(d.getSchema().instruments[0].sends).toEqual({
        verb: 0.4,
        delay: 0.1,
      });
    });

    it("supports forward declarations and rejects unresolved targets", () => {
      const valid = new Drome();
      valid.synth().send("verb", 0.2).push();
      valid.bus("verb");
      expect(() => valid.getSchema()).not.toThrow();

      const invalid = new Drome();
      invalid.synth().send("missing", 0.2).push();
      expect(() => invalid.getSchema()).toThrow(
        '[Schema] Instrument 0 send "missing" does not reference a declared bus.',
      );
    });

    it("rejects main, empty targets, and invalid amounts", () => {
      const d = new Drome();

      expect(() => d.synth().send("main", 0.2)).toThrow(
        "[Instrument] send() cannot target main.",
      );
      expect(() => d.synth().send(" ", 0.2)).toThrow(
        "[Instrument] send() target cannot be empty.",
      );
      for (const amount of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => d.synth().send("verb", amount)).toThrow(
          "[Instrument] send() amount must be a finite number in [0, 1].",
        );
      }
    });
  });

  describe("multiple instruments", () => {
    it("each instrument schema is independent", () => {
      const d = new Drome();
      d.synth("sine").gain(0.5).push();
      d.synth("triangle").gain(d.env(0, 1).mode("bounded")).push();

      const [sine, triangle] = d.getSchema().instruments;

      if (sine.gain.max.type === "static") {
        expect(sine.gain.max.cycle[0][0].value).toBe(0.5);
      }
      expect(sine.gain.mode).toBe("bleed");
      expect(triangle.gain.mode).toBe("bounded");
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
        expect(inst.sourceKeys).toEqual([0]);
        expect(inst.loop).toBe(false);
        expect(inst.clipMode).toBe("clipped");
        expect(inst.direction).toBe("forward");
        expect(inst.variation.type).toBe("static");
        expect(inst.notes).not.toHaveProperty("type", "fit");
        expect(inst.fit).toBeNull();
        expect(inst.region).toBeNull();
      }
      expect(schema.banks).toHaveProperty("tr909");
      expect(schema.banks.tr909.samples.bd["0"][0].type).toBe("file");
      expect(schema.banks.tr909.samples.bd["0"][0].src).toMatch(/^https?:\/\//);
    });

    it("variation(1) sets the variation parameter", () => {
      const d = new Drome();
      const inst = d.sample("bd").variation(1).getSchema();

      expect(inst.variation.type).toBe("static");
      if (inst.variation.type === "static") {
        expect(inst.variation.cycle[0][0].value).toBe(1);
      }
    });

    it("all three variation syntax forms produce identical schema output", () => {
      const d = new Drome();
      const explicit = d.sample("bd").variation(1).getSchema().variation;
      const secondArg = d.sample("bd", 1).getSchema().variation;
      const shorthand = d.sample("bd:1").getSchema().variation;

      expect(secondArg).toEqual(explicit);
      expect(shorthand).toEqual(explicit);
    });

    it("variation cycles static values", () => {
      const d = new Drome();
      const inst = d.sample("bd").variation([0, 1, 2]).getSchema();

      expect(inst.variation.type).toBe("static");
      if (inst.variation.type === "static") {
        expect(inst.variation.cycle[0].map((s) => s.value)).toEqual([0, 1, 2]);
      }
    });

    it("variation accepts random cycles", () => {
      const d = new Drome();
      const inst = d
        .sample("bd")
        .variation(d.rand().int().range(0, 2))
        .getSchema();

      expect(inst.variation.type).toBe("random");
      if (inst.variation.type === "random") {
        expect(inst.variation.dataType).toBe("integer");
        expect(inst.variation.range).toEqual({ min: 0, max: 2 });
      }
    });

    it("defaults variation to 0", () => {
      const d = new Drome();
      const inst = d.sample("bd").getSchema();

      expect(inst.variation.type).toBe("static");
      if (inst.variation.type === "static") {
        expect(inst.variation.cycle[0][0].value).toBe(0);
      }
    });

    it("notes with root and scale produce MIDI target values", () => {
      const d = new Drome();
      d.sample("bd").root("A4").notes([0, 3, 7]).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler" && inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle[0].map((s) => s.value)).toEqual([
          69, 72, 76,
        ]);
      }
    });

    it("fit(2).loop(true) produces FitSchema with loop flag", () => {
      const d = new Drome();
      d.sample("loop").fit(2).loop(true).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.fit).toEqual({ type: "fit", bars: 2 });
        expect(inst.notes.source.type).toBe("static");
        expect(inst.region?.type).toBe("chop");
        expect(inst.loop).toBe(true);
      }
    });

    it("clip(false) sets sampler clip mode to one-shot", () => {
      const d = new Drome();
      d.sample("oh").clip(false).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.clipMode).toBe("one-shot");
      }
    });

    it("clip() sets sampler clip mode to clipped", () => {
      const d = new Drome();
      d.sample("oh").clip(false).clip().push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.clipMode).toBe("clipped");
      }
    });

    it("clip(true) sets sampler clip mode to clipped", () => {
      const d = new Drome();
      d.sample("oh").clip(false).clip(true).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.clipMode).toBe("clipped");
      }
    });

    it("direction() accepts full and abbreviated direction names", () => {
      const d = new Drome();

      expect(d.sample("bd").direction("forward").getSchema().direction).toBe(
        "forward",
      );
      expect(d.sample("bd").direction("reverse").getSchema().direction).toBe(
        "reverse",
      );
      expect(d.sample("bd").direction("alternate").getSchema().direction).toBe(
        "alternate",
      );
      expect(d.sample("bd").direction("for").getSchema().direction).toBe(
        "forward",
      );
      expect(d.sample("bd").direction("rev").getSchema().direction).toBe(
        "reverse",
      );
      expect(d.sample("bd").direction("alt").getSchema().direction).toBe(
        "alternate",
      );
    });

    it("dir() aliases direction(), including when extracted", () => {
      const d = new Drome();
      const sampler = d.sample("bd");
      const dir = sampler.dir;

      expect(dir("reverse")).toBe(sampler);
      expect(sampler.getSchema().direction).toBe("reverse");
    });

    it("direction() rejects invalid runtime input", () => {
      const d = new Drome();

      expect(() => d.sample("bd").direction("sideways" as never)).toThrow(
        '[Sampler] direction() must be "forward", "reverse", "alternate", "for", "rev", or "alt".',
      );
    });

    it("does not expose sample direction on synthesizers", () => {
      expect(new Drome().synth()).not.toHaveProperty("direction");
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

    it("simple samples emit sourceKeys: [0]", () => {
      const d = new Drome();
      d.loadSamples({ kick: ["kick.wav"] });
      d.sample("kick").bank("user").push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.sourceKeys).toEqual([0]);
      }
    });

    it("multisamples emit sorted sourceKeys", () => {
      const d = new Drome();
      d.loadSamples({
        bank: "acoustic",
        samples: { piano: { a3: ["a3.wav"], a2: ["a2.wav"] } },
      });
      d.sample("piano").bank("acoustic").push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.sourceKeys).toEqual([45, 57]);
      }
    });

    it("pitched sprites emit sorted sourceKeys", () => {
      const d = new Drome();
      d.loadSamples({
        bank: "acoustic",
        src: "piano.wav",
        samples: { piano: { a3: [[0.2, 0.3]], a2: [[0, 0.1]] } },
      });
      d.sample("piano").bank("acoustic").push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.sourceKeys).toEqual([45, 57]);
      }
    });

    it("unknown banks warn and emit fallback sourceKeys", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const d = new Drome();
      d.sample("kick").bank("missing").push();
      const inst = d.getSchema().instruments[0];

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Bank "missing" not found'),
      );
      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.sourceKeys).toEqual([0]);
      }
    });

    it("unknown samples warn and emit fallback sourceKeys", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const d = new Drome();
      d.loadSamples({ kick: ["kick.wav"] });
      d.sample("snare").bank("user").push();
      const inst = d.getSchema().instruments[0];

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Sample "snare" not found in bank "user"'),
      );
      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.sourceKeys).toEqual([0]);
      }
    });

    it("static notes and random variation remain independent", () => {
      const d = new Drome();
      d.sample("bd")
        .notes([0, 2, 4])
        .variation(d.rand().int().range(0, 2))
        .push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.notes.source.type).toBe("static");
        expect(inst.variation.type).toBe("random");
        expect(inst).not.toHaveProperty("playback");
      }
    });

    it("random notes and static variation remain independent", () => {
      const d = new Drome();
      d.sample("bd")
        .notes(d.rand().int().range(0, 12))
        .variation([0, 1])
        .push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.notes.source.type).toBe("random");
        expect(inst.variation.type).toBe("static");
        expect(inst).not.toHaveProperty("playback");
      }
    });

    it("start(0.25) emits static region with end defaulting to 1", () => {
      const d = new Drome();
      const inst = d.sample("bd").start(0.25).getSchema();

      expect(inst.region?.type).toBe("static");
      if (inst.region?.type === "static" && inst.region.end) {
        expect(inst.region.start.type).toBe("static");
        expect(inst.region.end.type).toBe("static");
        if (inst.region.start.type === "static") {
          expect(inst.region.start.cycle[0][0].value).toBe(0.25);
        }
        if (inst.region.end.type === "static") {
          expect(inst.region.end.cycle[0][0].value).toBe(1);
        }
      }
    });

    it("end(0.75) emits static region with start defaulting to 0", () => {
      const d = new Drome();
      const inst = d.sample("bd").end(0.75).getSchema();

      expect(inst.region?.type).toBe("static");
      if (inst.region?.type === "static" && inst.region.end) {
        expect(inst.region.start.type).toBe("static");
        expect(inst.region.end.type).toBe("static");
        if (inst.region.start.type === "static") {
          expect(inst.region.start.cycle[0][0].value).toBe(0);
        }
        if (inst.region.end.type === "static") {
          expect(inst.region.end.cycle[0][0].value).toBe(0.75);
        }
      }
    });

    it("duration() emits a relative-duration region", () => {
      const d = new Drome();
      const inst = d.sample("bd").start(0.4).duration(0.15).getSchema();

      expect(inst.region?.type).toBe("static");
      if (inst.region?.type === "static" && inst.region.duration) {
        expect(inst.region.start.type).toBe("static");
        expect(inst.region.duration.type).toBe("static");
        if (inst.region.start.type === "static") {
          expect(inst.region.start.cycle[0][0].value).toBe(0.4);
        }
        if (inst.region.duration.type === "static") {
          expect(inst.region.duration.cycle[0][0].value).toBe(0.15);
        }
      } else {
        expect.unreachable("Expected a relative-duration region");
      }
    });

    it("dur() aliases duration(), including when extracted", () => {
      const d = new Drome();
      const sampler = d.sample("bd");
      const dur = sampler.dur;

      expect(dur(0.15)).toBe(sampler);
      expect(sampler.getSchema()).toEqual(
        d.sample("bd").duration(0.15).getSchema(),
      );
    });

    it("end() and duration() use the most recently configured region mode", () => {
      const d = new Drome();
      const duration = d.sample("bd").end(0.8).duration(0.15).getSchema();
      const end = d.sample("bd").duration(0.15).end(0.8).getSchema();

      expect(duration.region?.type).toBe("static");
      if (duration.region?.type === "static") {
        expect(duration.region).toHaveProperty("duration");
        expect(duration.region).not.toHaveProperty("end");
      }
      expect(end.region?.type).toBe("static");
      if (end.region?.type === "static") {
        expect(end.region).toHaveProperty("end");
        expect(end.region).not.toHaveProperty("duration");
      }
    });

    it("duration() accepts boundary values and rejects invalid static values", () => {
      const d = new Drome();

      expect(() => d.sample("bd").duration(0).getSchema()).not.toThrow();
      expect(() => d.sample("bd").duration(1).getSchema()).not.toThrow();
      for (const value of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => d.sample("bd").duration(value).getSchema()).toThrow(
          "[Sampler] duration() values must be finite numbers in [0, 1].",
        );
      }
    });

    it("duration() preserves random parameters and warns for out-of-range ranges", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const d = new Drome();
      const inst = d
        .sample("bd")
        .duration(d.rand().range(-0.1, 1.1).steps(4))
        .getSchema();

      expect(inst.region?.type).toBe("static");
      if (inst.region?.type === "static" && inst.region.duration) {
        expect(inst.region.duration.type).toBe("random");
      } else {
        expect.unreachable("Expected a relative-duration region");
      }
      expect(warn).toHaveBeenCalledWith(
        "[Sampler] duration() random range is outside [0, 1]; resolved values will be clamped by the engine.",
      );
    });

    it("duration() rejects chop combinations", () => {
      const d = new Drome();

      expect(() => d.sample("bd").duration(0.15).chop(4).getSchema()).toThrow(
        "[Sampler] duration() cannot be used with chop().",
      );
      expect(() => d.sample("bd").chop(4).duration(0.15).getSchema()).toThrow(
        "[Sampler] duration() cannot be used with chop().",
      );
    });

    it("start() accepts cycling values", () => {
      const d = new Drome();
      const inst = d.sample("bd").start([0, 0.25]).getSchema();

      expect(inst.region?.type).toBe("static");
      if (inst.region?.type === "static") {
        expect(inst.region.start.type).toBe("static");
        if (inst.region.start.type === "static") {
          expect(inst.region.start.cycle[0].map((step) => step.value)).toEqual([
            0, 0.25,
          ]);
        }
      }
    });

    it("start/end scalar bounds must be ordered", () => {
      const d = new Drome();
      expect(() => d.sample("bd").start(0.75).end(0.25).getSchema()).toThrow(
        "[Sampler] start() must be less than end().",
      );
    });

    it("start/end numeric values must be in [0, 1]", () => {
      const d = new Drome();

      expect(() => d.sample("bd").start(-0.1).getSchema()).toThrow(
        "[Sampler] start() values must be finite numbers in [0, 1].",
      );
      expect(() => d.sample("bd").end(1.1).getSchema()).toThrow(
        "[Sampler] end() values must be finite numbers in [0, 1].",
      );
    });

    it("start/end random ranges outside [0, 1] warn", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const d = new Drome();
      d.sample("bd").start(d.rand().range(-0.5, 0.5)).getSchema();

      expect(warn).toHaveBeenCalledWith(
        "[Sampler] start() random range is outside [0, 1]; resolved values will be clamped by the engine.",
      );
    });

    it("chop(4) emits natural slices and default sequence", () => {
      const d = new Drome();
      const inst = d.sample("bd").chop(4).getSchema();

      expect(inst.region?.type).toBe("chop");
      if (inst.region?.type === "chop") {
        expect(inst.region.slices).toEqual([
          { start: 0, end: 0.25 },
          { start: 0.25, end: 0.5 },
          { start: 0.5, end: 0.75 },
          { start: 0.75, end: 1 },
        ]);
        expect(inst.region.sequence.type).toBe("static");
        if (inst.region.sequence.type === "static") {
          expect(
            inst.region.sequence.cycle[0].map((step) => step.value),
          ).toEqual([0, 1, 2, 3]);
        }
      }
    });

    it("chop(4, [0, 2, 1, 3]) preserves authored sequence", () => {
      const d = new Drome();
      const inst = d.sample("bd").chop(4, [0, 2, 1, 3]).getSchema();

      expect(inst.region?.type).toBe("chop");
      if (inst.region?.type === "chop") {
        expect(inst.region.sequence.type).toBe("static");
        if (inst.region.sequence.type === "static") {
          expect(
            inst.region.sequence.cycle[0].map((step) => step.value),
          ).toEqual([0, 2, 1, 3]);
        }
      }
    });

    it("chop() requires a positive integer slice count", () => {
      const d = new Drome();

      expect(() => d.sample("bd").chop(0)).toThrow(
        "[Sampler] chop() sliceCount must be a positive integer.",
      );
      expect(() => d.sample("bd").chop(-1)).toThrow(
        "[Sampler] chop() sliceCount must be a positive integer.",
      );
      expect(() => d.sample("bd").chop(1.5)).toThrow(
        "[Sampler] chop() sliceCount must be a positive integer.",
      );
    });

    it("chop(8) without explicit notes emits 8 default notes over 1 bar", () => {
      const d = new Drome();
      const inst = d.sample("bd").chop(8).getSchema();

      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle).toHaveLength(1);
        expect(inst.notes.source.cycle[0]).toHaveLength(8);
        expect(inst.notes.source.cycle[0].map((step) => step.offset)).toEqual([
          0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875,
        ]);
        expect(
          inst.notes.source.cycle[0].every((step) => step.duration === 0.125),
        ).toBe(true);
      }
    });

    it("chop() default notes use authored sequence step count", () => {
      const d = new Drome();
      const inst = d.sample("bd").chop(8, [0, 2, 1, 3]).getSchema();

      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle[0]).toHaveLength(4);
        expect(inst.notes.source.cycle[0].map((step) => step.offset)).toEqual([
          0, 0.25, 0.5, 0.75,
        ]);
      }
    });

    it("explicit notes override generated chop notes", () => {
      const d = new Drome();
      const inst = d.sample("bd").chop(8).notes([0, 12]).getSchema();

      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle[0].map((step) => step.value)).toEqual([
          0, 12,
        ]);
      }
    });

    it("chop() warns for static out-of-range sequence values and preserves them", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const d = new Drome();
      const inst = d.sample("bd").chop(4, [-1, 4]).getSchema();

      expect(warn).toHaveBeenCalledWith(
        "[Sampler] chop() sequence index -1 is outside [0, 3] and will wrap in the engine.",
      );
      expect(warn).toHaveBeenCalledWith(
        "[Sampler] chop() sequence index 4 is outside [0, 3] and will wrap in the engine.",
      );
      expect(inst.region?.type).toBe("chop");
      if (
        inst.region?.type === "chop" &&
        inst.region.sequence.type === "static"
      ) {
        expect(inst.region.sequence.cycle[0].map((step) => step.value)).toEqual(
          [-1, 4],
        );
      }
    });

    it("fit(2).chop(8) emits 8 generated notes over 2 bars", () => {
      const d = new Drome();
      const inst = d.sample("bd").fit(2).chop(8).getSchema();

      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle).toHaveLength(2);
        expect(inst.notes.source.cycle[0]).toHaveLength(4);
        expect(inst.notes.source.cycle[1]).toHaveLength(4);
        expect(inst.notes.source.cycle[0].map((step) => step.offset)).toEqual([
          0, 0.25, 0.5, 0.75,
        ]);
        expect(inst.notes.source.cycle[1].map((step) => step.offset)).toEqual([
          0, 0.25, 0.5, 0.75,
        ]);
        expect(
          inst.notes.source.cycle.flat().map((step) => step.stepIndex),
        ).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      }
      expect(inst.region?.type).toBe("chop");
      if (inst.region?.type === "chop") {
        expect(inst.region.slices).toHaveLength(8);
      }
    });

    it("fit(2).chop(8, [0, 2, 1, 3]) preserves the authored one-bar pattern", () => {
      const d = new Drome();
      const inst = d.sample("bd").fit(2).chop(8, [0, 2, 1, 3]).getSchema();

      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle).toHaveLength(1);
        expect(inst.notes.source.cycle[0]).toHaveLength(4);
        expect(inst.notes.source.cycle[0].map((step) => step.offset)).toEqual([
          0, 0.25, 0.5, 0.75,
        ]);
        expect(
          inst.notes.source.cycle[0].map((step) => step.stepIndex),
        ).toEqual([0, 1, 2, 3]);
      }
    });

    it("fit(2).chop(8, [0, 2], [1, 3]) preserves the authored two-bar pattern", () => {
      const d = new Drome();
      const inst = d.sample("bd").fit(2).chop(8, [0, 2], [1, 3]).getSchema();

      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle).toHaveLength(2);
        expect(inst.notes.source.cycle[0]).toHaveLength(2);
        expect(inst.notes.source.cycle[1]).toHaveLength(2);
        expect(inst.notes.source.cycle[0].map((step) => step.offset)).toEqual([
          0, 0.5,
        ]);
        expect(inst.notes.source.cycle[1].map((step) => step.offset)).toEqual([
          0, 0.5,
        ]);
        expect(
          inst.notes.source.cycle[0].map((step) => step.stepIndex),
        ).toEqual([0, 1]);
        expect(
          inst.notes.source.cycle[1].map((step) => step.stepIndex),
        ).toEqual([0, 1]);
      }
    });

    it("fit with explicit notes preserves explicit note timing and fit", () => {
      const d = new Drome();
      const inst = d.sample("bd").fit(2).notes([0, 12]).getSchema();

      expect(inst.fit).toEqual({ type: "fit", bars: 2 });
      expect(inst.region).toBeNull();
      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle).toHaveLength(1);
        expect(inst.notes.source.cycle[0].map((step) => step.value)).toEqual([
          0, 12,
        ]);
        expect(inst.notes.source.cycle[0].map((step) => step.offset)).toEqual([
          0, 0.5,
        ]);
        expect(inst.notes.source.cycle[0].map((step) => step.duration)).toEqual(
          [0.5, 0.5],
        );
      }
    });

    it("explicit notes provide pitch values over chop timing", () => {
      const d = new Drome();
      const inst = d
        .sample("bd")
        .fit(2)
        .chop(8, [0, 3, 5, 1])
        .notes([0, 12])
        .getSchema();

      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle).toHaveLength(1);
        expect(inst.notes.source.cycle[0].map((step) => step.value)).toEqual([
          0, 12, 0, 12,
        ]);
        expect(inst.notes.source.cycle[0].map((step) => step.offset)).toEqual([
          0, 0.25, 0.5, 0.75,
        ]);
        expect(inst.notes.source.cycle[0].map((step) => step.duration)).toEqual(
          [0.25, 0.25, 0.25, 0.25],
        );
      }
      expect(inst.fit).toEqual({ type: "fit", bars: 2 });
      expect(inst.region?.type).toBe("chop");
    });

    it("random chop sequence without steps expands to slice count", () => {
      const d = new Drome();
      const inst = d
        .sample("bd")
        .chop(8, d.rand().int().range(0, 7))
        .getSchema();

      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle[0]).toHaveLength(8);
      }
      expect(inst.region?.type).toBe("chop");
      if (inst.region?.type === "chop") {
        expect(inst.region.sequence.type).toBe("random");
        if (inst.region.sequence.type === "random") {
          expect(inst.region.sequence.grid.cycle[0]).toHaveLength(8);
          expect(
            inst.region.sequence.grid.cycle[0].map((step) => step.stepIndex),
          ).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        }
      }
    });

    it("random chop sequence with steps preserves explicit step count", () => {
      const d = new Drome();
      const inst = d
        .sample("bd")
        .chop(8, d.rand().int().range(0, 7).steps(4))
        .getSchema();

      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle[0]).toHaveLength(4);
      }
      expect(inst.region?.type).toBe("chop");
      if (inst.region?.type === "chop") {
        expect(inst.region.sequence.type).toBe("random");
        if (inst.region.sequence.type === "random") {
          expect(inst.region.sequence.grid.cycle[0]).toHaveLength(4);
        }
      }
    });

    it("single explicit note repeats over chop timing", () => {
      const d = new Drome();
      const inst = d
        .sample("bd")
        .fit(2)
        .chop(8, [0, 3, 5, 1])
        .notes([0])
        .getSchema();

      expect(inst.fit).toEqual({ type: "fit", bars: 2 });
      expect(inst.region?.type).toBe("chop");
      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle[0].map((step) => step.value)).toEqual([
          0, 0, 0, 0,
        ]);
        expect(inst.notes.source.cycle[0].map((step) => step.offset)).toEqual([
          0, 0.25, 0.5, 0.75,
        ]);
      }
    });

    it("start/end with chop precomputes bounded slices", () => {
      const d = new Drome();
      const inst = d.sample("bd").start(0.25).end(0.75).chop(4).getSchema();

      expect(inst.region?.type).toBe("chop");
      if (inst.region?.type === "chop") {
        expect(inst.region.slices).toEqual([
          { start: 0.25, end: 0.375 },
          { start: 0.375, end: 0.5 },
          { start: 0.5, end: 0.625 },
          { start: 0.625, end: 0.75 },
        ]);
      }
    });

    it("dynamic start/end are rejected with chop regardless of chaining order", () => {
      const d = new Drome();

      expect(() => d.sample("bd").start([0, 0.5]).chop(4).getSchema()).toThrow(
        "[Sampler] start() and end() must be static numbers when used with chop().",
      );
      expect(() => d.sample("bd").chop(4).start([0, 0.5]).getSchema()).toThrow(
        "[Sampler] start() and end() must be static numbers when used with chop().",
      );
      expect(() =>
        d.sample("bd").start(d.rand().range(0, 0.5)).chop(4).getSchema(),
      ).toThrow(
        "[Sampler] start() and end() must be static numbers when used with chop().",
      );
    });

    it("invalid static start/end bounds are rejected with chop", () => {
      const d = new Drome();

      expect(() =>
        d.sample("bd").start(0.75).end(0.25).chop(4).getSchema(),
      ).toThrow(
        "[Sampler] start() and end() must satisfy 0 <= start < end <= 1 when used with chop().",
      );
    });

    it("explicit chop suppresses implicit fit-only chop region", () => {
      const d = new Drome();
      const inst = d.sample("bd").fit(2).chop(8).getSchema();

      expect(inst.region?.type).toBe("chop");
      if (inst.region?.type === "chop") {
        expect(inst.region.slices).toHaveLength(8);
      }
    });

    it("fit(2) without explicit notes or region emits generated notes and chop region", () => {
      const d = new Drome();
      d.loadSamples({ loop: ["loop.wav"] });
      const inst = d.sample("loop").bank("user").fit(2).getSchema();

      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle).toEqual([
          [{ value: 0, offset: 0, duration: 1, stepIndex: 0 }],
          [{ value: 0, offset: 0, duration: 1, stepIndex: 0 }],
        ]);
      }
      expect(inst.region?.type).toBe("chop");
      if (inst.region?.type === "chop") {
        expect(inst.region.slices).toEqual([
          { start: 0, end: 0.5 },
          { start: 0.5, end: 1 },
        ]);
        expect(inst.region.sequence.type).toBe("static");
        if (inst.region.sequence.type === "static") {
          expect(inst.region.sequence.cycle).toEqual([
            [{ value: 0, offset: 0, duration: 1, stepIndex: 0 }],
            [{ value: 1, offset: 0, duration: 1, stepIndex: 0 }],
          ]);
        }
      }
    });

    it("fit(3) without explicit notes or region emits thirds across three bars", () => {
      const d = new Drome();
      const inst = d.sample("bd").fit(3).getSchema();

      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle).toHaveLength(3);
      }
      expect(inst.region?.type).toBe("chop");
      if (inst.region?.type === "chop") {
        expect(inst.region.slices).toEqual([
          { start: 0, end: 1 / 3 },
          { start: 1 / 3, end: 2 / 3 },
          { start: 2 / 3, end: 1 },
        ]);
      }
    });

    it("fit() generated default notes use the lowest source key", () => {
      const d = new Drome();
      d.loadSamples({
        bank: "acoustic",
        samples: { piano: { a2: ["a2.wav"], a3: ["a3.wav"] } },
      });
      const inst = d.sample("piano").bank("acoustic").fit(2).getSchema();

      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle[0][0].value).toBe(45);
        expect(inst.notes.source.cycle[1][0].value).toBe(45);
      }
    });

    it("explicit notes suppress fit default notes and implicit fit region", () => {
      const d = new Drome();
      const inst = d.sample("bd").fit(2).notes([0, 12]).getSchema();

      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle[0].map((step) => step.value)).toEqual([
          0, 12,
        ]);
      }
      expect(inst.region).toBeNull();
    });

    it("explicit region suppresses implicit fit region", () => {
      const d = new Drome();
      const inst = d.sample("bd").fit(2).start(0.25).getSchema();

      expect(inst.region?.type).toBe("static");
    });

    it("duration() suppresses the generated fit region while retaining fit playback", () => {
      const d = new Drome();
      const inst = d.sample("bd").fit(2).duration(0.15).getSchema();

      expect(inst.fit).toEqual({ type: "fit", bars: 2 });
      expect(inst.region?.type).toBe("static");
      if (inst.region?.type === "static" && inst.region.duration) {
        expect(inst.region.duration.type).toBe("static");
      } else {
        expect.unreachable("Expected a relative-duration region");
      }
      expect(inst.notes.source.type).toBe("static");
      if (inst.notes.source.type === "static") {
        expect(inst.notes.source.cycle[0]).toHaveLength(1);
      }
    });

    it("fit() succeeds for simple samples with sourceKeys [0]", () => {
      const d = new Drome();
      d.loadSamples({ loop: ["loop.wav"] });
      d.sample("loop").bank("user").fit(2).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.sourceKeys).toEqual([0]);
        expect(inst.fit).toEqual({ type: "fit", bars: 2 });
        expect(inst.notes.source.type).toBe("static");
      }
    });

    it("fit() succeeds for sprite samples with sourceKeys [0]", () => {
      const d = new Drome();
      d.loadSamples({
        bank: "loops",
        src: "loops.wav",
        samples: { break: [[0, 0.5]] },
      });
      d.sample("break").bank("loops").fit(2).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.sourceKeys).toEqual([0]);
        expect(inst.fit).toEqual({ type: "fit", bars: 2 });
        expect(inst.notes.source.type).toBe("static");
      }
    });

    it("fit() succeeds for pitched multisamples", () => {
      const d = new Drome();
      d.loadSamples({
        bank: "acoustic",
        samples: { piano: { a2: ["a2.wav"], a3: ["a3.wav"] } },
      });
      d.sample("piano").bank("acoustic").fit(2).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.sourceKeys).toEqual([45, 57]);
        expect(inst.fit).toEqual({ type: "fit", bars: 2 });
      }
    });

    it("notes() does not clear fit", () => {
      const d = new Drome();
      d.sample("bd").fit(2).notes([0, 12]).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.fit).toEqual({ type: "fit", bars: 2 });
        expect(inst.notes.source.type).toBe("static");
        if (inst.notes.source.type === "static") {
          expect(inst.notes.source.cycle[0].map((step) => step.value)).toEqual([
            0, 12,
          ]);
        }
      }
    });

    it("fit() requires a positive integer", () => {
      const d = new Drome();

      expect(() => d.sample("bd").fit(1.5)).toThrow(
        "[Sampler] fit() bars must be a positive integer.",
      );
      expect(() => d.sample("bd").fit(0)).toThrow(
        "[Sampler] fit() bars must be a positive integer.",
      );
      expect(() => d.sample("bd").fit(-1)).toThrow(
        "[Sampler] fit() bars must be a positive integer.",
      );
    });
  });

  describe("loadSamples", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("registers flat samples into the user bank", () => {
      const d = new Drome();
      d.loadSamples({ kick: ["url.wav"] });

      expect(d.getSchema().banks.user.samples.kick).toEqual({
        "0": [{ type: "file", src: "url.wav" }],
      });
    });

    it("merges multiple flat loadSamples calls into the user bank", () => {
      const d = new Drome();
      d.loadSamples({ kick: ["kick.wav"] }).loadSamples({
        snare: ["snare.wav"],
      });

      expect(d.getSchema().banks.user.samples).toEqual({
        kick: { "0": [{ type: "file", src: "kick.wav" }] },
        snare: { "0": [{ type: "file", src: "snare.wav" }] },
      });
    });

    it("lets samplers reference registered user samples", () => {
      const d = new Drome();
      d.loadSamples({ kick: ["url.wav"] });
      d.sample("kick").bank("user").push();

      const schema = d.getSchema();
      expect(schema.instruments[0].type).toBe("sampler");
      expect(schema.banks.user.samples.kick).toEqual({
        "0": [{ type: "file", src: "url.wav" }],
      });
    });

    it("registers named banks without polluting the user bank", () => {
      const d = new Drome();
      d.loadSamples({ bank: "mykit", samples: { kick: ["url.wav"] } });

      const schema = d.getSchema();
      expect(schema.banks.mykit.samples.kick).toEqual({
        "0": [{ type: "file", src: "url.wav" }],
      });
      expect(schema.banks.user).toBeUndefined();
    });

    it("custom named banks take precedence over built-in banks", () => {
      const d = new Drome();
      d.loadSamples({ bank: "tr909", samples: { bd: ["custom.wav"] } });
      d.sample("bd").bank("tr909").push();

      expect(d.getSchema().banks.tr909.samples.bd).toEqual({
        "0": [{ type: "file", src: "custom.wav" }],
      });
    });

    it("fetches and registers external JSON manifests", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          bank: "remote",
          samples: { kick: ["remote.wav"] },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const d = new Drome();
      await d.loadSamples("https://example.com/samples.json");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/samples.json",
      );
      expect(d.getSchema().banks.remote.samples.kick).toEqual({
        "0": [{ type: "file", src: "remote.wav" }],
      });
    });

    it("external JSON produces the same schema as equivalent inline data", async () => {
      const manifest = { kick: ["remote.wav"] };
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(manifest),
        }),
      );

      const remote = new Drome();
      await remote.loadSamples("https://example.com/samples.json");

      const inline = new Drome();
      inline.loadSamples(manifest);

      expect(remote.getSchema()).toEqual(inline.getSchema());
    });

    it("throws when an external sample manifest response is not ok", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          json: vi.fn(),
        }),
      );

      const d = new Drome();

      await expect(
        d.loadSamples("https://example.com/missing-samples.json"),
      ).rejects.toThrow(
        "Failed to load sample manifest from https://example.com/missing-samples.json: HTTP 404",
      );
    });

    it("throws when an external sample manifest has an invalid shape", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ kick: [123] }),
        }),
      );

      const d = new Drome();

      await expect(
        d.loadSamples("https://example.com/samples.json"),
      ).rejects.toThrow(
        "Invalid sample manifest: expected a sample bank, banked sample bank, multisample bank, or sprite bank",
      );
    });

    it("throws when inline sample input has an invalid shape", () => {
      const d = new Drome();

      expect(() => d.loadSamples({ kick: [123] } as unknown as never)).toThrow(
        "Invalid sample manifest: expected a sample bank, banked sample bank, multisample bank, or sprite bank",
      );
    });

    it("applies baseUrl to registered sample files", () => {
      const d = new Drome();
      d.loadSamples({
        bank: "acoustic",
        baseUrl: "https://example.com/piano/",
        samples: { piano: { a2: ["a2.wav"] } },
      });

      expect(d.getSchema().banks.acoustic.samples.piano["45"]).toEqual([
        { type: "file", src: "https://example.com/piano/a2.wav" },
      ]);
    });

    it("applies baseUrl to registered sprite src", () => {
      const d = new Drome();
      d.loadSamples({
        bank: "op1",
        baseUrl: "https://example.com/sprites/",
        src: "kit.wav",
        samples: { bd: [[0, 0.08]] },
      });

      expect(d.getSchema().banks.op1.samples.bd["0"]).toEqual([
        {
          type: "sprite",
          src: "https://example.com/sprites/kit.wav",
          start: 0,
          end: 0.08,
        },
      ]);
    });

    it("normalizes multisample pitch keys to numeric source keys", () => {
      const d = new Drome();
      d.loadSamples({
        bank: "acoustic",
        samples: {
          piano: {
            a2: ["file-01.wav", "file-02.wav"],
            a3: ["file-03.wav"],
          },
        },
      });

      expect(d.getSchema().banks.acoustic.samples.piano).toEqual({
        "45": [
          { type: "file", src: "file-01.wav" },
          { type: "file", src: "file-02.wav" },
        ],
        "57": [{ type: "file", src: "file-03.wav" }],
      });
      expect(d.getSchema().banks.user).toBeUndefined();
    });

    it("throws when a multisample pitch key is invalid", () => {
      const d = new Drome();

      expect(() =>
        d.loadSamples({
          bank: "acoustic",
          samples: { piano: { nope: ["file.wav"] } },
        }),
      ).toThrow('Invalid sample pitch key "nope"');
    });

    it("normalizes named sprite banks", () => {
      const d = new Drome();
      d.loadSamples({
        bank: "op1",
        src: "kit.wav",
        samples: {
          bd: [[0, 0.08]],
          sd: [[0.1, 0.18]],
        },
      });

      expect(d.getSchema().banks.op1.samples).toEqual({
        bd: {
          "0": [{ type: "sprite", src: "kit.wav", start: 0, end: 0.08 }],
        },
        sd: {
          "0": [{ type: "sprite", src: "kit.wav", start: 0.1, end: 0.18 }],
        },
      });
    });

    it("normalizes unnamed sprite banks into user", () => {
      const d = new Drome();
      d.loadSamples({
        src: "kit.wav",
        samples: { bd: [[0, 0.08]] },
      });

      expect(d.getSchema().banks.user.samples.bd).toEqual({
        "0": [{ type: "sprite", src: "kit.wav", start: 0, end: 0.08 }],
      });
    });

    it("normalizes sprite variations", () => {
      const d = new Drome();
      d.loadSamples({
        bank: "op1",
        src: "kit.wav",
        samples: {
          bd: [
            [0, 0.08],
            [0.42, 0.5],
          ],
        },
      });

      expect(d.getSchema().banks.op1.samples.bd["0"]).toEqual([
        { type: "sprite", src: "kit.wav", start: 0, end: 0.08 },
        { type: "sprite", src: "kit.wav", start: 0.42, end: 0.5 },
      ]);
    });

    it("normalizes pitched sprite banks", () => {
      const d = new Drome();
      d.loadSamples({
        bank: "acoustic",
        src: "piano-sprite.wav",
        samples: {
          piano: {
            a2: [[0, 0.16]],
            a3: [
              [0.2, 0.36],
              [0.37, 0.52],
            ],
          },
        },
      });

      expect(d.getSchema().banks.acoustic.samples.piano).toEqual({
        "45": [
          { type: "sprite", src: "piano-sprite.wav", start: 0, end: 0.16 },
        ],
        "57": [
          {
            type: "sprite",
            src: "piano-sprite.wav",
            start: 0.2,
            end: 0.36,
          },
          {
            type: "sprite",
            src: "piano-sprite.wav",
            start: 0.37,
            end: 0.52,
          },
        ],
      });
    });

    it("throws when a sprite region is not wrapped in a variations array", () => {
      const d = new Drome();

      expect(() =>
        d.loadSamples({
          bank: "op1",
          src: "kit.wav",
          samples: { bd: [0, 0.08] },
        } as unknown as never),
      ).toThrow(
        "Invalid sample manifest: expected a sample bank, banked sample bank, multisample bank, or sprite bank",
      );
    });

    it("throws when sprite region bounds are invalid", () => {
      const d = new Drome();

      expect(() =>
        d.loadSamples({
          bank: "op1",
          src: "kit.wav",
          samples: { bd: [[0.8, 0.2]] },
        }),
      ).toThrow(
        "Invalid sample manifest: expected a sample bank, banked sample bank, multisample bank, or sprite bank",
      );
    });
  });

  describe("PR 2 integration round-trip", () => {
    it("flat loadSamples + user-bank sampler round-trips in one chain", () => {
      const d = new Drome();
      d.loadSamples({ kick: ["url.wav"] })
        .sample("kick")
        .bank("user")
        .push();

      const schema = d.getSchema();
      const inst = schema.instruments[0];

      expect(schema.banks.user.samples.kick).toEqual({
        "0": [{ type: "file", src: "url.wav" }],
      });
      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.bank).toBe("user");
        expect(inst.sample).toBe("kick");
      }
    });

    it("named custom bank round-trips with a sampler reference", () => {
      const d = new Drome();
      d.loadSamples({ bank: "mykit", samples: { kick: ["url.wav"] } });
      d.sample("kick").bank("mykit").push();

      const schema = d.getSchema();
      const inst = schema.instruments[0];

      expect(schema.banks.mykit.samples.kick).toEqual({
        "0": [{ type: "file", src: "url.wav" }],
      });
      expect(schema.banks.user).toBeUndefined();
      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.bank).toBe("mykit");
        expect(inst.sample).toBe("kick");
      }
    });

    it("variation cycling round-trips as a StaticSchema", () => {
      const d = new Drome();
      d.sample("bd").variation([0, 1, 2]).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.variation.type).toBe("static");
        if (inst.variation.type === "static") {
          expect(inst.variation.cycle[0].map((step) => step.value)).toEqual([
            0, 1, 2,
          ]);
        }
      }
    });

    it("custom bank with same name as a built-in bank takes precedence", () => {
      const d = new Drome();
      d.loadSamples({ bank: "tr909", samples: { bd: ["custom.wav"] } });
      d.sample("bd").bank("tr909").push();

      expect(d.getSchema().banks.tr909.samples.bd).toEqual({
        "0": [{ type: "file", src: "custom.wav" }],
      });
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
