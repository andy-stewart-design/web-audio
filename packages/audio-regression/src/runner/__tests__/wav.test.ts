import { describe, expect, it } from "vitest";
import { decodeWav, encodeWav } from "../wav";
import { chunk, monoChunks, riff } from "./support/wav";

const golden = Buffer.from(
  "524946463a00000057415645666d7420120000000300010080bb000000ee020004002000000066616374040000000200000064617461080000000000003f000000c0",
  "hex",
);

function damaged(edit: (bytes: Buffer) => void) {
  const bytes = Buffer.from(golden);
  edit(bytes);
  return bytes;
}

describe("IEEE float32 WAV", () => {
  it("matches independent standard bytes including WAVEFORMATEX and per-channel fact count", () => {
    expect(
      encodeWav({ sampleRate: 48_000, channels: [Float32Array.of(0.5, -2)] }),
    ).toEqual(golden);
    const decoded = decodeWav(golden);
    expect(decoded.sampleRate).toBe(48_000);
    expect(decoded.frameCount).toBe(2);
    expect(decoded.channels).toEqual([Float32Array.of(0.5, -2)]);
  });

  it.each([1, 2, 4])(
    "round-trips %i ordered channels without changing any float32 bits",
    (count) => {
      const channels = Array.from({ length: count }, (_, index) =>
        Float32Array.of(
          0,
          -0,
          1.75 + index,
          -2.5 - index,
          1 / 3,
          2 ** -149,
          -(2 ** -149),
          3.4028234663852886e38,
        ),
      );
      const snapshots = channels.map((channel) =>
        Buffer.from(channel.buffer).toString("hex"),
      );
      const bytes = encodeWav({ sampleRate: 44_100, channels });
      const decoded = decodeWav(bytes);
      expect(decoded.sampleRate).toBe(44_100);
      expect(decoded.frameCount).toBe(8);
      expect(decoded.channels).toHaveLength(count);
      expect(
        decoded.channels.map((channel) =>
          Buffer.from(channel.buffer).toString("hex"),
        ),
      ).toEqual(snapshots);
      expect(
        channels.map((channel) => Buffer.from(channel.buffer).toString("hex")),
      ).toEqual(snapshots);
      expect(Object.is(decoded.channels[0]?.[1], -0)).toBe(true);
    },
  );

  it("interleaves distinct stereo channels in frame order and deinterleaves a byte-offset view", () => {
    const bytes = encodeWav({
      sampleRate: 48_000,
      channels: [Float32Array.of(0.5, 2), Float32Array.of(-0.5, -3)],
    });
    expect(
      [0, 1, 2, 3].map((sample) => bytes.readFloatLE(58 + sample * 4)),
    ).toEqual([0.5, -0.5, 2, -3]);
    expect(bytes.readUInt32LE(46)).toBe(2); // frames/channel, not total samples
    const backing = new Uint8Array(bytes.length + 7);
    backing.set(bytes, 3);
    expect(decodeWav(backing.subarray(3, 3 + bytes.length)).channels).toEqual([
      Float32Array.of(0.5, 2),
      Float32Array.of(-0.5, -3),
    ]);
  });

  it("skips unknown chunks before/after data, including odd-byte padding", () => {
    const [format, fact, data] = monoChunks();
    const bytes = riff(
      chunk("JUNK", Uint8Array.of(1, 2, 3)),
      format!,
      fact!,
      data!,
      chunk("LIST", Uint8Array.of(4)),
    );
    expect(decodeWav(bytes).channels).toEqual([Float32Array.of(0.5, -2)]);
  });

  it.each([
    ["short header", Buffer.alloc(11), /RIFF header/],
    ["wrong container", damaged((b) => b.write("RIFX", 0)), /RIFF\/WAVE/],
    ["non-ASCII magic", damaged((b) => (b[0] = 0xd2)), /RIFF\/WAVE/],
    ["wrong form", damaged((b) => b.write("AVI ", 8)), /RIFF\/WAVE/],
    ["truncated file", golden.subarray(0, -1), /RIFF length/],
    ["trailing bytes", Buffer.concat([golden, Buffer.alloc(1)]), /RIFF length/],
    [
      "chunk exceeds file",
      damaged((b) => b.writeUInt32LE(100, 54)),
      /Truncated WAV data/,
    ],
    ["PCM", damaged((b) => b.writeUInt16LE(1, 20)), /Unsupported WAV format/],
    [
      "extensible",
      damaged((b) => b.writeUInt16LE(0xfffe, 20)),
      /Unsupported WAV format/,
    ],
    [
      "float64",
      damaged((b) => b.writeUInt16LE(64, 34)),
      /Unsupported WAV format/,
    ],
    ["bad extension", damaged((b) => b.writeUInt16LE(1, 36)), /cbSize/],
    ["zero channels", damaged((b) => b.writeUInt16LE(0, 22)), /channel count/],
    [
      "too many channels",
      damaged((b) => b.writeUInt16LE(33, 22)),
      /channel count/,
    ],
    ["zero rate", damaged((b) => b.writeUInt32LE(0, 24)), /sample rate/],
    ["wrong byte rate", damaged((b) => b.writeUInt32LE(1, 28)), /byte rate/],
    ["wrong alignment", damaged((b) => b.writeUInt16LE(8, 32)), /alignment/],
    ["wrong fact count", damaged((b) => b.writeUInt32LE(4, 46)), /fact count/],
    ["NaN", damaged((b) => b.writeFloatLE(NaN, 58)), /Non-finite WAV sample/],
    [
      "Infinity",
      damaged((b) => b.writeFloatLE(Infinity, 62)),
      /Non-finite WAV sample/,
    ],
  ])("rejects %s clearly", (_name, bytes, message) => {
    expect(() => decodeWav(bytes)).toThrow(message);
  });

  it("rejects missing, duplicate, short and partially framed chunks", () => {
    const [format, fact, data] = monoChunks();
    if (!format || !fact || !data) throw new Error("Missing test chunks");
    for (const chunks of [
      [format, data],
      [fact, data],
      [format, fact],
    ])
      expect(() => decodeWav(riff(...chunks))).toThrow(
        "requires fmt, fact and data",
      );
    for (const duplicate of [format, fact, data])
      expect(() => decodeWav(riff(format, fact, data, duplicate))).toThrow(
        "Duplicate WAV",
      );
    expect(() =>
      decodeWav(riff(chunk("fmt ", Buffer.alloc(15)), fact, data)),
    ).toThrow("Truncated WAV fmt");
    expect(() =>
      decodeWav(riff(chunk("fmt ", format.subarray(8, 24)), fact, data)),
    ).toThrow("18 bytes");
    expect(() =>
      decodeWav(riff(format, chunk("fact", Buffer.alloc(2)), data)),
    ).toThrow("Truncated WAV fact");
    expect(() =>
      decodeWav(riff(format, fact, chunk("data", Buffer.alloc(0)))),
    ).toThrow("data is empty");
    expect(() =>
      decodeWav(riff(format, fact, chunk("data", Buffer.alloc(7)))),
    ).toThrow("whole frames");
    const headerFragment = riff(format, fact, data, Buffer.alloc(3));
    expect(() => decodeWav(headerFragment)).toThrow("chunk header");
    const oddChunk = riff(
      format,
      fact,
      data,
      chunk("JUNK", Uint8Array.of(1)),
    ).subarray(0, -1);
    oddChunk.writeUInt32LE(oddChunk.length - 8, 4);
    expect(() => decodeWav(oddChunk)).toThrow("padding");
  });

  it("rejects invalid writer inputs without treating silence or peaks above one as invalid", () => {
    expect(() => encodeWav({ sampleRate: 48_000, channels: [] })).toThrow(
      "channel count",
    );
    expect(() =>
      encodeWav({ sampleRate: 48_000, channels: [new Float32Array()] }),
    ).toThrow("empty WAV");
    expect(() =>
      encodeWav({
        sampleRate: 48_000,
        channels: [Float32Array.of(1), Float32Array.of(1, 2)],
      }),
    ).toThrow("equal-length");
    for (const sampleRate of [0, -1, 1.5, NaN, Infinity, 0xffff_ffff])
      expect(() =>
        encodeWav({ sampleRate, channels: [Float32Array.of(0)] }),
      ).toThrow("sample rate");
    for (const sample of [NaN, Infinity, -Infinity])
      expect(() =>
        encodeWav({ sampleRate: 48_000, channels: [Float32Array.of(sample)] }),
      ).toThrow("Non-finite");
    expect(
      decodeWav(
        encodeWav({ sampleRate: 48_000, channels: [Float32Array.of(0, 0)] }),
      ).channels,
    ).toEqual([Float32Array.of(0, 0)]);
  });
});
