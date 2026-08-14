import type { BinaryCycleData } from "../types";

function hex(hexNotation: string | number): BinaryCycleData[number] {
  const hexString =
    typeof hexNotation === "number" ? hexNotation.toString(16) : hexNotation;
  return hexString.split("").flatMap(hexToPattern);
}

function hexToPattern(hexValue: string): BinaryCycleData[number] {
  const binary = parseInt(hexValue, 16).toString(2).padStart(4, "0");
  return binary.split("").map((value) => (value === "1" ? 1 : 0));
}

export { hex };
