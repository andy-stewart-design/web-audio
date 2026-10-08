// Independent tiny RIFF builders for malformed/extra-chunk reader cases.
export function chunk(id: string, data: Uint8Array) {
  const result = Buffer.alloc(8 + data.length + (data.length % 2));
  result.write(id, 0, "ascii");
  result.writeUInt32LE(data.length, 4);
  result.set(data, 8);
  return result;
}

export function riff(...chunks: Buffer[]) {
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(
    4 + chunks.reduce((size, bytes) => size + bytes.length, 0),
    4,
  );
  header.write("WAVE", 8, "ascii");
  return Buffer.concat([header, ...chunks]);
}

export function monoChunks() {
  return [
    chunk("fmt ", Buffer.from("0300010080bb000000ee0200040020000000", "hex")),
    chunk("fact", Buffer.from("02000000", "hex")),
    chunk("data", Buffer.from("0000003f000000c0", "hex")),
  ];
}
