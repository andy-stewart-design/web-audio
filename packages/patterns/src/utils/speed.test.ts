import { describe, expect, it } from "vitest";
import { fast, slow } from "./speed";

describe("fast", () => {
  it("returns null when nullVal is undefined", () => {
    expect(fast([[1], [2]], undefined, 2)).toBeNull();
  });

  it("returns null when mult is 1", () => {
    expect(fast([[1], [2]], 0, 1)).toBeNull();
  });

  it("compresses cycle when mult > 1", () => {
    const result = fast([[1], [2], [3], [4]], 0, 2);
    expect(result).toEqual([[1, 2], [3, 4]]);
  });

  it("returns null when mult rounds to 0", () => {
    expect(fast([[1], [2]], 0, 0)).toBeNull();
    expect(fast([[1], [2]], 0, 0.4)).toBeNull();
  });

  it("returns null when mult is negative", () => {
    expect(fast([[1], [2]], 0, -2)).toBeNull();
  });

  it("rounds fractional mult to integer", () => {
    const result = fast([[1], [2], [3], [4]], 0, 2.4);
    expect(result).toEqual([[1, 2], [3, 4]]);
  });

  it("handles cycle length not evenly divisible by mult", () => {
    const result = fast([[1], [2], [3]], 0, 2);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
  });
});

describe("slow", () => {
  it("returns null when nullVal is undefined", () => {
    expect(slow([[1], [2]], undefined, 2)).toBeNull();
  });

  it("returns null when mult is 1", () => {
    expect(slow([[1], [2]], 0, 1)).toBeNull();
  });

  it("expands cycle with null values when mult > 1", () => {
    const result = slow([[1, 2]], 0, 2);
    expect(result).toEqual([[1, 0], [2, 0]]);
  });

  it("returns null when mult rounds to 0", () => {
    expect(slow([[1], [2]], 0, 0)).toBeNull();
    expect(slow([[1], [2]], 0, 0.4)).toBeNull();
  });

  it("returns null when mult is negative", () => {
    expect(slow([[1], [2]], 0, -2)).toBeNull();
  });

  it("rounds fractional mult to integer", () => {
    const result = slow([[1, 2]], 0, 2.4);
    expect(result).toEqual([[1, 0], [2, 0]]);
  });
});
