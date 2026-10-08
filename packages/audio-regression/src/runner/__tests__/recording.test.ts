import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../cases";
import {
  parseRecordingMetadata,
  readRecording,
  writeRecording,
} from "../recording";
import { encodeWav } from "../wav";

const metadata = {
  id: "storage",
  settings: { ...DEFAULT_SETTINGS, startOffsetFrames: 0 },
  bars: 1,
  tailSeconds: 0,
  bpm: 120,
  frameCount: 96_000,
  browserVersion: "147.0.7727.15",
};

function recording() {
  const channels = [new Float32Array(96_000), new Float32Array(96_000)];
  channels[0]![0] = 1.75;
  channels[1]![0] = -2;
  channels[1]![1] = -0;
  return { ...metadata, channels };
}

async function withDirectory<T>(run: (path: string) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "audio-recording-"));
  try {
    return await run(join(directory, "nested", "storage.wav"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("recording WAV and JSON storage", () => {
  it("writes/reads original channels and a small sidecar without extra runtime fields", async () => {
    await withDirectory(async (path) => {
      const input = {
        ...recording(),
        code: "not persisted",
        resources: { private: "/local/path" },
        metrics: [1],
      };
      const paths = await writeRecording(path, input);
      expect(paths.wav).toBe(path);
      expect(paths.json).toBe(path.replace(/\.wav$/, ".json"));
      const output = await readRecording(path);
      expect(output.metadata).toEqual(metadata);
      expect(output.channels).toEqual(input.channels);
      expect(Object.is(output.channels[1]?.[1], -0)).toBe(true);
      expect(output.frameCount).toBe(96_000);
      expect(output.sampleRate).toBe(48_000);
      const json = await readFile(paths.json, "utf8");
      expect(JSON.parse(json)).toEqual(metadata);
      expect(json).not.toContain("not persisted");
      expect(json).not.toContain("/local/path");
      expect(json.endsWith("\n")).toBe(true);
    });
  });

  it("validates and encodes before touching an existing recording", async () => {
    await withDirectory(async (path) => {
      const input = recording();
      const paths = await writeRecording(path, input);
      const before = await Promise.all([
        readFile(paths.wav),
        readFile(paths.json),
      ]);
      const invalid = recording();
      invalid.channels[0]![0] = NaN;
      await expect(writeRecording(path, invalid)).rejects.toThrow("Non-finite");
      await expect(
        writeRecording(path, { ...input, browserVersion: "" }),
      ).rejects.toThrow("metadata");
      await expect(
        writeRecording(path, { ...input, channels: [new Float32Array(2)] }),
      ).rejects.toThrow("shape");
      expect(
        await Promise.all([readFile(paths.wav), readFile(paths.json)]),
      ).toEqual(before);
      await expect(writeRecording(`${path}.txt`, input)).rejects.toThrow(
        "end in .wav",
      );
    });
  });

  it("reports missing/corrupt sidecars and rejects WAV/metadata rate, channel and frame mismatches", async () => {
    await withDirectory(async (path) => {
      await expect(readRecording(path)).rejects.toThrow(
        "Could not read recording",
      );
      const input = recording();
      const paths = await writeRecording(path, input);
      await rm(paths.json);
      await expect(readRecording(path)).rejects.toThrow(".json");
      await writeFile(paths.json, "{broken");
      await expect(readRecording(path)).rejects.toThrow(
        "Could not read recording",
      );
      await writeFile(
        paths.json,
        JSON.stringify({ ...metadata, frameCount: 1 }),
      );
      await expect(readRecording(path)).rejects.toThrow("frame count");
      await writeFile(paths.json, JSON.stringify(metadata));
      for (const audio of [
        { sampleRate: 44_100, channels: input.channels },
        { sampleRate: 48_000, channels: [input.channels[0]!] },
        {
          sampleRate: 48_000,
          channels: [new Float32Array(96_001), new Float32Array(96_001)],
        },
      ]) {
        await writeFile(paths.wav, encodeWav(audio));
        await expect(readRecording(path)).rejects.toThrow(
          "shape does not match metadata",
        );
      }
      await writeFile(paths.wav, "not audio");
      await expect(readRecording(path)).rejects.toThrow("WAV RIFF header");
    });
  });

  it.each([
    null,
    [],
    {},
    { ...metadata, id: "../escape" },
    { ...metadata, browserVersion: " " },
    { ...metadata, bars: 0 },
    { ...metadata, tailSeconds: -1 },
    { ...metadata, bpm: NaN },
    { ...metadata, frameCount: metadata.frameCount + 1 },
    { ...metadata, settings: {} },
    { ...metadata, settings: { ...metadata.settings, channels: 0 } },
    { ...metadata, settings: { ...metadata.settings, startOffsetFrames: -1 } },
  ])("rejects invalid metadata %j", (input) => {
    expect(() => parseRecordingMetadata(input)).toThrow();
  });

  it("accepts changed browser provenance without an environment compatibility gate", () => {
    expect(
      parseRecordingMetadata({ ...metadata, browserVersion: "999.0.0.0" })
        .browserVersion,
    ).toBe("999.0.0.0");
  });
});
