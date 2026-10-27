import { describe, expect, it } from "vitest";
import { compareAudio } from "../runner/compare";
import { withRenderer } from "../runner/render";
import type { SketchCase } from "../types";

type NativeRender = Awaited<
  ReturnType<Parameters<Parameters<typeof withRenderer>[0]>[0]["render"]>
>;

function renderCase(
  code: string,
  expectSilence = false,
  options: { bars?: number; tailSeconds?: number; sampleRate?: number } = {},
): SketchCase {
  return {
    id: "source-mix-native",
    description: "Temporary native source-mix fixture",
    code,
    bars: options.bars ?? 1,
    tailSeconds: options.tailSeconds ?? 0.25,
    expectSilence,
    settings: {
      sampleRate: options.sampleRate ?? 48_000,
      channels: 2,
      startOffsetFrames: 4_800,
    },
  };
}

function audio(result: NativeRender) {
  return { sampleRate: result.settings.sampleRate, channels: result.channels };
}

function maxAbs(channels: readonly Float32Array[]) {
  let peak = 0;
  for (const channel of channels) {
    for (const value of channel) peak = Math.max(peak, Math.abs(value));
  }
  return peak;
}

function maxChannelDifference(channels: readonly Float32Array[]) {
  if (channels.length < 2) return 0;
  return channels[0]!.reduce(
    (max, value, frame) =>
      Math.max(max, Math.abs(value - channels[1]![frame]!)),
    0,
  );
}

function maxAudioDifference(
  left: readonly Float32Array[],
  right: readonly Float32Array[],
) {
  return left.reduce(
    (max, channel, channelIndex) =>
      channel.reduce(
        (channelMax, value, frame) =>
          Math.max(channelMax, Math.abs(value - right[channelIndex]![frame]!)),
        max,
      ),
    0,
  );
}

function sumAudio(
  first: readonly Float32Array[],
  second: readonly Float32Array[],
) {
  return first.map((channel, channelIndex) => {
    const result = new Float32Array(channel.length);
    for (let frame = 0; frame < channel.length; frame++)
      result[frame] = channel[frame]! + second[channelIndex]![frame]!;
    return result;
  });
}

function positiveCrossingFrequency(
  channel: Float32Array,
  start: number,
  end: number,
  sampleRate: number,
) {
  let firstCrossing = -1;
  let lastCrossing = -1;
  let crossings = 0;
  let previous = channel[start]!;
  for (let frame = start + 1; frame < end; frame++) {
    const current = channel[frame]!;
    if (previous <= 0 && current > 0) {
      firstCrossing = firstCrossing < 0 ? frame : firstCrossing;
      lastCrossing = frame;
      crossings++;
    }
    previous = current;
  }
  if (crossings < 2 || firstCrossing < 0 || lastCrossing <= firstCrossing)
    return 0;
  return ((crossings - 1) * sampleRate) / (lastCrossing - firstCrossing);
}

const basic = (factory: string) => `d.bpm(120);
d.${factory}
  .notes(60)
  .xox("1")
  .gain(0.4)
  .adsr(0, 0, 1, 0.1)
  .push();`;

describe("native main source gain and pitched sub", () => {
  it("preserves omitted/unity parity and gain-only selector parity", async () => {
    await withRenderer(async (renderer) => {
      const omitted = await renderer.render(renderCase(basic('synth("sine")')));
      const unity = await renderer.render(
        renderCase(basic('synth("sine", 1)')),
      );
      const gainOnly = await renderer.render(renderCase(basic("synth(0.5)")));
      const explicit = await renderer.render(
        renderCase(basic('synth("sine", 0.5)')),
      );

      for (const result of [omitted, unity, gainOnly, explicit]) {
        expect(
          result.channels.every((channel) => channel.every(Number.isFinite)),
        ).toBe(true);
        expect(maxAbs(result.channels)).toBeGreaterThan(1e-5);
      }
      expect(
        compareAudio(audio(omitted), audio(unity), {
          tolerance: { maxError: 1e-6, rmsError: 1e-7 },
        }).passed,
      ).toBe(true);
      expect(
        compareAudio(audio(gainOnly), audio(explicit), {
          tolerance: { maxError: 1e-6, rmsError: 1e-7 },
        }).passed,
      ).toBe(true);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("scales a basic waveform through its source gain stage", async () => {
    await withRenderer(async (renderer) => {
      const unity = await renderer.render(
        renderCase(basic('synth("sine", 1)')),
      );
      const half = await renderer.render(
        renderCase(basic('synth("sine", 0.5)')),
      );

      expect(maxAbs(unity.channels)).toBeGreaterThan(1e-5);
      expect(maxAbs(half.channels)).toBeCloseTo(
        maxAbs(unity.channels) * 0.5,
        5,
      );
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("silences a static zero source gain without affecting the renderer lifetime", async () => {
    await withRenderer(async (renderer) => {
      const result = await renderer.render(renderCase(basic("synth(0)"), true));
      expect(
        result.channels.every((channel) =>
          channel.every((value) => value === 0),
        ),
      ).toBe(true);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("scales unison stereo difference with the complete source", async () => {
    await withRenderer(async (renderer) => {
      const render = (sourceGain: string) =>
        renderer.render(
          renderCase(`d.bpm(120);
d.synth("unison", ${sourceGain})
  .notes(60)
  .xox("1")
  .voices(3)
  .spread(24)
  .width(1)
  .gain(0.4)
  .adsr(0, 0, 1, 0.1)
  .push();`),
        );
      const unity = await render("1");
      const scaled = await render("0.5");

      for (const result of [unity, scaled]) {
        expect(result.channels).toHaveLength(2);
        expect(
          result.channels.every((channel) => channel.every(Number.isFinite)),
        ).toBe(true);
        expect(maxAbs(result.channels)).toBeGreaterThan(1e-5);
      }
      const unityDifference = maxChannelDifference(unity.channels);
      const scaledDifference = maxChannelDifference(scaled.channels);
      expect(unityDifference).toBeGreaterThan(1e-5);
      expect(scaledDifference).toBeCloseTo(unityDifference * 0.5, 5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("keeps nonzero unison main and centered sub contributions separate", async () => {
    await withRenderer(async (renderer) => {
      const render = (factory: string) =>
        renderer.render(
          renderCase(`d.bpm(120);
 d.${factory}
   .notes(60)
   .xox("1")
   .voices(3)
   .spread(24)
   .width(1)
   .gain(0.35)
   .adsr(0, 0, 1, 0.1)
   .push();`),
        );
      const mainOnly = await render('synth("unison", 0.35)');
      const subOnly = await render('synth("unison", 0).sub("sine", -1, 0.5)');
      const composed = await render(
        'synth("unison", 0.35).sub("sine", -1, 0.5)',
      );

      for (const result of [mainOnly, subOnly, composed]) {
        expect(result.channels).toHaveLength(2);
        expect(
          result.channels.every((channel) => channel.every(Number.isFinite)),
        ).toBe(true);
        expect(maxAbs(result.channels)).toBeGreaterThan(1e-5);
      }
      expect(
        maxAudioDifference(composed.channels, mainOnly.channels),
      ).toBeGreaterThan(1e-5);
      expect(
        maxAudioDifference(composed.channels, subOnly.channels),
      ).toBeGreaterThan(1e-5);
      expect(maxChannelDifference(composed.channels)).toBeGreaterThan(1e-5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("renders every sub waveform at both supported octaves", async () => {
    await withRenderer(async (renderer) => {
      for (const waveform of [
        "sine",
        "triangle",
        "square",
        "sawtooth",
      ] as const) {
        for (const octave of [-1, -2] as const) {
          const result = await renderer.render(
            renderCase(`d.bpm(120);
 d.synth(0).sub("${waveform}", ${octave}, 0.5)
   .notes(60)
   .xox("1")
   .gain(0.4)
   .adsr(0, 0, 1, 0.1)
   .push();`),
          );
          expect(maxAbs(result.channels)).toBeGreaterThan(1e-5);
          expect(
            result.channels.every((channel) => channel.every(Number.isFinite)),
          ).toBe(true);
        }
      }
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("keeps the centered sub audible with a muted main source", async () => {
    await withRenderer(async (renderer) => {
      const result = await renderer.render(
        renderCase(`d.bpm(120);
 d.synth(0).sub("sine", -1, 0.5)
   .notes(60)
   .xox("1")
   .gain(0.4)
   .adsr(0, 0, 1, 0.1)
   .push();`),
      );
      expect(maxAbs(result.channels)).toBeGreaterThan(1e-5);
      expect(maxChannelDifference(result.channels)).toBeLessThan(1e-5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("preserves main and noise output when the sub contribution is zero", async () => {
    await withRenderer(async (renderer) => {
      const render = (sub: string) =>
        renderer.render(
          renderCase(`d.bpm(120);
 d.synth("unison")${sub}
   .notes(60)
   .xox("1")
   .voices(3)
   .spread(24)
   .width(1)
   .noise("white", 0.2)
   .gain(0.4)
   .adsr(0, 0, 1, 0.1)
   .push();`),
        );
      const omitted = await render("");
      const silentSub = await render('.sub("square", -2, 0)');

      expect(
        compareAudio(audio(omitted), audio(silentSub), {
          tolerance: { maxError: 1e-6, rmsError: 1e-7 },
        }).passed,
      ).toBe(true);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("leaves noise unchanged when the main source gain is zero", async () => {
    await withRenderer(async (renderer) => {
      const render = (factory: string) =>
        renderer.render(
          renderCase(`d.bpm(120);
d.${factory}
  .notes(60)
  .xox("1")
  .noise("white", 0.3)
  .gain(0.4)
  .adsr(0, 0, 1, 0.1)
  .push();`),
        );
      const noiseOnly = await render("synth(0)");
      const zeroedSaw = await render('synth("saw", 0)');

      expect(
        compareAudio(audio(noiseOnly), audio(zeroedSaw), {
          tolerance: { maxError: 1e-6, rmsError: 1e-7 },
        }).passed,
      ).toBe(true);
      expect(maxAbs(noiseOnly.channels)).toBeGreaterThan(1e-5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("matches shorthand and structured gains in a composed mix", async () => {
    await withRenderer(async (renderer) => {
      const mix = (gain: string) =>
        renderer.render(
          renderCase(
            `d.bpm(120);
 d.synth("saw", 0.3).sub("triangle", -1, ${gain})
   .notes([48, 55])
   .xox("xx")
   .gain(0.4)
   .adsr(0, 0, 1, 0.1)
   .push();`,
            false,
            { bars: 2 },
          ),
        );
      const shorthand = await mix('"<0.2 0.4>"');
      const structured = await mix("d.str(0.2, 0.4)");

      expect(
        compareAudio(audio(shorthand), audio(structured), {
          tolerance: { maxError: 1e-6, rmsError: 1e-7 },
        }).passed,
      ).toBe(true);
      expect(maxAbs(shorthand.channels)).toBeGreaterThan(1e-5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("mixes main and sub additively before a linear effect", async () => {
    await withRenderer(async (renderer) => {
      const voice = (source: string) =>
        renderer.render(
          renderCase(`d.bpm(120);
 d.${source}
   .notes(60)
   .xox("1")
   .gain(0.45)
   .adsr(0, 0, 1, 0.1)
   .fx(d.gain(0.55))
   .push();`),
        );
      const main = await voice(
        'synth("unison", 0.3).voices(3).spread(24).width(1)',
      );
      const sub = await voice('synth("unison", 0).sub("sine", -1, 0.22)');
      const mixed = await voice(
        'synth("unison", 0.3).voices(3).spread(24).width(1).sub("sine", -1, 0.22)',
      );
      const expected = sumAudio(main.channels, sub.channels);

      expect(
        compareAudio(audio(mixed), {
          sampleRate: mixed.settings.sampleRate,
          channels: expected,
        }).passed,
      ).toBe(true);
      expect(maxAbs(mixed.channels)).toBeGreaterThan(1e-5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("preserves unison stereo difference when adding a centered sub", async () => {
    await withRenderer(async (renderer) => {
      const voice = (sub: string) =>
        renderer.render(
          renderCase(`d.bpm(120);
 d.synth("unison", 0.3)
   .voices(5)
   .spread(24)
   .width(1)
   ${sub}
   .notes(60)
   .xox("1")
   .gain(0.45)
   .adsr(0, 0, 1, 0.1)
   .fx(d.gain(0.55))
   .push();`),
        );
      const main = await voice("");
      const mixed = await voice('.sub("sine", -1, 0.22)');
      const mainDifference = main.channels[0]!.map(
        (value, frame) => value - main.channels[1]![frame]!,
      );
      const mixedDifference = mixed.channels[0]!.map(
        (value, frame) => value - mixed.channels[1]![frame]!,
      );

      expect(maxChannelDifference(main.channels)).toBeGreaterThan(1e-5);
      expect(
        maxAudioDifference([mainDifference], [mixedDifference]),
      ).toBeLessThan(1e-6);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("starts and stops every source at non-quantum offsets with one shared release", async () => {
    const sources = [
      'synth("sine")',
      'synth("unison").voices(5).spread(24).width(1)',
      'synth(0).sub("sine", -1, 0.6)',
      'synth(0).noise("white", 0.25)',
      'synth("unison", 0.25).voices(5).spread(24).width(1).sub("sine", -1, 0.2).noise("white", 0.1)',
    ];
    await withRenderer(async (renderer) => {
      for (const source of sources) {
        const result = await renderer.render(
          renderCase(
            `d.bpm(137);
 d.${source}
   .notes(60)
   .xox([0, 0, 1])
   .gain(0.4)
   .adsr(0, 0, 1, 0.1)
   .push();`,
            false,
            { tailSeconds: 0.4 },
          ),
        );
        const eventStart = Math.ceil(
          (result.startTime + (2 / 3) * result.barDuration) *
            result.settings.sampleRate,
        );
        const eventDuration = result.barDuration / 3;
        const sourceStop = Math.ceil(
          (result.startTime + result.barDuration + 0.1 * eventDuration + 0.05) *
            result.settings.sampleRate,
        );
        const blockStart = Math.floor(eventStart / 128) * 128;
        const blockEnd = blockStart + 128;

        expect(eventStart).toBeGreaterThan(blockStart);
        expect(eventStart).toBeLessThan(blockEnd);
        expect(sourceStop).toBeLessThan(result.frameCount);
        for (const channel of result.channels) {
          expect(
            channel
              .subarray(blockStart, eventStart)
              .every((value) => value === 0),
          ).toBe(true);
          expect(
            channel
              .subarray(eventStart, blockEnd)
              .some((value) => Math.abs(value) > 1e-8),
          ).toBe(true);
          expect(
            channel.subarray(sourceStop).every((value) => value === 0),
          ).toBe(true);
        }
      }
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("tracks common detune independently of unison controls", async () => {
    await withRenderer(async (renderer) => {
      const render = (voices: string, spread: string, width: string) =>
        renderer.render(
          renderCase(`d.bpm(137);
 d.synth("unison", 0)
   .voices(${voices})
   .spread(${spread})
   .width(${width})
   .sub("sine", -1, 0.7)
   .notes(60)
   .xox([0, 0, 1])
   .detune(100)
   .gain(0.4)
   .adsr(0, 0, 1, 0.1)
   .push();`),
        );
      const simple = await render("1", "0", "0");
      const wide = await render("7", "36", "1");
      const eventStart = Math.ceil(
        (wide.startTime + (2 / 3) * wide.barDuration) *
          wide.settings.sampleRate,
      );
      const start = Math.ceil(eventStart + 0.08 * wide.settings.sampleRate);
      const end = Math.floor(
        (wide.startTime + wide.barDuration - 0.05) * wide.settings.sampleRate,
      );
      const expectedFrequency = 440 * 2 ** ((60 - 69 - 12 + 100 / 100) / 12);

      expect(
        compareAudio(audio(simple), audio(wide), {
          tolerance: { maxError: 1e-6, rmsError: 1e-7 },
        }).passed,
      ).toBe(true);
      const frequency = positiveCrossingFrequency(
        wide.channels[0]!,
        start,
        end,
        wide.settings.sampleRate,
      );
      expect(frequency).toBeGreaterThan(expectedFrequency - 1);
      expect(frequency).toBeLessThan(expectedFrequency + 1);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("runs the timing and pitch smoke at 44.1 kHz", async () => {
    await withRenderer(async (renderer) => {
      const result = await renderer.render(
        renderCase(
          `d.bpm(137);
 d.synth("unison", 0)
   .voices(4)
   .spread(30)
   .width(1)
   .sub("sine", -2, 0.7)
   .notes(60)
   .xox([0, 0, 1])
   .detune(-50)
   .gain(0.4)
   .adsr(0, 0, 1, 0.1)
   .push();`,
          false,
          { sampleRate: 44_100, tailSeconds: 0.4 },
        ),
      );
      const eventStart = Math.ceil(
        (result.startTime + (2 / 3) * result.barDuration) *
          result.settings.sampleRate,
      );
      const start = Math.ceil(eventStart + 0.08 * result.settings.sampleRate);
      const end = Math.floor(
        (result.startTime + result.barDuration - 0.05) *
          result.settings.sampleRate,
      );
      const expectedFrequency = 440 * 2 ** ((60 - 69 - 24 - 50 / 100) / 12);
      const frequency = positiveCrossingFrequency(
        result.channels[0]!,
        start,
        end,
        result.settings.sampleRate,
      );

      expect(result.settings.sampleRate).toBe(44_100);
      expect(eventStart % 128).not.toBe(0);
      expect(frequency).toBeGreaterThan(expectedFrequency - 1);
      expect(frequency).toBeLessThan(expectedFrequency + 1);
      expect(maxAbs(result.channels)).toBeGreaterThan(1e-5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("repeats a composed render in fresh contexts", async () => {
    await withRenderer(async (renderer) => {
      const input = renderCase(`d.bpm(131);
 d.synth("unison", 0.2)
   .voices(4)
   .spread(18)
   .width(0.8)
   .sub("triangle", -1, 0.18)
   .noise("pink", 0.08)
   .notes([48, 55])
   .xox("xx")
   .gain(0.35)
   .adsr(0.01, 0.05, 0.8, 0.15)
   .fx(d.gain(0.5))
   .push();`);
      const first = await renderer.render(input);
      const second = await renderer.render(input);

      expect(
        compareAudio(audio(first), audio(second), {
          tolerance: { maxError: 1e-6, rmsError: 1e-7 },
        }).passed,
      ).toBe(true);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("characterizes bounded overlapping source-mix polyphony", async () => {
    await withRenderer(async (renderer) => {
      const started = performance.now();
      const result = await renderer.render(
        renderCase(
          `d.bpm(120);
 d.synth("unison", 0.2)
   .voices(7)
   .spread(24)
   .width(1)
   .sub("sine", -1, 0.16)
   .noise("white", 0.06)
   .notes([48, 52, 55, 59])
   .xox("1")
   .gain(0.3)
   .adsr(0.01, 0.05, 0.8, 0.4)
   .fx(d.gain(0.5))
   .push();`,
          false,
          { tailSeconds: 0.75 },
        ),
      );
      const wallTimeMs = performance.now() - started;
      const durationSeconds = result.frameCount / result.settings.sampleRate;
      const maximumMusicalPolyphony = 4;
      const ownedSourcesPerVoice = 7 + 1 + 1;
      process.stdout.write(
        `[source-mix] overlap characterization: duration=${durationSeconds.toFixed(3)}s polyphony=${maximumMusicalPolyphony} voices sourcesPerVoice=${ownedSourcesPerVoice} wall=${wallTimeMs.toFixed(1)}ms\n`,
      );

      expect(durationSeconds).toBeGreaterThan(0);
      expect(maximumMusicalPolyphony).toBe(4);
      expect(ownedSourcesPerVoice).toBe(9);
      expect(wallTimeMs).toBeGreaterThan(0);
      expect(maxAbs(result.channels)).toBeGreaterThan(1e-5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });
});
