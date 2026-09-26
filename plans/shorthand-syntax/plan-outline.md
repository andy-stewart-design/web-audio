# Shorthand Syntax Implementation Plan Outline

## Strategy

Migrate incrementally at the existing schema boundary. First prove the new event-cycle representation and compiler using structured input, then replace legacy authoring state, and only then add shorthand.

Use a one-way strangler migration rather than dual-writing state:

```text
legacy authoring state → temporary adapter → new compiler
new authoring state                    → new compiler
```

The temporary adapter is the only permitted bridge between architectures. The new compiler must not import legacy authored classes.

## PR 1 — Characterize the existing baseline

Add tests without changing behavior. Cover:

- timing ownership;
- rests and scalar broadcasting;
- random sources;
- transforms and setter order;
- sampler lane interactions;
- generated chop/fit timing;
- silent bars and polyphony;
- final schema output.

These fixtures become the initial compatibility baseline.

## PR 2 — Make intentional filtering changes

Implement sampler candidate-ordinal filtering as an isolated behavior change.

- Add explicit before/after fixtures.
- Establish the corrected behavior as the baseline for later parity comparisons.
- Do not introduce the new architecture in this PR.

## PR 3 — Introduce event-cycle primitives

Add the internal IR and generic mechanics:

- event, rest, and continuation steps;
- static and random cycles;
- `valueMode`;
- rational geometry and expansion limits;
- generic transforms;
- derived offsets and durations.

`@web-audio/patterns` owns generic structure, geometry, and transforms. Fluid retains structured-input entry points, authored intent, and consumer-specific validation.

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

Prove that the adapter preserves everything representable by legacy state:

- scalar broadcasting as constant `valueMode`;
- default versus authored intent;
- static rests and silent bars;
- random settings and values per bar;
- transformed cycle geometry;
- timing conditions;
- simultaneous voices;
- root and scale metadata.

Adapt authoring state directly rather than reconstructing it from compiled schema. Keep legacy getter side effects or materialization outside the pure compiler.

Run old and new compilers over the same fixtures and compare their schema output.

## PR 5 — Cut synth compilation over

Switch `Synthesizer.getSchema()` to the adapter and new compiler:

```text
legacy synth authoring state → adapter → new compiler
```

Remove superseded synth-only compilation code. Retain `AuthoredPitches`, `AuthoredTiming`, and the adapter until authoring state migrates later.

Once the old synth compiler is removed, use retained golden schema fixtures for subsequent parity checks rather than keeping the old compiler available.

## PR 6 — Cut sampler compilation over

Switch sampler schema generation to the adapter and new compiler, including:

- timing selection;
- candidate availability;
- hit-index value resolution;
- random values;
- names, notes, and variations;
- generated chop/fit timing overrides;
- silent bars and voice wrapping.

Remove the superseded sampler compilation path. Legacy classes remain temporarily as authoring storage.

Once the old sampler compiler is removed, use retained golden schema fixtures for subsequent parity checks.

## PR 7 — Establish transform ownership

Before introducing mixed state, centralize and test transform coordination.

Each transform must:

1. select or materialize timing once, when required;
2. transform each applicable lane exactly once;
3. preserve generated timing exemptions;
4. preserve setter and transform call order.

Add explicit sampler tests for mixed lane ordering and chop/fit interactions.

## PR 8 — Migrate common note and timing state

Replace shared `Instrument` note and timing storage with the new event state.

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

Structured input now uses the new architecture end to end.

## PR 10 — Add the shorthand parser and public AST

Implement and test:

- lexer and parser;
- readonly source-aware AST;
- syntax diagnostics;
- nesting and expansion limits;
- syntax restrictions such as rejecting `[0 1,2]`.

This work may proceed in parallel with PR 11 once the event-cycle IR and AST contracts are stable.

## PR 11 — Add shorthand normalization

Normalize typed shorthand ASTs into the same event cycles as structured input.

Determine `valueMode` through separate semantic analysis, not by reordering evaluation:

> Determine `valueMode` from authored topology: sequences, alternation, polyphony, rests, and structural repetition participate in classification; speed and weight modifiers preserve it. Evaluate geometry in written operator order, including the specified speed-chain cancellation rules.

This must not be implemented as “evaluate every `!` before every `*`, `/`, or `@`.”

Include equivalence fixtures such as:

```ts
.var("1/2");
.var(1).slow(2);

.var("1!2");
.var([1, 1]);
```

## PR 12 — Wire up the public shorthand API

Add:

- `d.shorthand()` and `d.sh()`;
- direct-string dispatch;
- shorthand support in `.notes()`, `.name()`, `.var()`, and `.xox()`;
- target-specific atom validation;
- sample alias restrictions;
- public AST exports;
- user documentation.

Public integration remains last even if parser and normalization work proceed in parallel.

## Cutover gates

Every production cutover requires:

- old/new schema parity while both compilers exist;
- parity against retained golden schema fixtures after an old compiler is deleted;
- focused tests for adapter edge cases;
- no unexplained mismatches;
- no legacy imports in the new compiler;
- no new features implemented through superseded paths;
- no production dependency on superseded paths except through the temporary adapter.

If the adapter cannot express a legacy state identically, the mismatch must either block cutover or land first as a separate, documented behavior change.
