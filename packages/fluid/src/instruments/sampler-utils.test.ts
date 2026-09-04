import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it, vi } from "vitest";
import Parameter from "@/patterns/parameter";
import {
  getChopSequenceSchema,
  getDefaultNotes,
  getDefaultNotesForSequence,
  getRegion,
} from "./sampler-utils";

describe("sampler numeric schemas", () => {
  it("serializes static start/end regions as value-only patterns", () => {
    const region = getRegion({
      fitSchema: null,
      chopState: null,
      chopBars: 1,
      region: {
        start: new Parameter([0, 0.25]),
        mode: "end",
        end: new Parameter(0.75),
      },
    });

    expect(region).toEqual({
      type: "static",
      start: { type: "static", cycle: [[0, 0.25]] },
      end: { type: "static", cycle: [[0.75]] },
    });
  });

  it("serializes static duration regions without timing fields", () => {
    const region = getRegion({
      fitSchema: null,
      chopState: null,
      chopBars: 1,
      region: {
        start: new Parameter(0.4),
        mode: "duration",
        duration: new Parameter(0.15),
      },
    });

    expect(region).toEqual({
      type: "static",
      start: { type: "static", cycle: [[0.4]] },
      duration: { type: "static", cycle: [[0.15]] },
    });
  });

  it("preserves random region configuration and warnings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const region = getRegion({
      fitSchema: null,
      chopState: null,
      chopBars: 1,
      region: {
        start: null,
        mode: "duration",
        duration: new Parameter(
          new RandomCycle().steps(2, 0).range(-0.1, 1.1).rib(7, 4),
        ),
      },
    });

    expect(region).toMatchObject({
      type: "static",
      duration: {
        type: "random-number",
        valuesPerBar: [2, 0],
        range: { min: -0.1, max: 1.1 },
        segments: [{ seed: 7, len: 4 }],
      },
    });
    expect(warn).toHaveBeenCalledWith(
      "[Sampler] duration() random range is outside [0, 1]; resolved values will be clamped by the engine.",
    );
  });

  it("serializes generated fit slice values independently from timing", () => {
    const region = getRegion({
      fitSchema: { type: "fit", bars: 3 },
      chopState: null,
      chopBars: 3,
      region: null,
    });

    expect(region).toMatchObject({
      type: "chop",
      sequence: { type: "static", cycle: [[0], [1], [2]] },
    });
    expect(region).not.toHaveProperty("sequence.cycle.0.0.offset");
  });

  it("serializes authored and generated chop sequences as numeric values", () => {
    expect(
      getChopSequenceSchema({
        sliceCount: 4,
        sequence: new Parameter([0, 2, 1, 3]),
      }),
    ).toEqual({ type: "static", cycle: [[0, 2, 1, 3]] });

    expect(
      getChopSequenceSchema(
        {
          sliceCount: 4,
          sequence: null,
        },
        2,
      ),
    ).toEqual({
      type: "static",
      cycle: [
        [0, 1],
        [2, 3],
      ],
    });
  });

  it("expands a default random chop pattern to generated hit counts", () => {
    expect(
      getChopSequenceSchema(
        {
          sliceCount: 8,
          sequence: new Parameter(new RandomCycle().int().range(0, 7)),
        },
        2,
      ),
    ).toMatchObject({
      type: "random-number",
      valuesPerBar: [4, 4],
      dataType: "integer",
      range: { min: 0, max: 7 },
    });
  });

  it("keeps generated note values separate from generated timing", () => {
    expect(getDefaultNotes(45, 2, 4)).toEqual({
      type: "static",
      cycle: [[[45]], [null], [[45]], [null]],
    });
    expect(
      getDefaultNotesForSequence(
        45,
        new RandomCycle().steps(2, 0, 1).getRandomSchema(),
        null,
      ),
    ).toEqual({
      type: "static",
      cycle: [[[45], [45]], [null], [[45]]],
    });
  });
});
