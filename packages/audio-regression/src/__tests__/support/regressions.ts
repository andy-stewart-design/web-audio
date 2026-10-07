import { selectCase } from "../../cases";
import type { SketchCase } from "../../types";
import { cases } from "./cases";

// Focused authored-source changes, not engine/DSP mocks or an automatic mutation framework.
// These cases and their generated recordings are test-only and never approved references.
function sourceChange(
  name: string,
  original: SketchCase,
  from: string,
  to: string,
) {
  if (!original.code.includes(from) || from === to)
    throw new Error(`Invalid regression fixture: ${name}`);
  const baseline = { ...original, id: name };
  return {
    name,
    original: baseline,
    changed: { ...baseline, code: baseline.code.replace(from, to) },
  };
}

const sine = selectCase(cases, "sine");
const timing = {
  ...sine,
  code: sine.code.replace(".push()", ".sequence(4, [0, 2]).push()"),
};
const selection: SketchCase = {
  ...selectCase(cases, "sample-tone"),
  code: "d.loadSamples({bank: 'local', samples: {tone: ['/samples/tone.wav', '/samples/asymmetric.wav']}}); d.sample('tone', 0).bank('local').clip(false).push();",
  resources: {
    "/samples/tone.wav": "cases/sample-tone/samples/tone.wav",
    "/samples/asymmetric.wav": "cases/sample-reverse/samples/asymmetric.wav",
  },
};

export const numericalRegressions = [
  sourceChange("pitch", sine, ".notes(69)", ".notes(81)"),
  sourceChange(
    "timing",
    timing,
    ".sequence(4, [0, 2])",
    ".sequence(4, [1, 3])",
  ),
  sourceChange("gain", sine, ".gain(0.5)", ".gain(0.55)"),
  sourceChange(
    "filter",
    selectCase(cases, "lfo-filter"),
    "[300, 900]",
    "[300, 1800]",
  ),
  sourceChange(
    "sample-selection",
    selection,
    "d.sample('tone', 0)",
    "d.sample('tone', 1)",
  ),
  sourceChange(
    "reverse",
    selectCase(cases, "sample-reverse"),
    '.direction("reverse")',
    '.direction("forward")',
  ),
];

const evaluation = sourceChange(
  "evaluation",
  sine,
  ".notes(69)",
  ".missingNotes(69)",
);
const resource = {
  ...selectCase(cases, "sample-tone"),
  id: "resource",
  code: `${selectCase(cases, "sample-tone").code} ${sine.code}`,
};
export const diagnosticRegressions = [
  { ...evaluation, diagnostic: "missingNotes is not a function" },
  {
    name: "resource",
    original: resource,
    changed: {
      ...resource,
      resources: {
        "/samples/tone.wav": "cases/sample-tone/samples/absent-regression.wav",
      },
    },
    diagnostic: "Failed to load",
  },
];
