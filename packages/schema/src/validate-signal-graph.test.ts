import { describe, expect, it } from "vitest";
import type { DromeSchema } from "./index";
import {
  SignalGraphValidationError,
  validateSignalGraph,
} from "./validate-signal-graph";

const validSchema = () =>
  ({
    bpm: 120,
    buses: {
      main: { gain: 1, effects: [] },
      drums: { gain: 0.8, effects: [{ type: "gain" }] },
      music: { gain: 1, effects: [{ type: "filter" }] },
    },
    instruments: [
      {
        route: "drums",
        sends: { music: 0.25 },
        ducks: {
          music: { depth: 0.75, onset: 0, recovery: 1 },
        },
        effects: [{ type: "filter" }],
      },
    ],
    banks: {},
  }) as unknown as DromeSchema;

const validateUnknown = (value: unknown) =>
  validateSignalGraph(value as DromeSchema);

const expectPath = (value: unknown, path: string) => {
  try {
    validateUnknown(value);
  } catch (error) {
    expect(error).toBeInstanceOf(SignalGraphValidationError);
    expect((error as SignalGraphValidationError).path).toBe(path);
    return;
  }
  throw new Error("Expected graph validation to fail");
};

describe("validateSignalGraph", () => {
  it("accepts valid main-only and named-bus graphs", () => {
    expect(() =>
      validateSignalGraph({
        buses: { main: { gain: 1, effects: [] } },
        instruments: [],
        banks: {},
      }),
    ).not.toThrow();
    expect(() => validateSignalGraph(validSchema())).not.toThrow();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid BPM %s",
    (bpm) => {
      const schema = validSchema();
      schema.bpm = bpm;
      expectPath(schema, "bpm");
    },
  );

  it("allows omitted BPM", () => {
    const schema = validSchema();
    delete schema.bpm;
    expect(() => validateSignalGraph(schema)).not.toThrow();
  });

  it.each([
    [{ instruments: [], banks: {} }, "buses"],
    [{ buses: null, instruments: [], banks: {} }, "buses"],
    [{ buses: [], instruments: [], banks: {} }, "buses"],
    [{ buses: {}, instruments: [], banks: {} }, "buses.main"],
    [{ buses: { main: null }, instruments: [], banks: {} }, 'buses["main"]'],
  ])("rejects malformed bus graphs", (schema, path) => {
    expectPath(schema, path as string);
  });

  it.each([
    ["", 'buses[""]'],
    [" drums", 'buses[" drums"]'],
    ["drums ", 'buses["drums "]'],
  ])("rejects non-canonical bus name %j", (name, path) => {
    const schema = validSchema();
    schema.buses[name] = { gain: 1, effects: [] };
    expectPath(schema, path);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.1])(
    "rejects invalid bus gain %s",
    (gain) => {
      const schema = validSchema();
      schema.buses.main.gain = gain;
      expectPath(schema, 'buses["main"].gain');
    },
  );

  it("accepts bus gain above unity", () => {
    const schema = validSchema();
    schema.buses.main.gain = 2;
    expect(() => validateSignalGraph(schema)).not.toThrow();
  });

  it.each([
    [undefined, "instruments[0].route"],
    [" missing ", "instruments[0].route"],
    ["missing", "instruments[0].route"],
  ])("rejects invalid routes", (route, path) => {
    const schema = validSchema() as unknown as {
      instruments: Record<string, unknown>[];
    };
    schema.instruments[0].route = route;
    expectPath(schema, path);
  });

  it.each([
    ["sends", null, "instruments[0].sends"],
    ["sends", [], "instruments[0].sends"],
    ["ducks", null, "instruments[0].ducks"],
    ["ducks", [], "instruments[0].ducks"],
  ])("rejects malformed %s records", (field, value, path) => {
    const schema = validSchema() as unknown as {
      instruments: Record<string, unknown>[];
    };
    schema.instruments[0][field] = value;
    expectPath(schema, path);
  });

  it.each(["main", "missing", " music ", ""])(
    "rejects invalid send target %j",
    (target) => {
      const schema = validSchema();
      schema.instruments[0].sends = { [target]: 0.5 };
      expectPath(schema, `instruments[0].sends[${JSON.stringify(target)}]`);
    },
  );

  it.each([-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid send amount %s",
    (amount) => {
      const schema = validSchema();
      schema.instruments[0].sends.music = amount;
      expectPath(schema, 'instruments[0].sends["music"]');
    },
  );

  it.each(["main", "missing", " music ", ""])(
    "rejects invalid duck target %j",
    (target) => {
      const schema = validSchema();
      schema.instruments[0].ducks = {
        [target]: { depth: 1, onset: 0, recovery: 1 },
      };
      expectPath(schema, `instruments[0].ducks[${JSON.stringify(target)}]`);
    },
  );

  it("rejects malformed nested duck records", () => {
    const schema = validSchema() as unknown as {
      instruments: { ducks: Record<string, unknown> }[];
    };
    schema.instruments[0].ducks.music = null;
    expectPath(schema, 'instruments[0].ducks["music"]');
  });

  it.each([
    ["depth", -0.1],
    ["depth", 1.1],
    ["depth", Number.NaN],
    ["onset", -0.1],
    ["onset", Number.POSITIVE_INFINITY],
    ["recovery", -0.1],
    ["recovery", Number.NaN],
  ])("rejects invalid duck %s %s", (field, value) => {
    const schema = validSchema();
    const duck = schema.instruments[0].ducks.music as unknown as Record<
      string,
      unknown
    >;
    duck[field] = value;
    expectPath(schema, `instruments[0].ducks["music"].${field}`);
  });

  it.each([
    ["bus", null, 'buses["main"].effects'],
    ["bus", [{ type: "reverb" }], 'buses["main"].effects[0].type'],
    ["instrument", null, "instruments[0].effects"],
    ["instrument", [{ type: "compressor" }], "instruments[0].effects[0].type"],
  ])("rejects unsupported or malformed %s effects", (owner, effects, path) => {
    const schema = validSchema() as unknown as {
      buses: Record<string, Record<string, unknown>>;
      instruments: Record<string, unknown>[];
    };
    if (owner === "bus") schema.buses.main.effects = effects;
    else schema.instruments[0].effects = effects;
    expectPath(schema, path);
  });

  it("reports old instrument schemas through a structured error", () => {
    const schema = validSchema() as unknown as {
      instruments: Record<string, unknown>[];
    };
    delete schema.instruments[0].route;
    delete schema.instruments[0].sends;
    delete schema.instruments[0].ducks;
    expectPath(schema, "instruments[0].route");
  });

  it("does not mutate its input", () => {
    const schema = validSchema();
    const before = structuredClone(schema);
    validateSignalGraph(schema);
    expect(schema).toEqual(before);
  });
});
