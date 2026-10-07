import { describe, expect, it } from "vitest";
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
  it.each([throwingProcessor, throwingLateProcessor])(
    "rejects processor failure without accepting partial audio, then recovers",
    async (moduleSource) => {
      await withRenderer(async (renderer) => {
        const input = sketch({ code, tailSeconds: 0 });
        await expect(
          renderer
            .render({
              ...input,
              code: withBrokenWorklet(code, moduleSource),
            })
            .then(() => undefined),
        ).rejects.toThrow(/deliberate .*processor failure/);
        expect(renderer.browser.contexts()).toHaveLength(0);
        expect(
          (await renderer.render(input)).metrics.some(({ rms }) => rms > 0),
        ).toBe(true);
      });
    },
  );
});
