import { describe, expect, it } from "vitest";
import { RandomCycle } from "@web-audio/patterns";
import Envelope from "./envelope";

describe("Envelope", () => {
  describe("defaults", () => {
    it("returns a valid EnvelopeSchema with all defaults", () => {
      const schema = new Envelope().getSchema();
      expect(schema.type).toBe("envelope");
      expect(schema.min).toBe(0);
      expect(schema.mode).toBe("bleed");
    });

    it("defaults max to 1", () => {
      const schema = new Envelope().getSchema();
      expect(schema.max.type).toBe("static");
      if (schema.max.type === "static") {
        expect(schema.max.cycle[0][0].value).toBe(1);
      }
    });

    it("defaults A to 0.01", () => {
      const schema = new Envelope().getSchema();
      expect(schema.a.type).toBe("static");
      if (schema.a.type === "static") {
        expect(schema.a.cycle[0][0].value).toBe(0.01);
      }
    });

    it("defaults D to 0", () => {
      const schema = new Envelope().getSchema();
      if (schema.d.type === "static") {
        expect(schema.d.cycle[0][0].value).toBe(0);
      }
    });

    it("defaults S to 1", () => {
      const schema = new Envelope().getSchema();
      if (schema.s.type === "static") {
        expect(schema.s.cycle[0][0].value).toBe(1);
      }
    });

    it("defaults R to 0.01", () => {
      const schema = new Envelope().getSchema();
      if (schema.r.type === "static") {
        expect(schema.r.cycle[0][0].value).toBe(0.01);
      }
    });
  });

  describe("constructor", () => {
    it("sets custom min", () => {
      const schema = new Envelope(0.1).getSchema();
      expect(schema.min).toBe(0.1);
    });

    it("sets custom max as static value", () => {
      const schema = new Envelope(0, 0.75).getSchema();
      expect(schema.max.type).toBe("static");
      if (schema.max.type === "static") {
        expect(schema.max.cycle[0][0].value).toBe(0.75);
      }
    });

    it("sets max as a multi-bar cycle", () => {
      const schema = new Envelope(0, [0.75, 1.25], [0.25, 0.5]).getSchema();
      expect(schema.max.type).toBe("static");
      if (schema.max.type === "static") {
        expect(schema.max.cycle).toHaveLength(2);
      }
    });

    it("sets max as a RandomCycle", () => {
      const rand = new RandomCycle();
      const schema = new Envelope(0, rand).getSchema();
      expect(schema.max.type).toBe("random");
    });
  });

  describe(".adsr()", () => {
    it("sets all four ADSR values", () => {
      const schema = new Envelope().adsr(0.5, 0.25, 0.8, 0.1).getSchema();
      if (schema.a.type === "static") expect(schema.a.cycle[0][0].value).toBe(0.5);
      if (schema.d.type === "static") expect(schema.d.cycle[0][0].value).toBe(0.25);
      if (schema.s.type === "static") expect(schema.s.cycle[0][0].value).toBe(0.8);
      if (schema.r.type === "static") expect(schema.r.cycle[0][0].value).toBe(0.1);
    });

    it("accepts array cycle syntax on each param", () => {
      const schema = new Envelope().adsr([0.2, 0.4], 0.1, 0.8, 0.05).getSchema();
      expect(schema.a.type).toBe("static");
      if (schema.a.type === "static") {
        expect(schema.a.cycle[0]).toHaveLength(2);
      }
    });
  });

  describe("individual setters", () => {
    it(".a() overrides attack", () => {
      const schema = new Envelope().adsr(0.5, 0.25, 0.8, 0.1).a(0.9).getSchema();
      if (schema.a.type === "static") expect(schema.a.cycle[0][0].value).toBe(0.9);
    });

    it(".d() overrides decay", () => {
      const schema = new Envelope().adsr(0.5, 0.25, 0.8, 0.1).d(0.9).getSchema();
      if (schema.d.type === "static") expect(schema.d.cycle[0][0].value).toBe(0.9);
    });

    it(".s() overrides sustain", () => {
      const schema = new Envelope().adsr(0.5, 0.25, 0.8, 0.1).s(0.3).getSchema();
      if (schema.s.type === "static") expect(schema.s.cycle[0][0].value).toBe(0.3);
    });

    it(".r() overrides release", () => {
      const schema = new Envelope().adsr(0.5, 0.25, 0.8, 0.1).r(0.9).getSchema();
      if (schema.r.type === "static") expect(schema.r.cycle[0][0].value).toBe(0.9);
    });

    it("last write wins between .adsr() and individual setter", () => {
      const schema = new Envelope().a(0.9).adsr(0.5, 0.25, 0.8, 0.1).getSchema();
      if (schema.a.type === "static") expect(schema.a.cycle[0][0].value).toBe(0.5);
    });
  });

  describe(".mode()", () => {
    it("defaults to bleed", () => {
      expect(new Envelope().getSchema().mode).toBe("bleed");
    });

    it("sets clip mode", () => {
      expect(new Envelope().mode("clip").getSchema().mode).toBe("clip");
    });
  });

  describe("chaining", () => {
    it("all methods return the Envelope instance", () => {
      const env = new Envelope();
      expect(env.adsr(0.1, 0.1, 0.8, 0.1)).toBe(env);
      expect(env.a(0.1)).toBe(env);
      expect(env.d(0.1)).toBe(env);
      expect(env.s(0.8)).toBe(env);
      expect(env.r(0.1)).toBe(env);
      expect(env.mode("clip")).toBe(env);
    });
  });
});
