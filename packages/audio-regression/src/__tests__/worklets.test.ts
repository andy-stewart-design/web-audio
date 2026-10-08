import { describe, expect, it } from "vitest";
import { normalizeCase, planRender } from "../cases";
import { withRenderer } from "../runner/render";
import { sketch } from "./support/cases";
import {
  throwingLateProcessor,
  throwingProcessor,
  withBrokenWorklet,
} from "./support/worklet-failures";

const code =
  "d.synth('sawtooth').notes(57).gain(0.3).fx(d.lpf(d.lfo(300, 2500).norm().wave('sine').speed(1))).push();";

describe("native worklet diagnostics", () => {
  it("rejects first/final-quantum failures, closes each context, and recovers", async () => {
    const input = sketch({
      code,
      tailSeconds: 0,
      settings: { sampleRate: 44_100, startOffsetFrames: 4_417 },
    });
    const { frameCount } = planRender(normalizeCase(input));
    await withRenderer(async (renderer) => {
      for (const [label, moduleSource] of [
        ["first quantum", throwingProcessor],
        ["final quantum", throwingLateProcessor(frameCount)],
      ] as const) {
        await expect(
          renderer
            .render({
              ...input,
              code: withBrokenWorklet(code, moduleSource),
            })
            .then(() => undefined),
          label,
        ).rejects.toThrow(/deliberate .*processor failure/);
        expect(renderer.browser.contexts(), label).toHaveLength(0);
      }
      expect(
        (await renderer.render(input)).metrics.some(({ rms }) => rms > 0),
      ).toBe(true);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });
});
