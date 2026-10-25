import { describe, expect, it } from "vitest";
import { compareAudio } from "../runner/compare";
import { withRenderer } from "../runner/render";
import {
  audio,
  compareWindow,
  eventWindows,
  expectAudibleWindows,
  expectNativeHealth,
  scalarEnvelopeCase,
  temporaryEnvelopeCase,
} from "./support/patterned-envelope";

const gainMinimum = `"<[0 0.15] [0.3 0.45]>"`;
const gainMaximum = `"<[0.9 0.7] [0.8 0.6]>"`;
const detuneMinimum = `"<[0 180] [-240 360]>"`;
const detuneMaximum = `"<[600 960] [720 1200]>"`;

const crossingMinimum = `"<[1.2 0.8] [0.4 1.1]>"`;
const crossingMaximum = `"<[0.2 1.4] [1.6 -0.3]>"`;

describe("native patterned envelope bounds", () => {
  it("resolves minimum and maximum independently for every bar and hit", async () => {
    await withRenderer(async (renderer) => {
      const shorthand = await renderer.render(
        temporaryEnvelopeCase(
          "patterned-gain-shorthand",
          ".gain(envelope)",
          gainMinimum,
          gainMaximum,
        ),
      );
      const builder = await renderer.render(
        temporaryEnvelopeCase(
          "patterned-gain-builder",
          ".gain(envelope)",
          "d.str([0, 0.15], [0.3, 0.45])",
          "d.str([0.9, 0.7], [0.8, 0.6])",
        ),
      );
      const zeroMinimum = await renderer.render(
        temporaryEnvelopeCase(
          "patterned-gain-zero-min",
          ".gain(envelope)",
          "0",
          gainMaximum,
        ),
      );
      const constantMaximum = await renderer.render(
        temporaryEnvelopeCase(
          "patterned-gain-constant-max",
          ".gain(envelope)",
          gainMinimum,
          "0.9",
        ),
      );
      const scalarOracle = await renderer.render(
        scalarEnvelopeCase("patterned-gain-scalar-oracle"),
      );

      for (const result of [shorthand, builder, zeroMinimum, constantMaximum])
        expectNativeHealth(result);
      expectNativeHealth(scalarOracle);
      expect(compareAudio(audio(shorthand), audio(builder)).passed).toBe(true);
      expect(compareAudio(audio(shorthand), audio(scalarOracle)).passed).toBe(
        true,
      );

      const windows = eventWindows(shorthand);
      for (const result of [shorthand, builder, zeroMinimum, constantMaximum])
        expectAudibleWindows(result, windows);
      expect(compareWindow(shorthand, zeroMinimum, windows[0]!).passed).toBe(
        true,
      );
      expect(
        compareWindow(shorthand, constantMaximum, windows[0]!).passed,
      ).toBe(true);
      for (const window of windows.slice(1)) {
        expect(
          compareWindow(shorthand, zeroMinimum, window).worst?.error,
        ).toBeGreaterThan(1e-5);
        expect(
          compareWindow(shorthand, constantMaximum, window).worst?.error,
        ).toBeGreaterThan(1e-5);
      }
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("applies patterned minimum to the external detune envelope", async () => {
    await withRenderer(async (renderer) => {
      const shorthand = await renderer.render(
        temporaryEnvelopeCase(
          "patterned-detune-shorthand",
          ".gain(0.3).detune(envelope)",
          detuneMinimum,
          detuneMaximum,
        ),
      );
      const builder = await renderer.render(
        temporaryEnvelopeCase(
          "patterned-detune-builder",
          ".gain(0.3).detune(envelope)",
          "d.str([0, 180], [-240, 360])",
          "d.str([600, 960], [720, 1200])",
        ),
      );
      const zeroMinimum = await renderer.render(
        temporaryEnvelopeCase(
          "patterned-detune-zero-min",
          ".gain(0.3).detune(envelope)",
          "0",
          detuneMaximum,
        ),
      );

      for (const result of [shorthand, builder, zeroMinimum])
        expectNativeHealth(result);
      expect(compareAudio(audio(shorthand), audio(builder)).passed).toBe(true);

      const windows = eventWindows(shorthand);
      for (const result of [shorthand, builder, zeroMinimum])
        expectAudibleWindows(result, windows);
      expect(compareWindow(shorthand, zeroMinimum, windows[0]!).passed).toBe(
        true,
      );
      for (const window of windows.slice(1))
        expect(
          compareWindow(shorthand, zeroMinimum, window).worst?.error,
        ).toBeGreaterThan(1e-5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("preserves finite audible output for crossing and inverted bounds", async () => {
    await withRenderer(async (renderer) => {
      const shorthand = await renderer.render(
        temporaryEnvelopeCase(
          "patterned-crossing-shorthand",
          ".gain(envelope)",
          crossingMinimum,
          crossingMaximum,
        ),
      );
      const builder = await renderer.render(
        temporaryEnvelopeCase(
          "patterned-crossing-builder",
          ".gain(envelope)",
          "d.str([1.2, 0.8], [0.4, 1.1])",
          "d.str([0.2, 1.4], [1.6, -0.3])",
        ),
      );

      expectNativeHealth(shorthand);
      expectNativeHealth(builder);
      expect(compareAudio(audio(shorthand), audio(builder)).passed).toBe(true);
      const windows = eventWindows(shorthand);
      expectAudibleWindows(shorthand, windows);
      expectAudibleWindows(builder, windows);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });
});
