import { describe, expect, it, vi } from "vitest";
import type {
  NotesSchema,
  ParameterSchema,
  RandomSchema,
  StaticSchema,
  StaticSchemaValue,
} from "@web-audio/schema";
import { materializeBarEvents } from "./materialize-bar-events";

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

function summarize(events: ReturnType<typeof materializeBarEvents>) {
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

describe("materializeBarEvents static sources", () => {
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
  ])("materializes $label unmasked notes", ({ bar, expected }) => {
    const notes = { source: staticSchema([bar]) } satisfies NotesSchema;

    expect(
      summarize(
        materializeBarEvents({ notes, barIndex: 0, resolve: unusedResolver }),
      ),
    ).toEqual(expected);
  });

  it("materializes a chord as one ordered multi-voice event", () => {
    const notes = {
      source: staticSchema(
        [[step(60, 0, 0, 0.5), step(64, 0, 0, 0.5), step(67, 1, 0.5, 0.5)]],
        true,
      ),
    } satisfies NotesSchema;

    expect(
      summarize(
        materializeBarEvents({ notes, barIndex: 0, resolve: unusedResolver }),
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
        materializeBarEvents({ notes, barIndex: 0, resolve: unusedResolver }),
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
        materializeBarEvents({ notes, barIndex: 1, resolve: unusedResolver }),
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
      materializeBarEvents({ notes, barIndex: 3, resolve: unusedResolver }).map(
        ({ hitIndex, voices }) => ({ hitIndex, voices }),
      ),
    ).toEqual([
      { hitIndex: 0, voices: [60] },
      { hitIndex: 1, voices: [64] },
    ]);
  });
});

describe("materializeBarEvents random eligibility and values", () => {
  it("does not consume hit indices for random-mask misses", () => {
    const source = staticSchema([[step(60, 0), step(64, 1)]]);
    const mask = randomSchema(
      staticSchema([[step(1, 0), step(1, 1), step(1, 2), step(1, 3)]]),
    );
    const resolve = vi.fn(
      (_schema: ParameterSchema, _barIndex: number, valueIndex: number) =>
        valueIndex % 2 === 0 ? 1 : 0,
    );

    const events = materializeBarEvents({
      notes: { source, mask },
      barIndex: 0,
      resolve,
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
    expect(resolve.mock.calls.map(([, , valueIndex]) => valueIndex)).toEqual([
      0, 1, 2, 3,
    ]);
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
      const resolve = vi.fn(
        (schema: ParameterSchema, _barIndex: number, valueIndex: number) => {
          if (schema === mask) return 1;
          return [60, 64][valueIndex];
        },
      );

      const events = materializeBarEvents({
        notes: { source, mask },
        barIndex: 0,
        resolve,
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
        resolve.mock.calls
          .filter(([schema]) => schema === source)
          .map(([, , valueIndex]) => valueIndex),
      ).toEqual([0, 1]);
    },
  );

  it("does not consume hit indices for unmasked random structural rests", () => {
    const source = randomSchema(
      staticSchema([[step(1, 0), step(0, 1), step(1, 2)]]),
    );
    const resolve = vi.fn(
      (_schema: ParameterSchema, _barIndex: number, hitIndex: number) =>
        [60, 64][hitIndex],
    );

    const events = materializeBarEvents({
      notes: { source },
      barIndex: 0,
      resolve,
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
    expect(resolve.mock.calls.map(([, , hitIndex]) => hitIndex)).toEqual([
      0, 1,
    ]);
  });
});

describe("materializeBarEvents empty bars and immutability", () => {
  it("returns no events for empty source or mask bars", () => {
    const source = staticSchema([[]]);
    const populatedSource = staticSchema([[step(60, 0)]]);
    const emptyMask = staticSchema([[]]);

    expect(
      materializeBarEvents({
        notes: { source },
        barIndex: 0,
        resolve: unusedResolver,
      }),
    ).toEqual([]);
    expect(
      materializeBarEvents({
        notes: { source: populatedSource, mask: emptyMask },
        barIndex: 0,
        resolve: unusedResolver,
      }),
    ).toEqual([]);
  });

  it("returns no events for all-rest structural grids", () => {
    const source = staticSchema([[step(60, 0)]]);
    const allRestMask = staticSchema([[step(0, 0), step(0, 1)]]);
    const randomSource = randomSchema(staticSchema([[step(0, 0), step(0, 1)]]));

    expect(
      materializeBarEvents({
        notes: { source, mask: allRestMask },
        barIndex: 0,
        resolve: unusedResolver,
      }),
    ).toEqual([]);
    expect(
      materializeBarEvents({
        notes: { source: randomSource },
        barIndex: 0,
        resolve: unusedResolver,
      }),
    ).toEqual([]);
  });

  it("returns no events for an empty random source bar under a mask", () => {
    const source = randomSchema(staticSchema([[]]));
    const mask = staticSchema([[step(1, 0)]]);

    expect(
      materializeBarEvents({
        notes: { source, mask },
        barIndex: 0,
        resolve: unusedResolver,
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

    materializeBarEvents({
      notes,
      barIndex: 0,
      resolve: () => 1,
    });

    expect(notes).toEqual(before);
  });
});
