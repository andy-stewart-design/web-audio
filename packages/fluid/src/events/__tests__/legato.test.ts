import { describe, expect, it } from "vitest";
import { compileSamplerEventState, compileSynthEventState } from "../compiler";
import {
  createSamplerEventState,
  createSynthEventState,
  replaceEventNotes,
  replaceEventTiming,
  replaceSampleNames,
} from "../transitions";
import {
  decodeNotesInputGeometry,
  decodeSampleNamesInput,
} from "@/inputs/decode-structured-input";
import { decodeXoxInputGeometry } from "@/inputs/decode-xox-input";

describe("compiled legato timing", () => {
  it("extends generated timing without mutating its caller-owned gates", () => {
    const state = createSamplerEventState("bd");
    const timingOverride = {
      cycle: [
        [{ offset: 0.25, duration: 0.125 }],
        [],
        [{ offset: 0.75, duration: 0.125 }],
        [],
      ],
    };
    const before = structuredClone(timingOverride);
    const normal = compileSamplerEventState(state, { timingOverride });
    const legato = compileSamplerEventState(state, {
      timingOverride,
      legato: true,
    });
    expect(legato.timing.cycle).toEqual([
      [{ offset: 0.25, duration: 2.5 }],
      [],
      [{ offset: 0.75, duration: 1.5 }],
      [],
    ]);
    expect(timingOverride).toEqual(before);
    expect(state).toEqual(createSamplerEventState("bd"));
    expect(compileSamplerEventState(state, { timingOverride })).toEqual(normal);
    expect(
      compileSamplerEventState(state, { timingOverride, legato: true }),
    ).toEqual(legato);
  });

  it("uses the final expanded cycle after empty value bars suppress generated hits", () => {
    const state = replaceSampleNames(
      createSamplerEventState(),
      decodeSampleNamesInput([["bd"], [null]]),
    );
    const timingOverride = { cycle: [[{ offset: 0.5, duration: 0.25 }]] };
    const compiled = compileSamplerEventState(state, {
      timingOverride,
      legato: true,
    });
    expect(compiled.timing.cycle).toEqual([[{ offset: 0.5, duration: 2 }], []]);
    expect(compiled.sampleNames.cycle).toEqual([[["bd"]], [null]]);
    expect(compiled.notes).toBeUndefined();
  });

  it("uses the final expanded synth cycle after silent note bars are removed", () => {
    const decoded = decodeNotesInputGeometry([[60], [], [64]]);
    const state = replaceEventTiming(
      replaceEventNotes(
        createSynthEventState(),
        decoded.cycle,
        decoded.zeroWidthPatterns,
      ),
      decodeXoxInputGeometry([[1, 0]]).cycle,
    );
    const normal = compileSynthEventState(state);
    const compiled = compileSynthEventState(state, { legato: true });
    expect(compiled.timing.cycle).toEqual([
      [{ offset: 0, duration: 2 }],
      [],
      [{ offset: 0, duration: 1 }],
    ]);
    expect(compiled.notes).toEqual(normal.notes);
    expect(compileSynthEventState(state)).toEqual(normal);
  });
});
