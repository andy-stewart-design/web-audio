import { describe, expect, it } from "vitest";
import type { StaticSchemaValue } from "@web-audio/schema";
import { getStaticOnsetForHit, groupStaticOnsets } from "./static-onsets";

function voice(value: number, stepIndex: number, offset = stepIndex / 4) {
  return {
    value,
    offset,
    duration: 0.25,
    stepIndex,
  } satisfies StaticSchemaValue;
}

describe("groupStaticOnsets", () => {
  it("assigns consecutive hit indices to dense monophonic events", () => {
    const groups = groupStaticOnsets([
      voice(60, 0),
      voice(64, 1),
      voice(67, 2),
    ]);

    expect(
      groups.map(({ hitIndex, voices }) => ({
        hitIndex,
        values: voices.map(({ value }) => value),
      })),
    ).toEqual([
      { hitIndex: 0, values: [60] },
      { hitIndex: 1, values: [64] },
      { hitIndex: 2, values: [67] },
    ]);
  });

  it("compresses sparse grid positions into consecutive hit indices", () => {
    const groups = groupStaticOnsets([voice(60, 0), voice(67, 2)]);

    expect(groups.map(({ hitIndex }) => hitIndex)).toEqual([0, 1]);
  });

  it("groups chord voices into one onset without changing voice order", () => {
    const first = voice(60, 0, 0);
    const second = voice(64, 0, 0);
    const third = voice(67, 2, 0.5);
    const groups = groupStaticOnsets([first, second, third]);

    expect(groups).toHaveLength(2);
    expect(groups[0].hitIndex).toBe(0);
    expect(groups[0].voices).toEqual([first, second]);
    expect(groups[0].voices[0]).toBe(first);
    expect(groups[0].voices[1]).toBe(second);
    expect(groups[1].hitIndex).toBe(1);
    expect(groups[1].voices).toEqual([third]);
  });

  it("preserves first-occurrence order without sorting or mutating the bar", () => {
    const first = voice(67, 2, 0.5);
    const second = voice(60, 0, 0);
    const third = voice(71, 2, 0.5);
    const bar = [first, second, third];
    const before = bar.map((step) => ({ ...step }));

    const groups = groupStaticOnsets(bar);

    expect(groups.map(({ voices }) => voices[0].stepIndex)).toEqual([2, 0]);
    expect(groups[0].voices).toEqual([first, third]);
    expect(bar).toEqual(before);
    expect(bar).toEqual([first, second, third]);
  });

  it("returns no groups for an empty bar", () => {
    expect(groupStaticOnsets([])).toEqual([]);
  });
});

describe("getStaticOnsetForHit", () => {
  it("cycles source onset groups across a longer mask", () => {
    const groups = groupStaticOnsets([voice(60, 0), voice(64, 1)]);

    expect(
      [0, 1, 2, 3, 4].map(
        (hitIndex) => getStaticOnsetForHit(groups, hitIndex)?.voices[0].value,
      ),
    ).toEqual([60, 64, 60, 64, 60]);
  });

  it("returns null when the source bar has no onsets", () => {
    expect(getStaticOnsetForHit([], 0)).toBeNull();
  });
});
