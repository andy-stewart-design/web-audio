# Shorthand Syntax Direct-Cutover Implementation Plan

## Status and companion documents

Proposed revision to the delivery sequence in [`plan.md`](./plan.md).

The normative behavior and target architecture remain defined by [`spec.md`](./spec.md). This document changes only how the target architecture is introduced. It replaces the adapter-first, lane-by-lane migration sequence with a shorter direct cutover.

Read this with:

- [`spec.md`](./spec.md) — authoritative behavior and architecture;
- [`plan-outline.md`](./plan-outline.md) — original conservative migration outline;
- [`plan.md`](./plan.md) — original detailed strangler plan;
- [`pattern-flow-comparison.md`](./pattern-flow-comparison.md) — current and target flows;
- [`syntax-examples.md`](./syntax-examples.md) — public syntax examples.

If this plan and the specification disagree, the specification wins.

## Why revise the delivery strategy

The original plan optimizes for independently releasable migration steps, direct old/new compiler comparison, and small production cutovers. To achieve that, it intentionally introduces temporary machinery:

- a legacy-state adapter;
- separate synth and sampler compiler cutovers;
- mixed native and legacy state;
- transform coordination across both representations;
- repeated implementation of corrected semantics in old and new compilers.

That is appropriate when minimizing each cutover's risk is more important than minimizing total migration work. It is unnecessarily expensive when a larger atomic cutover is acceptable and explicit golden schema fixtures already provide a strong compatibility oracle.

This revised plan optimizes for:

- reaching the target architecture sooner;
- avoiding production adapters and mixed state;
- implementing semantics only once in the replacement architecture after PR 2;
- deleting legacy event abstractions at the production cutover;
- preserving reviewability by building and testing pure foundations before wiring them into production.

## Current position

PR 1 established complete schema compatibility fixtures.

PR 2 establishes the intentional semantic baseline:

1. sampler note and variation rests use candidate ordinals;
2. authored scalar and one-step inputs are ordinary patterns;
3. constructor defaults are explicit fallback sources.

Finish PR 2, but treat it as the final work that changes the legacy event architecture. Do not further generalize or polish legacy authored wrappers beyond what is required to make the corrected public behavior explicit and tested.

Implementation details inside `AuthoredPitches`, `AuthoredEventValues`, `AuthoredTiming`, `MaskedCycle`, and the old event compiler remain temporary. Public schema fixtures and semantic expectations are the durable output of PR 2.

## Target production flow

The production cutover moves directly from the current flow to:

```text
structured input → decode and validate ─┐
                                        ├→ PatternExpression<T> → evaluate → EventCycle<T>
shorthand source → parse ───────────────┘
                                                                  ↓
                                                       InstrumentEventState
                                                                  ↓
                                                        pure event compiler
                                                                  ↓
                                                     existing event schema
```

Before shorthand is connected, only the structured-input branch is active.

Expressions remain transient. Instrument state stores event cycles. Random sources remain a separate event-cycle variant. Processing parameters remain outside this architecture.

## Migration rules

1. Do not add a production legacy-state adapter by default.
2. Do not dual-write legacy and native event state.
3. Do not introduce a production period where some coordinated event lanes are native and others remain legacy-backed.
4. Build new primitives, state transitions, and compilation beside production code with direct unit tests.
5. Switch all coordinated event lanes atomically once the replacement path is complete.
6. Use corrected golden schema fixtures as the cutover authority.
7. Delete superseded compiler and authored-wrapper code in the cutover PR.
8. Keep processing patterns, envelopes, effects, and unrelated sampler configuration out of the migration.
9. Add shorthand only after structured input uses the target path end to end.
10. If a temporary bridge becomes necessary, stop and document the concrete blocker before adding it. A bridge is an exception, not a planned phase.

## Verification conventions

Run focused tests throughout each PR. At each PR completion gate, run:

```sh
pnpm check
pnpm lint
pnpm test
pnpm format
git diff --check
```

The schema boundary remains the compatibility boundary. Before production cutover, test the new compiler using directly constructed native state. At cutover, run the existing public Fluid API fixtures unchanged against the new path.

---

# PR 1 — Characterize the existing baseline

Status: complete.

Retain the explicit event-schema compatibility fixtures as the long-term parity authority. Do not keep obsolete production code solely for differential testing.

# PR 2 — Land intentional event-semantics changes

Status: in progress.

Complete the corrected semantic baseline in the current architecture:

- candidate-ordinal availability;
- authored scalar pattern behavior;
- default fallback intent and resolution.

## Completion gate

- [ ] Corrected public schema fixtures pass.
- [ ] Intentional output changes are isolated and documented.
- [ ] Defaults, authored patterns, rests, random sources, and transforms have explicit coverage.
- [ ] No target expression, event-cycle, or adapter infrastructure has landed.
- [ ] No additional legacy refactoring is planned after this PR.

---

# PR 3 — Build shared expression and event-cycle foundations

## Goal

Implement the target input-boundary model and canonical event-cycle mechanics without changing production instrument behavior.

## Step 3.1 — Define `PatternExpression<T>`

Add one readonly expression model shared by structured input and shorthand:

- explicit root patterns;
- atoms and rests;
- sequences, groups, parallel groups, and alternation;
- modifiers;
- optional source ranges;
- bounded node count and depth.

Do not add a separate shorthand AST.

## Step 3.2 — Define event-cycle primitives

Add:

- static event cycles;
- event, rest, and continuation steps;
- nonempty event groups;
- explicit silent patterns;
- separate random event-cycle variants;
- bounded cycle, pattern, step, event, and voice counts.

No `valueMode`, scalar classification, authored broadcasting metadata, or schema-specific fields belong in the cycle.

## Step 3.3 — Implement exact evaluation

Implement one pure evaluator that:

- accepts `PatternExpression<TAtom>`;
- receives a consumer atom interpreter;
- evaluates typed structured atoms through identity interpretation;
- owns allocation, geometry, rests, continuations, and normalization;
- uses bounded rational arithmetic;
- rejects excessive expansion instead of rounding or truncating;
- returns immutable event cycles.

Initially implement the structures required by existing structured input. Shorthand-only alternation and operator behavior may be completed in PR 6.

## Step 3.4 — Decode structured inputs

In Fluid, decode and validate current method input into typed expressions:

- method arguments become explicit patterns/bars;
- array entries become sequential slots;
- nested arrays become simultaneous groups;
- allowed `null` and `undefined` values become rests;
- random inputs bypass static expression evaluation and become random event cycles.

Cover notes, sample names, variations, and fixed timing.

## Step 3.5 — Implement native cycle transforms

Implement pure event-cycle transforms for:

- `reverse`;
- `fast`;
- `slow`;
- `stretch`.

Preserve exact geometry, explicit rests, continuations, silent patterns, and multi-pattern cycles. Keep default fallback metadata outside the transformed cycle.

## Likely files

- `packages/patterns/src/pattern-expression.ts`
- `packages/patterns/src/event-cycle.ts`
- `packages/patterns/src/evaluate-pattern-expression.ts`
- `packages/patterns/src/event-cycle-transforms.ts`
- rational, grid, limit, and corresponding test files
- `packages/fluid/src/patterns/decode-structured-input.ts`
- structured-decoder tests and Fluid validation utilities

## Completion gate

- [ ] Structured inputs decode into `PatternExpression<T>`.
- [ ] One evaluator produces canonical event cycles.
- [ ] Generic transforms operate on event cycles immutably.
- [ ] Random sources retain a separate branch.
- [ ] Production instruments still use the legacy path.
- [ ] No adapter or native/legacy mixed state exists.

---

# PR 4 — Build native event state and the pure compiler

## Goal

Implement the complete target state model, transitions, and compiler in isolation from production authoring classes.

## Step 4.1 — Define native event state

Define readonly state for synths and samplers:

- authored static and random event sources;
- default static sources with nonempty fallback groups;
- implicit and explicit timing;
- chance conditions;
- root and scale metadata;
- sampler names and variations;
- optional generated timing override supplied to compilation.

Intent is colocated with its source. Expressions do not enter state.

## Step 4.2 — Implement pure state transitions

Implement structural transitions for:

- replacing notes, names, variations, and timing;
- applying root and scale settings;
- applying all event transforms exactly once;
- preserving setter/transform call order;
- retaining fallback groups while transforming default timing geometry;
- preserving generated chop/fit exemptions.

A transform coordinator does not need to exist as a migration abstraction. If a named coordinator is useful, it should be a thin native state transition with no legacy dependencies.

## Step 4.3 — Implement the pure compiler

Implement:

- explicit/generated/inferred timing selection;
- sampler density and tie policy;
- candidate-ordinal availability;
- continuation transparency;
- default fallback resolution;
- bounded common-cycle expansion;
- final hit-index value resolution;
- static and random schema emission;
- root and scale conversion;
- existing silent-bar conventions.

The compiler must not import legacy authored classes, inspect public JavaScript input nesting, mutate state, or compile processing parameters.

## Step 4.4 — Test native semantics directly

Construct native state directly in tests and cover the corrected behavior matrix, including:

- synth and sampler timing ownership;
- all authored/default contrasts;
- rest intersections and continuations;
- scalar slowdown;
- random values and random timing;
- transforms and setter ordering;
- silent patterns and cycle expansion;
- generated timing overrides;
- duplicate voices and independent lane wrapping.

Use explicit expected schema objects. Do not build a production legacy adapter solely to run differential tests.

## Likely files

- `packages/fluid/src/instruments/event-state.ts`
- `packages/fluid/src/instruments/event-state-transitions.ts`
- `packages/fluid/src/instruments/event-state-compiler.ts`
- corresponding test files

## Completion gate

- [ ] Native state represents all corrected structured behavior.
- [ ] Pure transitions preserve all transform and setter-order rules.
- [ ] Pure compiler output matches corrected golden expectations.
- [ ] Compiler and transitions have no legacy authored-class imports.
- [ ] Production instruments still have one legacy source of truth.
- [ ] No adapter or dual state has been introduced.

---

# PR 5 — Cut structured input over atomically

## Goal

Replace production event authoring and compilation in one coordinated cutover, then delete the superseded architecture.

This is intentionally the largest PR in the revised plan. Its risk is controlled by the isolated coverage from PRs 3 and 4 and by the existing complete-schema fixtures.

## Step 5.1 — Route all structured setters to native state

Replace legacy event storage in `Instrument`, `Synthesizer`, and `Sampler`:

- initialize native synth and sampler event state;
- decode and evaluate `.notes()`;
- decode fixed/random `.xox()`;
- preserve `.hex()`, `.euclid()`, and `.sequence()` behavior;
- decode and evaluate `.name()`;
- decode and evaluate `.variation()` / `.var()`;
- apply root and scale through native state;
- make every setter replacement authored, even when equal to a default;
- retain generated chop/fit timing as a compiler override.

All coordinated event lanes switch together. Do not leave sampler names or variations on legacy wrappers after common notes and timing move.

## Step 5.2 — Route transforms through native transitions

Make `reverse`, `fast`, `slow`, and `stretch` update `InstrumentEventState` directly:

- transform every participating event lane exactly once;
- select or materialize timing once when required;
- preserve default fallback groups;
- preserve later-setter behavior;
- preserve explicit timing and generated timing exemptions;
- leave processing parameters untouched.

## Step 5.3 — Switch schema generation

Route both synth and sampler `getSchema()` through the new pure compiler in the same production cutover.

Preserve:

- current schema types;
- optional sampler notes and default variation omission;
- sample resource warnings;
- sampler region, fit, chop, loop, clipping, and direction behavior;
- processing parameter compilation.

## Step 5.4 — Delete superseded event infrastructure

Once the new path is wired and fixtures pass, delete or narrow:

- the old event compiler;
- `AuthoredPitches`;
- `AuthoredEventValues`;
- event-related `AuthoredTiming` responsibilities;
- event-related `MaskedCycle` usage;
- duplicated availability, materialization, timing-selection, and cycle-expansion helpers;
- wrapper-detail tests that no longer describe production behavior.

Retain any generally useful rhythm generators as named pure utilities rather than legacy stateful wrappers.

## Cutover verification

Run the existing public Fluid API compatibility fixtures unchanged. Review every schema mismatch against the PR 2 baseline. A mismatch must be:

1. fixed as a regression; or
2. documented as an additional intentional behavior change before merge.

Also use `rg` to confirm deleted wrappers and compiler symbols have no production callers.

## Completion gate

- [ ] Structured input uses expressions, evaluation, event cycles, native state, and the new compiler end to end.
- [ ] Both synth and sampler cut over together.
- [ ] No legacy adapter, dual state, or mixed event-lane state exists.
- [ ] Old event compiler and authored wrappers are deleted or explicitly narrowed.
- [ ] Complete schema fixtures pass unchanged except for documented PR 2 expectations.
- [ ] Processing patterns remain unaffected.

---

# PR 6 — Add shorthand parsing and complete shared evaluation

## Goal

Add shorthand as a second frontend to the already-production expression evaluator.

## Step 6.1 — Parse directly into `PatternExpression<string>`

Implement:

- source-aware lexing and parsing;
- source ranges;
- groups, polyphony, alternation, and postfix modifiers;
- reserved-token and empty-structure errors;
- syntax and expansion limits.

Do not introduce a second shorthand AST or converted expression tree.

## Step 6.2 — Complete shorthand-only evaluation

Extend the shared evaluator with:

- deterministic alternation;
- structural repetition;
- acceleration and slowdown;
- relative weighting and continuations;
- exact speed-chain cancellation;
- nested allocation and bounded finite periods.

Structured behavior must continue through the same evaluator unchanged.

## Step 6.3 — Add consumer atom interpreters

In Fluid, interpret shorthand atoms during evaluation for:

- notes;
- sample names;
- variations;
- XOX timing.

Preserve legacy compact XOX through a compatibility decoder that also produces `PatternExpression<string>`.

## Step 6.4 — Prove structured/shorthand equivalence

Compare expression structures, event cycles, and final schema for equivalent forms, including:

```ts
.var("1!2");
.var([1, 1]);

.var("1/2");
.var(1).slow(2);
```

Cover rests, chords, continuations, weighting, alternation, direct strings, reusable shorthand values, and target-specific errors.

## Completion gate

- [ ] Shorthand parses directly into the shared expression model.
- [ ] One evaluator handles structured and shorthand geometry.
- [ ] Atom interpretation creates no converted expression copy.
- [ ] Structured production behavior remains green.
- [ ] No public shorthand dispatch is required yet.

---

# PR 7 — Wire the public shorthand API and finish cleanup

## Goal

Expose shorthand publicly after the target structured architecture is stable.

## Tasks

- [ ] Add `d.shorthand()` and `d.sh()`.
- [ ] Return immutable reusable shorthand values with inspectable expressions.
- [ ] Add direct single-string dispatch to supported consumers.
- [ ] Require reusable shorthand values to be the sole argument.
- [ ] Support `.notes()`, `.name()`, `.variation()` / `.var()`, and `.xox()`.
- [ ] Preserve compact XOX compatibility.
- [ ] Apply the documented sample alias and `:` restrictions.
- [ ] Export public expression types.
- [ ] Add malformed syntax, invalid target, and expansion-limit tests.
- [ ] Update Fluid, patterns, and concept documentation.
- [ ] Remove migration-only exports, comments, and test scaffolding.
- [ ] Confirm expressions and event cycles do not enter schema or audio-engine code.

## Completion gate

- [ ] Supported consumers accept direct strings and reusable shorthand.
- [ ] Structured and shorthand inputs share one model and evaluator.
- [ ] Instrument state stores only event cycles.
- [ ] Legacy event abstractions and migration-only code are gone.
- [ ] Intentional compatibility changes are documented.
- [ ] Complete repository validation passes.

---

# Direct-cutover review checklist

- [ ] PR 2 is the last change to legacy event semantics.
- [ ] New foundational code is tested before production wiring.
- [ ] New compiler tests construct native state directly.
- [ ] No production adapter is introduced without a documented blocker.
- [ ] No lane is represented in both legacy and native state.
- [ ] All coordinated event lanes switch in one production cutover.
- [ ] Golden schema fixtures remain the compatibility authority.
- [ ] Expressions remain transient input-boundary values.
- [ ] Event cycles remain internal canonical state.
- [ ] Random sources remain a separate branch.
- [ ] Defaults retain nonempty fallback groups and never create/filter hits.
- [ ] Authored rests filter by candidate ordinal.
- [ ] Transforms update native state exactly once.
- [ ] Processing parameters remain outside the redesign.
- [ ] Superseded wrappers and compiler helpers are deleted at cutover.
- [ ] Type checking, linting, tests, formatting, and `git diff --check` pass.
