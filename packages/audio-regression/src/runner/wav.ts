// RIFF/WAVE, WAVE_FORMAT_IEEE_FLOAT (3), little-endian interleaved float32.
// Non-PCM WAVEFORMATEX includes cbSize=0 and a fact count per channel:
// https://www.mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html
const HEADER_BYTES = 58;
const UINT32_MAX = 0xffff_ffff;

function validateFormat(sampleRate: number, channelCount: number) {
  if (!Number.isInteger(channelCount) || channelCount < 1 || channelCount > 32)
    throw new Error("WAV channel count must be an integer from 1 to 32");
  const blockAlign = channelCount * 4;
  const byteRate = sampleRate * blockAlign;
  if (!Number.isInteger(sampleRate) || sampleRate < 1 || byteRate > UINT32_MAX)
    throw new Error("WAV sample rate must be a positive representable integer");
  return { sampleRate, channelCount, blockAlign, byteRate };
}

export function encodeWav(audio: {
  sampleRate: number;
  channels: readonly Float32Array[];
}) {
  const format = validateFormat(audio.sampleRate, audio.channels.length);
  const frameCount = audio.channels[0]?.length ?? 0;
  if (!frameCount) throw new Error("Cannot encode empty WAV audio");
  for (const channel of audio.channels) {
    if (!(channel instanceof Float32Array) || channel.length !== frameCount)
      throw new Error("WAV channels must be equal-length Float32Arrays");
  }
  const dataSize = frameCount * format.blockAlign;
  if (
    !Number.isSafeInteger(dataSize) ||
    dataSize + HEADER_BYTES - 8 > UINT32_MAX
  )
    throw new Error("Audio is too large for a RIFF WAV");
  const bytes = Buffer.alloc(HEADER_BYTES + dataSize);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(18, 16);
  bytes.writeUInt16LE(3, 20);
  bytes.writeUInt16LE(format.channelCount, 22);
  bytes.writeUInt32LE(format.sampleRate, 24);
  bytes.writeUInt32LE(format.byteRate, 28);
  bytes.writeUInt16LE(format.blockAlign, 32);
  bytes.writeUInt16LE(32, 34);
  bytes.writeUInt16LE(0, 36);
  bytes.write("fact", 38, "ascii");
  bytes.writeUInt32LE(4, 42);
  bytes.writeUInt32LE(frameCount, 46);
  bytes.write("data", 50, "ascii");
  bytes.writeUInt32LE(dataSize, 54);
  let offset = HEADER_BYTES;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < format.channelCount; channel++) {
      const sample = audio.channels[channel]![frame]!;
      if (!Number.isFinite(sample))
        throw new Error(
          `Non-finite WAV sample in channel ${channel} at frame ${frame}`,
        );
      bytes.writeFloatLE(sample, offset);
      offset += 4;
    }
  }
  return bytes;
}

function readFormat(bytes: Buffer) {
  if (bytes.length < 16) throw new Error("Truncated WAV fmt chunk");
  const tag = bytes.readUInt16LE(0);
  const bits = bytes.readUInt16LE(14);
  if (tag !== 3 || bits !== 32)
    throw new Error(
      `Unsupported WAV format: tag ${tag}, ${bits} bits; expected IEEE float32 (3)`,
    );
  if (bytes.length !== 18 || bytes.readUInt16LE(16) !== 0)
    throw new Error("WAV float fmt chunk must be 18 bytes with cbSize 0");
  const format = validateFormat(bytes.readUInt32LE(4), bytes.readUInt16LE(2));
  if (
    bytes.readUInt16LE(12) !== format.blockAlign ||
    bytes.readUInt32LE(8) !== format.byteRate
  )
    throw new Error("WAV block alignment or byte rate is inconsistent");
  return format;
}

export function decodeWav(input: Uint8Array) {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length < 12) throw new Error("Truncated WAV RIFF header");
  if (
    bytes.toString("latin1", 0, 4) !== "RIFF" ||
    bytes.toString("latin1", 8, 12) !== "WAVE"
  )
    throw new Error("Expected little-endian RIFF/WAVE file");
  if (bytes.readUInt32LE(4) + 8 !== bytes.length)
    throw new Error(
      "WAV RIFF length does not match file (truncated or trailing bytes)",
    );
  let format: ReturnType<typeof readFormat> | undefined;
  let data: Buffer | undefined;
  let factFrames: number | undefined;
  for (let offset = 12; offset < bytes.length; ) {
    if (offset + 8 > bytes.length)
      throw new Error("Truncated WAV chunk header");
    const id = bytes.toString("latin1", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + size;
    const next = end + (size % 2);
    if (next > bytes.length)
      throw new Error(`Truncated WAV ${id} chunk or padding`);
    const chunk = bytes.subarray(offset + 8, end);
    switch (id) {
      case "fmt ":
        if (format) throw new Error("Duplicate WAV fmt chunk");
        format = readFormat(chunk);
        break;
      case "fact":
        if (factFrames !== undefined)
          throw new Error("Duplicate WAV fact chunk");
        if (size < 4) throw new Error("Truncated WAV fact count");
        factFrames = chunk.readUInt32LE(0);
        break;
      case "data":
        if (data) throw new Error("Duplicate WAV data chunk");
        data = chunk;
        break;
    }
    offset = next;
  }
  if (!format || !data || factFrames === undefined)
    throw new Error("WAV requires fmt, fact and data chunks");
  if (!data.length || data.length % format.blockAlign !== 0)
    throw new Error("WAV data is empty or does not contain whole frames");
  const frameCount = data.length / format.blockAlign;
  if (factFrames !== frameCount)
    throw new Error("WAV fact count does not match data frames");
  const channels = Array.from(
    { length: format.channelCount },
    () => new Float32Array(frameCount),
  );
  let offset = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channels.length; channel++) {
      const sample = data.readFloatLE(offset);
      if (!Number.isFinite(sample))
        throw new Error(
          `Non-finite WAV sample in channel ${channel} at frame ${frame}`,
        );
      channels[channel]![frame] = sample;
      offset += 4;
    }
  }
  return { sampleRate: format.sampleRate, frameCount, channels };
}
