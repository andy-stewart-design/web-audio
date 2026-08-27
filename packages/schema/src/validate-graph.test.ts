import { describe, expect, it } from "vitest";
import type {
  DromeSchema,
  EffectSchema,
  InstrumentSchema,
  StaticSchema,
} from "./index";
import { validateDromeGraph } from "./validate-graph";

function staticParam(value: number): StaticSchema {
  return {
    type: "static",
    polyphonic: false,
    cycle: [[{ value, offset: 0, duration: 1, stepIndex: 0 }]],
  };
}

function instrument(route = "main", sends: Record<string, number> = {}) {
  return { route, sends } as InstrumentSchema;
}

function schema(
  buses: DromeSchema["buses"] = {},
  instruments: InstrumentSchema[] = [],
): DromeSchema {
  return {
    bpm: undefined,
    buses,
    instruments: instruments as never[],
    banks: {},
  };
}

describe("validateDromeGraph", () => {
  it("accepts a canonical graph", () => {
    expect(() =>
      validateDromeGraph(
        schema(
          {
            drums: { gain: 0.8, effects: [] },
            verb: { gain: 0.5, effects: [] },
          },
          [instrument("drums", { verb: 0.2 })],
        ),
      ),
    ).not.toThrow();
  });

  it.each(["", " drums "])("rejects non-canonical bus name %j", (name) => {
    expect(() =>
      validateDromeGraph(schema({ [name]: { gain: 1, effects: [] } })),
    ).toThrow(`[Schema] Bus name "${name}" is not canonical.`);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid bus gain %s",
    (gain) => {
      expect(() =>
        validateDromeGraph(schema({ drums: { gain, effects: [] } })),
      ).toThrow(
        '[Schema] Bus "drums" gain must be a finite number greater than or equal to 0.',
      );
    },
  );

  it("rejects effects on main", () => {
    expect(() =>
      validateDromeGraph(
        schema({
          main: {
            gain: 1,
            effects: [{ type: "gain", gain: staticParam(1) }],
          },
        }),
      ),
    ).toThrow("[Schema] Effects on main are not supported in the bus MVP.");
  });

  it("accepts multi-bar and multi-step static bus effect parameters", () => {
    const effect: EffectSchema = {
      type: "gain",
      gain: {
        ...staticParam(1),
        cycle: [
          [
            { value: 1, offset: 0, duration: 0.5, stepIndex: 0 },
            { value: 0.5, offset: 0.5, duration: 0.5, stepIndex: 1 },
          ],
          [{ value: 0.25, offset: 0, duration: 1, stepIndex: 0 }],
        ],
      },
    };

    expect(() =>
      validateDromeGraph(schema({ drums: { gain: 1, effects: [effect] } })),
    ).not.toThrow();
  });

  it.each([
    ["empty cycle", []],
    ["empty row", [[]]],
    [
      "non-finite first value",
      [[{ value: Number.NaN, offset: 0, duration: 1, stepIndex: 0 }]],
    ],
  ])("rejects a static bus parameter with %s", (_label, cycle) => {
    const effect: EffectSchema = {
      type: "gain",
      gain: { ...staticParam(1), cycle },
    };

    expect(() =>
      validateDromeGraph(schema({ drums: { gain: 1, effects: [effect] } })),
    ).toThrow(
      '[Schema] Bus "drums" effects[0].gain must be a finite bar-resolvable static parameter.',
    );
  });

  it("continues to reject random bus parameters", () => {
    const effect: EffectSchema = {
      type: "gain",
      gain: {
        type: "random",
        dataType: "float",
        segments: [{ seed: 0 }],
        quantValue: undefined,
        range: undefined,
        algorithm: "xor",
        grid: staticParam(1),
      },
    };

    expect(() =>
      validateDromeGraph(schema({ drums: { gain: 1, effects: [effect] } })),
    ).toThrow(
      '[Schema] Bus "drums" effects[0].gain must be a finite bar-resolvable static parameter.',
    );
  });

  it("rejects unresolved and non-canonical routes", () => {
    expect(() => validateDromeGraph(schema({}, [instrument("drums")]))).toThrow(
      '[Schema] Instrument 0 route "drums" does not reference a declared bus.',
    );
    expect(() =>
      validateDromeGraph(schema({}, [instrument(" main ")])),
    ).toThrow('[Schema] Instrument 0 route " main " is not canonical.');
  });

  it("rejects main, unresolved, non-canonical, and invalid sends", () => {
    expect(() =>
      validateDromeGraph(schema({}, [instrument("main", { main: 0.2 })])),
    ).toThrow("[Schema] Instrument 0 send cannot target main.");
    expect(() =>
      validateDromeGraph(schema({}, [instrument("main", { verb: 0.2 })])),
    ).toThrow(
      '[Schema] Instrument 0 send "verb" does not reference a declared bus.',
    );
    expect(() =>
      validateDromeGraph(
        schema({ verb: { gain: 1, effects: [] } }, [
          instrument("main", { " verb ": 0.2 }),
        ]),
      ),
    ).toThrow('[Schema] Instrument 0 send target " verb " is not canonical.');
    expect(() =>
      validateDromeGraph(
        schema({ verb: { gain: 1, effects: [] } }, [
          instrument("main", { verb: 2 }),
        ]),
      ),
    ).toThrow(
      '[Schema] Instrument 0 send "verb" amount must be a finite number in [0, 1].',
    );
  });
});
