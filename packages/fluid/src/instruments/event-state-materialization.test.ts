import { describe, expect, it } from "vitest";
import {
  assertEventCycleInvariants,
  type EventCycleTransform,
} from "@web-audio/patterns";
import { decodeNotesInputGeometry } from "@/patterns/decode-structured-input";
import { decodeXoxInputGeometry } from "@/patterns/decode-xox-input";
import type { InstrumentEventState } from "./event-state";
import { makeCycle, materializeEventSources } from "./event-state-geometry";
import {
  createSamplerEventState,
  createSynthEventState,
  replaceEventNotes,
  replaceEventTiming,
  transformEventState,
} from "./event-state-transitions";
import {
  compileSamplerEventState,
  compileSynthEventState,
} from "./event-state-compiler";

const rest = { type: "rest" } as const;
const continuation = { type: "continuation" } as const;
const onset = { type: "event", values: [1] } as const;
const event = (value: number) => ({ type: "event", values: [value] }) as const;

function notes(state: InstrumentEventState, input: readonly unknown[]) {
  const decoded = decodeNotesInputGeometry(input);
  return replaceEventNotes(
    state,
    decoded.cycle,
    decoded.zeroWidthPatterns,
    "noteValueSlots" in decoded ? decoded.noteValueSlots : undefined,
  );
}
function authoredNotes(state: InstrumentEventState) {
  const source = state.notes;
  if (
    source.intent !== "authored" ||
    source.cycle.type !== "static-event-cycle"
  )
    throw new Error("Expected authored static notes");
  return { ...source, cycle: source.cycle };
}
function staticNotes(state: InstrumentEventState) {
  return authoredNotes(state).cycle;
}
function compile(state: InstrumentEventState) {
  return state.type === "synth"
    ? compileSynthEventState(state)
    : compileSamplerEventState(state);
}

const fractionalSpeeds = [
  { operation: { type: "fast", multiplier: 2 / 3 }, widths: [6, 6, 6] },
  { operation: { type: "slow", multiplier: 3 / 2 }, widths: [6, 6, 6] },
  { operation: { type: "fast", multiplier: 3 / 2 }, widths: [9, 9, 9, 9] },
] satisfies { operation: EventCycleTransform; widths: number[] }[];
const transforms: EventCycleTransform[] = [
  { type: "reverse" },
  { type: "fast", multiplier: 2 },
  { type: "slow", multiplier: 2 },
  { type: "stretch", bars: 2, steps: 2 },
];

describe("materialized empty value bars", () => {
  it.each([0, 1])(
    "preserves the selected grid for empty note bar %i, without inventing note slots",
    (emptyIndex) => {
      const input = [[60], [60]];
      input[emptyIndex] = [];
      const initial = replaceEventTiming(
        notes(createSamplerEventState("bd"), input),
        decodeXoxInputGeometry([[1, 0, 1]]).cycle,
      );
      const before = structuredClone(initial);
      const materialized = materializeEventSources(initial);
      const patterns = [
        [event(60), rest, event(60)],
        [event(60), rest, event(60)],
      ];
      patterns[emptyIndex] = [rest, rest, rest];
      expect(staticNotes(materialized).patterns).toStrictEqual(patterns);
      expect(authoredNotes(materialized).zeroWidthPatterns).toStrictEqual([
        false,
        false,
      ]);
      expect(
        authoredNotes(materialized).noteValueSlots?.patterns[emptyIndex],
      ).toStrictEqual([rest, rest, rest]);

      for (const { operation, widths } of fractionalSpeeds) {
        const transformed = transformEventState(initial, operation);
        expect(
          staticNotes(transformed).patterns.map((pattern) => pattern.length),
        ).toStrictEqual(widths);
        expect(
          authoredNotes(transformed).noteValueSlots?.patterns.map(
            (pattern) => pattern.length,
          ),
        ).toStrictEqual(widths);
        assertEventCycleInvariants(staticNotes(transformed));
        expect(Object.isFrozen(transformed.notes)).toBe(true);
        expect(initial).toStrictEqual(before);
      }
    },
  );
});

describe("materialized note placeholders with same-bar continuations", () => {
  for (const kind of ["synth", "sampler"] as const) {
    it.each([
      { name: "null", value: null },
      { name: "undefined", value: undefined },
      { name: "empty chord", value: [] },
      { name: "null-only chord", value: [null, undefined] },
    ])(
      `${kind} silences an omitted onset's complete continuation run ($name)`,
      ({ value }) => {
        const state = notes(
          kind === "synth"
            ? createSynthEventState()
            : createSamplerEventState("bd"),
          [[60, value, 64]],
        );
        // Two gates reproduce the synth report. Three gates also expose the
        // sampler interaction after availability removes its middle candidate.
        const gates = kind === "synth" ? 2 : 3;
        for (const width of [2, 3]) {
          const tail = Array.from({ length: width - 1 }, () => continuation);
          const initial = replaceEventTiming(
            state,
            makeCycle<1>([
              Array.from({ length: gates }, () => [onset, ...tail]).flat(),
            ]),
          );
          const before = structuredClone(initial);
          expect(() => compile(initial)).not.toThrow();
          const materialized = materializeEventSources(initial);
          const silence = Array.from(
            { length: width * (gates - 1) },
            () => rest,
          );
          expect(staticNotes(materialized).patterns).toStrictEqual([
            [event(60), ...tail, ...silence],
          ]);
          assertEventCycleInvariants(staticNotes(materialized));
          const slots = authoredNotes(materialized).noteValueSlots;
          expect(slots).toBeDefined();
          if (slots) assertEventCycleInvariants(slots);
          expect(authoredNotes(materialized).zeroWidthPatterns).toStrictEqual([
            false,
          ]);

          for (const operation of transforms) {
            const transformed = transformEventState(initial, operation);
            assertEventCycleInvariants(staticNotes(transformed));
            expect(() => compile(transformed)).not.toThrow();
            expect(Object.isFrozen(transformed.notes)).toBe(true);
            expect(initial).toStrictEqual(before);
          }
          const reversed = transformEventState(initial, { type: "reverse" });
          expect(staticNotes(reversed).patterns).toStrictEqual([
            [...silence, event(60), ...tail],
          ]);
          const offsets = kind === "synth" ? [0.5] : [0, 2 / 3];
          const duration = 1 / gates;
          const expected = {
            timing: {
              cycle: [offsets.map((offset) => ({ offset, duration }))],
              condition: undefined,
            },
            notes: { type: "static", cycle: [offsets.map(() => [60])] },
          };
          if (kind === "synth")
            expect(compile(reversed)).toStrictEqual(expected);
          else
            expect(compile(reversed)).toStrictEqual({
              ...expected,
              sampleNames: { type: "static", cycle: [[["bd"]]] },
              variationIndices: undefined,
            });
        }
      },
    );
  }
});
