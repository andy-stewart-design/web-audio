import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCase, planRender } from "../cases";
import type { RecordingMetadata } from "../types";
import { decodeWav, encodeWav } from "./wav";

export const REFERENCE_DIRECTORY = fileURLToPath(
  new URL("../../references/", import.meta.url),
);

export function referencePath(id: string, directory = REFERENCE_DIRECTORY) {
  return join(directory, id, "render.wav");
}

function recordingPaths(path: string) {
  const wav = resolve(path);
  if (extname(wav).toLowerCase() !== ".wav")
    throw new Error("Recording path must end in .wav");
  return {
    wav,
    json:
      basename(wav) === "render.wav"
        ? join(dirname(wav), "metadata.json")
        : `${wav.slice(0, -4)}.json`,
  };
}

export function parseRecordingMetadata(input: unknown) {
  if (
    typeof input !== "object" ||
    input === null ||
    !("id" in input) ||
    typeof input.id !== "string" ||
    !("bars" in input) ||
    typeof input.bars !== "number" ||
    !("tailSeconds" in input) ||
    typeof input.tailSeconds !== "number" ||
    !("bpm" in input) ||
    typeof input.bpm !== "number" ||
    !("frameCount" in input) ||
    typeof input.frameCount !== "number" ||
    !("browserVersion" in input) ||
    typeof input.browserVersion !== "string" ||
    !input.browserVersion.trim() ||
    !("settings" in input) ||
    typeof input.settings !== "object" ||
    input.settings === null
  )
    throw new Error("Invalid recording metadata fields");
  const settings = input.settings;
  if (
    !("sampleRate" in settings) ||
    typeof settings.sampleRate !== "number" ||
    !("channels" in settings) ||
    typeof settings.channels !== "number" ||
    !("beatsPerBar" in settings) ||
    typeof settings.beatsPerBar !== "number" ||
    !("startOffsetFrames" in settings) ||
    typeof settings.startOffsetFrames !== "number"
  )
    throw new Error("Invalid recording metadata settings");
  const sketch = normalizeCase({
    id: input.id,
    description: "Recording metadata",
    code: "",
    bars: input.bars,
    tailSeconds: input.tailSeconds,
    settings: {
      sampleRate: settings.sampleRate,
      channels: settings.channels,
      beatsPerBar: settings.beatsPerBar,
      startOffsetFrames: settings.startOffsetFrames,
    },
  });
  const layout = planRender(sketch, input.bpm);
  if (input.frameCount !== layout.frameCount)
    throw new Error(
      "Recording metadata frame count does not match render settings",
    );
  // Deliberately select a small stable set; no source, resources, hashes or clock time.
  return {
    id: sketch.id,
    settings: sketch.settings,
    bars: sketch.bars,
    tailSeconds: sketch.tailSeconds,
    bpm: layout.bpm,
    frameCount: layout.frameCount,
    browserVersion: input.browserVersion,
  } satisfies RecordingMetadata;
}

function checkAudioMetadata(
  audio: {
    sampleRate: number;
    frameCount: number;
    channels: readonly Float32Array[];
  },
  metadata: RecordingMetadata,
) {
  if (
    audio.sampleRate !== metadata.settings.sampleRate ||
    audio.channels.length !== metadata.settings.channels ||
    audio.frameCount !== metadata.frameCount
  )
    throw new Error("Recording WAV shape does not match metadata");
}

export async function writeRecording(
  path: string,
  recording: RecordingMetadata & { channels: readonly Float32Array[] },
) {
  const paths = recordingPaths(path);
  const metadata = parseRecordingMetadata(recording);
  checkAudioMetadata(
    {
      sampleRate: metadata.settings.sampleRate,
      frameCount: recording.channels[0]?.length ?? 0,
      channels: recording.channels,
    },
    metadata,
  );
  const wav = encodeWav({
    sampleRate: metadata.settings.sampleRate,
    channels: recording.channels,
  });
  const json = `${JSON.stringify(metadata, null, 2)}\n`;
  // Validate/encode everything before file I/O. Ordinary WAV/JSON writes are
  // not a transaction: later disk-write failures can leave partial output.
  await mkdir(dirname(paths.wav), { recursive: true });
  await writeFile(paths.wav, wav);
  await writeFile(paths.json, json);
  return paths;
}

export async function readRecording(path: string) {
  const paths = recordingPaths(path);
  try {
    const audio = decodeWav(await readFile(paths.wav));
    const input: unknown = JSON.parse(await readFile(paths.json, "utf8"));
    const metadata = parseRecordingMetadata(input);
    checkAudioMetadata(audio, metadata);
    return { ...audio, metadata };
  } catch (error) {
    throw new Error(
      `Could not read recording ${paths.wav}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
