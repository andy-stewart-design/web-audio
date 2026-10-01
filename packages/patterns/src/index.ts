import FixedTimingCycle from "./fixed-timing-cycle";
import RandomCycle from "./random-cycle";
import { ValueCycle } from "./value-cycle";
import {
  assertCycleBarLimit,
  assertCycleLimits,
  getChordStaticSchema,
} from "./utils";
import { MaskedCycle } from "./masked-cycle";
import { assertPatternExpressionLimits } from "./pattern-expression";
import {
  assertEventCycleInvariants,
  assertRandomGenerationMetadata,
} from "./event-cycle";
import { evaluatePatternExpression } from "./evaluate-pattern-expression";
import { getEventPatternGeometry } from "./utils/event-grid";
import {
  reverseEventCycle,
  fastEventCycle,
  slowEventCycle,
  stretchEventCycle,
} from "./event-cycle-transforms";
import type {
  ChanceCondition,
  Chord,
  AtomInterpretation,
  AtomInterpreter,
  NonEmptyGroup,
  EventCycle,
  StaticEventCycle,
  RandomEventCycle,
  RandomEventSettings,
  EventPattern,
  EventStep,
  PatternExpression,
  PatternNode,
  PatternRange,
  PatternAtom,
  PatternRest,
  PatternSequence,
  PatternGroup,
  PatternParallel,
  PatternAlternate,
  PatternModifier,
  RandomNumberPattern,
  ScheduledValue,
  SourceHitReference,
  StaticNotePattern,
  StaticPattern,
  TimingPattern,
  TimingStep,
} from "./types";

export {
  FixedTimingCycle,
  RandomCycle,
  ValueCycle,
  MaskedCycle,
  assertCycleBarLimit,
  assertCycleLimits,
  assertPatternExpressionLimits,
  assertEventCycleInvariants,
  assertRandomGenerationMetadata,
  evaluatePatternExpression,
  getEventPatternGeometry,
  reverseEventCycle,
  fastEventCycle,
  slowEventCycle,
  stretchEventCycle,
  getChordStaticSchema,
  type ChanceCondition,
  type Chord,
  type AtomInterpretation,
  type AtomInterpreter,
  type NonEmptyGroup,
  type EventCycle,
  type StaticEventCycle,
  type RandomEventCycle,
  type RandomEventSettings,
  type EventPattern,
  type EventStep,
  type PatternExpression,
  type PatternNode,
  type PatternRange,
  type PatternAtom,
  type PatternRest,
  type PatternSequence,
  type PatternGroup,
  type PatternParallel,
  type PatternAlternate,
  type PatternModifier,
  type RandomNumberPattern,
  type ScheduledValue,
  type SourceHitReference,
  type StaticNotePattern,
  type StaticPattern,
  type TimingPattern,
  type TimingStep,
};

// Internal frontend bounds: validate before allocating decoded expression/state data.
export {
  MAX_EXPRESSION_NODES,
  MAX_EVENT_CYCLE_PATTERNS,
  MAX_EVENT_CYCLE_STEPS,
  MAX_EVENT_GROUP_VOICES,
} from "./utils/cycle-limits";
