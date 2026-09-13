import type { ChanceCondition } from "@web-audio/schema";
import { describe, expect, it } from "vitest";
import ChanceResolver from "./chance-resolver";

function condition(overrides: Partial<ChanceCondition> = {}): ChanceCondition {
  return {
    type: "chance",
    probability: 0.5,
    segments: [{ seed: 42 }],
    algorithm: "xor",
    order: "forward",
    ...overrides,
  };
}

describe("ChanceResolver", () => {
  it("produces deterministic seeded decisions", () => {
    const first = new ChanceResolver(condition()).resolveBar(0, 8);
    const second = new ChanceResolver(condition()).resolveBar(0, 8);

    expect(first).toEqual(second);
    expect(first).toEqual([true, true, true, true, false, true, false, true]);
  });

  it("returns exact decisions at probability boundaries", () => {
    expect(
      new ChanceResolver(condition({ probability: 0 })).resolveBar(0, 4),
    ).toEqual([false, false, false, false]);
    expect(
      new ChanceResolver(condition({ probability: 1 })).resolveBar(0, 4),
    ).toEqual([true, true, true, true]);
  });

  it("uses playback bar progression for an unbounded segment", () => {
    const resolver = new ChanceResolver(condition());

    expect(resolver.resolveBar(0, 8)).not.toEqual(resolver.resolveBar(1, 8));
  });

  it("loops bounded ribbon segments", () => {
    const resolver = new ChanceResolver(
      condition({
        segments: [
          { seed: 42, len: 2 },
          { seed: 99, len: 2 },
        ],
      }),
    );

    expect(resolver.resolveBar(0, 8)).toEqual(resolver.resolveBar(4, 8));
    expect(resolver.resolveBar(0, 8)).not.toEqual(resolver.resolveBar(2, 8));
  });

  it("supports mulberry generation", () => {
    const xor = new ChanceResolver(condition()).resolveBar(0, 8);
    const mulberry = new ChanceResolver(
      condition({ algorithm: "mulberry" }),
    ).resolveBar(0, 8);

    expect(mulberry).not.toEqual(xor);
  });

  it("reverses decisions after forward generation", () => {
    const forward = new ChanceResolver(condition()).resolveBar(3, 8);
    const reverse = new ChanceResolver(
      condition({ order: "reverse" }),
    ).resolveBar(3, 8);

    expect(reverse).toEqual(forward.toReversed());
  });

  it("returns no decisions when there are no candidates", () => {
    expect(new ChanceResolver(condition()).resolveBar(0, 0)).toEqual([]);
  });
});
