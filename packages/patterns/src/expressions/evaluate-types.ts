import type { EventSpan } from "../events/grid";
import type { Rational } from "../math/rational";
import type { PatternNode, PatternRange } from "./model";

type AtomInterpretation<T> =
  | { readonly type: "event"; readonly value: T }
  | { readonly type: "rest" };

type AtomInterpreter<TAtom, TValue> = (
  value: TAtom,
  range?: PatternRange,
) => AtomInterpretation<TValue>;

type SpanPattern<T> = EventSpan<T>[];
type NodeEvaluation<T> = readonly SpanPattern<T>[];
type PreparedSequenceChild<T> = {
  readonly node: PatternNode<T>;
  readonly weight: Rational;
};
type PrepareSequenceChildren = <T>(
  children: readonly PatternNode<T>[],
  source: { readonly range?: PatternRange },
) => readonly PreparedSequenceChild<T>[];

type EvaluateNode<TAtom, TValue> = (
  node: PatternNode<TAtom>,
  offset: Rational,
  duration: Rational,
  interpretAtom: AtomInterpreter<TAtom, TValue>,
) => NodeEvaluation<TValue>;

export type {
  AtomInterpretation,
  AtomInterpreter,
  EvaluateNode,
  NodeEvaluation,
  PrepareSequenceChildren,
  PreparedSequenceChild,
  SpanPattern,
};
