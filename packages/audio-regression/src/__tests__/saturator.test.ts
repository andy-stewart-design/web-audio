import { describe, expect, it } from "vitest";
import { withRenderer } from "../runner/render";
import type { SketchCase } from "../types";

const synthCase: SketchCase = {
  id: "saturator-synth-smoke",
  description: "Public synth saturator smoke",
  code: `d.synth("sawtooth")
  .notes(60)
  .gain(0.4)
  .fx(d.saturator(3).postgain(0.25))
  .push();`,
  bars: 1,
  tailSeconds: 0.1,
  settings: { sampleRate: 48_000, channels: 2, startOffsetFrames: 4_800 },
};

const busCase: SketchCase = {
  id: "saturator-bus-smoke",
  description: "Public named-bus saturator smoke",
  code: `d.bus("drums").fx(d.saturator(2).postgain(0.3));
d.synth("square").notes(48).gain(0.35).route("drums").push();`,
  bars: 1,
  tailSeconds: 0.1,
  settings: { sampleRate: 48_000, channels: 2, startOffsetFrames: 4_800 },
};

const dryCases: Record<string, SketchCase> = {
  [synthCase.id]: {
    ...synthCase,
    id: "saturator-synth-smoke-dry",
    description: "Public synth dry comparison",
    code: `d.synth("sawtooth").notes(60).gain(0.4).push();`,
  },
  [busCase.id]: {
    ...busCase,
    id: "saturator-bus-smoke-dry",
    description: "Public named-bus dry comparison",
    code: `d.bus("drums");
d.synth("square").notes(48).gain(0.35).route("drums").push();`,
  },
};

function assertFiniteAndAudible(result: {
  channels: readonly ArrayLike<number>[];
  metrics: readonly { rms: number }[];
}) {
  expect(
    result.channels.every((channel) =>
      Array.from(channel).every(Number.isFinite),
    ),
  ).toBe(true);
  expect(result.metrics.some(({ rms }) => rms > 1e-5)).toBe(true);
}

describe("native public saturator smoke", () => {
  it.each([synthCase, busCase])(
    "renders finite repeatable saturation through $id",
    async (input) => {
      await withRenderer(async (renderer) => {
        const first = await renderer.render(input);
        const second = await renderer.render(input);
        const dry = await renderer.render(dryCases[input.id]);

        assertFiniteAndAudible(first);
        assertFiniteAndAudible(second);
        assertFiniteAndAudible(dry);
        expect(first.channels).toEqual(second.channels);
        expect(first.channels).not.toEqual(dry.channels);
        expect(renderer.browser.contexts()).toHaveLength(0);
      });
    },
  );
});
