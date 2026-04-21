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
});
