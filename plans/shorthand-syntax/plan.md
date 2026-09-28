# Shorthand Syntax Detailed Implementation Plan

## Status and companion documents

Proposed implementation plan.

Read this with:

- [`spec.md`](./spec.md) — normative behavior and architecture;
- [`plan-outline.md`](./plan-outline.md) — high-level PR sequence;
- [`syntax-examples.md`](./syntax-examples.md) — shorthand and closest structured equivalents;
- [`pattern-flow-comparison.md`](./pattern-flow-comparison.md) — current and target flows side by side;
- [`pattern-flow-current.png`](./pattern-flow-current.png) — current production flow;
- [`pattern-flow-target.png`](./pattern-flow-target.png) — target flow;
- [`pattern-ir-redesign.md`](./pattern-ir-redesign.md) — superseded design history only.

If this plan and the specification disagree, the specification wins.

## Delivery strategy

Migrate at the existing schema boundary. Structured input proves the shared expression model, event-cycle representation, and compiler before shorthand is connected to the public API.

Use one input-boundary expression flow:

```text
structured input → decode and validate ─┐
                                        ├→ PatternExpression → evaluate → EventCycle<T>
shorthand source → parse ───────────────┘
```

Expressions are transient. Instrument state stores evaluated event cycles, not both representations.

Use a one-way strangler migration for production state:

```text
legacy authoring state → temporary adapter → new compiler → existing schema
new authoring state                    → new compiler → existing schema
```

Do not dual-write legacy and new state. During migration, one representation remains authoritative for each lane. The temporary adapter is the only code allowed to depend on both architectures.

Steps below are intended to be reviewable commits or commit-sized units. Files marked **new, suggested** may be renamed during implementation, but ownership boundaries should remain intact.

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

While old and new compilers coexist, compare them directly. After deleting an old implementation, use retained explicit golden schema fixtures rather than preserving obsolete code solely for differential tests.

---

# PR 1 — Characterize the existing baseline

## Goal

Create an explicit compatibility baseline without changing production behavior.

## Step 1.1 — Establish schema fixture infrastructure

### Work

Create table-driven fixtures that invoke the public Fluid API and assert complete event-pattern schema output. Prefer explicit expected objects over broad snapshots.

### Tasks

- [x] Add a dedicated event-schema compatibility test file.
- [x] Add reusable fixture types and assertion helpers.
- [x] Capture complete timing, values, conditions, and silent bars.
- [x] Keep fixture construction reusable by later old/new compiler comparisons.
- [x] Confirm this step changes no production files.

### Likely files

- `packages/fluid/src/instruments/event-schema-compatibility.test.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-compiler.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/index.test.ts`

### Verification

- [x] Run focused Fluid tests.
- [x] Confirm fixtures pass against current behavior.
- [x] Confirm the diff contains tests and fixture data only.

## Step 1.2 — Fill the compatibility matrix

### Tasks

- [x] Cover synth implicit timing and explicit XOX timing.
- [x] Cover sampler ownership, rest priority, density, and tie-breaking.
- [x] Cover current scalar broadcasting and constructor defaults separately.
- [x] Cover rests in notes, names, and variations.
- [x] Cover random notes, variations, and timing conditions.
- [x] Cover chords, duplicate voices, and independent wrapping.
- [x] Cover silent bars and multi-bar LCM expansion.
- [x] Cover root and scale conversion, including negative degrees.
- [x] Cover `fast`, `slow`, `stretch`, and `reverse` around setters.
- [x] Cover generated chop/fit timing and transform exemptions.

### Likely files

- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/instruments/event-compiler.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/index.test.ts`

### Verification

- [x] Run the complete Fluid suite.
- [x] Review the matrix against `spec.md` compatibility requirements.
- [x] Confirm no production behavior changed.

## PR 1 completion gate

- [x] Existing behavior is represented by explicit passing fixtures.
- [x] Later PRs can reference named fixtures instead of rediscovering behavior.
- [x] No intentional behavior change has landed yet.

---

# PR 2 — Land intentional event-semantics changes

## Goal

Establish the corrected semantic baseline before introducing adapters or a new compiler. Keep each behavior change independently reviewable inside the PR.

## Step 2.1 — Change sampler filtering to candidate ordinals

### Work

Change static sampler note and variation availability from offset resampling to active candidate ordinals, matching sample-name behavior.

### Tasks

- [x] Add failing note and variation fixtures against explicit XOX.
- [x] Cover wrapping, multi-bar cycles, and multiple-lane rest intersections.
- [x] Exclude the selected timing owner from redundant filtering.
- [x] Preserve random zero-values-per-bar suppression.
- [x] Preserve fixed filtering before runtime chance.
- [x] Update only intentional golden expectations.

### Likely files

- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/event-compiler.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`, only if availability exposure changes
- `packages/fluid/src/patterns/authored-event-values.ts`, only if availability exposure changes

### Verification

- [x] Verify `[0, null, 2]` against four candidates yields offsets `0`, `1/2`, `3/4` and values `0`, `2`, `0`.
- [x] Confirm unrelated PR 1 fixtures remain green.

## Step 2.2 — Remove authored scalar broadcasting

### Work

Treat every value supplied through a setter as an authored pattern, including scalars and one-step arrays. Rests introduced by transforms filter externally owned timing.

### Tasks

- [ ] Make scalar, one-element array, and one-step cycle inputs use the same authored path.
- [ ] Remove authored `broadcastValue` exceptions from fixed availability.
- [ ] Make `.var(1).slow(2)` produce the same event/rest availability as an equivalent two-bar pattern.
- [ ] Apply the rule consistently to notes, names, and variations.
- [ ] Add before/after fixtures for explicit timing interactions.
- [ ] Update only intentional golden expectations.

### Likely files

- `packages/fluid/src/patterns/authored-event-values.ts`
- `packages/fluid/src/patterns/authored-event-values.test.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/event-compiler.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`

### Verification

- [ ] Confirm authored slowed rest bars suppress externally owned candidates.
- [ ] Confirm untransformed one-step authored patterns still repeat naturally.

## Step 2.3 — Establish explicit default fallback semantics

### Work

Separate constructor defaults from authored patterns. A default source retains transformed timing geometry plus a nonempty fallback group.

### Tasks

- [ ] Represent or expose default intent independently from authored setters.
- [ ] Require each fallback group to be nonempty.
- [ ] Ensure defaults do not compete with authored timing.
- [ ] Ensure defaults never filter externally owned timing.
- [ ] Fill every surviving hit from the fallback group.
- [ ] Ensure fallback values never create hits or activate silent timing bars.
- [ ] Allow the transformed default cycle to supply timing only when no stronger source exists.
- [ ] Ensure a setter replaces a default with authored intent even when values are equal.

### Likely files

- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/patterns/authored-event-values.ts`
- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/event-compiler.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`

### Verification

- [ ] Verify `d.sample("bd").slow(2).xox([1, 1])` fills every surviving hit with `bd`.
- [ ] Verify `d.sample().name("bd").slow(2).xox([1, 1])` can suppress the slowed rest bar.
- [ ] Verify defaults do not activate an empty explicit timing bar.
- [ ] Verify setting the same value changes intent to authored.

## Step 2.4 — Promote the corrected baseline

### Tasks

- [ ] Mark candidate filtering, authored pattern semantics, and default fallbacks as intentional changes.
- [ ] Ensure no new architecture types or adapters landed in this PR.
- [ ] Make corrected fixtures authoritative for PR 4 differential comparisons.

### Verification

- [ ] Run the complete repository suite.
- [ ] Review schema diffs specifically for unrelated changes.

## PR 2 completion gate

- [ ] Candidate-ordinal filtering is established.
- [ ] Authored scalar broadcasting is removed.
- [ ] Default fallbacks have explicit tested semantics.
- [ ] No event-cycle redesign code has landed.

---

# PR 3 — Introduce shared expressions and event-cycle primitives

## Goal

Add one expression model, one evaluator, canonical event cycles, and generic transforms without changing production compilation.

## Step 3.1 — Define `PatternExpression<T>`

### Work

Create one generic tree used by structured decoding and shorthand parsing. Include explicit root patterns/bars and optional source ranges.

### Tasks

- [ ] Define atom, rest, sequence, group, parallel, alternate, and modifier nodes.
- [ ] Define explicit root `patterns` for structured method arguments.
- [ ] Make source ranges optional so shorthand can populate them without burdening structured input.
- [ ] Keep atom payload generic: typed structured values or shorthand text.
- [ ] Make nodes readonly and ordinary enumerable data.
- [ ] Bound expression node count and depth.
- [ ] Do not define `ShorthandNode` or a second expression representation.

### Likely files

- `packages/patterns/src/pattern-expression.ts` — **new, suggested**
- `packages/patterns/src/pattern-expression.test.ts` — **new, suggested**
- `packages/patterns/src/types.ts`
- `packages/patterns/src/index.ts`
- `packages/patterns/src/utils/cycle-limits.ts`

### Verification

- [ ] Type-test all node variants.
- [ ] Verify expression data is immutable and enumerable.
- [ ] Confirm no production Fluid path uses it yet.

## Step 3.2 — Define event-cycle types and invariants

### Tasks

- [ ] Define static `EventCycle`, `EventPattern`, and event/rest/continuation steps.
- [ ] Keep random cycles as a separate variant rather than expression nodes.
- [ ] Enforce nonempty event groups and configured limits.
- [ ] Preserve explicit silent patterns and simultaneous voice order.
- [ ] Do not add `valueMode` or scalar classification metadata.

### Likely files

- `packages/patterns/src/event-cycle.ts` — **new, suggested**
- `packages/patterns/src/event-cycle.test.ts` — **new, suggested**
- `packages/patterns/src/types.ts`
- `packages/patterns/src/index.ts`
- `packages/patterns/src/utils/cycle-limits.ts`

### Verification

- [ ] Run event-cycle tests and package type checking.
- [ ] Confirm static cycles express events, explicit rests, continuations, and silent bars.

## Step 3.3 — Add exact geometry and the shared evaluator

### Work

Evaluate typed expressions into event cycles. Initially support the structure required by existing structured input: explicit bars, values, rests, sequences, and polyphony. Leave shorthand-only operators to PR 10 while defining their node contract now.

### Tasks

- [ ] Add normalized rational arithmetic and overflow checks.
- [ ] Decode equal structural allocation into the smallest bounded step grid.
- [ ] Derive offsets and durations from step indexes and continuation runs.
- [ ] Evaluate explicit bars, sequences, rests, and simultaneous groups.
- [ ] Accept an atom interpreter callback; use identity interpretation for typed structured atoms.
- [ ] Reject excessive denominators, steps, voices, or cycles rather than rounding.
- [ ] Keep evaluation pure and immutable.

### Likely files

- `packages/patterns/src/evaluate-pattern-expression.ts` — **new, suggested**
- `packages/patterns/src/evaluate-pattern-expression.test.ts` — **new, suggested**
- `packages/patterns/src/utils/rational.ts` — **new, suggested**
- `packages/patterns/src/utils/rational.test.ts` — **new, suggested**
- `packages/patterns/src/utils/event-grid.ts` — **new, suggested**
- `packages/patterns/src/utils/event-grid.test.ts` — **new, suggested**

### Verification

- [ ] Test exact nested allocation and limit failures.
- [ ] Assert expression inputs are not mutated.

## Step 3.4 — Decode structured inputs into expressions

### Work

Keep consumer dimensions and validation in Fluid, then call the shared evaluator.

### Tasks

- [ ] Decode method arguments as explicit patterns/bars.
- [ ] Decode array entries as sequential children.
- [ ] Decode nested arrays as simultaneous groups.
- [ ] Decode `null` and `undefined` as whole-step rests where allowed.
- [ ] Validate notes, names, variations, and XOX in Fluid.
- [ ] Route typed expressions through `evaluatePatternExpression()`.
- [ ] Route random sources directly to the random event-cycle branch.
- [ ] Test scalar, one-element, sequential, simultaneous, rest, and multi-bar forms.

### Likely files

- `packages/fluid/src/patterns/decode-structured-input.ts` — **new, suggested**
- `packages/fluid/src/patterns/decode-structured-input.test.ts` — **new, suggested**
- `packages/fluid/src/types.ts`
- `packages/fluid/src/utils/validate.ts`
- `packages/patterns/src/pattern-expression.ts`
- `packages/patterns/src/evaluate-pattern-expression.ts`

### Verification

- [ ] Compare evaluated geometry with corrected structured fixtures.
- [ ] Confirm decoder output can be inspected independently in tests.
- [ ] Confirm production instruments remain on the legacy path.

## Step 3.5 — Implement generic event-cycle transforms

### Tasks

- [ ] Implement reverse, acceleration, slowdown, and stretch.
- [ ] Insert slowdown rests without extending gates.
- [ ] Preserve explicit rests versus continuations.
- [ ] Preserve default fallback metadata outside the cycle.
- [ ] Cover silent patterns and multi-bar cycles.
- [ ] Test `60/2`, `[0 2 4 6]/2`, and transform composition.

### Likely files

- `packages/patterns/src/event-cycle-transforms.ts` — **new, suggested**
- `packages/patterns/src/event-cycle-transforms.test.ts` — **new, suggested**
- `packages/patterns/src/utils/reverse.ts`
- `packages/patterns/src/utils/speed.ts`
- `packages/patterns/src/utils/stretch.ts`
- `packages/patterns/src/index.ts`

### Verification

- [ ] Run new and existing pattern-transform tests.
- [ ] Verify all transforms return new immutable data.

## PR 3 completion gate

- [ ] Structured input decodes to the shared expression model and uses one evaluator.
- [ ] Event cycles represent all corrected structured event behavior.
- [ ] Generic transforms preserve exact geometry.
- [ ] Production schema generation remains legacy-backed.

---

# PR 4 — Add the lossless adapter and pure compiler

## Goal

Prove new event state and compilation against the corrected baseline without changing production `getSchema()` calls.

## Step 4.1 — Define immutable event state

### Tasks

- [ ] Define synth and sampler event-state inputs.
- [ ] Define authored event sources containing event cycles.
- [ ] Define default sources containing static timing geometry plus `readonly [T, ...T[]]` fallback groups.
- [ ] Define implicit/explicit timing and chance conditions.
- [ ] Represent root/scale state without legacy class methods.
- [ ] Keep generated sampler timing as an optional compiler override.
- [ ] Keep compiler input readonly.

### Likely files

- `packages/fluid/src/instruments/event-state.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state.test.ts` — **new, suggested**
- `packages/fluid/src/types.ts`

### Verification

- [ ] Type-check synth and sampler fixtures.
- [ ] Confirm state types have no legacy class references or expression trees.

## Step 4.2 — Build the one-way legacy adapter

### Tasks

- [ ] Add read-only legacy snapshots where private state blocks adaptation.
- [ ] Preserve corrected authored pattern geometry.
- [ ] Preserve default intent and nonempty fallback groups.
- [ ] Preserve rests, silent bars, and transformed geometry.
- [ ] Preserve random settings, ranges, maps, segments, and values per bar.
- [ ] Preserve explicit timing, chance, root, and scale state.
- [ ] Keep materialization outside the pure compiler.
- [ ] Assert adapter snapshots directly, independently of schema.

### Likely files

- `packages/fluid/src/instruments/legacy-event-state-adapter.ts` — **new, suggested**
- `packages/fluid/src/instruments/legacy-event-state-adapter.test.ts` — **new, suggested**
- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/patterns/authored-timing.ts`
- `packages/fluid/src/patterns/authored-event-values.ts`
- `packages/fluid/src/instruments/event-state.ts`

### Verification

- [ ] Assert adaptation is deterministic and non-mutating.
- [ ] Verify the compiler imports no legacy class.

## Step 4.3 — Implement static compilation

### Tasks

- [ ] Implement synth implicit versus explicit timing selection.
- [ ] Implement sampler rest priority, density, and tie order.
- [ ] Use default timing only when no stronger timing source exists.
- [ ] Expand cycles to a bounded common length.
- [ ] Apply authored rests by candidate ordinal.
- [ ] Keep continuations ordinal-occupying and transparent externally.
- [ ] Prevent defaults from filtering candidates.
- [ ] Fill surviving hits from default fallback groups.
- [ ] Ensure fallback groups never create hits or activate silent bars.
- [ ] Resolve authored values by final hit index.
- [ ] Emit existing static schema shapes and silent-bar conventions.

### Likely files

- `packages/fluid/src/instruments/event-state-compiler.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state-compiler.test.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state.ts`
- `packages/patterns/src/event-cycle.ts`

### Verification

- [ ] Run focused compiler tests.
- [ ] Assert compiler inputs remain unchanged.
- [ ] Compare complete static output with corrected golden fixtures.

## Step 4.4 — Add random compilation and differential parity

### Tasks

- [ ] Preserve random notes and variations as random schemas.
- [ ] Preserve segments, ranges, maps, integer settings, and values per bar.
- [ ] Preserve random timing as one runtime condition.
- [ ] Apply fixed filtering before runtime chance.
- [ ] Ensure random misses consume no final values.
- [ ] Pass chop/fit timing as a separate override.
- [ ] Compare old/new complete schema output over the fixture matrix.
- [ ] Explain every mismatch rather than hiding differences in the harness.

### Likely files

- `packages/fluid/src/instruments/event-state-compiler.ts`
- `packages/fluid/src/instruments/event-state-compiler.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/instruments/legacy-event-state-adapter.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`

### Verification

- [ ] Run differential synth and sampler fixtures.
- [ ] Confirm production `getSchema()` methods still use the old compiler.

## PR 4 completion gate

- [ ] Adapter snapshots are lossless across corrected legacy state.
- [ ] New compiler output matches the corrected baseline.
- [ ] Legacy effects stay outside the pure compiler.

---

# PR 5 — Cut synth schema compilation over

## Goal

Use the new compiler for synth schema generation while legacy classes remain the authoring source of truth.

## Step 5.1 — Establish the synth cutover gate

### Tasks

- [ ] Cover default and authored notes.
- [ ] Cover static and random notes.
- [ ] Cover explicit and random XOX timing.
- [ ] Cover rests, chords, silent bars, root, and scale.
- [ ] Cover transforms and setter ordering.
- [ ] Assert complete synth schema where useful.

### Likely files

- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/index.test.ts`

### Verification

- [ ] Confirm direct old/new synth parity before wiring changes.

## Step 5.2 — Switch `Synthesizer.getSchema()`

### Tasks

- [ ] Build immutable synth state through the adapter.
- [ ] Compile through the new compiler.
- [ ] Keep legacy classes authoritative for setters and transforms.
- [ ] Remove synth-only schema wiring with no remaining caller.
- [ ] Retain shared helpers still needed by sampler or transform materialization.
- [ ] Retain golden synth fixtures for later PRs.

### Likely files

- `packages/fluid/src/instruments/synthesizer.ts`
- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/legacy-event-state-adapter.ts`
- `packages/fluid/src/instruments/event-state-compiler.ts`
- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`

### Verification

- [ ] Confirm synth production no longer invokes the old schema path.
- [ ] Confirm sampler output is unchanged.

## PR 5 completion gate

- [ ] Synth schema uses the new compiler.
- [ ] Synth authoring still has one legacy source of truth.
- [ ] The adapter remains explicit and temporary.

---

# PR 6 — Cut sampler schema compilation over

## Goal

Use the new compiler for sampler schema generation while legacy classes remain authoring storage.

## Step 6.1 — Complete sampler cutover fixtures

### Tasks

- [ ] Cover every inferred timing owner and tie case.
- [ ] Cover explicit and generated timing overrides.
- [ ] Cover static/random notes and variations.
- [ ] Cover authored rest intersections.
- [ ] Cover default fallback name, note, and variation behavior.
- [ ] Cover voice wrapping and duplicate voices.
- [ ] Cover fit, chop, region, loop, clipping, and direction.
- [ ] Cover missing-name and missing-bank warnings.

### Likely files

- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/instruments/event-state-compiler.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/index.test.ts`

### Verification

- [ ] Confirm direct old/new sampler parity before cutover.

## Step 6.2 — Switch sampler `getSchema()`

### Tasks

- [ ] Build sampler event state through the adapter.
- [ ] Pass generated timing override separately.
- [ ] Preserve optional notes and default variation omission.
- [ ] Preserve resource-warning behavior.
- [ ] Remove old sampler `getSchema()` compilation entry points.
- [ ] Retain only named transform-materialization helpers needed until PR 7.
- [ ] Retain golden sampler fixtures.

### Likely files

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/event-state-compiler.ts`
- `packages/fluid/src/instruments/legacy-event-state-adapter.ts`
- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`

### Verification

- [ ] Confirm sampler `getSchema()` never calls the old schema path.
- [ ] Confirm retained old helpers are transform-only.

## PR 6 completion gate

- [ ] Both instruments compile schema through the new compiler.
- [ ] Legacy classes remain the sole authoring state.
- [ ] Remaining old helpers have named callers and a PR 7 deletion target.

---

# PR 7 — Establish transform ownership and remove old compiler helpers

## Goal

Make every event transform one coordinated operation before introducing mixed native/legacy state.

## Step 7.1 — Expand transform ownership fixtures

### Tasks

- [ ] Cover all event lanes through each transform.
- [ ] Cover setter-before-transform and transform-before-setter order.
- [ ] Cover explicit timing before and after value setters.
- [ ] Cover repeated transforms and chains.
- [ ] Cover generated chop/fit exemptions.
- [ ] Cover authored slowed rests against external timing.
- [ ] Cover default fallback groups under external timing.
- [ ] Define mixed-state expectations for PRs 8 and 9.

### Likely files

- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/patterns/notes.test.ts`
- `packages/fluid/src/patterns/authored-event-values.test.ts`

### Verification

- [ ] Run transform fixtures against current legacy authoring state.

## Step 7.2 — Introduce one transform coordinator

### Tasks

- [ ] Define one transition entry for reverse, fast, slow, and stretch.
- [ ] Select or materialize timing once per operation.
- [ ] Transform each participating cycle exactly once.
- [ ] Preserve default fallback groups while transforming default cycles.
- [ ] Preserve absent sample names and generated timing exemptions.
- [ ] Keep processing parameters outside the coordinator.
- [ ] Route base and sampler transform methods through the coordinator.

### Likely files

- `packages/fluid/src/instruments/event-transform-coordinator.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-transform-coordinator.test.ts` — **new, suggested**
- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/event-state-compiler.ts`
- `packages/fluid/src/instruments/legacy-event-state-adapter.ts`

### Verification

- [ ] Confirm each public transform has one transition entry.
- [ ] Confirm no lane is transformed through both base and subclass paths.

## Step 7.3 — Delete superseded compiler helpers

### Tasks

- [ ] Route transform timing selection through new pure logic.
- [ ] Remove compilation from `AuthoredPitches`.
- [ ] Remove old note/sampler compilation and timing selectors when unreferenced.
- [ ] Remove obsolete types and exports.
- [ ] Use golden fixtures after deletion.
- [ ] Keep the adapter as the only legacy bridge.

### Likely files

- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/event-state-compiler.ts`
- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`
- compiler test files

### Verification

- [ ] Use `rg` to confirm deleted symbols have no callers.
- [ ] Run golden schema fixtures against the sole compiler.
- [ ] Confirm the compiler has no legacy imports.

## PR 7 completion gate

- [ ] Compilation and transform timing selection use new pure logic.
- [ ] Every transform coordinates cycles exactly once.
- [ ] Old compiler implementations are deleted.

---

# PR 8 — Migrate common notes and timing to native state

## Goal

Replace shared `Instrument` note and timing authoring storage while sampler names and variations remain temporarily legacy-backed.

## Step 8.1 — Add native state transitions

### Tasks

- [ ] Construct default synth/sampler note sources with nonempty fallback groups.
- [ ] Construct implicit timing state.
- [ ] Decode and evaluate `.notes()` structured input.
- [ ] Decode fixed/random `.xox()` input.
- [ ] Preserve `.hex()`, `.euclid()`, and `.sequence()` compatibility.
- [ ] Make every setter replacement authored.
- [ ] Store root/scale state without changing cycle geometry.
- [ ] Add pure transition tests.

### Likely files

- `packages/fluid/src/instruments/event-state.ts`
- `packages/fluid/src/instruments/event-state-transitions.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state-transitions.test.ts` — **new, suggested**
- `packages/fluid/src/patterns/decode-structured-input.ts`
- `packages/fluid/src/patterns/authored-timing.ts`, for compatibility reference only

### Verification

- [ ] Confirm setters replace only their target source.
- [ ] Confirm equal-value setters change default intent to authored.

## Step 8.2 — Move `Instrument` to native notes/timing

### Tasks

- [ ] Replace constructor initialization.
- [ ] Route notes, root, scale, XOX, hex, Euclid, and sequence through native transitions.
- [ ] Route common transforms through event-cycle transforms.
- [ ] Preserve fluent signatures and call order.
- [ ] Remove the synth legacy adapter.
- [ ] Adapt only remaining sampler legacy lanes.
- [ ] Ensure mixed state has one timing-selection source.

### Likely files

- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/synthesizer.ts`
- `packages/fluid/src/instruments/sampler.ts`
- event state, transition, coordinator, adapter, and type files

### Verification

- [ ] Run synth golden fixtures.
- [ ] Run sampler mixed-state fixtures.
- [ ] Confirm synth production has no legacy authoring dependency.

## Step 8.3 — Remove dead common wrappers

### Tasks

- [ ] Remove `AuthoredPitches` when no remaining adapter needs it.
- [ ] Remove `AuthoredTiming` when rhythm helpers have moved.
- [ ] Move useful pure generators to named utilities.
- [ ] Replace wrapper-detail tests with transition/golden coverage.

### Likely files

- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/patterns/authored-timing.ts`
- corresponding tests
- `packages/fluid/src/instruments/legacy-event-state-adapter.ts`

### Verification

- [ ] Use `rg` to confirm removed wrappers have no production imports.
- [ ] Run Fluid and patterns suites.

## PR 8 completion gate

- [ ] Synth authoring and compilation are native end to end.
- [ ] Sampler notes and timing are native.
- [ ] Remaining adapter responsibility is explicitly limited.

---

# PR 9 — Migrate sampler names and variations

## Goal

Complete structured-input migration and remove the temporary bridge.

## Step 9.1 — Move names and variations to native sources

### Tasks

- [ ] Decode and evaluate `.name()` structured input.
- [ ] Decode and evaluate `.variation()` / `.var()` structured input.
- [ ] Preserve default fallback groups and authored setter intent.
- [ ] Preserve random variation settings.
- [ ] Update warning logic to enumerate static names from native cycles/fallbacks.
- [ ] Add pure transition tests.

### Likely files

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/event-state.ts`
- `packages/fluid/src/instruments/event-state-transitions.ts`
- `packages/fluid/src/patterns/decode-structured-input.ts`
- `packages/fluid/src/utils/sample-utils.ts`
- `packages/fluid/src/types.ts`

### Verification

- [ ] Run sampler golden, random variation, and warning tests.

## Step 9.2 — Make sampler transforms fully native

### Tasks

- [ ] Transform notes, timing, names, and variations exactly once.
- [ ] Preserve authored rest filtering.
- [ ] Preserve default fallback groups.
- [ ] Preserve timing materialization and generated timing exemptions.
- [ ] Remove legacy coordinator callbacks.
- [ ] Retain call-order fixtures unchanged.

### Likely files

- transform coordinator, state transitions, sampler, instrument, and related tests

### Verification

- [ ] Confirm no legacy lane is invoked by a public transform.
- [ ] Run all transform and sampler fixtures.

## Step 9.3 — Delete adapters and obsolete infrastructure

### Tasks

- [ ] Delete the legacy event-state adapter.
- [ ] Delete unused authored wrappers.
- [ ] Delete or narrow `MaskedCycle` when no production path needs it.
- [ ] Remove duplicate timing, availability, and materialization helpers.
- [ ] Remove obsolete exports and wrapper-detail tests.
- [ ] Leave processing `Parameter` and unrelated classes untouched.

### Likely files

- `packages/fluid/src/instruments/legacy-event-state-adapter.ts`
- `packages/fluid/src/patterns/authored-event-values.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/patterns/authored-timing.ts`
- `packages/patterns/src/masked-cycle.ts`
- related tests and indexes

### Verification

- [ ] Use `rg` for removed class and adapter names.
- [ ] Run the complete repository suite.
- [ ] Confirm structured inputs still match golden fixtures.
- [ ] Confirm no shorthand public API is connected yet.

## PR 9 completion gate

- [ ] Structured event input uses expressions, evaluation, native state, and the new compiler end to end.
- [ ] No temporary adapter or dual representation remains.

---

# PR 10 — Add shorthand parsing and shorthand-only expression evaluation

## Goal

Parse shorthand directly into the shared expression model and extend the existing evaluator with shorthand-only structures and operators.

## Step 10.1 — Add source-aware lexer and parser

### Tasks

- [ ] Tokenize atoms, delimiters, rests, and postfix modifiers.
- [ ] Treat spaces, tabs, and newlines as equivalent separators.
- [ ] Preserve atom and modifier amount lexemes as strings.
- [ ] Populate source ranges on every parsed expression node.
- [ ] Parse directly into `PatternExpression<string>`.
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
- [ ] Confirm parsing performs no target-specific atom interpretation.

## Step 10.2 — Enforce grouping and polyphony grammar

### Tasks

- [ ] Parse nested square groups and alternation.
- [ ] Distinguish sequential and simultaneous square groups.
- [ ] Reject `[0 1,2]` and `[0,1 2]`.
- [ ] Reject rests as simultaneous voices.
- [ ] Preserve voice order and duplicates.
- [ ] Parse postfix chains in written order.

### Likely files

- shorthand parser and tests
- `packages/patterns/src/pattern-expression.ts`

### Verification

- [ ] Cover every syntax and invalid-form example in `spec.md`.

## Step 10.3 — Extend the shared evaluator

### Tasks

- [ ] Evaluate groups inside parent allocations.
- [ ] Evaluate deterministic and nested alternation.
- [ ] Evaluate structural repetition `!`.
- [ ] Evaluate acceleration `*` and slowdown `/`.
- [ ] Combine uninterrupted speed chains as one exact rational rate.
- [ ] Evaluate sequence weighting with continuations.
- [ ] Evaluate alternation weighting as whole-bar selection frequency with retriggers.
- [ ] Preserve written operator order.
- [ ] Test `60/2 1` exactly.
- [ ] Test `<0@2 2 3>*2` as `[0, 0]` and `[2, 3]`.

### Likely files

- `packages/patterns/src/evaluate-pattern-expression.ts`
- `packages/patterns/src/evaluate-pattern-expression.test.ts`
- rational/grid helpers

### Verification

- [ ] Verify speed cancellation includes durations.
- [ ] Verify weighted alternation retriggers rather than sustains.
- [ ] Verify no second evaluator was introduced.

## PR 10 completion gate

- [ ] Shorthand parses directly into `PatternExpression<string>`.
- [ ] The shared evaluator handles structured and shorthand structures.
- [ ] Parser behavior remains target-independent.
- [ ] No Fluid public method accepts shorthand yet.

---

# PR 11 — Add atom interpretation and prove equivalence

## Goal

Interpret shorthand atoms during shared evaluation without constructing an intermediate converted expression.

## Step 11.1 — Define consumer atom interpreters

### Tasks

- [ ] Define a callback contract that receives atom text and source range.
- [ ] Let callbacks return an event value/group or rest interpretation.
- [ ] Parse notes and variations as strict finite numbers.
- [ ] Preserve signed and fractional values.
- [ ] Validate sample names without constructor `name:variation` behavior.
- [ ] Map XOX onset/rest atoms and reject polyphony.
- [ ] Include target method and source range in interpretation errors.
- [ ] Keep structural geometry inside the evaluator.

### Likely files

- `packages/fluid/src/patterns/atom-interpreters.ts` — **new, suggested**
- `packages/fluid/src/patterns/atom-interpreters.test.ts` — **new, suggested**
- `packages/patterns/src/evaluate-pattern-expression.ts`
- `packages/fluid/src/utils/sample-utils.ts`
- `packages/fluid/src/utils/validate.ts`
- `packages/fluid/src/types.ts`

### Verification

- [ ] Confirm interpretation occurs leaf-by-leaf during evaluation.
- [ ] Confirm no converted expression copy is created.

## Step 11.2 — Preserve legacy compact XOX

### Work

Treat compact XOX as a consumer compatibility frontend that produces the same expression model, not as generic parser behavior.

### Tasks

- [ ] Recognize compact `x`, `o`, `.`, and whitespace sources for direct strings.
- [ ] Apply the same compatibility decoding to `Shorthand.source` when consumed by `.xox()`.
- [ ] Build a `PatternExpression<string>` representing individual XOX positions.
- [ ] Evaluate it through the same XOX atom interpreter.
- [ ] Keep generic parser/evaluator free of XOX-specific rules.

### Likely files

- `packages/fluid/src/patterns/decode-xox-input.ts` — **new, suggested**
- `packages/fluid/src/patterns/decode-xox-input.test.ts` — **new, suggested**
- atom interpreter files

### Verification

- [ ] Compare direct compact strings and reusable shorthand sources.
- [ ] Confirm general shorthand still uses the generic parser.

## Step 11.3 — Prove structured/shorthand equivalence

### Tasks

- [ ] Compare equivalent decoded/parsed expression structures where applicable.
- [ ] Compare evaluated event cycles for atoms, rests, sequences, and chords.
- [ ] Compare `"1!2"` with `[1, 1]`.
- [ ] Compare `"1/2"` with scalar input followed by `.slow(2)`.
- [ ] Compare weighted shorthand continuation steps and durations.
- [ ] Compare alternation over its complete finite period.
- [ ] Verify continuations occupy external ordinals without suppressing candidates.
- [ ] Verify authored rests suppress candidates.
- [ ] Compare final schema output for each supported consumer.

### Likely files

- `packages/fluid/src/patterns/atom-interpreters.test.ts`
- `packages/fluid/src/patterns/decode-structured-input.test.ts`
- `packages/fluid/src/instruments/event-state-compiler.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/patterns/src/evaluate-pattern-expression.test.ts`

### Verification

- [ ] Run patterns and Fluid suites.
- [ ] Confirm comparisons include geometry, rests, continuations, and final schema.

## PR 11 completion gate

- [ ] Shorthand text atoms evaluate to typed event cycles through consumer callbacks.
- [ ] No separate lowering tree exists.
- [ ] Structured and shorthand equivalents compile identically.
- [ ] Public Fluid method dispatch remains unchanged.

---

# PR 12 — Wire up the public shorthand API

## Goal

Expose immutable reusable shorthand values and direct-string dispatch for all supported consumers.

## Step 12.1 — Add shorthand construction and exports

### Tasks

- [ ] Define `Shorthand` with `source` and `expression: PatternExpression<string>`.
- [ ] Parse eagerly in `d.shorthand()` and `d.sh()`.
- [ ] Freeze the wrapper and parsed expression recursively.
- [ ] Export `Shorthand`, `PatternExpression`, and supporting node types.
- [ ] Keep parsed data enumerable and inspectable.
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
- [ ] Confirm no avoidable explicit return types are added.

## Step 12.2 — Add argument dispatch and consumers

### Tasks

- [ ] Dispatch one string, one `Shorthand`, or structured arguments.
- [ ] Require a `Shorthand` value to be the sole argument.
- [ ] Add shorthand to `.notes()`, `.name()`, `.variation()` / `.var()`, and `.xox()`.
- [ ] Evaluate parsed expressions with the relevant atom interpreter.
- [ ] Preserve legacy compact XOX compatibility.
- [ ] Preserve multiple structured string arguments under existing dispatch rules.
- [ ] Test direct strings and `d.sh()` through the same parser/evaluator path.

### Likely files

- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/sampler.ts`
- event-state transitions, structured decoder, XOX decoder, atom interpreters, and Fluid types/tests

### Verification

- [ ] Run consumer tests for all supported methods.
- [ ] Run retained structured-input golden fixtures unchanged.

## Step 12.3 — Enforce sample alias rules

### Tasks

- [ ] Restrict aliases to `[A-Za-z0-9]+` in names and bank keys.
- [ ] Reject `:` in structured and shorthand `.name()` input.
- [ ] Preserve `d.sample("bd:2")` constructor behavior.
- [ ] Reject combined selectors in `.name()`.
- [ ] Preserve unrestricted URLs.
- [ ] Add direct schema validation coverage.
- [ ] Add focused migration errors.

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
- [ ] Verify constructor shorthand and `.name()` intentionally differ only as specified.

## Step 12.4 — Complete end-to-end tests and documentation

### Tasks

- [ ] Add public examples for every supported consumer.
- [ ] Add malformed syntax, invalid target, and expansion-limit errors.
- [ ] Add exact slowdown, cancellation, weighting, alternation, and continuation tests.
- [ ] Document reusable `d.sh()` and direct strings.
- [ ] Document authored patterns versus default fallbacks.
- [ ] Document sample-name restrictions and intentional changes.
- [ ] Verify schema and engine contain no shorthand/expression concepts.
- [ ] Remove temporary exports and migration comments.

### Likely files

- `packages/fluid/README.md`
- `docs/concepts/patterns.md`
- `packages/patterns/README.md`
- public API, compiler, evaluator, parser, and decoder tests
- `plans/shorthand-syntax/syntax-examples.md`

### Verification

- [ ] Run the complete repository suite.
- [ ] Review public exports and generated declarations.
- [ ] Confirm no obsolete wrappers, adapters, or compiler symbols remain without a documented role.

## PR 12 completion gate

- [ ] Supported consumers accept direct strings and reusable shorthand values.
- [ ] Parsed `PatternExpression<string>` data is typed, immutable, enumerable, and inspectable.
- [ ] Structured and shorthand inputs share one expression model and evaluator.
- [ ] Instrument state retains only event cycles.
- [ ] Compatibility changes are documented and tested.
- [ ] No shorthand concept leaked into schema or audio engine.

---

# Global review checklist

- [ ] Each PR has one primary architectural or behavioral purpose.
- [ ] Behavior changes are not hidden inside refactors.
- [ ] Every abstraction has focused unit tests.
- [ ] Complete schema fixtures cover production cutovers.
- [ ] Each lane has one authoritative state representation.
- [ ] Expressions remain at the input boundary.
- [ ] The compiler and transitions do not import superseded classes.
- [ ] Temporary dependencies have a named deletion PR.
- [ ] Limits fail explicitly rather than truncating or rounding.
- [ ] Processing parameters remain outside event cycles.
- [ ] Type checking, linting, tests, formatting, and `git diff --check` pass.
