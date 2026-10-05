import { mkdir, writeFile } from "node:fs/promises";

// Input fixtures only: PCM16 WAVs, not the forthcoming float-WAV reference codec.
const sampleRate = 48_000;
const frames = sampleRate / 2;
const directory = new URL("../../resources/", import.meta.url);
await mkdir(directory, { recursive: true });

for (const name of ["tone", "asymmetric"]) {
  const data = Buffer.alloc(44 + frames * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sampleRate, 24);
  data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(frames * 2, 40);
  for (let frame = 0; frame < frames; frame++) {
    const time = frame / sampleRate;
    const frequency = name === "tone" || time < 0.125 ? 440 : 880;
    const amplitude =
      name === "tone" ? 0.5 : time < 0.125 ? 0.6 : time >= 0.375 ? 0.2 : 0;
    const sample = amplitude * Math.sin(2 * Math.PI * frequency * time);
    data.writeInt16LE(Math.round(sample * 32767), 44 + frame * 2);
  }
  await writeFile(new URL(`${name}.wav`, directory), data);
}
