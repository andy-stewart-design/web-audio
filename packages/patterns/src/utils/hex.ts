function hex(hexNotation: string | number) {
  const hexString = typeof hexNotation === "number"
    ? hexNotation.toString(16)
    : hexNotation;
  return hexString.split("").flatMap(hexToPattern);
}

function hexToPattern(hexValue: string) {
  const bin = parseInt(hexValue, 16).toString(2).padStart(4, "0");
  return bin.split("").map((b) => parseInt(b));
}

export { hex };
