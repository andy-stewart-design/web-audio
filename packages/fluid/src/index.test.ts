import { afterEach, describe, expect, it, vi } from "vitest";
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
        expect(inst.loop).toBe(false);
        expect(inst.clipMode).toBe("clipped");
        expect(inst.variation.type).toBe("static");
        expect(inst.notes).not.toHaveProperty("type", "fit");
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
      if (inst.type === "sampler" && inst.notes.type === "static") {
        expect(inst.notes.cycle[0].map((s) => s.value)).toEqual([69, 72, 76]);
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
        name: "acoustic",
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
        name: "acoustic",
        sprite: "piano.wav",
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
        expect(inst.notes.type).toBe("static");
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
        expect(inst.notes.type).toBe("random");
        expect(inst.variation.type).toBe("static");
        expect(inst).not.toHaveProperty("playback");
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
        expect(inst.notes).toEqual({ type: "fit", bars: 2 });
      }
    });

    it("fit() succeeds for sprite samples with sourceKeys [0]", () => {
      const d = new Drome();
      d.loadSamples({
        name: "loops",
        sprite: "loops.wav",
        samples: { break: [[0, 0.5]] },
      });
      d.sample("break").bank("loops").fit(2).push();
      const inst = d.getSchema().instruments[0];

      expect(inst.type).toBe("sampler");
      if (inst.type === "sampler") {
        expect(inst.sourceKeys).toEqual([0]);
        expect(inst.notes).toEqual({ type: "fit", bars: 2 });
      }
    });

    it("fit() throws for pitched multisamples", () => {
      const d = new Drome();
      d.loadSamples({
        name: "acoustic",
        samples: { piano: { a2: ["a2.wav"], a3: ["a3.wav"] } },
      });
      d.sample("piano").bank("acoustic").fit(2).push();

      expect(() => d.getSchema()).toThrow(
        '[Sampler] fit() is only valid for unpitched samples (sourceKeys: [0]). "acoustic/piano" has sourceKeys: [45, 57].',
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
      d.loadSamples({ name: "mykit", samples: { kick: ["url.wav"] } });

      const schema = d.getSchema();
      expect(schema.banks.mykit.samples.kick).toEqual({
        "0": [{ type: "file", src: "url.wav" }],
      });
      expect(schema.banks.user).toBeUndefined();
    });

    it("custom named banks take precedence over built-in banks", () => {
      const d = new Drome();
      d.loadSamples({ name: "tr909", samples: { bd: ["custom.wav"] } });
      d.sample("bd").bank("tr909").push();

      expect(d.getSchema().banks.tr909.samples.bd).toEqual({
        "0": [{ type: "file", src: "custom.wav" }],
      });
    });

    it("fetches and registers external JSON manifests", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          name: "remote",
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
        "Invalid sample manifest: expected a sample bank, named sample bank, multisample bank, or sprite bank",
      );
    });

    it("throws when inline sample input has an invalid shape", () => {
      const d = new Drome();

      expect(() => d.loadSamples({ kick: [123] } as unknown as never)).toThrow(
        "Invalid sample manifest: expected a sample bank, named sample bank, multisample bank, or sprite bank",
      );
    });

    it("normalizes multisample pitch keys to numeric source keys", () => {
      const d = new Drome();
      d.loadSamples({
        name: "acoustic",
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
          name: "acoustic",
          samples: { piano: { nope: ["file.wav"] } },
        }),
      ).toThrow('Invalid sample pitch key "nope"');
    });

    it("normalizes named sprite banks", () => {
      const d = new Drome();
      d.loadSamples({
        name: "op1",
        sprite: "kit.wav",
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
        sprite: "kit.wav",
        samples: { bd: [[0, 0.08]] },
      });

      expect(d.getSchema().banks.user.samples.bd).toEqual({
        "0": [{ type: "sprite", src: "kit.wav", start: 0, end: 0.08 }],
      });
    });

    it("normalizes sprite variations", () => {
      const d = new Drome();
      d.loadSamples({
        name: "op1",
        sprite: "kit.wav",
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
        name: "acoustic",
        sprite: "piano-sprite.wav",
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
          name: "op1",
          sprite: "kit.wav",
          samples: { bd: [0, 0.08] },
        } as unknown as never),
      ).toThrow(
        "Invalid sample manifest: expected a sample bank, named sample bank, multisample bank, or sprite bank",
      );
    });

    it("throws when sprite region bounds are invalid", () => {
      const d = new Drome();

      expect(() =>
        d.loadSamples({
          name: "op1",
          sprite: "kit.wav",
          samples: { bd: [[0.8, 0.2]] },
        }),
      ).toThrow(
        "Invalid sample manifest: expected a sample bank, named sample bank, multisample bank, or sprite bank",
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
      d.loadSamples({ name: "mykit", samples: { kick: ["url.wav"] } });
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
      d.loadSamples({ name: "tr909", samples: { bd: ["custom.wav"] } });
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
