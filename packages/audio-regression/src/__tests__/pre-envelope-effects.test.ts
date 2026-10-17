import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { describe, expect, it } from "vitest";
import { compareAudio } from "../runner/compare";
import { withRenderer } from "../runner/render";
import type { SketchCase } from "../types";

const sampleTone = fileURLToPath(
  new URL("../../cases/sample-tone/samples/tone.wav", import.meta.url),
);

function synthCase(sampleRate: number): SketchCase {
  return {
    id: "pre-envelope-synth-native",
    description: "Synthetic filter and amplitude-envelope placement fixture",
    code: `d.synth("sine")
  .notes(60)
  .gain(0.8)
  .adsr(0.2, 0, 1, 0.2)
  .fx(d.lpf(700).q(12))
  .push();`,
    bars: 1,
    tailSeconds: 0.5,
    settings: {
      sampleRate,
      channels: 2,
      startOffsetFrames: Math.round(sampleRate * 0.1),
    },
  };
}

function samplerCase(sampleRate: number, samplePath: string): SketchCase {
  return {
    id: "pre-envelope-sampler-native",
    description:
      "Decoded sample filter and amplitude-envelope placement fixture",
    code: `d.loadSamples({
  bank: "local",
  samples: { tone: ["/samples/tone.wav"] },
});
d.sample("tone")
  .bank("local")
  .xox("xooooooo")
  .gain(0.8)
  .adsr(0.1, 0, 1, 0.1)
  .fx(d.lpf(1200).q(12))
  .push();`,
    bars: 1,
    tailSeconds: 0.15,
    settings: {
      sampleRate,
      channels: 2,
      startOffsetFrames: Math.round(sampleRate * 0.1),
    },
    resources: { "/samples/tone.wav": samplePath },
  };
}

interface ReferenceGraphInput {
  kind: "synth" | "sampler";
  topology: "pre-envelope" | "post-envelope";
  sampleRate: number;
  channels: number;
  frameCount: number;
  startTime: number;
  eventDuration: number;
  attack: number;
  release: number;
  filterFrequency: number;
  baseGain: number;
  stopTime: number;
}

async function renderReferenceGraph(page: Page, input: ReferenceGraphInput) {
  return page.evaluate(async (graph) => {
    const audio = new OfflineAudioContext({
      numberOfChannels: graph.channels,
      length: graph.frameCount,
      sampleRate: graph.sampleRate,
    });
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(graph.filterFrequency, graph.startTime);
    filter.Q.setValueAtTime(12, graph.startTime);

    const envelope = audio.createGain();
    const balance = audio.createGain();
    balance.gain.value = graph.baseGain;
    balance.connect(audio.destination);

    const attackDuration = Math.max(graph.attack * graph.eventDuration, 0.0025);
    const decayDuration = Math.max(
      Math.min(0, graph.eventDuration - attackDuration),
      0.0025,
    );
    const releaseDuration = Math.max(
      graph.release * graph.eventDuration,
      0.0025,
    );
    const eventEnd = graph.startTime + graph.eventDuration;
    envelope.gain.setValueAtTime(0, graph.startTime);
    envelope.gain.linearRampToValueAtTime(
      0.8,
      graph.startTime + attackDuration,
    );
    envelope.gain.linearRampToValueAtTime(
      0.8,
      graph.startTime + attackDuration + decayDuration,
    );
    envelope.gain.setValueAtTime(0.8, eventEnd);
    envelope.gain.linearRampToValueAtTime(0, eventEnd + releaseDuration);

    let source: OscillatorNode | AudioBufferSourceNode;
    if (graph.kind === "synth") {
      const oscillator = audio.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = 440 * Math.pow(2, (60 - 69) / 12);
      source = oscillator;
    } else {
      const response = await fetch("/samples/tone.wav");
      const buffer = await audio.decodeAudioData(await response.arrayBuffer());
      const sample = audio.createBufferSource();
      sample.buffer = buffer;
      sample.playbackRate.value = 1;
      source = sample;
    }

    if (graph.topology === "pre-envelope") {
      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(balance);
    } else {
      source.connect(envelope);
      envelope.connect(filter);
      filter.connect(balance);
    }

    source.start(graph.startTime);
    source.stop(graph.stopTime);
    const rendered = await audio.startRendering();
    return Array.from({ length: rendered.numberOfChannels }, (_, channel) =>
      Array.from(rendered.getChannelData(channel)),
    );
  }, input);
}

async function renderGraph(
  renderer: Parameters<Parameters<typeof withRenderer>[0]>[0],
  input: ReferenceGraphInput,
  samplePath?: string,
) {
  const context = await renderer.browser.newContext({
    serviceWorkers: "block",
  });
  try {
    if (samplePath) {
      await context.route("**/samples/tone.wav", (route) =>
        route.fulfill({ path: samplePath, contentType: "audio/wav" }),
      );
    }
    const page = await context.newPage();
    await page.goto(renderer.origin);
    return await renderReferenceGraph(page, input);
  } finally {
    await context.close();
  }
}

function audioChannels(channels: number[][]) {
  return channels.map((channel) => Float32Array.from(channel));
}

function finalSuppression(
  channels: readonly Float32Array[],
  input: ReferenceGraphInput,
) {
  const start = Math.ceil(
    (input.startTime +
      input.eventDuration +
      input.release * input.eventDuration +
      0.01) *
      input.sampleRate,
  );
  const end = Math.floor((input.stopTime - 0.005) * input.sampleRate);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return channels.map((channel) => {
    expect(end).toBeLessThanOrEqual(channel.length);

    return channel
      .subarray(start, end)
      .reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
  });
}

function graphInput(
  kind: ReferenceGraphInput["kind"],
  result: Awaited<
    ReturnType<Parameters<Parameters<typeof withRenderer>[0]>[0]["render"]>
  >,
) {
  const eventDuration = kind === "synth" ? 2 : 0.25;
  const attack = kind === "synth" ? 0.2 : 0.1;
  const release = kind === "synth" ? 0.2 : 0.1;
  const startTime =
    result.settings.startOffsetFrames / result.settings.sampleRate;
  return {
    kind,
    topology: "pre-envelope" as const,
    sampleRate: result.settings.sampleRate,
    channels: result.settings.channels,
    frameCount: result.frameCount,
    startTime,
    eventDuration,
    attack,
    release,
    filterFrequency: kind === "synth" ? 700 : 1200,
    baseGain: kind === "synth" ? 0.325 : 0.875,
    stopTime: startTime + eventDuration + release * eventDuration + 0.05,
  } satisfies ReferenceGraphInput;
}

describe("native pre-envelope placement discriminator", () => {
  it.each([44_100, 48_000])(
    "matches explicit synth and sampler graphs and rejects post-envelope graphs at %s Hz",
    async (sampleRate) => {
      const directory = await mkdtemp(
        join(tmpdir(), "audio-pre-envelope-effects-"),
      );
      const localSample = join(directory, "tone.wav");
      try {
        await copyFile(sampleTone, localSample);
        await withRenderer(async (renderer) => {
          for (const [kind, fixture, samplePath] of [
            ["synth", synthCase(sampleRate), undefined],
            ["sampler", samplerCase(sampleRate, localSample), localSample],
          ] as const) {
            const result = await renderer.render(fixture);
            const input = graphInput(kind, result);
            const intended = {
              sampleRate,
              channels: audioChannels(
                await renderGraph(renderer, input, samplePath),
              ),
            };
            const current = {
              sampleRate,
              channels: result.channels,
            };
            const comparison = compareAudio(intended, current);
            expect(comparison.passed, `${kind} intended graph`).toBe(true);
            expect(finalSuppression(current.channels, input)).toEqual([0, 0]);

            const postEnvelope = await renderGraph(
              renderer,
              { ...input, topology: "post-envelope" },
              samplePath,
            );
            const wrongComparison = compareAudio(
              { sampleRate, channels: audioChannels(postEnvelope) },
              current,
            );
            expect(wrongComparison.passed, `${kind} old graph`).toBe(false);
            expect(wrongComparison.worst?.error).toBeGreaterThan(1e-4);
            expect(renderer.browser.contexts()).toHaveLength(0);
          }
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
