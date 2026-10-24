import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, expectTypeOf, it } from "vitest";
import Drome from "@/drome";
import Envelope from "@/automations/envelope";
import { decodeNumericInput } from "@/inputs/decode-numeric-input";

function staticValues(input: Parameters<typeof decodeNumericInput>[0]) {
  const decoded = decodeNumericInput(input);
  if (decoded instanceof RandomCycle) throw new Error("Expected static input");
  return decoded;
}

describe("structured numeric input", () => {
  it("preserves aliases and argument geometry", () => {
    const d = new Drome();

    expect(staticValues([d.structured(0.2, 0.1)])).toEqual([[0.2], [0.1]]);
    expect(staticValues([d.str([0.2, 0.1])])).toEqual([[0.2, 0.1]]);

    const detached = d.str;
    expect(staticValues([detached(0.3, 0.4)])).toEqual([[0.3], [0.4]]);
    expect(d.str).not.toBe(d.structured);
  });

  it("matches legacy structured and numeric shorthand patterns", () => {
    const d = new Drome();
    const bars = staticValues([d.str(0.2, 0.1)]);
    const steps = staticValues([d.str([0.2, 0.1])]);

    expect(bars).toEqual(staticValues([0.2, 0.1]));
    expect(bars).toEqual(staticValues(["<0.2 0.1>"]));
    expect(steps).toEqual(staticValues([[0.2, 0.1]]));
    expect(steps).toEqual(staticValues(["0.2 0.1"]));
    expect(staticValues([d.str(-0.2, 0)])).toEqual(staticValues(["<-0.2 0>"]));
  });

  it("normalizes one reusable value as the whole numeric argument", () => {
    const d = new Drome();
    const nested = d.str(0.2);

    expect(() =>
      Reflect.apply(decodeNumericInput, undefined, [[[nested]]]),
    ).toThrow("sole argument");
    expect(() =>
      Reflect.apply(decodeNumericInput, undefined, [[nested, 0.1]]),
    ).toThrow("sole argument");
    expect(() => staticValues([d.str([[0.2], 0.1])])).toThrow("finite number");
  });

  it("does not change raw legacy array aliasing", () => {
    const bar = [0.2, 0.1];
    const decoded = decodeNumericInput([bar]);
    if (decoded instanceof RandomCycle)
      throw new Error("Expected static input");

    expect(decoded[0]).toBe(bar);
    bar[0] = 0.9;
    expect(decoded[0][0]).toBe(0.9);
  });

  it("keeps static typing and direct random permissions distinct", () => {
    const d = new Drome();
    const numeric = d.str(0.2, 0.1);
    const strings = d.str("bd", "sd");
    const nullable = d.str([60, null, 64]);
    const random = d.rand();

    const typeChecks = () => {
      d.synth().gain(numeric);
      d.synth().gain(random);
      // @ts-expect-error String structured values are event-only.
      d.synth().gain(strings);
      // @ts-expect-error Nullable structured values are event-only.
      d.synth().gain(nullable);
      // @ts-expect-error Random cycles cannot be wrapped in structured data.
      d.structured(random);
      // @ts-expect-error Random cycles cannot be wrapped in structured data.
      d.synth().gain(d.str(random));
    };
    expectTypeOf(typeChecks).toBeFunction();

    const decoded = staticValues([numeric]);
    expectTypeOf(decoded).toEqualTypeOf<number[][]>();
    expect(() =>
      Reflect.apply(decodeNumericInput, undefined, [[strings]]),
    ).toThrow("finite number");
    expect(() =>
      Reflect.apply(decodeNumericInput, undefined, [[nullable]]),
    ).toThrow("finite number");
    expect(() => Reflect.apply(d.structured, d, [random])).toThrow(
      "numbers, strings, null, or arrays",
    );
    expect(() => Reflect.apply(d.str, d, [random])).toThrow(
      "numbers, strings, null, or arrays",
    );
    expect(() => Reflect.apply(d.str, d, [[random]])).toThrow(
      "numbers, strings, null, or arrays",
    );
    expect(() => Reflect.apply(d.str, d, [random, 0.2])).toThrow(
      "numbers, strings, null, or arrays",
    );
    expect(decodeNumericInput([random])).toBe(random);
  });

  it("rejects invalid atoms and source objects at the builder boundary", () => {
    const d = new Drome();
    const envelope = new Envelope(0, 1);
    const lfo = d.lfo(0, 1);
    const midi = d.midi.cc("controller", 74);
    const typeChecks = () => {
      // @ts-expect-error A whole-pattern builder must have at least one value.
      d.str();
      // @ts-expect-error Reusable shorthand is not structured data.
      d.str(d.sh("0.2"));
      // @ts-expect-error Structured wrappers cannot be nested.
      d.str(d.str(0.2));
      // @ts-expect-error Random sources cannot be mixed with static bars.
      d.str(d.rand(), 0.2);
      // @ts-expect-error Random sources cannot be nested within static bars.
      d.str([d.rand()]);
      // @ts-expect-error Numeric wrappers must be the sole pattern argument.
      d.synth().gain(d.str(0.2), 0.1);
      // @ts-expect-error Numeric wrappers cannot be nested in a raw bar.
      d.synth().gain([d.str(0.2)]);
      // @ts-expect-error Modulation sources are not structured atoms.
      d.str(envelope);
      // @ts-expect-error Modulation sources are not structured atoms.
      d.str(lfo);
      // @ts-expect-error Modulation sources are not structured atoms.
      d.str(midi);
    };
    expectTypeOf(typeChecks).toBeFunction();

    expect(() => Reflect.apply(d.str, d, [])).toThrow("requires at least one");
    expect(() => Reflect.apply(d.str, d, [NaN])).toThrow("must be finite");
    expect(() => Reflect.apply(d.str, d, [Infinity])).toThrow("must be finite");
    expect(() => Reflect.apply(d.str, d, [envelope])).toThrow(
      "numbers, strings, null, or arrays",
    );
    expect(() => Reflect.apply(d.str, d, [lfo])).toThrow(
      "numbers, strings, null, or arrays",
    );
    expect(() => Reflect.apply(d.str, d, [midi])).toThrow(
      "numbers, strings, null, or arrays",
    );

    const staticInput = d.str(0.2);
    const random = d.rand();
    expect(() => Reflect.apply(d.str, d, [staticInput, staticInput])).toThrow(
      "numbers, strings, null, or arrays",
    );
    expect(() => Reflect.apply(d.str, d, [[staticInput]])).toThrow(
      "numbers, strings, null, or arrays",
    );
    expect(() => Reflect.apply(d.str, d, [random, 0.2])).toThrow(
      "numbers, strings, null, or arrays",
    );
  });
});
