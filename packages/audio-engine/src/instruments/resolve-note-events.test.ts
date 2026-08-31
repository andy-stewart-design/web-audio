import { describe, expect, it, vi } from "vitest";
import type {
  NotesSchema,
  ParameterSchema,
  RandomSchema,
  StaticSchema,
  StaticSchemaValue,
} from "@web-audio/schema";
import { resolveNoteEvents } from "./resolve-note-events";

function step(
  value: number,
  stepIndex: number,
  offset = stepIndex / 4,
  duration = 0.25,
) {
  return { value, offset, duration, stepIndex } satisfies StaticSchemaValue;
}

function staticSchema(cycle: StaticSchemaValue[][], polyphonic = false) {
  return { type: "static", polyphonic, cycle } satisfies StaticSchema;
}

function randomSchema(grid: StaticSchema) {
  return {
    type: "random",
    dataType: "float",
    segments: [{ seed: 42 }],
    quantValue: undefined,
    range: undefined,
    algorithm: "xor",
    grid,
  } satisfies RandomSchema;
}

function summarize(events: ReturnType<typeof resolveNoteEvents>) {
  return events.map(
    ({ hitIndex, gridStepIndex, offset, duration, voices }) => ({
      hitIndex,
      gridStepIndex,
      offset,
      duration,
      voices,
    }),
  );
}

const unusedResolver = () => {
  throw new Error("resolver should not be called");
};

describe("resolveNoteEvents static sources", () => {
  it.each([
    {
      label: "dense",
      bar: [step(60, 0, 0, 0.5), step(64, 1, 0.5, 0.5)],
      expected: [
        {
          hitIndex: 0,
          gridStepIndex: 0,
          offset: 0,
          duration: 0.5,
          voices: [60],
        },
        {
          hitIndex: 1,
          gridStepIndex: 1,
          offset: 0.5,
          duration: 0.5,
          voices: [64],
        },
      ],
    },
    {
      label: "sparse",
      bar: [step(60, 0), step(67, 2)],
      expected: [
        {
          hitIndex: 0,
          gridStepIndex: 0,
          offset: 0,
          duration: 0.25,
          voices: [60],
        },
        {
          hitIndex: 1,
          gridStepIndex: 2,
          offset: 0.5,
          duration: 0.25,
          voices: [67],
        },
      ],
    },
  ])("resolves $label unmasked notes", ({ bar, expected }) => {
    const notes = { source: staticSchema([bar]) } satisfies NotesSchema;

    expect(
      summarize(
        resolveNoteEvents({ notes, barIndex: 0, resolveValue: unusedResolver }),
      ),
    ).toEqual(expected);
  });

  it("resolves a chord as one ordered multi-voice event", () => {
    const notes = {
      source: staticSchema(
        [[step(60, 0, 0, 0.5), step(64, 0, 0, 0.5), step(67, 1, 0.5, 0.5)]],
        true,
      ),
    } satisfies NotesSchema;

    expect(
      summarize(
        resolveNoteEvents({ notes, barIndex: 0, resolveValue: unusedResolver }),
      ),
    ).toEqual([
      {
        hitIndex: 0,
        gridStepIndex: 0,
        offset: 0,
        duration: 0.5,
        voices: [60, 64],
      },
      {
        hitIndex: 1,
        gridStepIndex: 1,
        offset: 0.5,
        duration: 0.5,
        voices: [67],
      },
    ]);
  });

  it("cycles source onset groups across static mask geometry", () => {
    const notes = {
      source: staticSchema(
        [[step(60, 0, 0, 0.5), step(64, 0, 0, 0.5), step(67, 1, 0.5, 0.5)]],
        true,
      ),
      mask: staticSchema([[step(1, 0), step(1, 2), step(1, 3, 0.75)]]),
    } satisfies NotesSchema;

    expect(
      summarize(
        resolveNoteEvents({ notes, barIndex: 0, resolveValue: unusedResolver }),
      ),
    ).toEqual([
      {
        hitIndex: 0,
        gridStepIndex: 0,
        offset: 0,
        duration: 0.25,
        voices: [60, 64],
      },
      {
        hitIndex: 1,
        gridStepIndex: 2,
        offset: 0.5,
        duration: 0.25,
        voices: [67],
      },
      {
        hitIndex: 2,
        gridStepIndex: 3,
        offset: 0.75,
        duration: 0.25,
        voices: [60, 64],
      },
    ]);
  });

  it("selects source and mask bars independently while restarting hit indices", () => {
    const notes = {
      source: staticSchema([
        [step(48, 0, 0, 1)],
        [step(60, 0, 0, 0.5), step(64, 1, 0.5, 0.5)],
      ]),
      mask: staticSchema([
        [step(1, 0, 0, 1)],
        [step(1, 1, 0.25), step(1, 3, 0.75)],
      ]),
    } satisfies NotesSchema;

    expect(
      summarize(
        resolveNoteEvents({ notes, barIndex: 1, resolveValue: unusedResolver }),
      ),
    ).toEqual([
      {
        hitIndex: 0,
        gridStepIndex: 1,
        offset: 0.25,
        duration: 0.25,
        voices: [60],
      },
      {
        hitIndex: 1,
        gridStepIndex: 3,
        offset: 0.75,
        duration: 0.25,
        voices: [64],
      },
    ]);
    expect(
      resolveNoteEvents({
        notes,
        barIndex: 3,
        resolveValue: unusedResolver,
      }).map(({ hitIndex, voices }) => ({ hitIndex, voices })),
    ).toEqual([
      { hitIndex: 0, voices: [60] },
      { hitIndex: 1, voices: [64] },
    ]);
  });
});

describe("resolveNoteEvents random eligibility and values", () => {
  it("does not consume hit indices for random-mask misses", () => {
    const source = staticSchema([[step(60, 0), step(64, 1)]]);
    const mask = randomSchema(
      staticSchema([[step(1, 0), step(1, 1), step(1, 2), step(1, 3)]]),
    );
    const resolveValue = vi.fn(
      (_schema: ParameterSchema, _barIndex: number, valueIndex: number) =>
        valueIndex % 2 === 0 ? 1 : 0,
    );

    const events = resolveNoteEvents({
      notes: { source, mask },
      barIndex: 0,
      resolveValue,
    });

    expect(summarize(events)).toEqual([
      {
        hitIndex: 0,
        gridStepIndex: 0,
        offset: 0,
        duration: 0.25,
        voices: [60],
      },
      {
        hitIndex: 1,
        gridStepIndex: 2,
        offset: 0.5,
        duration: 0.25,
        voices: [64],
      },
    ]);
    expect(
      resolveValue.mock.calls.map(([, , valueIndex]) => valueIndex),
    ).toEqual([0, 1, 2, 3]);
  });

  it.each(["static", "random"] as const)(
    "resolves random notes by hit index under a %s mask",
    (maskType) => {
      const source = randomSchema(
        staticSchema([[step(1, 0), step(1, 1), step(1, 2)]]),
      );
      const staticMask = staticSchema([[step(1, 0), step(1, 2)]]);
      const mask =
        maskType === "static" ? staticMask : randomSchema(staticMask);
      const resolveValue = vi.fn(
        (schema: ParameterSchema, _barIndex: number, valueIndex: number) => {
          if (schema === mask) return 1;
          return [60, 64][valueIndex];
        },
      );

      const events = resolveNoteEvents({
        notes: { source, mask },
        barIndex: 0,
        resolveValue,
      });

      expect(
        events.map(({ hitIndex, gridStepIndex, voices }) => ({
          hitIndex,
          gridStepIndex,
          voices,
        })),
      ).toEqual([
        { hitIndex: 0, gridStepIndex: 0, voices: [60] },
        { hitIndex: 1, gridStepIndex: 2, voices: [64] },
      ]);
      expect(
        resolveValue.mock.calls
          .filter(([schema]) => schema === source)
          .map(([, , valueIndex]) => valueIndex),
      ).toEqual([0, 1]);
    },
  );

  it("does not consume hit indices for unmasked random structural rests", () => {
    const source = randomSchema(
      staticSchema([[step(1, 0), step(0, 1), step(1, 2)]]),
    );
    const resolveValue = vi.fn(
      (_schema: ParameterSchema, _barIndex: number, hitIndex: number) =>
        [60, 64][hitIndex],
    );

    const events = resolveNoteEvents({
      notes: { source },
      barIndex: 0,
      resolveValue,
    });

    expect(
      events.map(({ hitIndex, gridStepIndex, voices }) => ({
        hitIndex,
        gridStepIndex,
        voices,
      })),
    ).toEqual([
      { hitIndex: 0, gridStepIndex: 0, voices: [60] },
      { hitIndex: 1, gridStepIndex: 2, voices: [64] },
    ]);
    expect(resolveValue.mock.calls.map(([, , hitIndex]) => hitIndex)).toEqual([
      0, 1,
    ]);
  });
});

describe("resolveNoteEvents empty bars and immutability", () => {
  it("returns no events for empty source or mask bars", () => {
    const source = staticSchema([[]]);
    const populatedSource = staticSchema([[step(60, 0)]]);
    const emptyMask = staticSchema([[]]);

    expect(
      resolveNoteEvents({
        notes: { source },
        barIndex: 0,
        resolveValue: unusedResolver,
      }),
    ).toEqual([]);
    expect(
      resolveNoteEvents({
        notes: { source: populatedSource, mask: emptyMask },
        barIndex: 0,
        resolveValue: unusedResolver,
      }),
    ).toEqual([]);
  });

  it("returns no events for all-rest structural grids", () => {
    const source = staticSchema([[step(60, 0)]]);
    const allRestMask = staticSchema([[step(0, 0), step(0, 1)]]);
    const randomSource = randomSchema(staticSchema([[step(0, 0), step(0, 1)]]));

    expect(
      resolveNoteEvents({
        notes: { source, mask: allRestMask },
        barIndex: 0,
        resolveValue: unusedResolver,
      }),
    ).toEqual([]);
    expect(
      resolveNoteEvents({
        notes: { source: randomSource },
        barIndex: 0,
        resolveValue: unusedResolver,
      }),
    ).toEqual([]);
  });

  it("returns no events for an empty random source bar under a mask", () => {
    const source = randomSchema(staticSchema([[]]));
    const mask = staticSchema([[step(1, 0)]]);

    expect(
      resolveNoteEvents({
        notes: { source, mask },
        barIndex: 0,
        resolveValue: unusedResolver,
      }),
    ).toEqual([]);
  });

  it("does not mutate source or mask schemas", () => {
    const notes = {
      source: staticSchema(
        [[step(60, 0, 0, 0.5), step(64, 0, 0, 0.5), step(67, 1)]],
        true,
      ),
      mask: randomSchema(staticSchema([[step(1, 0), step(1, 2)]])),
    } satisfies NotesSchema;
    const before = structuredClone(notes);

    resolveNoteEvents({
      notes,
      barIndex: 0,
      resolveValue: () => 1,
    });

    expect(notes).toEqual(before);
  });
});
