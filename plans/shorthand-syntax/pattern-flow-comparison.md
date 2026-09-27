# Pattern Flow Comparison

## Status

Design aid. [`spec.md`](./spec.md) is authoritative for behavior and architecture.

| Current production flow                                        | Target flow                                       |
| -------------------------------------------------------------- | ------------------------------------------------- |
| ![Current production pattern flow](./pattern-flow-current.png) | ![Target pattern flow](./pattern-flow-target.png) |

## Architectural change

The target replaces consumer-specific authoring wrappers and compilation paths with one input-boundary expression flow:

```text
structured input → decode and validate ─┐
                                        ├→ PatternExpression → evaluate → EventCycle<T>
shorthand source → parse ───────────────┘
```

Key properties:

- structured and shorthand input produce the same `PatternExpression` model;
- one evaluator owns allocation, geometry, rests, continuations, alternation, and operators;
- consumer callbacks interpret shorthand atoms during evaluation;
- random configuration remains a separate event-source branch;
- expressions are transient, while instrument state stores evaluated event cycles;
- authored patterns and default fallback sources retain distinct intent;
- the pure compiler continues emitting the existing synth and sampler schema;
- the schema and audio engine remain unaware of expressions and event cycles.

The editable target diagram is [`target-pattern-flow.tldraw`](./target-pattern-flow.tldraw).
