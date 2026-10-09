# Shorthand Syntax Direct-Cutover Implementation Plan

## Status and companion documents

Active implementation plan. PRs 1–3 and Steps 4.1–4.4's readonly state model, pure transitions, and static/random event compiler with generated timing overrides are complete. Immediate fluent transforms and read-independent behavior follow the specification; legacy getter-sensitive speed cancellation is an approved compatibility exception, not a feasibility blocker. Step 4.5's complete-schema replay and the PR 4 gate were reopened for two native materialization defects and are complete again after retained regressions and workspace revalidation. Synth materialized slowdown-rest filtering is an additional approved specification-conformance exception; corrected golden expectations remain unchanged. PR 4 merged as [#55](https://github.com/andy-stewart-design/web-audio/pull/55). The separate [patterns package reorganization](../completed/patterns-package-reorg/plan.md) is complete. The standalone [Fluid package reorganization](../completed/fluid-package-reorg/plan.md), including domain-local tests in both packages, merged as [#56](https://github.com/andy-stewart-design/web-audio/pull/56). PR 5's Steps 5.1–5.4 are complete and merged: all event setters, transforms, and both schema getters use native state, and the obsolete event path was deleted after verified [assertion-level coverage transfer](./phase-5-coverage-transfer.md). Integrated builds, focused suites, and workspace type checking pass; final workspace verification is recorded below. File references below use the reorganized layout; PRs 1–4's records describe their completion-time, pre-cutover wiring.

The normative behavior and target architecture remain defined by [`spec.md`](./spec.md). This document governs delivery and supersedes the adapter-first, lane-by-lane sequence in [`plan.md`](./plan.md) and [`plan-outline.md`](./plan-outline.md). Those documents are retained as historical alternatives, not execution checklists.

Read this with:

- [`spec.md`](./spec.md) — normative behavior and architecture;
- [`../completed/fluid-package-reorg/plan.md`](../completed/fluid-package-reorg/plan.md) — standalone layout and verification record;
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

Corrected golden schema fixtures are the compatibility authority for preserved behavior; the specification remains normative. Legacy behavior that conflicts with the specification is not a reason to repair superseded code or reproduce its defects in native state. The approved getter-sensitive speed-chain and synth materialized slowdown-rest exceptions are documented in Steps 4.2/4.5 and the specification; existing corrected goldens remain unchanged. Temporary test-only legacy/native comparisons are permitted, including generated setter/transform sequences. They run independently initialized paths, not a legacy-state adapter, and are removed when the legacy path is deleted; retained golden and native tests remain authoritative afterward.

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

Unit suites use domain-local `__tests__/`; cross-domain/public API suites use `src/__tests__/`, with fixtures and replay drivers in the relevant suite's `support/`. Production code must not import these modules. Keep tests TypeScript-checked. File lists identify current paths; future modules are explicitly marked as planned.

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

- `packages/fluid/src/__tests__/event-schemas/compatibility.test.ts`

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

- `packages/fluid/src/__tests__/event-schemas/compatibility.test.ts`

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
- `packages/fluid/src/instruments/__tests__/event-compiler.test.ts`
- `packages/fluid/src/__tests__/event-schemas/compatibility.test.ts`
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
- `packages/fluid/src/patterns/__tests__/authored-event-values.test.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/__tests__/event-compiler.test.ts`
- `packages/fluid/src/__tests__/event-schemas/compatibility.test.ts`

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
- `packages/fluid/src/patterns/__tests__/authored-event-values.test.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/patterns/__tests__/authored-pitches.test.ts`
- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/__tests__/event-compiler.test.ts`
- `packages/fluid/src/__tests__/event-schemas/compatibility.test.ts`

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

- `packages/fluid/src/__tests__/event-schemas/compatibility.test.ts`
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

Status: complete as isolated foundations. This does not establish full corrected-baseline compatibility; the representation-feasibility and complete-schema replay gates in Steps 4.2/4.5 remain required before PR 5.

## Step 3.1 — Define `PatternExpression<T>`

### Work

Create one generic readonly tree used by structured decoding and shorthand parsing.

Implemented in `packages/patterns/src/expressions/model.ts`, with readonly node definitions and a non-mutating iterative `assertPatternExpressionLimits()` helper. Root type exports are curated around actual consumers, not every constituent definition. Expressions are bounded to 16,384 node occurrences and depth 128. Root pattern nodes start at depth 1; the expression wrapper and opaque atom payloads are excluded from node counts. Source ranges use half-open UTF-16 offsets. Runtime freezing will be connected with shorthand construction in Step 7.1.

### Tasks

- [x] Define atom, rest, sequence, group, parallel, alternate, and modifier nodes.
- [x] Define explicit root patterns for structured method arguments.
- [x] Make source ranges optional for structured input and available to shorthand.
- [x] Keep atom payload generic.
- [x] Make expression data readonly and enumerable.
- [x] Bound expression node count and depth.
- [x] Do not define a second shorthand AST.

### Likely files

- `packages/patterns/src/expressions/model.ts`
- `packages/patterns/src/expressions/__tests__/model.test.ts`
- `packages/patterns/src/index.ts`
- `packages/patterns/src/limits.ts`

### Verification

- [x] Type-test every node variant.
- [x] Verify expression data can be frozen and inspected.
- [x] Confirm no production Fluid path uses expressions yet.

## Step 3.2 — Define event-cycle primitives and invariants

### Work

Create the canonical internal representation for static and random event lanes.

Implemented in `packages/patterns/src/events/cycle.ts`, with readonly types and a non-mutating `assertEventCycleInvariants()` helper. Event groups are nonempty tuples; continuations must follow an event or continuation within the same pattern. Empty patterns are rejected; silence is represented by explicit rest steps. Unknown runtime step tags are rejected with their pattern/step path before validation or transforms can proceed. Random numeric sources retain settings plus `StaticEventCycle<1>` candidate geometry, with counts derived from onsets so sparse/transformed timing is not lost or duplicated. Types are exported only for package integration, not as a Fluid extension API.

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

- `packages/patterns/src/events/cycle.ts`
- `packages/patterns/src/events/__tests__/cycle.test.ts`
- `packages/patterns/src/index.ts`
- `packages/patterns/src/limits.ts`

### Verification

- [x] Verify events, rests, continuations, and silent patterns are distinguishable.
- [x] Verify event groups cannot be empty.
- [x] Confirm random settings remain a separate representation.

## Step 3.3 — Add exact geometry and the shared evaluator

### Work

Evaluate typed expressions into immutable event cycles using exact bounded structural geometry.

Implemented in `packages/patterns/src/expressions/evaluate.ts`, with `math/rational.ts` and `events/grid.ts`. BigInt intermediates normalize to frozen safe-integer rationals with denominators bounded to 16,384. Evaluation uses identity or a ranged event/rest callback, preserves each explicit bar's smallest exact grid, and freezes new structural data without touching opaque payloads. Geometry is derived from indexes and continuation runs, never stored on steps. Alternation and modifiers fail explicitly until Step 6.2. Production Fluid remains unchanged.

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

- `packages/patterns/src/expressions/evaluate.ts`
- `packages/patterns/src/expressions/__tests__/evaluate.test.ts`
- `packages/patterns/src/math/rational.ts`
- `packages/patterns/src/math/__tests__/rational.test.ts`
- `packages/patterns/src/events/grid.ts`
- `packages/patterns/src/events/__tests__/grid.test.ts`

### Verification

- [x] Test exact nested allocation.
- [x] Test explicit rests versus continuations.
- [x] Test limit and overflow failures.
- [x] Assert expression inputs are unchanged.

## Step 3.4 — Decode structured inputs into expressions

### Work

Keep consumer validation in Fluid, then evaluate all static structured event input through the shared expression path.

Native-only `decode-{structured,random,xox}-input.ts` helpers are in Fluid's `inputs/` directory. A separate cumulative raw-input budget of 65,536 argument, bar, and chord slots includes sparse holes and omitted nullable voices; array lengths are reserved before traversal, independently of emitted-node and surviving-voice limits. Opaque atom payloads are not traversed. Before cutover, resolve legacy empty-note-chord acceptance and empty-note-bar timing-priority provenance.

### Tasks

- [x] Decode method arguments as explicit patterns/bars.
- [x] Decode array entries as sequential children.
- [x] Decode nested arrays as simultaneous groups.
- [x] Decode allowed `null` and `undefined` values as whole-step rests.
- [x] Validate notes, names, variations, and XOX in Fluid.
- [x] Route typed expressions through the shared evaluator.
- [x] Route random inputs directly to random event cycles.
- [x] Cover scalar, sequence, chord, rest, silent-bar, and multi-bar input.

### Likely files

- `packages/fluid/src/inputs/decode-structured-input.ts`
- `packages/fluid/src/inputs/__tests__/decode-structured-input.test.ts`
- `packages/fluid/src/inputs/decode-random-input.ts`
- `packages/fluid/src/inputs/decode-xox-input.ts`
- `packages/fluid/src/inputs/__tests__/decode-xox-input.test.ts`
- `packages/fluid/src/inputs/types.ts`
- `packages/fluid/src/inputs/guards.ts`
- `packages/fluid/src/events/state.ts` — readonly timing chance metadata

### Verification

- [x] Compare evaluated geometry with corrected structured fixtures.
- [x] Confirm decoder output can be inspected independently.
- [x] Confirm random inputs bypass static evaluation.
- [x] Confirm production instruments remain on the legacy path.

## Step 3.5 — Implement generic event-cycle transforms

### Work

Implement the transforms needed by native instrument state before production cutover.

Implemented in `packages/patterns/src/events/transforms.ts`. Fluent and native transforms share unchanged numeric speed resolution in `math/speed-ratio.ts`. Transforms freeze fresh structure, preserve opaque payloads, and guard total patterns, steps, and voices before expansion. Reverse mirrors complete event/gate blocks; stretch retriggers those blocks; slowdown spaces onsets without extending gates. Random candidates transform separately from generation settings, with reverse toggling generation order once. Cross-bar gates fail explicitly under the v1 continuation invariant. Materialized helper calls are not an uninterrupted expression speed chain; Step 6.2 still owns that cancellation.

### Tasks

- [x] Implement reverse, acceleration, slowdown, and stretch.
- [x] Insert slowdown rests without extending gates.
- [x] Preserve explicit rests and continuations.
- [x] Preserve silent patterns and multi-pattern cycles.
- [x] Keep fallback groups outside cycle transforms.
- [x] Return new immutable cycle data.
- [x] Test transform composition and repeated transforms.

### Likely files

- `packages/patterns/src/events/transforms.ts`
- `packages/patterns/src/events/__tests__/transforms.test.ts`
- `packages/patterns/src/events/__tests__/geometry-transforms.test.ts`
- `packages/patterns/src/cycles/operations/reverse.ts`
- `packages/patterns/src/cycles/operations/speed.ts`
- `packages/patterns/src/cycles/operations/stretch.ts`
- `packages/patterns/src/math/speed-ratio.ts`

### Verification

- [x] Verify `60/2` produces an event pattern followed by a silent pattern.
- [x] Verify `[0 2 4 6]/2` preserves non-extended gate durations.
- [x] Verify all transforms are immutable.
- [x] Run patterns and Fluid focused suites.

## PR 3 completion gate

- [x] Structured inputs decode to the shared expression model.
- [x] One evaluator produces canonical event cycles.
- [x] Expression evaluation, structured decoding, and generic transforms provide tested native event-cycle foundations.
- [x] Generic transforms preserve exact geometry.
- [x] Production schema generation remains legacy-backed.
- [x] No adapter or mixed state exists.

---

# PR 4 — Build native state, transitions, and the pure compiler

## Goal

Implement the complete target event state and compiler beside production code. Test it directly rather than adapting legacy authoring classes into it.

## Step 4.1 — Define immutable instrument event state

### Work

Represent synth and sampler event concerns as readonly data with intent colocated with each source.

Status: complete as a type-only model in `packages/fluid/src/events/state.ts`, with 12 focused tests/type assertions. Defaults require static cycles and nonempty fallback tuples; authored numeric lanes admit random cycles, while names stay static. Timing retains readonly chance metadata separately from numeric generation. Pitch state records resolved root/scale data and whether a transform was explicitly requested, preserving sampler note omission even for `root(0)`. Generated sampler timing is a separate compiler-input override, not a stored lane.

Patterns now exports `EventCycle` and `NonEmptyGroup` for this concrete cross-package consumer; no runtime exports or Fluid public exports were added. Native constructors and runtime freezing belong to Step 4.2. This initial model does not resolve the representation-feasibility questions in Steps 4.2/4.5, which still block cutover. Production instruments remain unchanged.

### Tasks

- [x] Define authored static and random event sources.
- [x] Define default static sources with nonempty fallback groups.
- [x] Define implicit and explicit timing state.
- [x] Preserve timing chance conditions.
- [x] Represent synth and sampler notes.
- [x] Represent sampler names and variations.
- [x] Represent root and scale state without legacy class methods.
- [x] Accept generated sampler timing as a compiler override, not stored event state.
- [x] Keep expressions out of state.

### Likely files

- `packages/fluid/src/events/state.ts` — also owns the unchanged readonly timing chance metadata
- `packages/fluid/src/events/__tests__/state.test.ts`
- `packages/patterns/src/index.ts`

### Verification

- [x] Type-check complete synth and sampler states.
- [x] Verify default fallback groups cannot be empty.
- [x] Confirm state types have no legacy class or expression references.

## Step 4.2 — Implement pure state transitions

### Work

Implement native setter and transform behavior before changing the mutable public facades. Establish representation feasibility explicitly: native state must preserve the distinction between authored rests and materialized timing gaps, coordinated lanes sharing selected timing, and later timing replacement. Passing isolated transform tests is insufficient if subsequent setters lose these distinctions.

Status: complete. Constructors, setters, timing composition, pitch state, pure transforms, immutable snapshots, and materialization provenance are directly tested. Legacy getter-sensitive speed cancellation was explicitly rejected in favor of the specification's immediate transitions and pure reads. Compilation and complete native replay are verified in Steps 4.3–4.5; public getter integration remains PR 5 work.

### Tasks

- [x] Add constructors for default synth and sampler event state.
- [x] Replace notes, names, variations, and timing independently.
- [x] Make every setter replacement authored.
- [x] Apply root and scale without changing cycle geometry.
- [x] Apply reverse, fast, slow, and stretch exactly once to participating lanes.
- [x] Preserve default fallback groups while transforming their cycles.
- [x] Preserve setter-before-transform and transform-before-setter behavior.
- [x] Preserve explicit timing and generated timing exemptions.
- [x] Prove materialized timing gaps do not become authored candidate-filtering rests after later timing or unrelated value setters.
- [x] Prove authored and slowdown-created rests still filter replacement timing.
- [x] Prove coordinated lanes sharing materialized timing do not apply their intersection twice.
- [x] Cover repeated and chained transforms, timing replacement, and generated chop/fit exemptions.
- [x] Resolve empty-bar provenance for authored-rest priority and speed geometry: legacy zero-width empty bars and canonical one-step silence compress differently. Also resolve legacy empty-note-chord acceptance against native empty-group validation before cutover.
- [x] Document and resolve any required representation changes before production wiring.
- [x] Keep transitions pure and immutable.

### Likely files

- `packages/fluid/src/events/transitions.ts`
- `packages/fluid/src/events/__tests__/transitions.test.ts`
- `packages/fluid/src/events/geometry.ts`
- `packages/fluid/src/events/snapshot.ts`
- `packages/fluid/src/events/state.ts`
- `packages/patterns/src/events/transforms.ts`

### Verification

- [x] Test every setter against default and authored state.
- [x] Test equal-value setters changing intent.
- [x] Test all transforms before and after setters, including sparse explicit timing followed by reverse/slow and timing replacement.
- [x] Assert native state preserves the required availability and timing distinctions across subsequent operations.
- [x] Assert transition inputs remain unchanged.
- [x] Confirm no transition imports a legacy authored wrapper.
- [x] Block PR 5 until representation-feasibility cases also pass complete-schema replay in Step 4.5.

### Representation decisions and approved compatibility exception

Implemented helpers are `packages/fluid/src/events/transitions.ts`, `packages/fluid/src/events/geometry.ts`, and `packages/fluid/src/events/snapshot.ts`. Production facades remain entirely legacy-backed.

Native provenance is colocated with authored sources, never with generic event steps:

- `availability` is an immutable boolean/transparent-timing-gap cycle. Authored false slots survive alignment; inherited timing gaps disappear from ordinal filtering. Slowdown-created rest steps are transparent while aligned, then become false slots when timing is released by the same setters as the corrected legacy path.
- `materializedTiming` is an immutable identity shared by coordinated notes/variations. It prevents their already-applied intersection from filtering selected inferred timing twice.
- `zeroWidthPatterns` preserves empty note/random/timing bars without allowing empty canonical patterns. Generic geometry transforms compress these bars without inserting a subdivision. Empty static names/variations remain ordinary authored rests, matching their legacy normalization.
- `noteValueSlots` preserves structured null/undefined/empty/null-only chords as value slots during note materialization, while transformed gaps and variation rests are skipped. Empty chords decode as rest nodes, never empty event groups. `materializationExempt` retains the legacy original-one-slot note-source exemption after its geometry changes; this is not scalar broadcasting or an alternate value mode.
- Generated timing overrides retain readonly schema geometry outside v1 IR, because existing chop/fit gates may cross bars. They remain compiler inputs and are never stored or transformed as authored lanes.

Tests cover native state directly and 32 reproducible eight-operation legacy/native timing-prefix sequences. The comparison uses independently initialized paths and production-intended native helpers; it compares timing selection/filtering, not complete compilation. Step 4.5 now verifies complete schemas and sequences without intermediate getter boundaries.

**Approved: immediate fluent speed transforms, independent of reads.** The user explicitly chose specification conformance over reproducing legacy deferred/getter-sensitive speed cancellation. Native `.fast(2).slow(2)` operates on the materialized intermediate cycle and preserves shortened gates; no getter call changes the outcome. Do not repair the old wrappers, add pending speed state, introduce an observation boundary, or require parity with that legacy quirk. Shorthand's exact uninterrupted expression-chain cancellation remains required in Step 6.2.

`packages/fluid/src/events/__tests__/transitions.test.ts` now tests immediate acceleration/slowdown for synth, sampler, and generated-timing contexts, unchanged results after repeated native reads, later timing replacement, and coordinated value lanes under generated timing. No expected-failure test remains. Steps 4.3–4.5 must extend this to pure compilation and complete-schema replay; PR 5 must test public `getSchema()` read independence once the facade uses native state. Differential mismatches attributable to this approved exception are explained differences, not blockers. Other preserved-behavior regressions still require fixes; do not rewrite existing goldens to hide them.

## Step 4.3 — Implement static event compilation

### Work

Compile native state to the existing schema without parsing input or mutating authoring state.

Status: complete in `packages/fluid/src/events/compiler.ts`, with direct native-state tests. The compiler reuses Step 4.2 timing selection, availability, shared-materialization provenance, and snapshots. Synth compilation applies authored availability without changing synth transform materialization semantics. Notes resolve final hit counts; sample names and variations retain the established compact sequences for independent engine-side hit-index wrapping. Common-length expansion and emitted event/voice budgets are checked before schema group allocation. Exact geometry stays native until numeric schema emission, retaining corrected golden offset rounding.

Tests compare complete static schemas with representative corrected golden expectations, cover continuations and provenance directly, and prove compilation cannot affect later transforms or mutate/alias input data. Random sources and chance metadata are now supported by Step 4.4; its implementation removed the temporary unsupported-branch guards and their test. Complete shared-fixture replay is verified in Step 4.5; production facades and corrected goldens are unchanged.

### Tasks

- [x] Implement synth implicit versus explicit timing selection.
- [x] Implement sampler rest priority, density, and tie order.
- [x] Use defaults for timing only when no stronger source exists.
- [x] Expand participating cycles to a bounded common length.
- [x] Apply authored rests by candidate ordinal.
- [x] Keep continuations ordinal-occupying and externally transparent.
- [x] Prevent defaults from filtering candidates.
- [x] Fill surviving hits from fallback groups.
- [x] Prevent fallbacks from creating hits or activating silent patterns.
- [x] Resolve authored values by final hit index.
- [x] Apply root and scale conversion.
- [x] Emit existing static schema shapes and silent-bar conventions.

### Likely files

- `packages/fluid/src/events/compiler.ts`
- `packages/fluid/src/events/__tests__/compiler.test.ts`
- `packages/fluid/src/events/state.ts`
- `packages/patterns/src/events/cycle.ts`

### Verification

- [x] Construct native static states directly in tests.
- [x] Compare complete output with corrected golden expectations.
- [x] Assert compiler inputs remain unchanged.
- [x] Confirm the compiler has no legacy imports.

## Step 4.4 — Add random compilation and generated timing overrides

### Work

Complete the compiler for random lanes, chance timing, and generated sampler timing.

Status: complete in `packages/fluid/src/events/compiler.ts`, with 80 passing compiler tests across static, random, chance, and generated timing cases. Production synth/sampler getters and corrected golden expectations are unchanged; complete shared-fixture replay is verified in Step 4.5.

Random notes use surviving fixed-candidate counts; random variations preserve authored per-bar counts for independent wrapping. Both retain cloned generation metadata, including segments, ranges, maps, quantization, algorithms, and order. Binary/scale note maps follow the established pitch-conversion policy, with generated scale maps bounded before allocation. Explicit synth rhythm replaces random note counts even in originally empty bars; sampler random zero-count bars suppress candidates. Probability zero compiles to silence, probability one omits a redundant condition, and intermediate probabilities remain one runtime timing condition after fixed filtering. The compiler never generates random decisions or values.

`compileSamplerEventState(state, { timingOverride })` accepts readonly generated schema geometry outside authored IR. Overrides take priority over stored rhythm/chance, preserve gates crossing bars, and share native availability policy with ordinary compilation. Input geometry, common-length expansion, and emitted event/count budgets are validated before expansion. Compilation never stores, freezes, mutates, or aliases the override. Chop/fit exemption goldens and read-independent subsequent transforms are covered directly.

A matching complete compiler expectation and retained `resolve-sampler-events.test.ts` regression demonstrate that middle chance misses consume no random notes, variations, or sample names. Audio-engine production code and schema types remain unchanged.

### Tasks

- [x] Preserve random notes and variations as random schemas.
- [x] Preserve values-per-pattern, segments, ranges, maps, and integer settings.
- [x] Preserve random timing as one runtime condition.
- [x] Apply fixed availability before runtime chance.
- [x] Ensure random misses consume no final values.
- [x] Accept chop/fit timing as a separate override.
- [x] Preserve optional sampler notes and default variation omission.
- [x] Cover random zero-count and silent-pattern conventions.

### Likely files

- `packages/fluid/src/events/compiler.ts`
- `packages/fluid/src/events/__tests__/compiler.test.ts`
- `packages/fluid/src/events/state.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/instruments/sampler-event-timing.ts`
- `packages/fluid/src/instruments/__tests__/sampler-event-timing.test.ts`

### Verification

- [x] Compare complete random output with corrected golden expectations.
- [x] Cover generated chop and fit timing exemptions.
- [x] Run new compiler tests over the full semantic matrix.
- [x] Confirm production `getSchema()` still uses the legacy path.

## Step 4.5 — Replay complete native scenarios before cutover

### Work

Prove the complete structured native path, not only compilation from hand-constructed state. Extract replayable operation sequences from the existing compatibility fixtures while retaining their names and corrected expected schemas unchanged. Replay each sequence through native construction, decoding, evaluation, transitions, generated timing overrides, and compilation. Production instruments remain legacy-backed.

Status: complete. All 54 corrected fixtures share fresh operation factories and unchanged names/expected schema ASTs in `packages/fluid/src/__tests__/event-schemas/support/schema-fixtures.ts`. Both public API and native replay pass their complete serialized expectations. The test-only `packages/fluid/src/__tests__/event-schemas/support/scenario-replay.ts` driver delegates native behavior to decoders, transitions, compilation, and the isolated production-intended `packages/fluid/src/instruments/sampler-event-timing.ts` configuration helpers; it never adapts legacy state. Sampler configuration stays outside authored IR, retaining validated fit/chop bounds, processing sequence counts, generated-timing priority, and materialization release.

`packages/fluid/src/__tests__/event-schemas/native-replay.test.ts` has 88 retained replay cases: the 54 corrected goldens, complete representation-feasibility cases, and explicit approved-exception regressions. They cover inherited gaps versus slowdown-created rests, repeated shared intersections, empty-bar timing priority and generated compression, null/undefined/empty/null-only note chords, original-one-slot exemptions, generated sequence counts, fit deactivation, and immediate synth/sampler/generated speed chains. Every operation prefix is compiled repeatedly without mutating frozen native state, then the final complete schema is compared with independent uninterrupted replay.

**Materialization follow-up:** readiness was reopened after empty note-value bars lost selected timing width during fractional speeds and missing note groups left orphan continuations. Both defects are fixed in native `alignValues()`: an empty value bar aligned to active timing retains the full silent grid without inventing note-value slots, and removing an onset silences its entire continuation run. Four retained complete-schema fixtures cover leading/trailing empty note bars under `.fast(2 / 3)` and `.slow(3 / 2)`; temporary comparisons verify strict legacy parity with and without intermediate reads. Ten direct cases in `packages/fluid/src/events/__tests__/materialization.test.ts` additionally cover fractional geometry, null/undefined/empty/null-only placeholders, one- and two-step continuation runs, synth/sampler transitions, all four transforms, immutable inputs, and complete reversed schemas. These are native fixes, not new compatibility exceptions; corrected goldens and production wiring are unchanged.

`packages/fluid/src/__tests__/event-schemas/legacy-comparison.test.ts` has 149 temporary tests. Forty-eight seeds each for synth, sampler, and generated-timing contexts replay eight-operation sequences, comparing all 1,152 prefixes with and without intermediate compilation (2,304 complete legacy/native schema comparisons). Each uninterrupted prefix initializes fresh paths and random sources. Failure messages include the context, seed, operations, and strict complete schema difference.

Eleven differing prefixes across four generated sequences are fully explained by approved exceptions. Both read modes are checked against exact, independent legacy counterpart schemas and retained explicit native expectations; there is no broad skip for sequences containing speed transforms or rests. Deferred implicit stored-rhythm speeds explain synth seeds 6/12 and sampler seed 48, even when schema reads do not observe that legacy lane. Synth seed 26 exposes the separately approved availability exception below. All other prefixes require strict parity. The temporary comparison file and its obsolete counterpart expectations are removed at cutover; `packages/fluid/src/__tests__/event-schemas/support/native-regression-fixtures.ts`, shared corrected fixtures, and native replay remain.

**Approved: synth authored availability survives materialization.** Legacy synth compilation ignores slowdown-created within-bar rests after note materialization; native compilation applies their candidate-ordinal availability as specified. `.synth().notes([60, 64]).slow(2).xox(rand().bin().steps(4).chance(1))` emits offsets `0` and `1/2` in both bars with quarter-bar durations, not the legacy four candidates per bar. The user approved documenting this as a compatibility exception rather than reproducing or repairing the legacy defect. Inherited timing gaps remain transparent. The specification, retained full-schema regressions, and explicit old/new characterization record the distinction. No corrected expectation or legacy implementation changed, and no unexplained differential mismatch remains.

### Tasks

- [x] Share scenario inputs and golden expectations between existing public API fixtures and the native replay tests.
- [x] Initialize fresh native state and sampler configuration for every scenario.
- [x] Use the production-intended native helpers rather than duplicating their semantics in the test driver.
- [x] Replay every corrected compatibility fixture, including random sources and generated timing.
- [x] Add complete-schema cases for the representation-feasibility scenarios in Step 4.2.
- [x] Add temporary test-only comparisons against independently constructed legacy instruments.
- [x] Compare bounded, reproducibly generated valid setter/transform sequences, including timing replacement and repeated transforms; compare sequence prefixes to expose intermediate divergences.
- [x] Report the scenario or generation seed, operation sequence, and complete schema difference for each failure.
- [x] Turn discovered edge cases into retained explicit golden or native regression tests; do not redefine expected behavior merely to match the new path.
- [x] Resolve materialized empty-value grid width and orphan continuation defects, retaining fractional-speed schema replay and direct continuation-transition regressions before PR 5.

### Likely files

- `packages/fluid/src/__tests__/event-schemas/compatibility.test.ts`
- `packages/fluid/src/__tests__/event-schemas/native-replay.test.ts`
- `packages/fluid/src/__tests__/event-schemas/legacy-comparison.test.ts` — temporary, removed at cutover
- `packages/fluid/src/__tests__/event-schemas/support/schema-fixtures.ts`
- `packages/fluid/src/__tests__/event-schemas/support/native-regression-fixtures.ts`
- `packages/fluid/src/__tests__/event-schemas/support/scenario-replay.ts`
- `packages/fluid/src/events/__tests__/materialization.test.ts` — retained native materialization regressions
- `packages/fluid/src/events/__tests__/transitions.test.ts`
- `packages/fluid/src/events/__tests__/compiler.test.ts`
- `packages/fluid/src/instruments/sampler-event-timing.ts`
- `packages/fluid/src/instruments/__tests__/sampler-event-timing.test.ts`

### Verification

- [x] Compare complete native schema output strictly with every corrected golden expectation.
- [x] Confirm the legacy public fixtures still pass with unchanged expectations.
- [x] Resolve every differential mismatch before cutover.
- [x] Confirm the replay driver contains no legacy-to-native adaptation or duplicated authoring semantics.
- [x] Confirm production instruments still use only legacy state and compilation.

## PR 4 completion gate

- [x] Native state represents every corrected structured event behavior.
- [x] Representation feasibility is demonstrated across transforms and subsequent setters, with no unresolved design questions.
- [x] Native transitions preserve transform and setter semantics.
- [x] The pure compiler emits the established schema.
- [x] Complete native scenario replay passes against unchanged corrected goldens.
- [x] Generated setter/transform comparisons have no unexplained mismatches.
- [x] Static, random, and generated timing cases are covered.
- [x] New production-intended code has no legacy authored-class imports; legacy comparison dependencies are test-only.
- [x] No production adapter, dual state, or production cutover has landed.

---

# PR 5 — Cut structured input over atomically

## Goal

Replace production event authoring and compilation in one coordinated cutover, then delete the legacy event architecture.

The standalone Fluid reorganization merged as [#56](https://github.com/andy-stewart-design/web-audio/pull/56), satisfying PR 5's prerequisite. Steps 5.1–5.4 are complete and merged; see the [coverage-transfer and deletion record](./phase-5-coverage-transfer.md). Use the final reorganized paths and preserve the pre-cutover baseline coverage: 27 Fluid files / 896 tests and 22 patterns files / 372 tests before cutover deletions. Counts alone did not authorize deletion; Step 5.4's verified assertion-level transfer is recorded separately.

Steps 5.1–5.4 formed one production transition and were merged together. Preparation could occur in isolated code, but the merged PR contains only native event state.

Organize reviewable commits by setter wiring (5.1), transform wiring (5.2), schema wiring (5.3), and legacy deletion after verified coverage transfer (5.4). These are review boundaries, not separately deployable production states; merge them together only after the final integrated path passes all cutover gates. Keep representation changes in PR 4 and newly discovered behavior changes out of PR 5. Corrected golden expectations must remain unchanged.

## Step 5.1 — Route every event setter to native state

### Work

Replace legacy fields in `Instrument`, `Synthesizer`, and `Sampler` with one native event-state source of truth.

Status: complete and merged, together with the user-approved supporting transform/schema wiring in Steps 5.2–5.3. Facades store only `_eventState`; structured notes, names, variations, and fixed/random XOX delegate to the existing decoders and pure transitions. Hex, Euclid, and sequence call the named pure generators exported from the patterns entry point, then decode transient masks and compose through native timing transitions; no temporary `FixedTimingCycle` is constructed. Root/scale and sampler fit/chop use the existing native helpers; processing fields remain unchanged. Decoder diagnostics now preserve the established public name/nullable-voice error messages without changing validation rules or golden expectations.

`packages/fluid/src/instruments/__tests__/event-setters.test.ts` adds 49 retained tests covering frozen native state, lane replacement, equal-value authored intent, structured dimensions, caller-input snapshots, eager validation without state replacement, rhythm generation/composition, pitch intent, exactly-once transforms, processing independence, and native resource warnings. Existing public setter/validation suites are retained unchanged.

### Tasks

- [x] Initialize native synth and sampler event state.
- [x] Decode and evaluate `.notes()` into native state.
- [x] Decode fixed and random `.xox()` into native timing state.
- [x] Preserve `.hex()`, `.euclid()`, and `.sequence()` behavior through native timing transitions.
- [x] Decode and evaluate `.name()` into native sampler state.
- [x] Decode and evaluate `.variation()` / `.var()` into native sampler state.
- [x] Route root and scale updates through native state.
- [x] Preserve fluent public signatures and validation behavior.
- [x] Keep processing parameter fields unchanged.
- [x] Do not retain parallel legacy event fields.

### Likely files

- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/synthesizer.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/events/state.ts`
- `packages/fluid/src/events/transitions.ts`
- `packages/fluid/src/inputs/decode-structured-input.ts`
- `packages/fluid/src/inputs/decode-random-input.ts`
- `packages/fluid/src/inputs/decode-xox-input.ts`
- `packages/fluid/src/inputs/types.ts`
- `packages/fluid/src/pitch/types.ts`
- `packages/fluid/src/pitch/get-scale.ts`

### Verification

- [x] Confirm setters replace only their target lane.
- [x] Confirm equal-value setters change default intent to authored.
- [x] Run focused public setter and validation tests.
- [x] Confirm no public instrument stores both legacy and native event state.

## Step 5.2 — Route transforms through native transitions

### Work

Make every global event transform one immediate native state operation.

Status: implemented as supporting wiring for Step 5.1. Each inherited public transform enters one `_transformEvents()` hook; the sampler supplies generated timing context, and the existing pure transition coordinates all participating lanes once. There is no deferred speed state, operation log, or getter mutation. Public replay verifies call order, repeated transforms, slowdown availability, and both approved exceptions; direct facade spies verify one transition per transform in synth, sampler, and generated-timing contexts.

### Tasks

- [x] Route `reverse`, `fast`, `slow`, and `stretch` through native transitions.
- [x] Transform every participating event cycle exactly once.
- [x] Select or materialize timing once when current behavior requires it.
- [x] Preserve default fallback groups.
- [x] Preserve authored slowed-rest filtering.
- [x] Preserve explicit timing and setter call order.
- [x] Preserve generated chop/fit timing exemptions.
- [x] Leave processing parameters outside event transforms.
- [x] Avoid an operation log or deferred getter mutation.

### Likely files

- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/events/transitions.ts`
- `packages/fluid/src/events/__tests__/transitions.test.ts`
- `packages/fluid/src/instruments/sampler-event-timing.ts`
- `packages/fluid/src/instruments/__tests__/sampler-event-timing.test.ts`
- `packages/patterns/src/events/transforms.ts`

### Verification

- [x] Run every transform against every event lane.
- [x] Cover setter-before-transform and transform-before-setter ordering.
- [x] Cover repeated and chained transforms.
- [x] Confirm each public transform has one native state transition entry.

## Step 5.3 — Switch synth and sampler schema generation together

### Work

Route both instruments through the pure compiler in the same production cutover.

Status: implemented as supporting wiring for Step 5.1. Both getters use the existing pure native compiler; generated timing remains an external override. Native warning enumeration reads authored event groups or default fallback names. The new retained `packages/fluid/src/__tests__/event-schemas/public-native-replay.test.ts` replays all 88 native golden/regression cases through public facades, with repeated getters after every operation and an independent uninterrupted replay. All 54 corrected public goldens and existing processing/configuration tests pass unchanged.

During Steps 5.1–5.3, legacy code and assertions were retained deliberately until coverage transfer. A temporary independent legacy driver kept the 149 original comparisons, 54 added calibration cases, and transition timing oracle meaningful after facade cutover. Step 5.4 now deletes that driver and all legacy assertions after verifying their retained destinations; the unchanged generated operation matrix instead exercises native/public schema replay and read independence. All 54 corrected goldens remain unchanged.

### Tasks

- [x] Compile synth event schema from native state.
- [x] Compile sampler event schema from native state.
- [x] Pass generated chop/fit timing as an override.
- [x] Preserve optional notes and default variation omission.
- [x] Preserve sample warning behavior using native static names and fallbacks.
- [x] Preserve region, fit, chop, loop, clipping, direction, routing, effects, and gain behavior.
- [x] Keep schema and audio-engine types unchanged.

### Likely files

- `packages/fluid/src/instruments/synthesizer.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/events/compiler.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/instruments/sampler-event-timing.ts`
- `packages/fluid/src/samples/normalize-bank.ts`
- `packages/fluid/src/__tests__/event-schemas/compatibility.test.ts`
- `packages/fluid/src/__tests__/drome.test.ts`
- `packages/fluid/src/instruments/__tests__/instrument.test.ts`

### Verification

- [x] Run all complete-schema fixtures unchanged against the new path.
- [x] Explain and resolve every mismatch against the corrected PR 2 baseline without changing golden expectations.
- [x] Stop cutover for any necessary behavior change and review it separately before proceeding; no new behavior change was required.
- [x] Confirm both instruments use the new compiler.
- [x] Confirm no production getter invokes legacy event compilation.

## Step 5.4 — Delete superseded event infrastructure

### Work

Remove the old architecture in the same PR so the repository does not retain two competing paths. Before deleting legacy tests or implementations, record a coverage-transfer inventory in the PR: each useful legacy behavior/assertion maps to a retained golden, decoder, transition, compiler, or public API test. Assertions specific only to obsolete internals may be retired with an explicit rationale; passing golden fixtures alone does not justify dropping behavioral coverage.

Status: complete, verified, and merged. The [coverage-transfer record](./phase-5-coverage-transfer.md) maps every removed suite's assertions to retained destinations or explicit retirement rationales. No legacy authored wrappers, compiler, masked cycle, chord serializer, or temporary oracle remains. Review identified that temporary `FixedTimingCycle` rhythm generators did not meet the pure-utility requirement. The facades now call named pure `euclid`, `hex`, and `sequence` exports directly. Empty generator input still rejects, empty bars remain silent, and mask limits, state preservation on failure, composition, and chance retention pass retained regressions. All integrated builds and workspace verification commands pass; PR 5 is complete.

### Tasks

- [x] Inventory useful legacy assertions and identify their retained replacement tests before deletion.
- [x] Preserve coverage for validation/errors, resource warnings, rhythm composition, random settings, root/scale conversion, materialization, and setter/transform call order.
- [x] Verify replacement tests pass and cover the same behavioral assertions before removing legacy tests.
- [x] Delete temporary legacy/native differential wiring while retaining native replay, shared scenarios, and regression expectations.
- [x] Delete the old event compiler.
- [x] Delete `AuthoredPitches`.
- [x] Delete `AuthoredEventValues`.
- [x] Delete or narrow `AuthoredTiming` to any genuinely reusable rhythm utilities.
- [x] Delete or narrow event-related `MaskedCycle` usage.
- [x] Remove duplicated timing selection, availability, materialization, and cycle-expansion helpers.
- [x] Remove obsolete exports and imports.
- [x] Replace wrapper-detail tests only after their useful behavioral assertions have verified native coverage or an explicit retirement rationale.
- [x] Retain useful rhythm generation only as named pure utilities.

### Completed coverage-transfer/deletion inventory

The [assertion-level audit](./phase-5-coverage-transfer.md) was recorded and its retained destinations verified before deletion. Each useful assertion has a concrete retained destination; obsolete accessor/storage contracts and approved-exception counterpart schemas have explicit retirement rationales. Deleted implementation and unit-suite paths (kept here as the audit trail, not live links):

- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/__tests__/event-compiler.test.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/patterns/__tests__/authored-pitches.test.ts`
- `packages/fluid/src/patterns/authored-event-values.ts`
- `packages/fluid/src/patterns/__tests__/authored-event-values.test.ts`
- `packages/fluid/src/patterns/authored-timing.ts`
- `packages/fluid/src/patterns/__tests__/authored-timing.test.ts`
- `packages/fluid/src/patterns/authored-availability.ts`
- `packages/fluid/src/patterns/__tests__/authored-availability.test.ts`
- `packages/fluid/src/patterns/event-timing.ts`
- `packages/patterns/src/cycles/masked-cycle.ts`
- `packages/patterns/src/cycles/__tests__/masked-cycle.test.ts`
- `packages/patterns/src/cycles/chord-static-schema.ts` and `__tests__/chord-static-schema.test.ts` — unused legacy chord serializer, with every assertion transferred
- `packages/patterns/src/index.ts` — removed `MaskedCycle` and unused `Chord` exports; exported pure `euclid`, `hex`, and `sequence` for Fluid; retained random/processing primitives and their dependencies
- `packages/patterns/src/cycles/types.ts` — removed unused `SourceHitReference` and `Chord` types; retained public note input's `ScheduledValue`
- `packages/fluid/src/inputs/guards.ts` — removed `isDefined`, whose only consumer was the deleted compiler

Temporary comparison wiring:

- `packages/fluid/src/__tests__/event-schemas/legacy-comparison.test.ts` — deleted the 203-test temporary suite and obsolete legacy counterpart expectations, not shared/native expectations
- `packages/fluid/src/__tests__/event-schemas/support/legacy-scenario-replay.ts` — deleted the temporary independent legacy wrapper driver
- `packages/fluid/src/events/__tests__/transitions.test.ts` — deleted the legacy-driver import, timing oracle, and temporary comparison section; retained every native transition assertion and direct feasibility regression
- `packages/fluid/src/__tests__/event-schemas/support/generated-scenarios.ts` — retained the same fresh-input sequence generator without any legacy dependency

Retained destinations for the assertion-level inventory (a passing destination must be identified for each useful assertion, not merely for each deleted file):

- `packages/fluid/src/__tests__/event-schemas/compatibility.test.ts` — all 54 corrected public-API goldens, unchanged
- `packages/fluid/src/__tests__/event-schemas/native-replay.test.ts` — all 88 native replay cases, including approved exceptions and materialization regressions
- `packages/fluid/src/__tests__/event-schemas/public-native-replay.test.ts` — the same 88 explicit cases plus 144 generated sequences (1,152 prefixes) through native-backed public facades, including full-schema getter read independence
- `packages/fluid/src/instruments/__tests__/event-setters.test.ts` — 49 public state/setter/rhythm/transform/validation/warning cases
- `packages/fluid/src/__tests__/event-schemas/support/schema-fixtures.ts`
- `packages/fluid/src/__tests__/event-schemas/support/native-regression-fixtures.ts`
- `packages/fluid/src/__tests__/event-schemas/support/scenario-replay.ts` — retain independent public/native replay; after cutover the public driver invokes native-backed facades
- `packages/fluid/src/__tests__/event-schemas/coverage-transfer.test.ts` — 22 explicit retained test cases for runtime fallback guards/snapshots, rooted chords, random pitch maps/counts/chance, empty/latent availability, and masked transform/rhythm-order schemas
- `packages/fluid/src/events/__tests__/state.test.ts`
- `packages/fluid/src/events/__tests__/transitions.test.ts` — retained native coverage; obsolete oracle imports are gone
- `packages/fluid/src/events/__tests__/compiler.test.ts`
- `packages/fluid/src/events/__tests__/materialization.test.ts` — empty-value grid width, continuation-run cleanup, and complete reversed schemas
- `packages/fluid/src/inputs/__tests__/decode-structured-input.test.ts`
- `packages/fluid/src/inputs/__tests__/decode-xox-input.test.ts`
- `packages/fluid/src/instruments/__tests__/sampler-event-timing.test.ts`
- `packages/fluid/src/instruments/__tests__/sampler-utils.test.ts`
- `packages/fluid/src/instruments/__tests__/instrument.test.ts`
- `packages/fluid/src/__tests__/drome.test.ts`
- `packages/fluid/src/parameters/parameter.ts` and `packages/fluid/src/parameters/__tests__/parameter.test.ts` — processing behavior stays outside the event redesign

The reorganization's `pitch/`, `samples/`, `inputs/guards.ts`, `inputs/types.ts`, `drome.ts`, and default-only `index.ts` are retained owners, not obsolete migration infrastructure. Deletion was performed only after the inventory's pre-deletion runs passed (Fluid 30 files / 1,251 tests; patterns 22 files / 372 tests). Initial post-deletion focused runs passed with Fluid 24 files / 1,005 tests and patterns 20 files / 354 tests. After the pure-rhythm review cleanup and two additional public validation cases, Fluid passes 24 files / 1,007 tests; workspace verification passes 1,881 tests and all check/lint/format commands. The reduced counts reflect inventoried legacy assertions, not unverified coverage loss.

### Verification

- [x] Use `rg` to confirm removed classes and compiler symbols have no callers.
- [x] Run Fluid, patterns, schema, and complete repository suites.
- [x] Confirm every inventory entry has a passing retained test or an explicit retirement rationale.
- [x] Confirm no useful validation, warning, rhythm, random, or call-order coverage was lost.
- [x] Confirm temporary differential tests no longer import deleted legacy code.
- [x] Confirm the diff contains no production adapter or dual-state bridge.
- [x] Confirm processing patterns remain unchanged.

## PR 5 completion gate

- [x] The standalone Fluid reorganization is merged before production integration.
- [x] Structured event input uses expressions and evaluation end to end.
- [x] Instrument state stores only native event cycles.
- [x] Both synth and sampler compile through the new compiler.
- [x] All coordinated event lanes switched together.
- [x] Transforms update native state exactly once.
- [x] Legacy wrappers and compiler code are deleted or explicitly narrowed.
- [x] Golden schema fixtures pass with corrected expectations unchanged.
- [x] Coverage transfer is recorded and verified before legacy test deletion.
- [x] Setter, transform, schema, and deletion commits were reviewed separately and merge together.
- [x] Temporary differential wiring is deleted; native scenario replay and regression tests remain.
- [x] No adapter, dual state, or mixed event-lane state remains.

---

# PR 6 — Add shorthand parsing and prove shared evaluation

## Goal

Add shorthand as a second frontend to the expression evaluator already used by structured production input.

## Step 6.1 — Add the source-aware lexer and parser

### Work

Parse shorthand directly into `PatternExpression<string>`.

Status: complete. `@web-audio/patterns` now lexes and parses shorthand directly into the shared expression model. The lexer preserves UTF-16 source ranges and authored lexemes, rejects reserved future syntax, and bounds source length and token count. The parser validates structural grouping, alternation, postfix attachment, simultaneous-voice restrictions, and empty forms before applying the shared expression node and depth limits. No target-specific atom interpretation or second AST was introduced.

### Tasks

- [x] Tokenize atoms, delimiters, rests, and postfix modifiers.
- [x] Treat spaces, tabs, and newlines as equivalent separators.
- [x] Preserve atom and modifier amount lexemes as strings.
- [x] Populate source ranges on parsed nodes.
- [x] Reject unsupported reserved constructs and empty structures.
- [x] Bound source length, token count, expression depth, and node count.
- [x] Do not introduce `ShorthandNode` or another AST.

### Likely files

- `packages/patterns/src/shorthand/lexer.ts` — **new, suggested**
- `packages/patterns/src/shorthand/__tests__/lexer.test.ts` — **new, suggested**
- `packages/patterns/src/shorthand/parser.ts` — **new, suggested**
- `packages/patterns/src/shorthand/__tests__/parser.test.ts` — **new, suggested**
- `packages/patterns/src/shorthand/errors.ts` — **new, suggested**
- `packages/patterns/src/expressions/model.ts`
- `packages/patterns/src/index.ts`

### Verification

- [x] Verify exact ranges for valid and invalid input.
- [x] Cover all syntax and invalid-form examples from the specification.
- [x] Confirm parsing performs no target-specific atom interpretation.

## Step 6.2 — Complete shorthand-only expression evaluation

### Work

Extend the same evaluator with shorthand structures and operators.

Status: complete. The shared evaluator now handles nested groups, deterministic and weighted alternation, structural repetition, acceleration, slowdown, and relative weighting. Speed chains accumulate exact bounded rational rates before transformation, while interrupted chains retain written operation order. Alternation periods, repetition, normalized grids, event-cycle steps, and voices remain bounded, and structured input continues through the same evaluator path.

### Tasks

- [x] Evaluate nested groups and deterministic alternation.
- [x] Evaluate structural repetition `!`.
- [x] Evaluate acceleration `*` and slowdown `/`.
- [x] Evaluate relative weighting `@` with continuations.
- [x] Combine uninterrupted speed chains as exact rational rates.
- [x] Preserve written operator order.
- [x] Implement weighted alternation as whole-pattern retrigger frequency.
- [x] Bound alternation periods and normalized expansion.
- [x] Keep structured evaluation on the same code path.

### Likely files

- `packages/patterns/src/expressions/evaluate.ts`
- `packages/patterns/src/expressions/__tests__/evaluate.test.ts`
- `packages/patterns/src/events/transforms.ts`
- `packages/patterns/src/math/rational.ts`
- `packages/patterns/src/events/grid.ts`
- `packages/patterns/src/limits.ts`

### Verification

- [x] Test `60/2 1` exactly.
- [x] Test `[0 2]*2/2` for geometry and duration cancellation.
- [x] Test `<0@2 2 3>*2` as `[0, 0]` followed by `[2, 3]`.
- [x] Verify weighting distinguishes continuations from rests.
- [x] Verify no second evaluator was introduced.

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

- `packages/fluid/src/inputs/atom-interpreters.ts` — **new, suggested**
- `packages/fluid/src/inputs/__tests__/atom-interpreters.test.ts` — **new, suggested**
- `packages/fluid/src/inputs/decode-xox-input.ts`
- `packages/fluid/src/inputs/__tests__/decode-xox-input.test.ts`
- `packages/fluid/src/samples/normalize-bank.ts`
- `packages/fluid/src/inputs/guards.ts`
- `packages/fluid/src/inputs/types.ts`

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

- `packages/patterns/src/expressions/__tests__/evaluate.test.ts`
- `packages/fluid/src/inputs/__tests__/atom-interpreters.test.ts` — **planned; Step 6.3**
- `packages/fluid/src/inputs/__tests__/decode-structured-input.test.ts`
- `packages/fluid/src/events/__tests__/compiler.test.ts`
- `packages/fluid/src/__tests__/event-schemas/compatibility.test.ts`

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
- [ ] Export `Shorthand`; add named expression/supporting-type exports only for demonstrated consumers, not every constituent type.
- [ ] Keep parsed expression data enumerable and inspectable.
- [ ] Test alias equivalence and eager syntax errors.

### Likely files

- `packages/patterns/src/shorthand/create.ts` — **new, suggested; owning module, not a barrel**
- `packages/patterns/src/expressions/model.ts`
- `packages/patterns/src/index.ts`
- `packages/fluid/src/drome.ts` — shorthand factory implementation
- `packages/fluid/src/index.ts` — public export contract
- `packages/fluid/src/__tests__/drome.test.ts`
- `packages/fluid/src/inputs/types.ts`

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
- `packages/fluid/src/events/transitions.ts`
- `packages/fluid/src/inputs/atom-interpreters.ts` — **planned; Step 6.3**
- `packages/fluid/src/inputs/decode-xox-input.ts`
- `packages/fluid/src/inputs/types.ts`
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

- `packages/fluid/src/samples/normalize-bank.ts`
- `packages/fluid/src/samples/__tests__/normalize-bank.test.ts`
- `packages/fluid/src/samples/types.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/drome.ts`
- `packages/fluid/src/__tests__/drome.test.ts`
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
- [ ] The standalone package reorganization is merged before PR 5; current paths and assertion-level coverage-transfer requirements are used.
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
