# Shorthand Syntax Implementation Plan Outline

## Status and companion documents

**Superseded delivery outline — historical reference only.** [`direct-cutover-plan.md`](./direct-cutover-plan.md) is the active execution checklist. It replaces the adapter-first and mixed-state sequence below with one atomic production cutover. [`plan.md`](./plan.md) is the corresponding historical detailed plan; [`spec.md`](./spec.md) remains authoritative for behavior and architecture.

## Strategy

Migrate incrementally at the existing schema boundary. First prove the shared expression model, event-cycle representation, and compiler using structured input. Then replace legacy authoring state and add shorthand as a second frontend to the same evaluator.

Use a one-way strangler migration rather than dual-writing state:

```text
legacy authoring state → temporary adapter → new compiler
new authoring state                    → new compiler
```

The temporary adapter is the only permitted bridge between architectures. The new compiler must not import legacy authored classes.

Expressions remain at the input boundary:

```text
structured input → decode and validate ─┐
                                        ├→ PatternExpression → evaluate → EventCycle<T>
shorthand source → parse ───────────────┘
```

Instrument state stores evaluated event cycles, not expression trees.

## PR 1 — Characterize the existing baseline

Add tests without changing behavior. Cover:

- timing ownership;
- current scalar broadcasting;
- rests and random sources;
- transforms and setter order;
- sampler lane interactions;
- generated chop/fit timing;
- silent bars and polyphony;
- final schema output.

These fixtures become the initial compatibility baseline.

## PR 2 — Land intentional event-semantics changes

Land each change as an independently reviewable step before architecture migration:

1. Change sampler note and variation rests to candidate-ordinal filtering.
2. Remove authored scalar broadcasting. All authored sources become patterns whose rests filter externally owned timing.
3. Establish constructor defaults as fallback sources with nonempty groups. Defaults do not compete with or filter authored timing, fill surviving hits, and never create hits.

Include the explicit contrast:

```ts
d.sample("bd").slow(2).xox([1, 1]);
d.sample().name("bd").slow(2).xox([1, 1]);
```

The first uses a default fallback for every surviving hit. The second is an authored pattern whose slowed rest bar can suppress hits. Promote the corrected fixtures to the baseline used by all later parity comparisons.

## PR 3 — Introduce the shared expression and event-cycle primitives

Add:

- one generic `PatternExpression<T>` model for both frontends;
- structured-input decoding and validation into typed expressions;
- one evaluator for explicit bars, sequences, polyphony, rests, allocation, and limits;
- static event/rest/continuation cycles and separate random cycle variants;
- rational geometry and generic event-cycle transforms;
- derived offsets and durations.

Do not add `valueMode` or a separate shorthand AST. `@web-audio/patterns` owns the generic expression model and evaluator. Fluid owns consumer-specific structured decoding and validation.

Do not cut over production behavior yet.

## PR 4 — Add the adapter and pure compiler

Implement:

```text
legacy authoring state
  → one-way adapter
  → InstrumentEventState
  → new pure compiler
  → existing schema
```

Prove that the adapter preserves everything representable by the corrected legacy baseline:

- authored patterns and default fallback intent;
- nonempty default fallback groups;
- static rests and silent bars;
- random settings and values per bar;
- transformed cycle geometry;
- timing conditions;
- simultaneous voices;
- root and scale metadata.

Adapt authoring state directly rather than reconstructing it from compiled schema. Keep legacy getter side effects or materialization outside the pure compiler.

Run old and new compilers over the same fixtures and compare complete schema output.

## PR 5 — Cut synth compilation over

Switch `Synthesizer.getSchema()` to the adapter and new compiler:

```text
legacy synth authoring state → adapter → new compiler
```

Remove superseded synth-only schema wiring. Retain legacy state, the adapter, and shared helpers still required by sampler compilation or transform materialization.

Once an old implementation is removed, use retained golden schema fixtures rather than keeping it solely for comparison.

## PR 6 — Cut sampler compilation over

Switch sampler schema generation to the adapter and new compiler, including:

- timing selection;
- authored candidate availability;
- default fallback value resolution;
- hit-index value resolution;
- random values;
- names, notes, and variations;
- generated chop/fit timing overrides;
- silent bars and voice wrapping.

Remove the superseded sampler `getSchema()` path. Narrowly identified legacy timing/materialization helpers may remain until PR 7.

## PR 7 — Establish transform ownership

Before introducing mixed state, centralize and test transform coordination.

Each transform must:

1. select or materialize timing once, when required;
2. transform each applicable lane exactly once;
3. preserve default fallback groups while transforming default timing geometry;
4. preserve generated timing exemptions;
5. preserve setter and transform call order.

Route transform timing selection through the new pure logic, delete the remaining old compiler helpers, and make golden fixtures the parity authority.

## PR 8 — Migrate common note and timing state

Replace shared `Instrument` note and timing storage with native event state.

A temporary mixed flow may be:

```text
new notes/timing + legacy sampler names/variations
  → adapter for remaining legacy lanes
  → new compiler
```

The transform coordinator owns all lanes during this stage. Delete the synth adapter once synth state is fully native.

## PR 9 — Migrate sampler names and variations

Move sample names and variations to native event sources. Then:

- remove the final adapter;
- centralize sampler transforms entirely on `InstrumentEventState`;
- remove or narrow `AuthoredPitches`, `AuthoredTiming`, `AuthoredEventValues`, and `MaskedCycle`;
- remove duplicate materialization and availability helpers.

Structured input now follows the shared expression evaluator into native event state end to end.

## PR 10 — Add the shorthand parser to the shared expression model

Implement and test:

- lexer and parser producing `PatternExpression<string>` directly;
- readonly source ranges on parsed expression nodes;
- syntax diagnostics;
- shorthand-only alternation and postfix operators in the shared evaluator;
- nesting and expansion limits;
- syntax restrictions such as rejecting `[0 1,2]`.

There is no `ShorthandNode` or converted-tree lowering stage.

## PR 11 — Add target atom interpretation and prove equivalence

Add consumer callbacks that interpret shorthand atoms during evaluation:

- notes and variations become finite numbers;
- sample names remain validated names;
- XOX atoms become onsets or rests;
- legacy compact XOX strings decode into the same expression model.

No intermediate converted expression is created. Prove structured/shorthand event-cycle and schema equivalence, including:

```ts
.var("1/2");
.var(1).slow(2);

.var("1!2");
.var([1, 1]);
```

## PR 12 — Wire up the public shorthand API

Add:

- `d.shorthand()` and `d.sh()`;
- immutable reusable shorthand values exposing `PatternExpression<string>`;
- direct-string dispatch;
- shorthand support in `.notes()`, `.name()`, `.var()`, and `.xox()`;
- sample alias restrictions;
- public expression node exports;
- user documentation.

Public integration remains last even if parser and atom-interpreter work proceed in parallel.

## Cutover gates

Every production cutover requires:

- old/new schema parity while both compilers exist;
- parity against retained golden schema fixtures after an old compiler is deleted;
- focused tests for adapter edge cases;
- no unexplained mismatches;
- no legacy imports in the new compiler;
- no new features implemented through superseded paths;
- no production dependency on superseded paths except through the temporary adapter.

If the adapter cannot express corrected legacy state identically, the mismatch must either block cutover or land first as a separate, documented behavior change.
