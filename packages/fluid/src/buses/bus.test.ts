import { describe, expect, it } from "vitest";
import Drome, { Bus } from "@/index";

describe("Bus", () => {
  it("is exported from the package entry point", () => {
    expect(new Bus("music").name).toBe("music");
  });

  it("defaults output gain to one with no effects", () => {
    expect(new Drome().bus("music").getSchema()).toEqual({
      gain: 1,
      effects: [],
    });
  });

  it("normalizes and exposes its name", () => {
    expect(new Drome().bus("  Drum Group  ").name).toBe("Drum Group");
  });

  it("sets gain with last-write-wins semantics", () => {
    const bus = new Drome().bus("music");

    expect(bus.gain(0.5)).toBe(bus);
    expect(bus.gain(2).getSchema().gain).toBe(2);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid gain %s",
    (gain) => {
      expect(() => new Drome().bus("music").gain(gain)).toThrow();
    },
  );

  it("appends effects in exact order across calls", () => {
    const d = new Drome();
    const bus = d.bus("music").fx(d.lpf(800), d.gain(0.5)).fx(d.hpf(200));
    const effects = bus.getSchema().effects;

    expect(effects.map((effect) => effect.type)).toEqual([
      "filter",
      "gain",
      "filter",
    ]);
    expect(
      effects.map((effect) =>
        effect.type === "filter" ? effect.filterType : effect.type,
      ),
    ).toEqual(["lp", "gain", "hp"]);
    expect(bus.fx()).toBe(bus);
  });
});

describe("Drome.bus", () => {
  it("returns the same builder for repeated normalized names", () => {
    const d = new Drome();
    const first = d.bus(" drums ");
    const second = d.bus("drums");

    expect(second).toBe(first);
    first.gain(0.8);
    second.fx(d.lpf(8_000));
    expect(d.getSchema().buses.drums).toEqual(first.getSchema());
  });

  it("configures the implicit main bus", () => {
    const d = new Drome();
    const main = d.bus(" main ").gain(0.9).fx(d.lpf(10_000));

    expect(main).toBe(d.bus("main"));
    expect(d.getSchema().buses.main).toEqual(main.getSchema());
  });

  it("always emits main and one entry per canonical name", () => {
    const d = new Drome();
    d.bus(" drums ");
    d.bus("drums");
    d.bus("Music");
    d.bus("music");

    expect(Object.keys(d.getSchema().buses)).toEqual([
      "main",
      "drums",
      "Music",
      "music",
    ]);
  });

  it("does not depend on instrument or bus declaration order", () => {
    const d = new Drome();
    d.synth().push();
    d.bus("music").gain(0.75);

    expect(d.getSchema().buses).toEqual({
      main: { gain: 1, effects: [] },
      music: { gain: 0.75, effects: [] },
    });
  });
});
