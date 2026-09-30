# Shorthand Syntax Direct-Cutover Implementation Plan

## Status and companion documents

Proposed revision to the delivery sequence in [`plan.md`](./plan.md).

The normative behavior and target architecture remain defined by [`spec.md`](./spec.md). This document changes only how that architecture is introduced. It replaces the adapter-first, lane-by-lane sequence in PRs 3–9 of the original plan with a shorter direct cutover.

Read this with:

- [`spec.md`](./spec.md) — normative behavior and architecture;
- [`plan.md`](./plan.md) — original conservative strangler plan;
- [`plan-outline.md`](./plan-outline.md) — original high-level sequence;
- [`pattern-flow-comparison.md`](./pattern-flow-comparison.md) — current and target flows;
- [`syntax-examples.md`](./syntax-examples.md) — shorthand and structured equivalents.

If this plan and the specification disagree, the specification wins.

## Delivery strategy

Finish the intentional semantic corrections in PR 2, then stop modifying the legacy event architecture.

Build the target foundations beside production code:

```text
structured input → decode and validate → PatternExpression<T> → evaluate → EventCycle<T>
                                                               ↓
                                                    InstrumentEventState
                                                               ↓
                                                     pure event compiler
                                                               ↓
                                                  existing event schema
```

Before shorthand is connected, only the structured-input branch exists. Once the target path is complete and directly tested, switch every coordinated event lane to native state in one production cutover and delete the old path.

After the cutover, add shorthand as a second frontend:

```text
structured input → decode and validate ─┐
                                        ├→ PatternExpression → evaluate → EventCycle<T>
shorthand source → parse ───────────────┘
```

This plan intentionally does not include:

- a production legacy-state adapter;
- production old/new differential wiring;
- separate synth and sampler schema cutovers;
- mixed native and legacy event lanes;
- a transform coordinator that understands both representations.

Corrected golden schema fixtures are the compatibility authority. Temporary test-only legacy/native comparisons are permitted, including generated setter/transform sequences. They run independently initialized paths, not a legacy-state adapter, and are removed when the legacy path is deleted; retained golden and native tests remain authoritative afterward.

## Migration rules

1. PR 2 is the final PR that changes legacy event semantics.
2. Do not dual-write legacy and native state.
3. Do not introduce a production period with mixed native and legacy event lanes.
4. Build new foundations with direct tests and complete native scenario replay before production wiring.
5. Switch notes, timing, sample names, and variations together.
6. Delete superseded wrappers and compiler code in the cutover PR only after recording and verifying coverage transfer.
7. Expressions remain transient; instrument state stores event cycles only.
8. Random sources remain a separate event-cycle branch.
9. Processing parameters remain outside the redesign.
10. If a production bridge becomes necessary, stop and document the concrete blocker before adding it. A production bridge is an exception, not a planned phase; independent test-only scenario replay is permitted.
11. Unresolved representation-feasibility questions block cutover. Resolve any required design changes before PR 5, not inside production wiring.
12. Do not change corrected golden expectations to make PR 5 pass. Fix regressions; if a behavior change proves necessary, stop and review it separately before resuming cutover.

Steps within the atomic cutover PR describe implementation areas, not independently mergeable production states. The branch may prepare isolated helpers first, but the merged result must contain only one authoritative event-state representation.

## Verification conventions

Run focused tests after each step. At the end of every PR, run:

```sh
pnpm check
pnpm lint
pnpm test
pnpm format
git diff --check
```

Useful focused commands:

```sh
pnpm --filter @web-audio/patterns test:ci
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/schema test:ci
```

Before production cutover, test the new compiler with directly constructed native state and replay compatibility scenarios through native constructors, decoding, evaluation, transitions, and compilation. The native test driver must invoke the same helpers intended for production, not recreate validation, timing selection, or materialization logic. Temporary differential tests may compare independently initialized legacy and native paths, but neither production code nor the native implementation may depend on the comparison harness. At cutover, run the existing public Fluid API fixtures unchanged against the new production path.

---

# PR 1 — Characterize the existing baseline

## Goal

Capture current public behavior at the schema boundary without changing production code.

Status: complete.

## Step 1.1 — Establish complete schema fixtures

### Work

Use table-driven public Fluid API scenarios with explicit complete event-pattern expectations.

### Tasks

- [x] Add the event-schema compatibility test file.
- [x] Cover complete timing, values, conditions, and silent bars.
- [x] Use fresh instrument construction for every fixture.
- [x] Compare canonical serialized schema output strictly.
- [x] Keep production behavior unchanged.

### Likely files

- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`

### Verification

- [x] Run focused Fluid tests.
- [x] Run the complete repository suite.
- [x] Confirm the PR contains tests only.

## Step 1.2 — Retain fixtures as the parity authority

### Work

Use explicit expected schema objects after old production code is deleted. Do not preserve obsolete code solely for differential tests.

### Tasks

- [x] Cover timing ownership, rests, defaults, scalar broadcasting, transforms, random sources, polyphony, generated timing, and cycle expansion.
- [x] Give each fixture a behavior-oriented name.
- [x] Make fixture failures identify complete schema differences.

### Likely files

- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`

### Verification

- [x] Confirm every planned intentional PR 2 change has a before/after fixture.

## PR 1 completion gate

- [x] Existing behavior is represented by explicit schema fixtures.
- [x] No production behavior changed.
- [x] Golden fixtures can remain after legacy deletion.

---

# PR 2 — Land intentional event-semantics changes

## Goal

Establish the corrected semantic baseline before replacing the architecture. Treat this as the final work on the legacy event path.

Status: complete. PR 2 is the last planned change to legacy event semantics; subsequent semantic work targets native state and the new compiler.

## Step 2.1 — Change sampler filtering to candidate ordinals

### Work

Make static sampler note and variation rests filter active timing candidates by ordinal rather than by offset resampling.

### Tasks

- [x] Apply candidate-ordinal filtering to notes and variations.
- [x] Preserve sample-name candidate-ordinal behavior.
- [x] Exclude the selected timing owner from redundant filtering.
- [x] Preserve random zero-values-per-bar suppression.
- [x] Preserve fixed filtering before runtime chance.
- [x] Cover wrapping, multi-bar cycles, and rest intersections.

### Likely files

- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/event-compiler.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/patterns/authored-event-values.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`

### Verification

- [x] Verify `[0, null, 2]` against four candidates yields offsets `0`, `1/2`, and `3/4`.
- [x] Verify resulting values are `0`, `2`, and `0`.
- [x] Confirm unrelated compatibility fixtures remain green.

## Step 2.2 — Remove authored scalar broadcasting

### Work

Treat every setter value, including scalars and one-step arrays, as an authored pattern whose transformed rests may filter externally owned timing.

### Tasks

- [x] Route scalar, one-element array, and one-step cycle input through the same authored path.
- [x] Remove authored broadcast exceptions.
- [x] Apply the rule to notes, names, and variations.
- [x] Cover explicit timing interactions.
- [x] Preserve natural repetition for untransformed one-step patterns.

### Likely files

- `packages/fluid/src/patterns/authored-event-values.ts`
- `packages/fluid/src/patterns/authored-event-values.test.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/event-compiler.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`

### Verification

- [x] Verify `.var(1).slow(2)` produces an event bar followed by a rest bar.
- [x] Verify authored slowed rest bars suppress externally owned candidates.
- [x] Confirm only intentional schema expectations changed.

## Step 2.3 — Establish default fallback semantics

### Work

Separate constructor default intent from authored setter intent. A default retains transformed timing geometry and a nonempty fallback group.

### Tasks

- [x] Represent default intent independently from authored intent.
- [x] Require nonempty fallback groups.
- [x] Prevent defaults from competing with authored timing.
- [x] Prevent defaults from filtering external timing.
- [x] Fill surviving hits from fallback groups.
- [x] Prevent fallbacks from creating hits or activating silent timing bars.
- [x] Allow transformed default cycles to supply timing when no stronger source exists.
- [x] Make equal-value setters replace defaults with authored intent.

### Likely files

- `packages/fluid/src/patterns/authored-event-values.ts`
- `packages/fluid/src/patterns/authored-event-values.test.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/patterns/notes.test.ts`
- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/event-compiler.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`

### Verification

- [x] Verify `d.sample("bd").slow(2).xox([1, 1])` fills surviving hits with `bd`.
- [x] Verify `d.sample().name("bd").slow(2).xox([1, 1])` filters its slowed rest bar.
- [x] Verify defaults do not activate an empty explicit timing bar.
- [x] Verify setting the same value changes intent to authored.

## Step 2.4 — Freeze the corrected legacy baseline

### Work

Promote corrected schema fixtures to the authority for the direct cutover. Avoid further legacy cleanup that will be deleted in PR 5.

### Tasks

- [x] Mark candidate filtering, authored scalar semantics, and fallback semantics as intentional changes.
- [x] Review new wrapper-level tests and retain only those needed to explain PR 2.
- [x] Confirm no expression, event-cycle, native-state, or adapter code landed.
- [x] Record PR 2 as the last planned change to legacy event semantics.

### Likely files

- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `plans/shorthand-syntax/direct-cutover-plan.md`
- release or migration documentation, if applicable

### Verification

- [x] Run the complete repository suite.
- [x] Review schema changes for unrelated differences.
- [x] Confirm all future semantic work targets native state and the new compiler.

## PR 2 completion gate

- [x] Candidate-ordinal filtering is established.
- [x] Authored scalar broadcasting is removed.
- [x] Constructor defaults have explicit fallback semantics.
- [x] Corrected golden fixtures pass.
- [x] No target architecture or migration bridge has landed.
- [x] No additional legacy refactoring is planned.

---

# PR 3 — Build shared expression and event-cycle foundations

## Goal

Add one expression model, one evaluator, canonical event cycles, structured decoding, and native transforms without changing production instrument behavior.

## Step 3.1 — Define `PatternExpression<T>`

### Work

Create one generic readonly tree used by structured decoding and shorthand parsing.

Implemented in `packages/patterns/src/pattern-expression.ts`, with supporting type exports and a non-mutating iterative `assertPatternExpressionLimits()` helper. Expressions are bounded to 16,384 node occurrences and depth 128. Root pattern nodes start at depth 1; the expression wrapper and opaque atom payloads are excluded from node counts. Source ranges use half-open UTF-16 offsets. Runtime freezing will be connected with shorthand construction in Step 7.1.

### Tasks

- [x] Define atom, rest, sequence, group, parallel, alternate, and modifier nodes.
- [x] Define explicit root patterns for structured method arguments.
- [x] Make source ranges optional for structured input and available to shorthand.
- [x] Keep atom payload generic.
- [x] Make expression data readonly and enumerable.
- [x] Bound expression node count and depth.
- [x] Do not define a second shorthand AST.

### Likely files

- `packages/patterns/src/pattern-expression.ts` — **new, suggested**
- `packages/patterns/src/pattern-expression.test.ts` — **new, suggested**
- `packages/patterns/src/types.ts`
- `packages/patterns/src/index.ts`
- `packages/patterns/src/utils/cycle-limits.ts`

### Verification

- [x] Type-test every node variant.
- [x] Verify expression data can be frozen and inspected.
- [x] Confirm no production Fluid path uses expressions yet.

## Step 3.2 — Define event-cycle primitives and invariants

### Work

Create the canonical internal representation for static and random event lanes.

Implemented in `packages/patterns/src/event-cycle.ts`, with readonly types and a non-mutating `assertEventCycleInvariants()` helper. Event groups are nonempty tuples; continuations must follow an event or continuation within the same pattern. Empty patterns are rejected; silence is represented by explicit rest steps. Random numeric sources retain settings plus `StaticEventCycle<1>` candidate geometry, with counts derived from onsets so sparse/transformed timing is not lost or duplicated. Types are exported only for package integration, not as a Fluid extension API.

Limits are 1,024 patterns, 16,384 total steps (also bounding onsets), 128 voices per event, and 65,536 total voice occurrences per cycle. Random settings arrays are bounded to 16,384 segments or mapped values. These limits leave the existing legacy checks unchanged.

### Tasks

- [x] Define `EventCycle`, static cycles, and random cycle variants.
- [x] Define event, rest, and continuation steps.
- [x] Require nonempty event groups.
- [x] Preserve explicit silent patterns.
- [x] Preserve simultaneous voice order and duplicates.
- [x] Bound pattern, step, event, voice, and cycle counts.
- [x] Do not add schema offsets, durations, `valueMode`, or scalar metadata.

### Likely files

- `packages/patterns/src/event-cycle.ts` — **new, suggested**
- `packages/patterns/src/event-cycle.test.ts` — **new, suggested**
- `packages/patterns/src/types.ts`
- `packages/patterns/src/index.ts`
- `packages/patterns/src/utils/cycle-limits.ts`

### Verification

- [x] Verify events, rests, continuations, and silent patterns are distinguishable.
- [x] Verify event groups cannot be empty.
- [x] Confirm random settings remain a separate representation.

## Step 3.3 — Add exact geometry and the shared evaluator

### Work

Evaluate typed expressions into immutable event cycles using exact bounded structural geometry.

Implemented in `packages/patterns/src/evaluate-pattern-expression.ts`, with `utils/rational.ts` and `utils/event-grid.ts`. BigInt intermediates normalize to frozen safe-integer rationals with denominators bounded to 16,384. Evaluation uses identity or a ranged event/rest callback, preserves each explicit bar's smallest exact grid, and freezes new structural data without touching opaque payloads. Geometry is derived from indexes and continuation runs, never stored on steps. Alternation and modifiers fail explicitly until Step 6.2. Production Fluid remains unchanged.

### Tasks

- [x] Add normalized rational arithmetic and overflow checks.
- [x] Decode equal structural allocation into the smallest bounded step grid.
- [x] Derive offsets and durations from step indexes and continuation runs.
- [x] Evaluate explicit patterns, sequences, rests, and simultaneous groups.
- [x] Accept an atom interpreter callback.
- [x] Use identity interpretation for typed structured atoms.
- [x] Reject excessive denominators, steps, voices, patterns, or cycles.
- [x] Keep evaluation pure and non-mutating.

### Likely files

- `packages/patterns/src/evaluate-pattern-expression.ts` — **new, suggested**
- `packages/patterns/src/evaluate-pattern-expression.test.ts` — **new, suggested**
- `packages/patterns/src/utils/rational.ts` — **new, suggested**
- `packages/patterns/src/utils/rational.test.ts` — **new, suggested**
- `packages/patterns/src/utils/event-grid.ts` — **new, suggested**
- `packages/patterns/src/utils/event-grid.test.ts` — **new, suggested**

### Verification

- [x] Test exact nested allocation.
- [x] Test explicit rests versus continuations.
- [x] Test limit and overflow failures.
- [x] Assert expression inputs are unchanged.

## Step 3.4 — Decode structured inputs into expressions

### Work

Keep consumer validation in Fluid, then evaluate all static structured event input through the shared expression path.

### Tasks

- [ ] Decode method arguments as explicit patterns/bars.
- [ ] Decode array entries as sequential children.
- [ ] Decode nested arrays as simultaneous groups.
- [ ] Decode allowed `null` and `undefined` values as whole-step rests.
- [ ] Validate notes, names, variations, and XOX in Fluid.
- [ ] Route typed expressions through the shared evaluator.
- [ ] Route random inputs directly to random event cycles.
- [ ] Cover scalar, sequence, chord, rest, silent-bar, and multi-bar input.

### Likely files

- `packages/fluid/src/patterns/decode-structured-input.ts` — **new, suggested**
- `packages/fluid/src/patterns/decode-structured-input.test.ts` — **new, suggested**
- `packages/fluid/src/patterns/decode-xox-input.ts` — **new, suggested**
- `packages/fluid/src/patterns/decode-xox-input.test.ts` — **new, suggested**
- `packages/fluid/src/types.ts`
- `packages/fluid/src/utils/validate.ts`

### Verification

- [ ] Compare evaluated geometry with corrected structured fixtures.
- [ ] Confirm decoder output can be inspected independently.
- [ ] Confirm random inputs bypass static evaluation.
- [ ] Confirm production instruments remain on the legacy path.

## Step 3.5 — Implement generic event-cycle transforms

### Work

Implement the transforms needed by native instrument state before production cutover.

### Tasks

- [ ] Implement reverse, acceleration, slowdown, and stretch.
- [ ] Insert slowdown rests without extending gates.
- [ ] Preserve explicit rests and continuations.
- [ ] Preserve silent patterns and multi-pattern cycles.
- [ ] Keep fallback groups outside cycle transforms.
- [ ] Return new immutable cycle data.
- [ ] Test transform composition and repeated transforms.

### Likely files

- `packages/patterns/src/event-cycle-transforms.ts` — **new, suggested**
- `packages/patterns/src/event-cycle-transforms.test.ts` — **new, suggested**
- `packages/patterns/src/utils/reverse.ts`
- `packages/patterns/src/utils/speed.ts`
- `packages/patterns/src/utils/stretch.ts`
- `packages/patterns/src/index.ts`

### Verification

- [ ] Verify `60/2` produces an event pattern followed by a silent pattern.
- [ ] Verify `[0 2 4 6]/2` preserves non-extended gate durations.
- [ ] Verify all transforms are immutable.
- [ ] Run patterns and Fluid focused suites.

## PR 3 completion gate

- [ ] Structured inputs decode to the shared expression model.
- [ ] One evaluator produces canonical event cycles.
- [ ] Event cycles represent corrected structured behavior.
- [ ] Generic transforms preserve exact geometry.
- [ ] Production schema generation remains legacy-backed.
- [ ] No adapter or mixed state exists.

---

# PR 4 — Build native state, transitions, and the pure compiler

## Goal

Implement the complete target event state and compiler beside production code. Test it directly rather than adapting legacy authoring classes into it.

## Step 4.1 — Define immutable instrument event state

### Work

Represent synth and sampler event concerns as readonly data with intent colocated with each source.

### Tasks

- [ ] Define authored static and random event sources.
- [ ] Define default static sources with nonempty fallback groups.
- [ ] Define implicit and explicit timing state.
- [ ] Preserve timing chance conditions.
- [ ] Represent synth and sampler notes.
- [ ] Represent sampler names and variations.
- [ ] Represent root and scale state without legacy class methods.
- [ ] Accept generated sampler timing as a compiler override, not stored event state.
- [ ] Keep expressions out of state.

### Likely files

- `packages/fluid/src/instruments/event-state.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state.test.ts` — **new, suggested**
- `packages/fluid/src/types.ts`

### Verification

- [ ] Type-check complete synth and sampler states.
- [ ] Verify default fallback groups cannot be empty.
- [ ] Confirm state types have no legacy class or expression references.

## Step 4.2 — Implement pure state transitions

### Work

Implement native setter and transform behavior before changing the mutable public facades. Establish representation feasibility explicitly: native state must preserve the distinction between authored rests and materialized timing gaps, coordinated lanes sharing selected timing, and later timing replacement. Passing isolated transform tests is insufficient if subsequent setters lose these distinctions.

### Tasks

- [ ] Add constructors for default synth and sampler event state.
- [ ] Replace notes, names, variations, and timing independently.
- [ ] Make every setter replacement authored.
- [ ] Apply root and scale without changing cycle geometry.
- [ ] Apply reverse, fast, slow, and stretch exactly once to participating lanes.
- [ ] Preserve default fallback groups while transforming their cycles.
- [ ] Preserve setter-before-transform and transform-before-setter behavior.
- [ ] Preserve explicit timing and generated timing exemptions.
- [ ] Prove materialized timing gaps do not become authored candidate-filtering rests after later timing or unrelated value setters.
- [ ] Prove authored and slowdown-created rests still filter replacement timing.
- [ ] Prove coordinated lanes sharing materialized timing do not apply their intersection twice.
- [ ] Cover repeated and chained transforms, timing replacement, and generated chop/fit exemptions.
- [ ] Document and resolve any required representation changes before production wiring.
- [ ] Keep transitions pure and immutable.

### Likely files

- `packages/fluid/src/instruments/event-state-transitions.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state-transitions.test.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state.ts`
- `packages/patterns/src/event-cycle-transforms.ts`

### Verification

- [ ] Test every setter against default and authored state.
- [ ] Test equal-value setters changing intent.
- [ ] Test all transforms before and after setters, including sparse explicit timing followed by reverse/slow and timing replacement.
- [ ] Assert native state preserves the required availability and timing distinctions across subsequent operations.
- [ ] Assert transition inputs remain unchanged.
- [ ] Confirm no transition imports a legacy authored wrapper.
- [ ] Block PR 5 until representation-feasibility cases also pass complete-schema replay in Step 4.5.

## Step 4.3 — Implement static event compilation

### Work

Compile native state to the existing schema without parsing input or mutating authoring state.

### Tasks

- [ ] Implement synth implicit versus explicit timing selection.
- [ ] Implement sampler rest priority, density, and tie order.
- [ ] Use defaults for timing only when no stronger source exists.
- [ ] Expand participating cycles to a bounded common length.
- [ ] Apply authored rests by candidate ordinal.
- [ ] Keep continuations ordinal-occupying and externally transparent.
- [ ] Prevent defaults from filtering candidates.
- [ ] Fill surviving hits from fallback groups.
- [ ] Prevent fallbacks from creating hits or activating silent patterns.
- [ ] Resolve authored values by final hit index.
- [ ] Apply root and scale conversion.
- [ ] Emit existing static schema shapes and silent-bar conventions.

### Likely files

- `packages/fluid/src/instruments/event-state-compiler.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state-compiler.test.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state.ts`
- `packages/patterns/src/event-cycle.ts`

### Verification

- [ ] Construct native static states directly in tests.
- [ ] Compare complete output with corrected golden expectations.
- [ ] Assert compiler inputs remain unchanged.
- [ ] Confirm the compiler has no legacy imports.

## Step 4.4 — Add random compilation and generated timing overrides

### Work

Complete the compiler for random lanes, chance timing, and generated sampler timing.

### Tasks

- [ ] Preserve random notes and variations as random schemas.
- [ ] Preserve values-per-pattern, segments, ranges, maps, and integer settings.
- [ ] Preserve random timing as one runtime condition.
- [ ] Apply fixed availability before runtime chance.
- [ ] Ensure random misses consume no final values.
- [ ] Accept chop/fit timing as a separate override.
- [ ] Preserve optional sampler notes and default variation omission.
- [ ] Cover random zero-count and silent-pattern conventions.

### Likely files

- `packages/fluid/src/instruments/event-state-compiler.ts`
- `packages/fluid/src/instruments/event-state-compiler.test.ts`
- `packages/fluid/src/instruments/event-state.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`

### Verification

- [ ] Compare complete random output with corrected golden expectations.
- [ ] Cover generated chop and fit timing exemptions.
- [ ] Run new compiler tests over the full semantic matrix.
- [ ] Confirm production `getSchema()` still uses the legacy path.

## Step 4.5 — Replay complete native scenarios before cutover

### Work

Prove the complete structured native path, not only compilation from hand-constructed state. Extract replayable operation sequences from the existing compatibility fixtures while retaining their names and corrected expected schemas unchanged. Replay each sequence through native construction, decoding, evaluation, transitions, generated timing overrides, and compilation. Production instruments remain legacy-backed.

### Tasks

- [ ] Share scenario inputs and golden expectations between existing public API fixtures and the native replay tests.
- [ ] Initialize fresh native state and sampler configuration for every scenario.
- [ ] Use the production-intended native helpers rather than duplicating their semantics in the test driver.
- [ ] Replay every corrected compatibility fixture, including random sources and generated timing.
- [ ] Add complete-schema cases for the representation-feasibility scenarios in Step 4.2.
- [ ] Add temporary test-only comparisons against independently constructed legacy instruments.
- [ ] Compare bounded, reproducibly generated valid setter/transform sequences, including timing replacement and repeated transforms; compare sequence prefixes to expose intermediate divergences.
- [ ] Report the scenario or generation seed, operation sequence, and complete schema difference for each failure.
- [ ] Turn discovered edge cases into retained explicit golden or native regression tests; do not redefine expected behavior merely to match the new path.

### Likely files

- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/instruments/event-schema-fixtures.ts` — **new, suggested**
- `packages/fluid/src/instruments/native-event-scenario-replay.test.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state-transitions.test.ts`
- `packages/fluid/src/instruments/event-state-compiler.test.ts`

### Verification

- [ ] Compare complete native schema output strictly with every corrected golden expectation.
- [ ] Confirm the legacy public fixtures still pass with unchanged expectations.
- [ ] Resolve every differential mismatch before cutover.
- [ ] Confirm the replay driver contains no legacy-to-native adaptation or duplicated authoring semantics.
- [ ] Confirm production instruments still use only legacy state and compilation.

## PR 4 completion gate

- [ ] Native state represents every corrected structured event behavior.
- [ ] Representation feasibility is demonstrated across transforms and subsequent setters, with no unresolved design questions.
- [ ] Native transitions preserve transform and setter semantics.
- [ ] The pure compiler emits the established schema.
- [ ] Complete native scenario replay passes against unchanged corrected goldens.
- [ ] Generated setter/transform comparisons have no unexplained mismatches.
- [ ] Static, random, and generated timing cases are covered.
- [ ] New production-intended code has no legacy authored-class imports; legacy comparison dependencies are test-only.
- [ ] No production adapter, dual state, or production cutover has landed.

---

# PR 5 — Cut structured input over atomically

## Goal

Replace production event authoring and compilation in one coordinated cutover, then delete the legacy event architecture.

Steps 5.1–5.4 are one production transition and must not be merged independently. Preparation may occur in isolated code, but the merged PR must have only native event state.

Organize reviewable commits by setter wiring (5.1), transform wiring (5.2), schema wiring (5.3), and legacy deletion after verified coverage transfer (5.4). These are review boundaries, not separately deployable production states; merge them together only after the final integrated path passes all cutover gates. Keep representation changes in PR 4 and newly discovered behavior changes out of PR 5. Corrected golden expectations must remain unchanged.

## Step 5.1 — Route every event setter to native state

### Work

Replace legacy fields in `Instrument`, `Synthesizer`, and `Sampler` with one native event-state source of truth.

### Tasks

- [ ] Initialize native synth and sampler event state.
- [ ] Decode and evaluate `.notes()` into native state.
- [ ] Decode fixed and random `.xox()` into native timing state.
- [ ] Preserve `.hex()`, `.euclid()`, and `.sequence()` behavior through native timing transitions.
- [ ] Decode and evaluate `.name()` into native sampler state.
- [ ] Decode and evaluate `.variation()` / `.var()` into native sampler state.
- [ ] Route root and scale updates through native state.
- [ ] Preserve fluent public signatures and validation behavior.
- [ ] Keep processing parameter fields unchanged.
- [ ] Do not retain parallel legacy event fields.

### Likely files

- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/synthesizer.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/event-state.ts`
- `packages/fluid/src/instruments/event-state-transitions.ts`
- `packages/fluid/src/patterns/decode-structured-input.ts`
- `packages/fluid/src/patterns/decode-xox-input.ts`
- `packages/fluid/src/types.ts`

### Verification

- [ ] Confirm setters replace only their target lane.
- [ ] Confirm equal-value setters change default intent to authored.
- [ ] Run focused public setter and validation tests.
- [ ] Confirm no public instrument stores both legacy and native event state.

## Step 5.2 — Route transforms through native transitions

### Work

Make every global event transform one immediate native state operation.

### Tasks

- [ ] Route `reverse`, `fast`, `slow`, and `stretch` through native transitions.
- [ ] Transform every participating event cycle exactly once.
- [ ] Select or materialize timing once when current behavior requires it.
- [ ] Preserve default fallback groups.
- [ ] Preserve authored slowed-rest filtering.
- [ ] Preserve explicit timing and setter call order.
- [ ] Preserve generated chop/fit timing exemptions.
- [ ] Leave processing parameters outside event transforms.
- [ ] Avoid an operation log or deferred getter mutation.

### Likely files

- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/event-state-transitions.ts`
- `packages/fluid/src/instruments/event-state-transitions.test.ts`
- `packages/patterns/src/event-cycle-transforms.ts`

### Verification

- [ ] Run every transform against every event lane.
- [ ] Cover setter-before-transform and transform-before-setter ordering.
- [ ] Cover repeated and chained transforms.
- [ ] Confirm each public transform has one native state transition entry.

## Step 5.3 — Switch synth and sampler schema generation together

### Work

Route both instruments through the pure compiler in the same production cutover.

### Tasks

- [ ] Compile synth event schema from native state.
- [ ] Compile sampler event schema from native state.
- [ ] Pass generated chop/fit timing as an override.
- [ ] Preserve optional notes and default variation omission.
- [ ] Preserve sample warning behavior using native static names and fallbacks.
- [ ] Preserve region, fit, chop, loop, clipping, direction, routing, effects, and gain behavior.
- [ ] Keep schema and audio-engine types unchanged.

### Likely files

- `packages/fluid/src/instruments/synthesizer.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/event-state-compiler.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/utils/sample-utils.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`

### Verification

- [ ] Run all complete-schema fixtures unchanged against the new path.
- [ ] Explain and resolve every mismatch against the corrected PR 2 baseline without changing golden expectations.
- [ ] Stop cutover for any necessary behavior change and review it separately before proceeding.
- [ ] Confirm both instruments use the new compiler.
- [ ] Confirm no production getter invokes legacy event compilation.

## Step 5.4 — Delete superseded event infrastructure

### Work

Remove the old architecture in the same PR so the repository does not retain two competing paths. Before deleting legacy tests or implementations, record a coverage-transfer inventory in the PR: each useful legacy behavior/assertion maps to a retained golden, decoder, transition, compiler, or public API test. Assertions specific only to obsolete internals may be retired with an explicit rationale; passing golden fixtures alone does not justify dropping behavioral coverage.

### Tasks

- [ ] Inventory useful legacy assertions and identify their retained replacement tests before deletion.
- [ ] Preserve coverage for validation/errors, resource warnings, rhythm composition, random settings, root/scale conversion, materialization, and setter/transform call order.
- [ ] Verify replacement tests pass and cover the same behavioral assertions before removing legacy tests.
- [ ] Delete temporary legacy/native differential wiring while retaining native replay, shared scenarios, and regression expectations.
- [ ] Delete the old event compiler.
- [ ] Delete `AuthoredPitches`.
- [ ] Delete `AuthoredEventValues`.
- [ ] Delete or narrow `AuthoredTiming` to any genuinely reusable rhythm utilities.
- [ ] Delete or narrow event-related `MaskedCycle` usage.
- [ ] Remove duplicated timing selection, availability, materialization, and cycle-expansion helpers.
- [ ] Remove obsolete exports and imports.
- [ ] Replace wrapper-detail tests only after their useful behavioral assertions have verified native coverage or an explicit retirement rationale.
- [ ] Retain useful rhythm generation only as named pure utilities.

### Likely files

- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/event-compiler.test.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/patterns/notes.test.ts`
- `packages/fluid/src/patterns/authored-event-values.ts`
- `packages/fluid/src/patterns/authored-event-values.test.ts`
- `packages/fluid/src/patterns/authored-timing.ts`
- `packages/fluid/src/patterns/authored-timing.test.ts`
- `packages/patterns/src/masked-cycle.ts`
- `packages/patterns/src/masked-cycle.test.ts`
- package index and type files

### Verification

- [ ] Use `rg` to confirm removed classes and compiler symbols have no callers.
- [ ] Run Fluid, patterns, schema, and complete repository suites.
- [ ] Confirm every inventory entry has a passing retained test or an explicit retirement rationale.
- [ ] Confirm no useful validation, warning, rhythm, random, or call-order coverage was lost.
- [ ] Confirm temporary differential tests no longer import deleted legacy code.
- [ ] Confirm the diff contains no production adapter or dual-state bridge.
- [ ] Confirm processing patterns remain unchanged.

## PR 5 completion gate

- [ ] Structured event input uses expressions and evaluation end to end.
- [ ] Instrument state stores only native event cycles.
- [ ] Both synth and sampler compile through the new compiler.
- [ ] All coordinated event lanes switched together.
- [ ] Transforms update native state exactly once.
- [ ] Legacy wrappers and compiler code are deleted or explicitly narrowed.
- [ ] Golden schema fixtures pass with corrected expectations unchanged.
- [ ] Coverage transfer is recorded and verified before legacy test deletion.
- [ ] Setter, transform, schema, and deletion commits were reviewed separately and merge together.
- [ ] Temporary differential wiring is deleted; native scenario replay and regression tests remain.
- [ ] No adapter, dual state, or mixed event-lane state remains.

---

# PR 6 — Add shorthand parsing and prove shared evaluation

## Goal

Add shorthand as a second frontend to the expression evaluator already used by structured production input.

## Step 6.1 — Add the source-aware lexer and parser

### Work

Parse shorthand directly into `PatternExpression<string>`.

### Tasks

- [ ] Tokenize atoms, delimiters, rests, and postfix modifiers.
- [ ] Treat spaces, tabs, and newlines as equivalent separators.
- [ ] Preserve atom and modifier amount lexemes as strings.
- [ ] Populate source ranges on parsed nodes.
- [ ] Reject unsupported reserved constructs and empty structures.
- [ ] Bound source length, token count, expression depth, and node count.
- [ ] Do not introduce `ShorthandNode` or another AST.

### Likely files

- `packages/patterns/src/shorthand/lexer.ts` — **new, suggested**
- `packages/patterns/src/shorthand/lexer.test.ts` — **new, suggested**
- `packages/patterns/src/shorthand/parser.ts` — **new, suggested**
- `packages/patterns/src/shorthand/parser.test.ts` — **new, suggested**
- `packages/patterns/src/shorthand/errors.ts` — **new, suggested**
- `packages/patterns/src/pattern-expression.ts`
- `packages/patterns/src/index.ts`

### Verification

- [ ] Verify exact ranges for valid and invalid input.
- [ ] Cover all syntax and invalid-form examples from the specification.
- [ ] Confirm parsing performs no target-specific atom interpretation.

## Step 6.2 — Complete shorthand-only expression evaluation

### Work

Extend the same evaluator with shorthand structures and operators.

### Tasks

- [ ] Evaluate nested groups and deterministic alternation.
- [ ] Evaluate structural repetition `!`.
- [ ] Evaluate acceleration `*` and slowdown `/`.
- [ ] Evaluate relative weighting `@` with continuations.
- [ ] Combine uninterrupted speed chains as exact rational rates.
- [ ] Preserve written operator order.
- [ ] Implement weighted alternation as whole-pattern retrigger frequency.
- [ ] Bound alternation periods and normalized expansion.
- [ ] Keep structured evaluation on the same code path.

### Likely files

- `packages/patterns/src/evaluate-pattern-expression.ts`
- `packages/patterns/src/evaluate-pattern-expression.test.ts`
- `packages/patterns/src/event-cycle-transforms.ts`
- rational, grid, and limit utilities

### Verification

- [ ] Test `60/2 1` exactly.
- [ ] Test `[0 2]*2/2` for geometry and duration cancellation.
- [ ] Test `<0@2 2 3>*2` as `[0, 0]` followed by `[2, 3]`.
- [ ] Verify weighting distinguishes continuations from rests.
- [ ] Verify no second evaluator was introduced.

## Step 6.3 — Add target atom interpreters and compact XOX decoding

### Work

Interpret shorthand leaves during shared evaluation without creating a converted expression tree.

### Tasks

- [ ] Define the consumer atom-interpreter callback contract.
- [ ] Parse notes and variations as strict finite numbers.
- [ ] Preserve signed and fractional values.
- [ ] Validate sample names under the specified alias rules.
- [ ] Map XOX onset and rest atoms.
- [ ] Reject XOX polyphony and unsupported values.
- [ ] Include target method and source range in errors.
- [ ] Decode legacy compact XOX into `PatternExpression<string>`.
- [ ] Apply compact decoding to direct strings and reusable shorthand sources.

### Likely files

- `packages/fluid/src/patterns/atom-interpreters.ts` — **new, suggested**
- `packages/fluid/src/patterns/atom-interpreters.test.ts` — **new, suggested**
- `packages/fluid/src/patterns/decode-xox-input.ts`
- `packages/fluid/src/patterns/decode-xox-input.test.ts`
- `packages/fluid/src/utils/sample-utils.ts`
- `packages/fluid/src/utils/validate.ts`
- `packages/fluid/src/types.ts`

### Verification

- [ ] Confirm interpretation occurs leaf-by-leaf during evaluation.
- [ ] Confirm no converted expression copy is created.
- [ ] Compare compact and general XOX event cycles.
- [ ] Verify target-specific errors include source ranges.

## Step 6.4 — Prove structured and shorthand equivalence

### Work

Compare equivalent inputs at expression, event-cycle, and final-schema boundaries before public shorthand dispatch lands.

### Tasks

- [ ] Compare atoms, rests, sequences, and chords.
- [ ] Compare `"1!2"` with `[1, 1]`.
- [ ] Compare `"1/2"` with scalar input followed by `.slow(2)`.
- [ ] Compare continuations and weighted durations.
- [ ] Compare alternation over its complete finite period.
- [ ] Verify continuations occupy candidate ordinals without suppressing them.
- [ ] Verify authored rests suppress candidates.
- [ ] Compare final schema output for every supported consumer.

### Likely files

- `packages/patterns/src/evaluate-pattern-expression.test.ts`
- `packages/fluid/src/patterns/atom-interpreters.test.ts`
- `packages/fluid/src/patterns/decode-structured-input.test.ts`
- `packages/fluid/src/instruments/event-state-compiler.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`

### Verification

- [ ] Run patterns and Fluid suites.
- [ ] Confirm comparisons include geometry, rests, continuations, and schema.
- [ ] Confirm production method dispatch remains structured-only.

## PR 6 completion gate

- [ ] Shorthand parses directly into `PatternExpression<string>`.
- [ ] One evaluator handles structured and shorthand geometry.
- [ ] Consumer callbacks interpret atoms during evaluation.
- [ ] Structured and shorthand equivalents compile identically.
- [ ] No shorthand public API is connected yet.

---

# PR 7 — Wire the public shorthand API and finish cleanup

## Goal

Expose reusable shorthand and direct-string dispatch after the target structured architecture is stable.

## Step 7.1 — Add shorthand construction and exports

### Work

Expose immutable reusable shorthand values containing the shared expression model.

### Tasks

- [ ] Define `Shorthand` with `source` and `expression`.
- [ ] Add `d.shorthand()` and `d.sh()`.
- [ ] Parse eagerly at shorthand construction.
- [ ] Freeze the wrapper and expression recursively.
- [ ] Export `Shorthand`, `PatternExpression`, and supporting node types.
- [ ] Keep parsed expression data enumerable and inspectable.
- [ ] Test alias equivalence and eager syntax errors.

### Likely files

- `packages/patterns/src/shorthand/index.ts` — **new, suggested**
- `packages/patterns/src/pattern-expression.ts`
- `packages/patterns/src/index.ts`
- `packages/fluid/src/index.ts`
- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/types.ts`

### Verification

- [ ] Inspect inferred public declarations.
- [ ] Verify returned values and nested expressions are immutable.
- [ ] Confirm no avoidable explicit return types are added.

## Step 7.2 — Add public method dispatch

### Work

Route supported direct strings and reusable shorthand values through the parser and evaluator already proved in PR 6.

### Tasks

- [ ] Dispatch one string, one `Shorthand`, or structured arguments.
- [ ] Require a `Shorthand` value to be the sole argument.
- [ ] Add shorthand to `.notes()`.
- [ ] Add shorthand to `.name()`.
- [ ] Add shorthand to `.variation()` / `.var()`.
- [ ] Add shorthand to `.xox()`.
- [ ] Preserve multiple structured arguments under existing dispatch rules.
- [ ] Preserve legacy compact XOX compatibility.
- [ ] Route direct strings and reusable shorthand through the same parser/evaluator path.

### Likely files

- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/event-state-transitions.ts`
- `packages/fluid/src/patterns/atom-interpreters.ts`
- `packages/fluid/src/patterns/decode-xox-input.ts`
- `packages/fluid/src/types.ts`
- public API test files

### Verification

- [ ] Run direct-string and reusable-value tests for every consumer.
- [ ] Run retained structured golden fixtures unchanged.
- [ ] Verify invalid mixed argument forms fail eagerly.

## Step 7.3 — Enforce sample alias compatibility changes

### Work

Apply the notation-safe sample-name rules defined by the specification.

### Tasks

- [ ] Restrict aliases to `[A-Za-z0-9]+` in names and bank keys.
- [ ] Reject `:` in structured and shorthand `.name()` input.
- [ ] Preserve constructor `d.sample("bd:2")` behavior.
- [ ] Reject combined selectors in `.name()`.
- [ ] Preserve unrestricted URLs.
- [ ] Tighten direct schema validation.
- [ ] Add focused migration errors and tests.

### Likely files

- `packages/fluid/src/utils/sample-utils.ts`
- `packages/fluid/src/utils/sample-utils.test.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/index.ts`
- `packages/fluid/src/index.test.ts`
- `packages/schema/src/validate-graph.ts`
- `packages/schema/src/validate-graph.test.ts`

### Verification

- [ ] Run Fluid and schema suites.
- [ ] Verify constructor shorthand and `.name()` differ only as specified.
- [ ] Confirm URL handling remains unchanged.

## Step 7.4 — Complete end-to-end coverage and documentation

### Work

Finalize public examples, diagnostics, cleanup, and architectural verification.

### Tasks

- [ ] Add public examples for every supported consumer.
- [ ] Add malformed syntax, invalid target, and expansion-limit tests.
- [ ] Add exact slowdown, cancellation, weighting, alternation, and continuation tests.
- [ ] Document reusable `d.sh()` and direct strings.
- [ ] Document authored patterns versus default fallbacks.
- [ ] Document sample-name restrictions and intentional changes.
- [ ] Remove migration-only exports, comments, and scaffolding.
- [ ] Confirm schema and audio engine contain no shorthand or event-cycle concepts.

### Likely files

- `packages/fluid/README.md`
- `packages/patterns/README.md`
- `docs/concepts/patterns.md`
- `plans/shorthand-syntax/syntax-examples.md`
- public API, parser, evaluator, interpreter, compiler, and schema tests

### Verification

- [ ] Run the complete repository suite.
- [ ] Review public exports and generated declarations.
- [ ] Use `rg` to confirm no obsolete wrappers, adapters, or compiler symbols remain.
- [ ] Confirm `git diff --check` passes.

## PR 7 completion gate

- [ ] Supported consumers accept direct strings and reusable shorthand values.
- [ ] Parsed expression data is readonly, enumerable, inspectable, and source-aware.
- [ ] Structured and shorthand input share one expression model and evaluator.
- [ ] Instrument state stores only event cycles.
- [ ] Legacy event abstractions and migration code are gone.
- [ ] Compatibility changes are documented and tested.
- [ ] Schema and audio engine remain unchanged by shorthand concepts.

---

# Global review checklist

- [ ] PR 2 is the final modification to legacy event semantics.
- [ ] New foundations are tested before production wiring.
- [ ] Representation feasibility is proven before cutover, including timing gaps, authored rests, shared materialization, and later timing replacement.
- [ ] New compiler tests construct native state directly, and complete native scenarios exercise decoding through compilation.
- [ ] Test-only differential comparisons use independently initialized paths and are removed with legacy deletion.
- [ ] Golden schema fixtures remain the compatibility authority and their corrected expectations do not change in PR 5.
- [ ] Useful legacy coverage is inventoried and verified in retained tests before deletion.
- [ ] Atomic cutover has separately reviewable setter, transform, schema, and deletion commits.
- [ ] No production adapter exists without a documented blocker.
- [ ] No event lane is represented in both legacy and native state.
- [ ] All coordinated event lanes switch in one production cutover.
- [ ] Expressions remain transient input-boundary values.
- [ ] Event cycles remain canonical internal state.
- [ ] Random sources remain a separate branch.
- [ ] Defaults retain nonempty fallback groups and never create or filter hits.
- [ ] Authored rests filter by candidate ordinal.
- [ ] Continuations occupy ordinals without suppressing external candidates.
- [ ] Transforms update native state exactly once.
- [ ] Processing parameters remain outside the redesign.
- [ ] Superseded wrappers and compiler helpers are deleted at cutover.
- [ ] Type checking, linting, tests, formatting, and `git diff --check` pass.
