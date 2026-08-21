import { describe, expect, it } from "vitest";
import Drome from "@/index";

describe("Bus builder", () => {
  it("normalizes main and returns one shared builder", () => {
    const d = new Drome();

    expect(d.bus(" main ")).toBe(d.bus("main"));
  });

  it("configures main gain with last-write-wins semantics", () => {
    const d = new Drome();

    d.bus("main").gain(0.5).gain(1.25);

    expect(d.getSchema().buses).toEqual({
      main: { gain: 1.25, effects: [] },
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid gain %s",
    (value) => {
      expect(() => new Drome().bus("main").gain(value)).toThrow(
        "[Bus] gain() must be a finite number greater than or equal to 0.",
      );
    },
  );

  it("accepts zero gain", () => {
    const d = new Drome();

    expect(d.bus("main").gain(0)).toBe(d.bus("main"));
    expect(d.getSchema().buses?.main.gain).toBe(0);
  });

  it("rejects empty and named buses in the main-gain slice", () => {
    const d = new Drome();

    expect(() => d.bus("   ")).toThrow("[Bus] name cannot be empty.");
    expect(() => d.bus("drums")).toThrow(
      '[Bus] Named bus "drums" is not supported until the routing slice.',
    );
  });

  it("rejects effects on main", () => {
    const d = new Drome();

    expect(() => d.bus("main").fx(d.lpf(800))).toThrow(
      "[Bus] Effects on main are not supported in the bus MVP.",
    );
  });
});
