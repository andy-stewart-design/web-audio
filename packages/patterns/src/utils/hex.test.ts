import { describe, expect, it } from "vitest";
import { hex } from "./hex";

describe("hex", () => {
  it("converts f to all ones", () => {
    expect(hex("f")).toEqual([1, 1, 1, 1]);
  });

  it("converts 0 to all zeros", () => {
    expect(hex("0")).toEqual([0, 0, 0, 0]);
  });

  it("converts multi-character hex strings", () => {
    expect(hex("a5")).toEqual([1, 0, 1, 0, 0, 1, 0, 1]);
  });

  it("accepts numeric input", () => {
    expect(hex(0xf)).toEqual([1, 1, 1, 1]);
  });

  it("handles uppercase and lowercase the same", () => {
    expect(hex("A")).toEqual(hex("a"));
  });

  it("converts 5 to 0101", () => {
    expect(hex("5")).toEqual([0, 1, 0, 1]);
  });

  it("handles large numbers with multiple hex digits", () => {
    expect(hex(0xff)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });
});
