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

  it("rejects non-constant bus effect parameters with a precise path", () => {
    const effect: EffectSchema = {
      type: "gain",
      gain: { ...staticParam(1), cycle: [[], []] },
    };

    expect(() =>
      validateDromeGraph(schema({ drums: { gain: 1, effects: [effect] } })),
    ).toThrow(
      '[Schema] Bus "drums" effects[0].gain must be one finite constant static value.',
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
