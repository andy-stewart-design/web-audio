import { describe, expect, it } from "vitest";
import { ValueCycle } from "./static-cycles";

describe("ValueCycle", () => {
  describe("getStaticSchema", () => {
    it("serializes a single bar as values only", () => {
      expect(new ValueCycle([60, 64, 67], 0).getStaticSchema()).toEqual({
        type: "static",
        cycle: [[60, 64, 67]],
      });
    });

    it("serializes multiple bars and preserves zero and finite numeric data", () => {
      const schema = new ValueCycle([1], 0)
        .pattern([0, -2.5], [3, 4.25])
        .getStaticSchema();

      expect(schema.cycle).toEqual([
        [0, -2.5],
        [3, 4.25],
      ]);
    });

    it("retains null-value positions introduced by pattern modifiers", () => {
      expect(
        new ValueCycle([60, 64, 67], 0).euclid(1, 4).getStaticSchema().cycle[0],
      ).toEqual([60, 0, 0, 0]);
    });

    it("rejects empty bars", () => {
      expect(() => new ValueCycle([], 0).getStaticSchema()).toThrow(
        "[Pattern] ValueCycle cannot serialize an empty bar at cycle[0].",
      );
    });

    it("rejects non-finite values", () => {
      expect(() =>
        new ValueCycle([1, Number.POSITIVE_INFINITY], 0).getStaticSchema(),
      ).toThrow(
        "[Pattern] ValueCycle cycle[0] must contain only finite numbers.",
      );
    });
  });
});
