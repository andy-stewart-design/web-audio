import { expect } from "vitest";
import { compareAudio } from "../../runner/compare";
import type { withRenderer } from "../../runner/render";
import type { SketchCase } from "../../types";

type NativeRender = Awaited<
  ReturnType<Parameters<Parameters<typeof withRenderer>[0]>[0]["render"]>
>;

type EventWindow = {
  start: number;
  end: number;
};

const notes = "<[60 64] [67 69]>";

export function temporaryEnvelopeCase(
  id: string,
  target: string,
  minimum: string,
  maximum: string,
) {
  return {
    id,
    description: `Temporary native patterned-envelope diagnostic: ${id}`,
    code: `
      d.bpm(120);
      const envelope = d.env(${minimum}, ${maximum})
        .adsr(0.1, 0.2, 0.5, 0.2)
        .mode("bounded");
      d.synth("sine").notes('${notes}')${target}.push();
    `,
    bars: 2,
    tailSeconds: 0.5,
    settings: {
      sampleRate: 48_000,
      channels: 2,
      startOffsetFrames: 4_800,
    },
  } satisfies SketchCase;
}

export function scalarEnvelopeCase(id: string) {
  return {
    id,
    description: `Temporary native scalar envelope oracle: ${id}`,
    code: `
      d.bpm(120);
      const rows = [
        [60, 0, 0.9, [1, 0], [0, 0]],
        [64, 0.15, 0.7, [0, 1], [0, 0]],
        [67, 0.3, 0.8, [0, 0], [1, 0]],
        [69, 0.45, 0.6, [0, 0], [0, 1]],
      ];
      for (const [note, minimum, maximum, firstBar, secondBar] of rows) {
        d.synth("sine")
          .notes(note)
          .gain(d.env(minimum, maximum)
            .adsr(0.1, 0.2, 0.5, 0.2)
            .mode("bounded"))
          .xox(d.str(firstBar, secondBar))
          .push();
      }
    `,
    bars: 2,
    tailSeconds: 0.5,
    settings: {
      sampleRate: 48_000,
      channels: 2,
      startOffsetFrames: 4_800,
    },
  } satisfies SketchCase;
}

export function audio(result: NativeRender, window?: EventWindow) {
  return {
    sampleRate: result.settings.sampleRate,
    channels: window
      ? result.channels.map((channel) =>
          channel.subarray(window.start, window.end),
        )
      : result.channels,
  };
}

export function eventWindows(result: NativeRender) {
  const eventDuration = result.barDuration / 2;
  return Array.from({ length: 4 }, (_, eventIndex) => {
    const bar = Math.floor(eventIndex / 2);
    const hit = eventIndex % 2;
    const eventStart =
      result.startTime + bar * result.barDuration + hit * eventDuration;
    const start = Math.floor(
      (eventStart + 0.5 * eventDuration) * result.settings.sampleRate,
    );
    const end = Math.ceil(
      (eventStart + 0.8 * eventDuration) * result.settings.sampleRate,
    );
    expect(end).toBeGreaterThan(start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeLessThanOrEqual(result.frameCount);
    return { start, end };
  });
}

export function expectNativeHealth(result: NativeRender) {
  expect(
    result.channels.every((channel) => channel.every(Number.isFinite)),
  ).toBe(true);
  expect(result.metrics.some(({ rms }) => rms > 1e-8)).toBe(true);
}

export function expectAudibleWindows(
  result: NativeRender,
  windows: readonly EventWindow[],
) {
  for (const window of windows) {
    expect(
      result.channels.some((channel) =>
        channel
          .subarray(window.start, window.end)
          .some((sample) => Math.abs(sample) > 1e-8),
      ),
    ).toBe(true);
  }
}

export function compareWindow(
  left: NativeRender,
  right: NativeRender,
  window: EventWindow,
) {
  return compareAudio(audio(left, window), audio(right, window));
}
