import {
  assertEventCycleInvariants,
  type EventCycle,
  type EventPattern,
  type EventStep,
  type RandomEventCycle,
  type StaticEventCycle,
} from "./cycle";
import {
  MAX_EVENT_CYCLE_PATTERNS,
  MAX_EVENT_CYCLE_STEPS,
  MAX_EVENT_CYCLE_VOICES,
} from "../limits";
import { getSpeedRatio } from "../math/speed-ratio";

const REST = Object.freeze({ type: "rest" } as const);
const CONTINUATION = Object.freeze({ type: "continuation" } as const);

type Operation =
  | { readonly type: "reverse" }
  | {
      readonly type: "speed";
      readonly numerator: number;
      readonly denominator: number;
    }
  | { readonly type: "stretch"; readonly bars: number; readonly steps: number };

function copyStep<T>(step: EventStep<T>) {
  if (step.type === "rest") return REST;
  if (step.type === "continuation") return CONTINUATION;
  const [first, ...remaining] = step.values;
  return Object.freeze({
    type: "event",
    values: Object.freeze([first, ...remaining] as const),
  } as const);
}

/** Keep an onset and its gate together, never detach its continuations. */
function getBlocks<T>(pattern: EventPattern<T>) {
  const blocks: {
    step: Exclude<EventStep<T>, { readonly type: "continuation" }>;
    width: number;
  }[] = [];
  for (let index = 0; index < pattern.length; index++) {
    const step = pattern[index];
    if (step.type === "continuation") {
      throw new Error(
        "[Pattern] Transform encountered an orphan continuation.",
      );
    }
    let end = index + 1;
    if (step.type === "event") {
      while (end < pattern.length && pattern[end].type === "continuation")
        end++;
    }
    blocks.push({ step, width: end - index });
    index = end - 1;
  }
  return blocks;
}

function appendBlock<T>(
  pattern: EventStep<T>[],
  block: ReturnType<typeof getBlocks<T>>[number],
) {
  pattern.push(copyStep(block.step));
  for (let index = 1; index < block.width; index++) pattern.push(CONTINUATION);
}

function assertBudget(patterns: bigint, steps: bigint, voices: bigint) {
  if (patterns > BigInt(MAX_EVENT_CYCLE_PATTERNS)) {
    throw new Error(
      `[Pattern] Transform produces more than ${MAX_EVENT_CYCLE_PATTERNS} patterns.`,
    );
  }
  if (steps > BigInt(MAX_EVENT_CYCLE_STEPS)) {
    throw new Error(
      `[Pattern] Transform produces more than ${MAX_EVENT_CYCLE_STEPS} steps.`,
    );
  }
  if (voices > BigInt(MAX_EVENT_CYCLE_VOICES)) {
    throw new Error(
      `[Pattern] Transform produces more than ${MAX_EVENT_CYCLE_VOICES} voices.`,
    );
  }
}

function counts<T>(cycle: StaticEventCycle<T>) {
  let steps = 0;
  let voices = 0;
  for (const pattern of cycle.patterns) {
    steps += pattern.length;
    for (const step of pattern) {
      if (step.type === "event") voices += step.values.length;
    }
  }
  return { steps: BigInt(steps), voices: BigInt(voices) };
}

function greatestCommonDivisor(a: number, b: number) {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function reversePatterns<T>(cycle: StaticEventCycle<T>) {
  return [...cycle.patterns].reverse().map((pattern) => {
    const result: EventStep<T>[] = [];
    for (const block of getBlocks(pattern).reverse())
      appendBlock(result, block);
    return Object.freeze(result);
  });
}

function speedPatterns<T>(
  cycle: StaticEventCycle<T>,
  numerator: number,
  denominator: number,
) {
  const divisor = greatestCommonDivisor(cycle.patterns.length, numerator);
  const groups = cycle.patterns.length / divisor;
  const repetitions = BigInt(numerator / divisor);
  const source = counts(cycle);
  // Check the complete repeated phrase before concatenating or inserting gaps.
  assertBudget(
    BigInt(groups) * BigInt(denominator),
    source.steps * repetitions * BigInt(denominator),
    source.voices * repetitions,
  );
  const result: EventPattern<T>[] = [];
  for (let group = 0; group < groups; group++) {
    // Match fluent acceleration: concatenate normalized source steps in bar
    // order, including unequal source lengths, repeating the complete phrase.
    const compressed: EventStep<T>[] = [];
    for (let offset = 0; offset < numerator; offset++) {
      const patternIndex = (group * numerator + offset) % cycle.patterns.length;
      compressed.push(...cycle.patterns[patternIndex]);
    }
    const width = compressed.length;
    const bars = Array.from({ length: denominator }, () =>
      Array<EventStep<T>>(width).fill(REST),
    );
    let sourceIndex = 0;
    for (const block of getBlocks(compressed)) {
      if (block.step.type === "event") {
        const position = sourceIndex * denominator;
        const barIndex = Math.floor(position / width);
        const stepIndex = position % width;
        // v1 cannot persist a gate spanning a bar boundary. Fail rather than
        // truncate it, retrigger it, or emit an orphan leading continuation.
        if (stepIndex + block.width > width) {
          throw new Error(
            "[Pattern] Speed transform would create a cross-bar continuation, which is not supported yet.",
          );
        }
        bars[barIndex][stepIndex] = copyStep(block.step);
        for (let index = 1; index < block.width; index++) {
          bars[barIndex][stepIndex + index] = CONTINUATION;
        }
      }
      // Slowdown spaces onsets, but keeps the existing gate width unchanged.
      sourceIndex += block.width;
    }
    result.push(...bars.map((bar) => Object.freeze(bar)));
  }
  return result;
}

function stretchPatterns<T>(
  cycle: StaticEventCycle<T>,
  bars: number,
  steps: number,
) {
  const source = counts(cycle);
  const repetitions = BigInt(bars) * BigInt(steps);
  assertBudget(
    BigInt(cycle.patterns.length) * BigInt(bars),
    source.steps * repetitions,
    source.voices * repetitions,
  );
  const result: EventPattern<T>[] = [];
  for (const pattern of cycle.patterns) {
    const blocks = getBlocks(pattern);
    for (let barIndex = 0; barIndex < bars; barIndex++) {
      const next: EventStep<T>[] = [];
      for (const block of blocks) {
        // Retrigger complete events in their allocation, not individual
        // continuation cells. Rest subdivisions are repeated as silence.
        for (let repeat = 0; repeat < steps; repeat++) appendBlock(next, block);
      }
      result.push(Object.freeze(next));
    }
  }
  return result;
}

function transformStatic<T>(cycle: StaticEventCycle<T>, operation: Operation) {
  const patterns =
    operation.type === "reverse"
      ? reversePatterns(cycle)
      : operation.type === "speed"
        ? speedPatterns(cycle, operation.numerator, operation.denominator)
        : stretchPatterns(cycle, operation.bars, operation.steps);
  return Object.freeze({
    type: "static-event-cycle",
    patterns: Object.freeze(patterns),
  } as const);
}

function transformCycle<T>(
  cycle: StaticEventCycle<T> | RandomEventCycle,
  operation: Operation,
) {
  assertEventCycleInvariants(cycle);
  if (cycle.type === "static-event-cycle") {
    const result = transformStatic(cycle, operation);
    assertEventCycleInvariants(result);
    return result;
  }
  const settings = cycle.settings;
  const result = Object.freeze({
    type: "random-event-cycle",
    candidateCycle: transformStatic(cycle.candidateCycle, operation),
    settings: Object.freeze({
      ...settings,
      segments: Object.freeze(
        settings.segments.map((segment) => Object.freeze({ ...segment })),
      ),
      ...(settings.range === undefined
        ? {}
        : { range: Object.freeze({ ...settings.range }) }),
      ...(settings.valueMap === undefined
        ? {}
        : { valueMap: Object.freeze([...settings.valueMap]) }),
      order:
        operation.type === "reverse"
          ? settings.order === "forward"
            ? "reverse"
            : "forward"
          : settings.order,
    }),
  } as const);
  assertEventCycleInvariants(result);
  return result;
}

function transformEventCycleSpeedRatio<T>(
  cycle: StaticEventCycle<T>,
  numerator: number,
  denominator: number,
) {
  if (
    !Number.isSafeInteger(numerator) ||
    numerator <= 0 ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0
  ) {
    throw new Error(
      "[Pattern] Speed ratios must use positive safe integer components.",
    );
  }
  const result = transformCycle(cycle, {
    type: "speed",
    numerator,
    denominator,
  });
  if (result.type !== "static-event-cycle") {
    throw new Error("[Pattern] Expected a static event-cycle transform.");
  }
  return result;
}

// Overloads preserve static payload inference and the separate random branch;
// the shared implementation never converts generated values into static data.
function reverseEventCycle<T>(cycle: StaticEventCycle<T>): StaticEventCycle<T>;
function reverseEventCycle(cycle: RandomEventCycle): RandomEventCycle;
function reverseEventCycle<T>(cycle: EventCycle<T>): EventCycle<T>;
function reverseEventCycle<T>(cycle: StaticEventCycle<T> | RandomEventCycle) {
  return transformCycle(cycle, { type: "reverse" });
}

function fastEventCycle<T>(
  cycle: StaticEventCycle<T>,
  multiplier: number,
): StaticEventCycle<T>;
function fastEventCycle(
  cycle: RandomEventCycle,
  multiplier: number,
): RandomEventCycle;
function fastEventCycle<T>(
  cycle: EventCycle<T>,
  multiplier: number,
): EventCycle<T>;
function fastEventCycle<T>(
  cycle: StaticEventCycle<T> | RandomEventCycle,
  multiplier: number,
) {
  return transformCycle(cycle, { type: "speed", ...getSpeedRatio(multiplier) });
}

function slowEventCycle<T>(
  cycle: StaticEventCycle<T>,
  multiplier: number,
): StaticEventCycle<T>;
function slowEventCycle(
  cycle: RandomEventCycle,
  multiplier: number,
): RandomEventCycle;
function slowEventCycle<T>(
  cycle: EventCycle<T>,
  multiplier: number,
): EventCycle<T>;
function slowEventCycle<T>(
  cycle: StaticEventCycle<T> | RandomEventCycle,
  multiplier: number,
) {
  const ratio = getSpeedRatio(multiplier);
  return transformCycle(cycle, {
    type: "speed",
    numerator: ratio.denominator,
    denominator: ratio.numerator,
  });
}

function positiveInteger(value: number, argument: "bars" | "steps") {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `[Pattern] stretch() ${argument} must be a positive safe integer.`,
    );
  }
}

function stretchEventCycle<T>(
  cycle: StaticEventCycle<T>,
  bars: number,
  steps?: number,
): StaticEventCycle<T>;
function stretchEventCycle(
  cycle: RandomEventCycle,
  bars: number,
  steps?: number,
): RandomEventCycle;
function stretchEventCycle<T>(
  cycle: EventCycle<T>,
  bars: number,
  steps?: number,
): EventCycle<T>;
function stretchEventCycle<T>(
  cycle: StaticEventCycle<T> | RandomEventCycle,
  bars: number,
  steps = 1,
) {
  positiveInteger(bars, "bars");
  positiveInteger(steps, "steps");
  return transformCycle(cycle, { type: "stretch", bars, steps });
}

type EventCycleTransform =
  | { readonly type: "reverse" }
  | { readonly type: "fast" | "slow"; readonly multiplier: number }
  | {
      readonly type: "stretch";
      readonly bars: number;
      readonly steps?: number;
    };

type EventCycleGeometry<TCycle> = {
  readonly cycle: TCycle;
  readonly zeroWidthPatterns: readonly boolean[];
};

function resolveOperation(operation: EventCycleTransform): Operation {
  if (operation.type === "reverse") return operation;
  if (operation.type === "stretch") {
    positiveInteger(operation.bars, "bars");
    positiveInteger(operation.steps ?? 1, "steps");
    return { ...operation, steps: operation.steps ?? 1 };
  }
  const ratio = getSpeedRatio(operation.multiplier);
  return operation.type === "fast"
    ? { type: "speed", ...ratio }
    : {
        type: "speed",
        numerator: ratio.denominator,
        denominator: ratio.numerator,
      };
}

/** Preserve zero-width provenance without allowing empty canonical patterns. */
function transformStaticGeometry<T>(
  cycle: StaticEventCycle<T>,
  operation: Operation,
  zeroWidthPatterns: readonly boolean[],
) {
  if (operation.type !== "speed") {
    const result = transformStatic(cycle, operation);
    const flags =
      operation.type === "reverse"
        ? [...zeroWidthPatterns].reverse()
        : zeroWidthPatterns.flatMap((flag) =>
            Array<boolean>(operation.bars).fill(flag),
          );
    return Object.freeze({
      cycle: result,
      zeroWidthPatterns: Object.freeze(flags),
    });
  }
  const { numerator, denominator } = operation;
  const divisor = greatestCommonDivisor(cycle.patterns.length, numerator);
  const groups = cycle.patterns.length / divisor;
  let steps = 0n;
  let voices = 0n;
  cycle.patterns.forEach((pattern, index) => {
    if (zeroWidthPatterns[index]) return;
    steps += BigInt(pattern.length);
    for (const step of pattern)
      if (step.type === "event") voices += BigInt(step.values.length);
  });
  const repetitions = BigInt(numerator / divisor);
  if (
    BigInt(cycle.patterns.length) * repetitions >
    BigInt(MAX_EVENT_CYCLE_STEPS)
  ) {
    throw new Error(
      `[Pattern] Transform traverses more than ${MAX_EVENT_CYCLE_STEPS} source patterns.`,
    );
  }
  assertBudget(
    BigInt(groups) * BigInt(denominator),
    steps * repetitions * BigInt(denominator),
    voices * repetitions,
  );
  const patterns: EventPattern<T>[] = [];
  const flags: boolean[] = [];
  for (let group = 0; group < groups; group++) {
    const compressed: EventStep<T>[] = [];
    for (let offset = 0; offset < numerator; offset++) {
      const index = (group * numerator + offset) % cycle.patterns.length;
      if (!zeroWidthPatterns[index]) compressed.push(...cycle.patterns[index]);
    }
    if (compressed.length === 0) {
      for (let bar = 0; bar < denominator; bar++) {
        patterns.push(Object.freeze([REST]));
        flags.push(true);
      }
    } else {
      const expanded = transformStatic(
        { type: "static-event-cycle", patterns: [compressed] },
        {
          type: "speed",
          numerator: 1,
          denominator,
        },
      );
      patterns.push(...expanded.patterns);
      flags.push(...Array<boolean>(denominator).fill(false));
    }
  }
  const result = Object.freeze({
    type: "static-event-cycle",
    patterns: Object.freeze(patterns),
  } as const);
  assertEventCycleInvariants(result);
  return Object.freeze({
    cycle: result,
    zeroWidthPatterns: Object.freeze(flags),
  });
}

function transformEventCycleGeometry<T>(
  cycle: StaticEventCycle<T>,
  operation: EventCycleTransform,
  zeroWidthPatterns?: readonly boolean[],
): EventCycleGeometry<StaticEventCycle<T>>;
function transformEventCycleGeometry(
  cycle: RandomEventCycle,
  operation: EventCycleTransform,
  zeroWidthPatterns?: readonly boolean[],
): EventCycleGeometry<RandomEventCycle>;
function transformEventCycleGeometry<T>(
  cycle: EventCycle<T>,
  operation: EventCycleTransform,
  zeroWidthPatterns?: readonly boolean[],
): EventCycleGeometry<EventCycle<T>>;
function transformEventCycleGeometry<T>(
  cycle: StaticEventCycle<T> | RandomEventCycle,
  operation: EventCycleTransform,
  zeroWidthPatterns?: readonly boolean[],
) {
  assertEventCycleInvariants(cycle);
  const source =
    cycle.type === "static-event-cycle" ? cycle : cycle.candidateCycle;
  const flags =
    zeroWidthPatterns ?? Array<boolean>(source.patterns.length).fill(false);
  if (
    flags.length !== source.patterns.length ||
    flags.some(
      (flag, index) =>
        typeof flag !== "boolean" ||
        (flag && source.patterns[index].some((step) => step.type !== "rest")),
    )
  ) {
    throw new Error(
      "[Pattern] Zero-width provenance must match silent canonical patterns.",
    );
  }
  const resolved = resolveOperation(operation);
  if (cycle.type === "static-event-cycle")
    return transformStaticGeometry(cycle, resolved, flags);
  const geometry = transformStaticGeometry(
    cycle.candidateCycle,
    resolved,
    flags,
  );
  // Reuse the existing structural snapshot/order rules, never generate values.
  const snapshot = transformCycle(cycle, {
    type: "speed",
    numerator: 1,
    denominator: 1,
  });
  if (snapshot.type !== "random-event-cycle")
    throw new Error("[Pattern] Expected random geometry.");
  const result = Object.freeze({
    ...snapshot,
    candidateCycle: geometry.cycle,
    settings: Object.freeze({
      ...snapshot.settings,
      order:
        operation.type === "reverse"
          ? snapshot.settings.order === "forward"
            ? "reverse"
            : "forward"
          : snapshot.settings.order,
    }),
  });
  assertEventCycleInvariants(result);
  return Object.freeze({
    cycle: result,
    zeroWidthPatterns: geometry.zeroWidthPatterns,
  });
}

export {
  transformEventCycleSpeedRatio,
  reverseEventCycle,
  fastEventCycle,
  slowEventCycle,
  stretchEventCycle,
  transformEventCycleGeometry,
};
export type { EventCycleTransform };
