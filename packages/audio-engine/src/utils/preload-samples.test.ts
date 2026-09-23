import type {
  BankSchema,
  RandomNumberPattern,
  SamplerSchema,
} from "@web-audio/schema";
import { describe, expect, it, vi } from "vitest";
import { defaultSamplerSchema, fileBank } from "../test-utils/schema-fixtures";
import { planSamplerPreloads } from "./preload-samples";

function schema(
  variationIndices?: SamplerSchema["eventPattern"]["variationIndices"],
  direction: SamplerSchema["direction"] = "forward",
) {
  return defaultSamplerSchema({
    direction,
    eventPattern: {
      timing: { cycle: [[{ offset: 0, duration: 1 }]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      ...(variationIndices && { variationIndices }),
    },
  });
}

function random(
  overrides: Partial<RandomNumberPattern> = {},
): RandomNumberPattern {
  return {
    type: "random-number",
    valuesPerBar: [1],
    dataType: "float",
    segments: [{ seed: 42 }],
    algorithm: "xor",
    order: "forward",
    ...overrides,
  };
}

function urls(plans: ReturnType<typeof planSamplerPreloads>) {
  return plans.map(({ url }) => url).sort();
}

describe("planSamplerPreloads", () => {
  it("plans default variation zero", () => {
    expect(urls(planSamplerPreloads(schema(), fileBank()))).toEqual([
      "https://example.com/bd.wav",
    ]);
  });

  it("includes every statically requested variation URL", () => {
    const banks = fileBank("kit", "bd", ["0.wav", "1.wav", "2.wav"]);
    const sampler = schema({
      type: "static",
      cycle: [[[0], [2], [1, 2]]],
    });

    expect(urls(planSamplerPreloads(sampler, banks))).toEqual([
      "0.wav",
      "1.wav",
      "2.wav",
    ]);
  });

  it("normalizes static variation indices with the runtime rule", () => {
    const banks = fileBank("kit", "bd", ["0.wav", "1.wav", "2.wav"]);
    const sampler = schema({
      type: "static",
      cycle: [[[-1], [3.6]]],
    });

    expect(urls(planSamplerPreloads(sampler, banks))).toEqual([
      "1.wav",
      "2.wav",
    ]);
  });

  it("wraps static variation layers per source key", () => {
    const banks: Record<string, BankSchema> = {
      kit: {
        samples: {
          bd: {
            "48": [{ type: "file", src: "48-0.wav" }],
            "60": [
              { type: "file", src: "60-0.wav" },
              { type: "file", src: "60-1.wav" },
              { type: "file", src: "60-2.wav" },
            ],
          },
        },
      },
    };
    const sampler = schema({
      type: "static",
      cycle: [[[4, -1]]],
    });

    expect(urls(planSamplerPreloads(sampler, banks))).toEqual([
      "48-0.wav",
      "60-1.wav",
      "60-2.wav",
    ]);
  });

  it("narrows finite random value maps", () => {
    const banks = fileBank("kit", "bd", ["0.wav", "1.wav", "2.wav"]);

    expect(
      urls(planSamplerPreloads(schema(random({ valueMap: [-1, 4] })), banks)),
    ).toEqual(["1.wav", "2.wav"]);
  });

  it("narrows small integral random ranges", () => {
    const banks = fileBank("kit", "bd", ["0.wav", "1.wav", "2.wav"]);

    expect(
      urls(
        planSamplerPreloads(
          schema(random({ dataType: "integer", range: { min: 1, max: 2 } })),
          banks,
        ),
      ),
    ).toEqual(["1.wav", "2.wav"]);
  });

  it.each([
    random(),
    random({ dataType: "integer", range: { min: 0.5, max: 2 } }),
    random({
      dataType: "integer",
      range: { min: 0, max: 2 },
      quantValue: 0.5,
    }),
    random({ dataType: "integer", range: { min: 0, max: 1_000 } }),
  ])(
    "preloads all available variations for uncertain random output",
    (pattern) => {
      const banks = fileBank("kit", "bd", ["0.wav", "1.wav", "2.wav"]);

      expect(urls(planSamplerPreloads(schema(pattern), banks))).toEqual([
        "0.wav",
        "1.wav",
        "2.wav",
      ]);
    },
  );

  it("plans variations independently for every source key", () => {
    const banks: Record<string, BankSchema> = {
      kit: {
        samples: {
          bd: {
            "48": [{ type: "file", src: "48-0.wav" }],
            "60": [
              { type: "file", src: "60-0.wav" },
              { type: "file", src: "60-1.wav" },
            ],
          },
        },
      },
    };

    expect(urls(planSamplerPreloads(schema(random()), banks))).toEqual([
      "48-0.wav",
      "60-0.wav",
      "60-1.wav",
    ]);
  });

  it("deduplicates shared file and sprite URLs", () => {
    const banks: Record<string, BankSchema> = {
      kit: {
        samples: {
          bd: {
            "0": [
              { type: "sprite", src: "kit.wav", start: 0, end: 0.5 },
              { type: "sprite", src: "kit.wav", start: 0.5, end: 1 },
            ],
            "60": [{ type: "file", src: "kit.wav" }],
          },
        },
      },
    };

    expect(urls(planSamplerPreloads(schema(random()), banks))).toEqual([
      "kit.wav",
    ]);
  });

  it("plans sequential, layered, and duplicate names as one URL set", () => {
    const banks: Record<string, BankSchema> = {
      kit: {
        samples: {
          bd: {
            "0": [{ type: "file", src: "shared.wav" }],
          },
          sd: {
            "0": [{ type: "sprite", src: "shared.wav", start: 0, end: 0.5 }],
          },
          piano: {
            "48": [{ type: "file", src: "piano-48.wav" }],
            "60": [{ type: "file", src: "piano-60.wav" }],
          },
        },
      },
    };
    const sampler = schema();
    sampler.eventPattern.sampleNames = {
      type: "static",
      cycle: [[["bd", "sd"], ["bd"]], [["piano"]]],
    };

    expect(urls(planSamplerPreloads(sampler, banks))).toEqual([
      "piano-48.wav",
      "piano-60.wav",
      "shared.wav",
    ]);
  });

  it("warns for missing names and empty entries while planning known names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const banks: Record<string, BankSchema> = fileBank();
    banks.kit.samples.empty = { "0": [] };
    const sampler = schema();
    sampler.eventPattern.sampleNames = {
      type: "static",
      cycle: [[["missing", "bd"], ["empty"]]],
    };

    expect(urls(planSamplerPreloads(sampler, banks))).toEqual([
      "https://example.com/bd.wav",
    ]);
    expect(warn).toHaveBeenCalledWith(
      '[Sampler] Sample "missing" not found in bank "kit"',
    );
    expect(warn).toHaveBeenCalledWith(
      '[Sampler] No entries found for "kit/empty" source 0',
    );
  });

  it("marks reverse and alternate sources for reverse preparation", () => {
    expect(
      planSamplerPreloads(schema(undefined, "reverse"), fileBank()),
    ).toEqual([{ url: "https://example.com/bd.wav", reverse: true }]);
    expect(
      planSamplerPreloads(schema(undefined, "alternate"), fileBank()),
    ).toEqual([{ url: "https://example.com/bd.wav", reverse: true }]);
  });

  it("warns and continues for missing external resources", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(planSamplerPreloads(schema(), {})).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      '[Sampler] Bank "kit" not found in schema',
    );
  });
});
