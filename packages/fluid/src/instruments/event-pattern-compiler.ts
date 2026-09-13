import type {
  NotePattern,
  RandomNumberPattern,
  StaticNotePattern,
  TimingSchema,
  TimingStep,
} from "@web-audio/schema";
import type { Chord, MaskedCycle } from "@web-audio/patterns";

type StaticNoteSource = {
  type: "static";
  cycle: MaskedCycle<Chord>;
  transform: (value: number) => number;
};

type RandomNoteSource = {
  type: "random";
  pattern: RandomNumberPattern;
  candidateTiming: TimingSchema;
};

type NoteSource = StaticNoteSource | RandomNoteSource;

type CompilerInput = {
  source: NoteSource;
  explicitTiming?: TimingSchema;
};

function compileEventPatterns({ source, explicitTiming }: CompilerInput) {
  return source.type === "static"
    ? compileStaticEvents(source, explicitTiming)
    : compileRandomEvents(source, explicitTiming);
}

function compileStaticEvents(
  source: StaticNoteSource,
  explicitTiming: TimingSchema | undefined,
) {
  const sourceBars = source.cycle.activeEvents.map((bar) =>
    bar.map((chord) => normalizeChord(chord, source.transform)),
  );
  const timing = explicitTiming ?? source.cycle.candidateTiming;
  const cycleLength = repeatingCycleLength(
    sourceBars.length,
    timing.cycle.length,
  );
  const noteCycle: StaticNotePattern["cycle"] = [];
  const timingCycle: TimingSchema["cycle"] = [];

  for (let barIndex = 0; barIndex < cycleLength; barIndex++) {
    const sourceBar = sourceBars[barIndex % sourceBars.length];
    const timingBar = timing.cycle[barIndex % timing.cycle.length];
    const noteBar: StaticNotePattern["cycle"][number] = [];
    const filteredTiming: TimingStep[] = [];

    timingBar.forEach((step, hitIndex) => {
      const chord =
        sourceBar.length === 0 ? null : sourceBar[hitIndex % sourceBar.length];
      if (chord === null) return;
      noteBar.push(chord);
      filteredTiming.push({ ...step });
    });

    noteCycle.push(noteBar.length > 0 ? noteBar : [null]);
    timingCycle.push(filteredTiming);
  }

  return {
    timing: {
      cycle: timingCycle,
      ...(timing.condition && { condition: cloneCondition(timing.condition) }),
    },
    notes: { type: "static", cycle: noteCycle },
  } satisfies { timing: TimingSchema; notes: NotePattern };
}

function compileRandomEvents(
  source: RandomNoteSource,
  explicitTiming: TimingSchema | undefined,
) {
  const timing = explicitTiming ?? source.candidateTiming;
  const cycleLength = repeatingCycleLength(
    source.pattern.valuesPerBar.length,
    timing.cycle.length,
  );
  const valuesPerBar = Array.from(
    { length: cycleLength },
    (_, barIndex) =>
      source.pattern.valuesPerBar[
        barIndex % source.pattern.valuesPerBar.length
      ],
  );
  const timingCycle = Array.from({ length: cycleLength }, (_, barIndex) => {
    if (valuesPerBar[barIndex] === 0) return [];
    return timing.cycle[barIndex % timing.cycle.length].map((step) => ({
      ...step,
    }));
  });

  return {
    timing: {
      cycle: timingCycle,
      ...(timing.condition && { condition: cloneCondition(timing.condition) }),
    },
    notes: {
      ...source.pattern,
      valuesPerBar,
      segments: source.pattern.segments.map((segment) => ({ ...segment })),
      range: source.pattern.range ? { ...source.pattern.range } : undefined,
      valueMap: source.pattern.valueMap
        ? [...source.pattern.valueMap]
        : undefined,
    },
  } satisfies { timing: TimingSchema; notes: NotePattern };
}

function normalizeChord(chord: Chord, transform: (value: number) => number) {
  const voices = (chord ?? [])
    .filter((value): value is number => typeof value === "number")
    .map(transform);
  return voices.length > 0 ? voices : null;
}

function repeatingCycleLength(...lengths: number[]) {
  if (lengths.some((length) => length === 0)) {
    throw new Error("[Fluid] Event patterns must contain at least one bar.");
  }
  return lengths.reduce(lowestCommonMultiple);
}

function lowestCommonMultiple(a: number, b: number) {
  return (a * b) / greatestCommonDivisor(a, b);
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function cloneCondition(condition: NonNullable<TimingSchema["condition"]>) {
  return {
    ...condition,
    segments: condition.segments.map((segment) => ({ ...segment })),
  };
}

export { compileEventPatterns };
export type { CompilerInput, NoteSource, RandomNoteSource, StaticNoteSource };
