import { describe, expect, it } from "vitest";
import { RandomCycle } from "@web-audio/patterns";
import Envelope from "@/automations/envelope";
import Filter from "./filter";
import type { FilterType } from "@web-audio/schema";

describe("Filter", () => {
  describe("basics", () => {
    it("basic lowpass", () => {
      const schema = new Filter("lp", 800).getSchema();
      expect(schema.type).toBe("filter");
      expect(schema.filterType).toBe("lp");
      expect(schema.frequency.type).toBe("static");
      if (schema.frequency.type === "static") {
        expect(schema.frequency.cycle[0][0].value).toBe(800);
      }
    });

    it("schema type field is always 'filter'", () => {
      expect(new Filter("hp", 1000).getSchema().type).toBe("filter");
    });

    it("all filter types round-trip correctly", () => {
      const types: FilterType[] = ["lp", "hp", "bp", "notch", "ap", "pk", "ls", "hs"];
      for (const t of types) {
        expect(new Filter(t, 1000).getSchema().filterType).toBe(t);
      }
    });
  });

  describe("defaults", () => {
    it("q defaults to 1", () => {
      const schema = new Filter("lp", 800).getSchema();
      expect(schema.q.type).toBe("static");
      if (schema.q.type === "static") {
        expect(schema.q.cycle[0][0].value).toBe(1);
      }
    });

    it("detune defaults to 0", () => {
      const schema = new Filter("lp", 800).getSchema();
      expect(schema.detune.type).toBe("static");
      if (schema.detune.type === "static") {
        expect(schema.detune.cycle[0][0].value).toBe(0);
      }
    });

    it("gain defaults to 0", () => {
      const schema = new Filter("lp", 800).getSchema();
      expect(schema.gain.type).toBe("static");
      if (schema.gain.type === "static") {
        expect(schema.gain.cycle[0][0].value).toBe(0);
      }
    });
  });

  describe(".q()", () => {
    it("sets q from static number", () => {
      const schema = new Filter("lp", 800).q(2).getSchema();
      expect(schema.q.type).toBe("static");
      if (schema.q.type === "static") {
        expect(schema.q.cycle[0][0].value).toBe(2);
      }
    });

    it("accepts a RandomCycle", () => {
      const schema = new Filter("lp", 800).q(new RandomCycle()).getSchema();
      expect(schema.q.type).toBe("random");
    });

    it("accepts an Envelope", () => {
      const schema = new Filter("lp", 800).q(new Envelope(0.5, 4)).getSchema();
      expect(schema.q.type).toBe("envelope");
    });
  });

  describe(".detune()", () => {
    it("sets detune from static number", () => {
      const schema = new Filter("lp", 800).detune(100).getSchema();
      expect(schema.detune.type).toBe("static");
      if (schema.detune.type === "static") {
        expect(schema.detune.cycle[0][0].value).toBe(100);
      }
    });
  });

  describe(".gain()", () => {
    it("sets gain from static number", () => {
      const schema = new Filter("lp", 800).gain(6).getSchema();
      expect(schema.gain.type).toBe("static");
      if (schema.gain.type === "static") {
        expect(schema.gain.cycle[0][0].value).toBe(6);
      }
    });
  });

  describe("frequency inputs", () => {
    it("cycle: multiple values produce multiple bars", () => {
      const schema = new Filter("lp", 400, 800, 1200).getSchema();
      expect(schema.frequency.type).toBe("static");
      if (schema.frequency.type === "static") {
        expect(schema.frequency.cycle).toHaveLength(3);
      }
    });

    it("RandomCycle on frequency", () => {
      const schema = new Filter("lp", new RandomCycle()).getSchema();
      expect(schema.frequency.type).toBe("random");
    });

    it("Envelope on frequency", () => {
      const env = new Envelope(200, 4000).adsr(0.3, 0.2, 0.5, 0.1);
      const schema = new Filter("lp", env).getSchema();
      expect(schema.frequency.type).toBe("envelope");
      if (schema.frequency.type === "envelope") {
        expect(schema.frequency.min).toBe(200);
        if (schema.frequency.max.type === "static") {
          expect(schema.frequency.max.cycle[0][0].value).toBe(4000);
        }
      }
    });
  });

  describe("chaining", () => {
    it("q, detune, gain return this", () => {
      const f = new Filter("lp", 800);
      expect(f.q(2)).toBe(f);
      expect(f.detune(0)).toBe(f);
      expect(f.gain(0)).toBe(f);
    });

    it("all mutations applied via chaining", () => {
      const schema = new Filter("lp", 800).q(2).detune(50).gain(3).getSchema();
      if (schema.q.type === "static") expect(schema.q.cycle[0][0].value).toBe(2);
      if (schema.detune.type === "static") expect(schema.detune.cycle[0][0].value).toBe(50);
      if (schema.gain.type === "static") expect(schema.gain.cycle[0][0].value).toBe(3);
    });
  });
});
