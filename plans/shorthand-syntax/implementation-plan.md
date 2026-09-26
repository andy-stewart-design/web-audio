# Shorthand Syntax Detailed Implementation Plan

## Status and companion documents

Proposed implementation plan.

Read this with:

- [`spec.md`](./spec.md) — normative behavior and architecture;
- [`plan-outline.md`](./plan-outline.md) — high-level PR sequence;
- [`pattern-ir-redesign.md`](./pattern-ir-redesign.md) — superseded design history only.

If this plan and the specification disagree, the specification wins.

## Delivery strategy

Migrate at the existing schema boundary. Structured input proves the event-cycle representation and compiler before shorthand is connected to the public API.

Use a one-way strangler migration:

```text
legacy authoring state → temporary adapter → new compiler → existing schema
new authoring state                    → new compiler → existing schema
```

Do not dual-write legacy and new state. During migration, one representation remains authoritative for each lane. The temporary adapter is the only code allowed to depend on both architectures.

The steps below are intended to be reviewable commits or commit-sized units inside each PR. File names marked **new, suggested** may change during implementation, but ownership boundaries should remain intact.

## Verification conventions

Run focused tests after each step. At the end of every PR, run:

```sh
pnpm check
pnpm lint
pnpm test
pnpm format
git diff --check
```

Useful focused commands include:

```sh
pnpm --filter @web-audio/patterns test:ci
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/schema test:ci
```

Do not retain an old compiler solely for differential testing. While both implementations exist, compare them directly. After an old implementation is deleted, use explicit retained golden schema fixtures.

---

# PR 1 — Characterize the existing baseline

## Goal

Create an explicit compatibility baseline without changing production behavior.

## Step 1.1 — Establish schema-level fixture infrastructure

### Work

Create table-driven fixtures that invoke the public Fluid API and assert the complete emitted event-pattern schema. Prefer explicit expected objects over broad snapshots so timing, values, conditions, and silent bars are visible in review.

Separate fixture input construction from assertions so the same cases can later run against old and new compilation paths.

### Tasks

- [ ] Add a dedicated compatibility test file rather than further expanding unrelated tests.
- [ ] Add reusable fixture types and assertion helpers.
- [ ] Capture complete `eventPattern` output, not only selected fields.
- [ ] Ensure fixture descriptions identify the behavior being protected.
- [ ] Confirm this step changes no production files.

### Likely files

- `packages/fluid/src/instruments/event-schema-compatibility.test.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-schema-fixtures.ts` — **new, suggested**, if fixture data warrants a separate file
- `packages/fluid/src/instruments/event-compiler.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/index.test.ts`

### Verification

- [ ] Run the focused Fluid tests.
- [ ] Verify all expectations pass against current behavior.
- [ ] Verify `git diff` contains tests and fixture data only.

## Step 1.2 — Fill out the compatibility matrix

### Work

Add fixtures for every behavior the migration could accidentally change.

### Tasks

- [ ] Cover synth implicit note timing and explicit XOX timing.
- [ ] Cover sampler timing ownership and density tie-breaking.
- [ ] Cover scalar broadcasting versus authored patterned values.
- [ ] Cover fixed rests in notes, names, and variations.
- [ ] Cover random notes, variations, and timing conditions.
- [ ] Cover chords, duplicate voices, and independent lane wrapping.
- [ ] Cover silent bars and multi-bar least-common-multiple expansion.
- [ ] Cover root and scale conversion, including negative scale degrees.
- [ ] Cover `fast`, `slow`, `stretch`, and `reverse` before and after setters.
- [ ] Cover generated chop/fit timing and its transform exemptions.
- [ ] Cover constructor defaults versus authored values.

### Likely files

- `packages/fluid/src/instruments/event-schema-compatibility.test.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-compiler.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/index.test.ts`

### Verification

- [ ] Run the complete Fluid test suite.
- [ ] Review the fixture matrix against the compatibility section of `spec.md`.
- [ ] Confirm there are no production behavior changes.

## PR 1 completion gate

- [ ] The current behavior is represented by explicit passing schema fixtures.
- [ ] All later compatibility work can reference fixture names rather than rediscovering behavior.
- [ ] Candidate-ordinal behavior has not changed yet.

---

# PR 2 — Make intentional candidate-ordinal filtering changes

## Goal

Land the sampler filtering behavior change independently from the architecture migration, making it the corrected baseline.

## Step 2.1 — Add focused expected-behavior tests

### Work

Add tests for candidate-ordinal availability before changing the implementation. Keep expected timing offsets and resolved values explicit.

### Tasks

- [ ] Cover variation rests against four explicit XOX candidates.
- [ ] Cover note rests against explicit XOX candidates.
- [ ] Cover sample-name rests as the already hit-aligned reference behavior.
- [ ] Cover candidate wrapping when lane and timing lengths differ.
- [ ] Cover multi-bar candidate wrapping.
- [ ] Cover intersection of rests from multiple non-owning lanes.
- [ ] Confirm the selected timing owner is not redundantly reapplied as a filter.
- [ ] Add the accepted fixture from the specification: variation `[0, null, 2]` produces hits at `0`, `1/2`, and `3/4` with values `0`, `2`, and `0`.

### Likely files

- `packages/fluid/src/instruments/event-compiler.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/index.test.ts`

### Verification

- [ ] Confirm new tests fail for only the intended offset-based cases before implementation.
- [ ] Confirm unrelated compatibility fixtures remain green.

## Step 2.2 — Change fixed availability to candidate ordinals

### Work

Update sampler note and variation availability to map by active candidate ordinal, matching sample names. Keep random values-per-bar and timing ownership behavior unchanged.

### Tasks

- [ ] Make static note availability hit-aligned.
- [ ] Make static variation availability hit-aligned.
- [ ] Preserve random zero-values-per-bar suppression.
- [ ] Preserve timing-owner exclusion.
- [ ] Preserve fixed filtering before runtime chance.
- [ ] Remove offset-based branches that are no longer used.

### Likely files

- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`, only if availability exposure needs adjustment
- `packages/fluid/src/patterns/authored-event-values.ts`, only if availability exposure needs adjustment

### Verification

- [ ] Run event compiler and compatibility tests.
- [ ] Confirm all PR 1 fixtures still pass except expectations intentionally updated here.
- [ ] Confirm random chance and values-per-bar tests are unchanged.

## Step 2.3 — Promote the corrected fixtures to the baseline

### Work

Update retained fixture expectations and document the behavior change in test names or comments where the old result is non-obvious.

### Tasks

- [ ] Update only the intentional schema expectations.
- [ ] Ensure no architecture types or adapters are introduced.
- [ ] Record the accepted result as the baseline used by PR 4 differential tests.

### Likely files

- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/instruments/event-compiler.test.ts`
- `plans/shorthand-syntax/spec.md`, only if implementation exposes an unresolved ambiguity

### Verification

- [ ] Run the complete repository suite.
- [ ] Review the diff specifically for unrelated schema changes.

## PR 2 completion gate

- [ ] Candidate-ordinal filtering is implemented and independently reviewed.
- [ ] The corrected fixtures are now the compatibility baseline.
- [ ] No event-cycle redesign code has landed in this PR.

---

# PR 3 — Introduce event-cycle primitives

## Goal

Add the canonical internal representation, normalization support, and generic transforms without changing production compilation.

## Step 3.1 — Define event-cycle types and invariants

### Work

Introduce the cycle/pattern/step representation and `valueMode`. Keep timing cycles structurally reusable without forcing value-lane metadata onto timing state.

### Tasks

- [ ] Define `EventStep<T>` with event, rest, and continuation variants.
- [ ] Define `EventPattern<T>` and static cycle types.
- [ ] Define constant and patterned `valueMode`.
- [ ] Define or adapt the random event-cycle variant without flattening random settings into static steps.
- [ ] Add constructors or validators that enforce nonempty event groups and cycle limits.
- [ ] Test explicit silent patterns and simultaneous voice preservation.
- [ ] Export only the package-level internals needed by Fluid; do not expose the IR as a Fluid public API.

### Likely files

- `packages/patterns/src/event-cycle.ts` — **new, suggested**
- `packages/patterns/src/event-cycle.test.ts` — **new, suggested**
- `packages/patterns/src/types.ts`
- `packages/patterns/src/index.ts`
- `packages/patterns/src/utils/cycle-limits.ts`

### Verification

- [ ] Run event-cycle unit tests.
- [ ] Run package type checking.
- [ ] Confirm no Fluid production file uses the new types yet.

## Step 3.2 — Add exact structural geometry helpers

### Work

Add bounded rational helpers for intermediate offsets, widths, speed rates, and normalized equal-step grids. These helpers must avoid floating-point decisions during structural composition.

### Tasks

- [ ] Add normalized rational creation and arithmetic.
- [ ] Add greatest-common-divisor and least-common-multiple helpers with overflow checks.
- [ ] Convert rational event geometry into the smallest bounded equal-step pattern.
- [ ] Derive offsets and durations from final step indexes and continuation runs.
- [ ] Reject excessive denominators, pattern lengths, and expansion instead of rounding.
- [ ] Test nested unequal allocation and exact speed cancellation.

### Likely files

- `packages/patterns/src/utils/rational.ts` — **new, suggested**
- `packages/patterns/src/utils/rational.test.ts` — **new, suggested**
- `packages/patterns/src/utils/event-grid.ts` — **new, suggested**
- `packages/patterns/src/utils/event-grid.test.ts` — **new, suggested**
- `packages/patterns/src/utils/cycle-limits.ts`
- `packages/patterns/src/utils/index.ts`

### Verification

- [ ] Test exact results for representative fractions and nested grids.
- [ ] Test all configured limits and safe-integer failures.
- [ ] Confirm `[0 2]*2/2` can normalize without duration drift at the helper level.

## Step 3.3 — Implement generic event-cycle transforms

### Work

Implement immutable transforms over event cycles. Transform geometry while preserving semantic metadata such as `valueMode` and random settings.

### Tasks

- [ ] Implement reverse.
- [ ] Implement acceleration.
- [ ] Implement slowdown with gap insertion rather than implicit gate extension.
- [ ] Implement stretch using existing compatibility behavior.
- [ ] Preserve constant `valueMode` through every transform.
- [ ] Preserve explicit rests versus continuations.
- [ ] Cover silent patterns and multi-bar cycles.
- [ ] Add exact tests for `60/2`, `[0 2 4 6]/2`, and transform composition.

### Likely files

- `packages/patterns/src/event-cycle-transforms.ts` — **new, suggested**
- `packages/patterns/src/event-cycle-transforms.test.ts` — **new, suggested**
- `packages/patterns/src/event-cycle.ts`
- `packages/patterns/src/utils/reverse.ts`, if shared helpers are reused
- `packages/patterns/src/utils/speed.ts`, if shared helpers are reused
- `packages/patterns/src/utils/stretch.ts`, if shared helpers are reused
- `packages/patterns/src/index.ts`

### Verification

- [ ] Run new transform tests and existing pattern transform tests.
- [ ] Verify all transforms return new immutable data.
- [ ] Verify transformed grids are never used to re-infer `valueMode`.

## Step 3.4 — Add Fluid structured-input normalization

### Work

Add Fluid-owned entry points that convert existing structured method arguments into event cycles while retaining target-specific validation.

### Tasks

- [ ] Normalize method arguments as bars.
- [ ] Normalize array entries as sequential steps.
- [ ] Normalize nested arrays as simultaneous voices.
- [ ] Normalize `null` and `undefined` as whole-step rests where allowed.
- [ ] Classify scalar and one-event groups as constant.
- [ ] Classify authored sequential or multi-bar input as patterned.
- [ ] Preserve random sources as random cycle variants.
- [ ] Keep note, name, variation, and XOX validation in Fluid.
- [ ] Test `.var(1)`, `.var([1])`, `.var([[1, 2]])`, and `.var([1, 2])` classification.

### Likely files

- `packages/fluid/src/patterns/normalize-structured-input.ts` — **new, suggested**
- `packages/fluid/src/patterns/normalize-structured-input.test.ts` — **new, suggested**
- `packages/fluid/src/types.ts`
- `packages/fluid/src/utils/validate.ts`
- `packages/patterns/src/event-cycle.ts`

### Verification

- [ ] Run structured-normalization tests.
- [ ] Compare normalized geometry to existing structured input fixtures.
- [ ] Confirm normalization is not connected to `Instrument` or `Sampler` yet.

## PR 3 completion gate

- [ ] Event cycles can represent all existing structured event inputs.
- [ ] Generic transforms preserve `valueMode` and exact geometry.
- [ ] Fluid owns consumer validation and structured argument semantics.
- [ ] Production schema generation remains on the legacy path.

---

# PR 4 — Add the lossless adapter and pure compiler

## Goal

Prove the new state and compiler against the corrected baseline without changing production `getSchema()` calls.

## Step 4.1 — Define immutable event state and compiler contracts

### Work

Define synth and sampler event-state inputs, timing overrides, pitch conversion state, and compiler output contracts. Keep generated sampler timing outside stored authoring state.

### Tasks

- [ ] Define `SynthEventState` and `SamplerEventState`.
- [ ] Define static/random event sources with colocated authored intent.
- [ ] Define implicit/explicit timing state and chance conditions.
- [ ] Represent root and scale conversion without depending on `AuthoredPitches` methods.
- [ ] Define generated timing as an optional compiler override.
- [ ] Keep state readonly at the compiler boundary.

### Likely files

- `packages/fluid/src/instruments/event-state.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state.test.ts` — **new, suggested**, if constructors enforce invariants
- `packages/fluid/src/types.ts`

### Verification

- [ ] Type-check state construction for synth and sampler fixtures.
- [ ] Confirm state types contain no legacy class references.

## Step 4.2 — Build and test the one-way legacy adapter

### Work

Convert legacy authoring objects into immutable event state. Adapt source state directly; do not reconstruct it from compiled schema.

### Tasks

- [ ] Add read-only legacy snapshot methods where private state prevents lossless adaptation.
- [ ] Preserve scalar broadcasting as constant `valueMode`.
- [ ] Preserve default versus authored intent.
- [ ] Preserve static rests, silent bars, and transformed geometry.
- [ ] Preserve random settings, ranges, maps, segments, and values per bar.
- [ ] Preserve explicit timing and chance conditions.
- [ ] Preserve root and scale state.
- [ ] Keep any legacy materialization outside the pure compiler.
- [ ] Add direct adapter-state assertions independent of schema output.

### Likely files

- `packages/fluid/src/instruments/legacy-event-state-adapter.ts` — **new, suggested**
- `packages/fluid/src/instruments/legacy-event-state-adapter.test.ts` — **new, suggested**
- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/patterns/authored-timing.ts`
- `packages/fluid/src/patterns/authored-event-values.ts`
- `packages/fluid/src/instruments/event-state.ts`

### Verification

- [ ] Run adapter tests covering every legacy source variant.
- [ ] Assert adapter calls are deterministic and do not mutate legacy state.
- [ ] Verify no new compiler file imports a legacy class.

## Step 4.3 — Implement static timing selection and compilation

### Work

Implement the pure static compiler against event state: timing ownership, common-cycle expansion, availability, hit renumbering, value resolution, pitch conversion, and schema emission.

### Tasks

- [ ] Implement synth implicit versus explicit timing selection.
- [ ] Implement sampler rest priority, density comparison, and tie order.
- [ ] Expand participating cycles to a bounded common length.
- [ ] Apply patterned rests by candidate ordinal.
- [ ] Treat continuations as ordinal-occupying but externally transparent.
- [ ] Broadcast constant value groups under externally owned timing.
- [ ] Avoid reapplying the selected timing owner as a filter.
- [ ] Resolve surviving values by final hit index.
- [ ] Emit existing static note, name, variation, and timing schema shapes.
- [ ] Preserve explicit silent-bar schema conventions.

### Likely files

- `packages/fluid/src/instruments/event-state-compiler.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state-compiler.test.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state.ts`
- `packages/patterns/src/event-cycle.ts`
- `packages/schema/src/index.ts`, types only if imports need clarification; schema shape should not change

### Verification

- [ ] Run focused static compiler tests.
- [ ] Assert compiler inputs are not mutated.
- [ ] Compare static results with corrected golden fixtures.

## Step 4.4 — Add random compilation and differential parity

### Work

Complete random source handling and run both compilation implementations over the compatibility matrix while both exist.

### Tasks

- [ ] Compile random notes and variations without converting them to static steps.
- [ ] Preserve random segments, ranges, maps, integer settings, and values per bar.
- [ ] Preserve random timing as one runtime condition.
- [ ] Ensure fixed filtering occurs before runtime chance.
- [ ] Ensure random misses consume no final values.
- [ ] Pass generated chop/fit timing into the compiler as an override.
- [ ] Add a differential harness that compares complete old/new schema output.
- [ ] Isolate and explain every mismatch; do not normalize away meaningful differences in the test harness.

### Likely files

- `packages/fluid/src/instruments/event-state-compiler.ts`
- `packages/fluid/src/instruments/event-state-compiler.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/instruments/legacy-event-state-adapter.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`, only if override construction needs a pure boundary

### Verification

- [ ] Run old/new differential fixtures for synth and sampler.
- [ ] Run random-pattern and sampler utility tests.
- [ ] Confirm no production `getSchema()` method calls the new compiler yet.

## PR 4 completion gate

- [ ] Adapter snapshots are lossless across the legacy domain.
- [ ] New compiler output matches the corrected baseline.
- [ ] Legacy side effects do not occur inside the compiler.
- [ ] Production still uses the old compiler.

---

# PR 5 — Cut synth schema compilation over

## Goal

Use the new compiler for synth schema generation while legacy classes remain the synth authoring source of truth.

## Step 5.1 — Add synth cutover tests

### Work

Turn the synth portion of the differential matrix into a production-cutover gate.

### Tasks

- [ ] Cover default notes and authored notes.
- [ ] Cover static and random notes.
- [ ] Cover explicit and random XOX timing.
- [ ] Cover rests, chords, silent bars, root, and scale.
- [ ] Cover all event transforms and setter ordering.
- [ ] Assert complete `SynthesizerSchema` output where useful, not only `eventPattern`.

### Likely files

- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/index.test.ts`

### Verification

- [ ] Confirm direct old/new synth parity before changing production wiring.

## Step 5.2 — Switch `Synthesizer.getSchema()`

### Work

Adapt legacy synth state at schema time and compile it with the new compiler.

### Tasks

- [ ] Replace `_getPitchEventPattern()` usage in `Synthesizer.getSchema()`.
- [ ] Build an immutable `SynthEventState` through the adapter.
- [ ] Compile through the new compiler.
- [ ] Keep notes, timing, root, scale, and transforms authored by legacy classes.
- [ ] Remove synth-only schema helpers that have no sampler or transform callers.
- [ ] Do not remove shared legacy note compilation utilities still required by sampler compilation or transform materialization.

### Likely files

- `packages/fluid/src/instruments/synthesizer.ts`
- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/legacy-event-state-adapter.ts`
- `packages/fluid/src/instruments/event-state-compiler.ts`
- `packages/fluid/src/instruments/event-compiler.ts`, only for now-dead synth-only exports
- `packages/fluid/src/patterns/authored-pitches.ts`, only for removed dead calls

### Verification

- [ ] Run all synth and compatibility tests.
- [ ] Confirm synth production no longer invokes the old schema compiler.
- [ ] Confirm sampler behavior is unchanged.
- [ ] Retain golden synth fixtures for later PRs.

## PR 5 completion gate

- [ ] Synth schema compilation uses the new compiler.
- [ ] Synth setters and transforms still have one authoritative legacy state.
- [ ] The synth adapter remains temporary and explicit.
- [ ] Shared legacy helpers needed by sampler or transforms have not been prematurely deleted.

---

# PR 6 — Cut sampler schema compilation over

## Goal

Use the new compiler for sampler schema generation while legacy classes remain authoring storage.

## Step 6.1 — Complete sampler cutover fixtures

### Work

Require parity for the full sampler interaction matrix before production wiring changes.

### Tasks

- [ ] Cover each inferred timing owner and tie case.
- [ ] Cover explicit timing and generated timing overrides.
- [ ] Cover static and random notes and variations.
- [ ] Cover sample-name, note, and variation rests and intersections.
- [ ] Cover default versus authored intent.
- [ ] Cover longest-group voice wrapping and duplicate voices.
- [ ] Cover fit, chop, region, loop, clipping, and direction to ensure event changes do not disturb adjacent schema.
- [ ] Cover missing-name and missing-bank warning inputs.

### Likely files

- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/instruments/event-state-compiler.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/index.test.ts`

### Verification

- [ ] Confirm direct old/new sampler parity before cutover.

## Step 6.2 — Switch sampler `getSchema()`

### Work

Build sampler event state through the adapter, pass any generated timing override separately, and compile with the new compiler.

### Tasks

- [ ] Replace `_getEventPattern()` with adapter plus new compiler.
- [ ] Keep `_getTimingOverride()` as the generated timing source.
- [ ] Ensure generated timing is not persisted into authored state.
- [ ] Preserve optional notes and default variation omission.
- [ ] Preserve sample-resource warning behavior.
- [ ] Remove old sampler schema compilation entry points no longer used by `getSchema()`.
- [ ] Temporarily retain only legacy timing/materialization helpers still required by transform methods; mark their remaining callers explicitly.

### Likely files

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/event-state-compiler.ts`
- `packages/fluid/src/instruments/legacy-event-state-adapter.ts`
- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`

### Verification

- [ ] Run sampler, compiler, compatibility, and sampler utility tests.
- [ ] Confirm sampler `getSchema()` never calls the old schema path.
- [ ] Confirm retained old helpers are reachable only from transform materialization, not schema generation.
- [ ] Retain golden sampler fixtures for later PRs.

## PR 6 completion gate

- [ ] Both synth and sampler schema generation use the new compiler.
- [ ] Legacy classes remain the sole authoring state.
- [ ] Any remaining old compiler helpers have named transform-only callers and a deletion target in PR 7.

---

# PR 7 — Establish transform ownership and remove old compilation helpers

## Goal

Make every event transform a single coordinated operation before introducing mixed legacy/new authoring state.

## Step 7.1 — Add transform ownership and call-order fixtures

### Work

Expand tests around materialization and lane coordination. Test observable results rather than implementation call counts unless a narrow unit seam makes exact call assertions valuable.

### Tasks

- [ ] Cover notes, timing, names, and variations through every transform.
- [ ] Cover setter-before-transform and transform-before-setter ordering.
- [ ] Cover explicit timing before and after value setters.
- [ ] Cover generated chop/fit timing exemptions.
- [ ] Cover repeated transforms and transform chains.
- [ ] Cover constant `valueMode` behavior expected after state migration.
- [ ] Add mixed-state expectations that PRs 8 and 9 must preserve.

### Likely files

- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/patterns/notes.test.ts`
- `packages/fluid/src/patterns/authored-event-values.test.ts`

### Verification

- [ ] Run all transform-focused fixtures against current legacy authoring state.

## Step 7.2 — Introduce one transform coordinator

### Work

Centralize timing selection/materialization and lane transformation. The coordinator must own the operation even while its lane implementations are still legacy-backed.

### Tasks

- [ ] Define one operation for reverse, fast, slow, and stretch transitions.
- [ ] Select or materialize timing once per transform when required.
- [ ] Apply the transform to each participating lane exactly once.
- [ ] Preserve absent sample-name behavior.
- [ ] Preserve generated timing exemptions.
- [ ] Keep processing parameters outside the coordinator.
- [ ] Route `Instrument` and `Sampler` transform methods through the coordinator.

### Likely files

- `packages/fluid/src/instruments/event-transform-coordinator.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-transform-coordinator.test.ts` — **new, suggested**
- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/event-state-compiler.ts`, if timing selection is exposed as a pure helper
- `packages/fluid/src/instruments/legacy-event-state-adapter.ts`

### Verification

- [ ] Run call-order and complete compatibility fixtures.
- [ ] Verify each public transform has a single state-transition entry point.
- [ ] Verify no lane is transformed twice through base and subclass methods.

## Step 7.3 — Remove superseded compiler helpers

### Work

Route transform timing selection through the new pure selection logic, then delete the remaining old compiler dependencies. Rename the new compiler only if doing so improves clarity without obscuring history.

### Tasks

- [ ] Remove transform calls to legacy schema compilation.
- [ ] Remove `AuthoredPitches.getEventPattern()` or narrow it to non-compilation state access.
- [ ] Remove old `compileNoteEvents`, `compileSamplerEvents`, and timing-selection helpers when unreferenced.
- [ ] Remove obsolete compiler types and exports.
- [ ] Retain golden fixtures rather than retaining old code for comparison.
- [ ] Confirm the adapter remains the only bridge to legacy authoring state.

### Likely files

- `packages/fluid/src/instruments/event-compiler.ts`
- `packages/fluid/src/instruments/event-state-compiler.ts`
- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/instruments/event-compiler.test.ts`
- `packages/fluid/src/instruments/event-state-compiler.test.ts`

### Verification

- [ ] Use `rg` to confirm deleted symbols have no callers.
- [ ] Run golden schema fixtures against the sole remaining compiler.
- [ ] Confirm the new compiler has no legacy imports.

## PR 7 completion gate

- [ ] Schema compilation and transform timing selection use the new pure logic.
- [ ] Every transform coordinates lanes exactly once.
- [ ] Old compiler implementations are deleted.
- [ ] Golden fixtures are now the parity authority.

---

# PR 8 — Migrate common notes and timing to native event state

## Goal

Replace shared `Instrument` note and timing authoring storage while sampler names and variations may remain temporarily legacy-backed.

## Step 8.1 — Add native state constructors and setters

### Work

Create immutable state-transition helpers for default construction, note replacement, timing replacement, and root/scale updates.

### Tasks

- [ ] Construct default synth and sampler note sources with explicit intent.
- [ ] Construct implicit timing state.
- [ ] Normalize `.notes()` through `normalizeStructuredInput()`.
- [ ] Normalize fixed and random `.xox()` inputs into timing state.
- [ ] Preserve `.hex()`, `.euclid()`, and `.sequence()` compatibility while keeping them outside shorthand v1.
- [ ] Replace note setters without retroactively applying earlier transforms.
- [ ] Store root and scale conversion state without mutating cycle geometry.
- [ ] Add pure transition tests.

### Likely files

- `packages/fluid/src/instruments/event-state.ts`
- `packages/fluid/src/instruments/event-state-transitions.ts` — **new, suggested**
- `packages/fluid/src/instruments/event-state-transitions.test.ts` — **new, suggested**
- `packages/fluid/src/patterns/normalize-structured-input.ts`
- `packages/fluid/src/patterns/authored-timing.ts`, for compatibility reference or narrowed generated-pattern helpers

### Verification

- [ ] Run transition tests independent of instrument classes.
- [ ] Confirm setters replace only their target source.

## Step 8.2 — Move `Instrument` to native note/timing state

### Work

Replace `_pitches` and `_timing` with native event state for both synths and samplers. Keep remaining sampler legacy lanes clearly separated.

### Tasks

- [ ] Replace constructor initialization.
- [ ] Route notes, root, scale, XOX, hex, Euclid, and sequence methods to native transitions.
- [ ] Route common transforms to native event-cycle transforms.
- [ ] Preserve fluent return values and public method signatures.
- [ ] Remove the synth legacy adapter.
- [ ] Adapt only remaining sampler legacy lanes at compilation time.
- [ ] Ensure mixed state has one timing-selection source.

### Likely files

- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/synthesizer.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/event-state.ts`
- `packages/fluid/src/instruments/event-state-transitions.ts`
- `packages/fluid/src/instruments/event-transform-coordinator.ts`
- `packages/fluid/src/instruments/legacy-event-state-adapter.ts`
- `packages/fluid/src/types.ts`

### Verification

- [ ] Run synth golden fixtures.
- [ ] Run sampler mixed-state fixtures.
- [ ] Verify transforms touch native notes/timing and legacy names/variation exactly once.
- [ ] Verify synth production has no legacy authoring dependency.

## Step 8.3 — Remove dead common legacy state

### Work

Delete or narrow common authored classes only as far as remaining sampler code allows.

### Tasks

- [ ] Remove `AuthoredPitches` if no remaining sampler adapter needs it.
- [ ] Remove `AuthoredTiming` if rhythm helper functionality has moved.
- [ ] Move any still-useful pure pattern generators to appropriately named utilities.
- [ ] Delete tests that only assert removed wrapper implementation details.
- [ ] Preserve equivalent behavior in transition and golden tests.

### Likely files

- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/patterns/authored-timing.ts`
- `packages/fluid/src/patterns/authored-timing.test.ts`
- `packages/fluid/src/patterns/notes.test.ts`
- `packages/fluid/src/instruments/legacy-event-state-adapter.ts`
- `packages/fluid/src/instruments/instrument.ts`

### Verification

- [ ] Use `rg` to confirm removed classes have no production imports.
- [ ] Run complete Fluid and patterns tests.

## PR 8 completion gate

- [ ] Synth authoring and compilation use native event state end to end.
- [ ] Common sampler notes and timing are native.
- [ ] Any remaining adapter handles only explicitly listed sampler lanes.
- [ ] Mixed-state transform fixtures pass.

---

# PR 9 — Migrate sampler names and variations, then remove legacy infrastructure

## Goal

Complete structured-input migration and delete the temporary bridge.

## Step 9.1 — Move names and variations to native sources

### Work

Replace `AuthoredEventValues` with native static/random event sources and Fluid-owned normalization.

### Tasks

- [ ] Normalize `.name()` structured input with sample-name validation.
- [ ] Normalize `.variation()` and `.var()` structured and random input.
- [ ] Preserve default sample-name and variation intent.
- [ ] Preserve constant groups and patterned rests.
- [ ] Preserve random variation settings.
- [ ] Update sampler warning logic to enumerate static names from native state.
- [ ] Add direct state-transition tests.

### Likely files

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/event-state.ts`
- `packages/fluid/src/instruments/event-state-transitions.ts`
- `packages/fluid/src/patterns/normalize-structured-input.ts`
- `packages/fluid/src/utils/sample-utils.ts`
- `packages/fluid/src/types.ts`

### Verification

- [ ] Run sampler golden and warning tests.
- [ ] Verify random and static variation behavior.

## Step 9.2 — Make sampler transforms fully native

### Work

Remove mixed-state branches and transform all sampler event lanes through one native transition.

### Tasks

- [ ] Transform notes, timing, names, and variations exactly once.
- [ ] Preserve timing materialization rules.
- [ ] Preserve constant `valueMode` across transforms.
- [ ] Preserve generated timing exemptions.
- [ ] Remove legacy callbacks from the transform coordinator.
- [ ] Retain call-order fixtures unchanged.

### Likely files

- `packages/fluid/src/instruments/event-transform-coordinator.ts`
- `packages/fluid/src/instruments/event-state-transitions.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/event-transform-coordinator.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`

### Verification

- [ ] Run all transform and sampler tests.
- [ ] Confirm no legacy lane is invoked by a public transform.

## Step 9.3 — Delete the adapter and obsolete classes

### Work

Remove migration-only code and any legacy pattern infrastructure with no remaining responsibility.

### Tasks

- [ ] Delete the legacy event-state adapter.
- [ ] Delete `AuthoredEventValues` when unused.
- [ ] Delete any remaining `AuthoredPitches` and `AuthoredTiming` wrappers when unused.
- [ ] Delete or substantially narrow `MaskedCycle` when no production path needs it.
- [ ] Remove obsolete exports and tests.
- [ ] Remove duplicate timing, availability, and materialization helpers.
- [ ] Confirm processing `Parameter` and unrelated pattern classes remain untouched.

### Likely files

- `packages/fluid/src/instruments/legacy-event-state-adapter.ts`
- `packages/fluid/src/patterns/authored-event-values.ts`
- `packages/fluid/src/patterns/authored-event-values.test.ts`
- `packages/fluid/src/patterns/authored-pitches.ts`
- `packages/fluid/src/patterns/authored-timing.ts`
- `packages/patterns/src/masked-cycle.ts`
- `packages/patterns/src/masked-cycle.test.ts`
- `packages/patterns/src/index.ts`
- `packages/fluid/src/instruments/event-compiler.ts`

### Verification

- [ ] Use `rg` for all removed class and adapter names.
- [ ] Run complete repository tests.
- [ ] Confirm structured inputs still match retained golden fixtures.
- [ ] Confirm no shorthand code has been connected yet.

## PR 9 completion gate

- [ ] Structured event input uses the new architecture end to end.
- [ ] There is no temporary adapter or dual representation.
- [ ] Legacy infrastructure is removed or has a documented narrower responsibility.

---

# PR 10 — Add the shorthand lexer, parser, and public AST contract

## Goal

Implement syntax parsing independently from target conversion and Fluid integration.

PR 10 and PR 11 may be developed in parallel after the event-cycle IR and AST type contract are agreed. Merge order may still require the AST contract before the normalizer.

## Step 10.1 — Define AST and source diagnostics

### Work

Add readonly, enumerable, source-aware AST types and structured syntax errors.

### Tasks

- [ ] Define all AST node variants from the specification.
- [ ] Preserve atom and modifier amount lexemes as strings.
- [ ] Define source ranges consistently as half-open or closed and test the convention.
- [ ] Define syntax error type and source-range reporting.
- [ ] Keep AST types target-independent.
- [ ] Freeze returned AST data recursively or establish an equivalent immutable construction guarantee.

### Likely files

- `packages/patterns/src/shorthand/types.ts` — **new, suggested**
- `packages/patterns/src/shorthand/errors.ts` — **new, suggested**
- `packages/patterns/src/shorthand/types.test.ts` — **new, suggested**
- `packages/patterns/src/index.ts`

### Verification

- [ ] Type-test every AST variant.
- [ ] Verify AST fields are enumerable and immutable.

## Step 10.2 — Implement lexical analysis

### Work

Tokenize atoms, delimiters, rests, and postfix modifiers while preserving source ranges and reserved-character errors.

### Tasks

- [ ] Treat spaces, tabs, and newlines as equivalent separators.
- [ ] Recognize all structural characters.
- [ ] Reject unsupported reserved constructs rather than treating them as atoms.
- [ ] Preserve signed and fractional atom text.
- [ ] Preserve modifier amounts for later rational validation.
- [ ] Bound input length and token count.
- [ ] Add exact range tests for valid and invalid input.

### Likely files

- `packages/patterns/src/shorthand/lexer.ts` — **new, suggested**
- `packages/patterns/src/shorthand/lexer.test.ts` — **new, suggested**
- `packages/patterns/src/shorthand/errors.ts`
- `packages/patterns/src/shorthand/types.ts`

### Verification

- [ ] Run lexer tests including whitespace and reserved-character cases.
- [ ] Fuzz or table-test malformed delimiter and modifier sequences.

## Step 10.3 — Implement parser and grammar restrictions

### Work

Parse sequences, square groups, parallel groups, alternation, rests, and postfix modifiers with explicit grammar errors.

### Tasks

- [ ] Parse nested groups and alternations.
- [ ] Parse postfix modifier chains in written order.
- [ ] Distinguish sequential square groups from simultaneous groups.
- [ ] Reject mixed same-level forms such as `[0 1,2]` and `[0,1 2]`.
- [ ] Reject rests as simultaneous voices.
- [ ] Reject empty expressions and structures.
- [ ] Enforce positive-integer `!` syntax at the appropriate parse or semantic boundary.
- [ ] Bound AST depth and node count.
- [ ] Test source ranges on nested nodes and errors.

### Likely files

- `packages/patterns/src/shorthand/parser.ts` — **new, suggested**
- `packages/patterns/src/shorthand/parser.test.ts` — **new, suggested**
- `packages/patterns/src/shorthand/types.ts`
- `packages/patterns/src/shorthand/errors.ts`
- `packages/patterns/src/shorthand/index.ts` — **new, suggested**
- `packages/patterns/src/index.ts`

### Verification

- [ ] Run parser tests for every syntax example and invalid form in `spec.md`.
- [ ] Confirm parsing performs no target-specific atom conversion.

## PR 10 completion gate

- [ ] A shorthand source string produces a public-contract AST or a ranged syntax error.
- [ ] Parser behavior is target-independent.
- [ ] No Fluid method accepts shorthand yet.

---

# PR 11 — Add shorthand semantic analysis and normalization

## Goal

Convert typed shorthand ASTs into the same event cycles as structured input without changing public method dispatch yet.

## Step 11.1 — Implement authored-topology analysis

### Work

Determine `valueMode` as separate semantic analysis, not by reordering operators.

Normative rule:

> Determine `valueMode` from authored topology: sequences, alternation, polyphony, rests, and structural repetition participate in classification; speed and weight modifiers preserve it. Evaluate geometry in written operator order, including the specified speed-chain cancellation rules.

### Tasks

- [ ] Analyze atoms and simultaneous groups as one authored event group.
- [ ] Treat authored sequences, alternation, rests, and `!` as classification-relevant topology.
- [ ] Make `*`, `/`, and `@` preserve their operand classification.
- [ ] Ensure analysis does not evaluate every `!` before every speed or weight operator.
- [ ] Carry classification metadata beside geometry during recursive evaluation.
- [ ] Test `"1"`, `"1/2"`, `"1*2"`, and `"1@2"` as constant.
- [ ] Test `"1!2"`, `"1 2"`, and `"<1 2>"` as patterned.
- [ ] Test `[1,2]` as one constant simultaneous group.

### Likely files

- `packages/patterns/src/shorthand/analyze.ts` — **new, suggested**
- `packages/patterns/src/shorthand/analyze.test.ts` — **new, suggested**
- `packages/patterns/src/shorthand/types.ts`
- `packages/patterns/src/event-cycle.ts`

### Verification

- [ ] Review classification tests separately from geometry tests.
- [ ] Confirm classification never inspects the final transformed grid.

## Step 11.2 — Evaluate geometry in written order

### Work

Evaluate sequence allocation, grouping, polyphony, alternation, rests, repetition, speed, slowdown, and weight into bounded rational geometry.

### Tasks

- [ ] Evaluate postfix operators in written order.
- [ ] Combine uninterrupted `*`/`/` chains as one exact rational rate.
- [ ] Preserve the distinction between structural `!` and acceleration `*`.
- [ ] Implement slowdown gaps without extending gates.
- [ ] Implement sibling allocation for `60/2 1` exactly as specified.
- [ ] Implement sequence weighting with continuations.
- [ ] Implement alternation weighting as selection frequency with retriggers.
- [ ] Implement `<0@2 2 3>*2` as bars `[0, 0]` and `[2, 3]`.
- [ ] Normalize nested rational geometry to the smallest bounded equal-step grid.
- [ ] Reject excessive expansion instead of truncating.

### Likely files

- `packages/patterns/src/shorthand/evaluate.ts` — **new, suggested**
- `packages/patterns/src/shorthand/evaluate.test.ts` — **new, suggested**
- `packages/patterns/src/shorthand/analyze.ts`
- `packages/patterns/src/utils/rational.ts`
- `packages/patterns/src/utils/event-grid.ts`
- `packages/patterns/src/event-cycle.ts`

### Verification

- [ ] Run exact geometry tests independently of Fluid atom conversion.
- [ ] Verify speed-chain cancellation includes event durations.
- [ ] Verify weighted alternation creates retriggers rather than continuations.

## Step 11.3 — Add Fluid target conversion and `normalizeShorthand()`

### Work

Convert target-independent atoms for notes, names, variations, and XOX, then produce typed event cycles through the generic evaluator.

### Tasks

- [ ] Add strict finite numeric conversion for notes and variations.
- [ ] Preserve signed and fractional notes and variations.
- [ ] Add sample alias validation without constructor `name:variation` interpretation.
- [ ] Add XOX atom conversion and legacy symbol meanings.
- [ ] Reject polyphony for XOX.
- [ ] Include target method and AST source range in errors where available.
- [ ] Keep target conversion from changing structure or timing.
- [ ] Return the same event-cycle types as structured normalization.

### Likely files

- `packages/fluid/src/patterns/normalize-shorthand.ts` — **new, suggested**
- `packages/fluid/src/patterns/normalize-shorthand.test.ts` — **new, suggested**
- `packages/fluid/src/utils/sample-utils.ts`
- `packages/fluid/src/utils/validate.ts`
- `packages/fluid/src/types.ts`
- `packages/patterns/src/shorthand/evaluate.ts`

### Verification

- [ ] Run target conversion tests with exact ranged errors.
- [ ] Confirm no instrument public signature accepts `Shorthand` yet.

## Step 11.4 — Prove structured/shorthand equivalence

### Work

Compare normalized event cycles and compiled schema for syntax with structured equivalents.

### Tasks

- [ ] Compare direct atoms, rests, sequences, and chords.
- [ ] Compare `"1!2"` with `[1, 1]`.
- [ ] Compare `"1/2"` with scalar input followed by `.slow(2)`.
- [ ] Compare weighted shorthand to exact continuation steps.
- [ ] Compare alternation over its full finite period.
- [ ] Compare direct shorthand AST normalization with manually constructed AST fixtures.
- [ ] Verify continuations occupy external candidate ordinals without suppressing them.
- [ ] Verify explicit rests still suppress candidates.

### Likely files

- `packages/fluid/src/patterns/normalize-shorthand.test.ts`
- `packages/fluid/src/patterns/normalize-structured-input.test.ts`
- `packages/fluid/src/instruments/event-state-compiler.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/patterns/src/shorthand/evaluate.test.ts`

### Verification

- [ ] Run patterns and Fluid package suites.
- [ ] Confirm equivalence assertions compare semantic metadata as well as grid shape.

## PR 11 completion gate

- [ ] Shorthand ASTs normalize into canonical event cycles.
- [ ] Classification and operator evaluation are independently tested.
- [ ] Structured and shorthand equivalents compile identically.
- [ ] Public Fluid API behavior remains unchanged.

---

# PR 12 — Wire up the public shorthand API

## Goal

Expose immutable shorthand values and direct-string dispatch for all supported consumers, then complete validation and documentation.

## Step 12.1 — Add immutable shorthand construction and exports

### Work

Expose `d.shorthand()` and `d.sh()` as immediate parser entry points and export the public readonly AST types.

### Tasks

- [ ] Define the `Shorthand` value shape.
- [ ] Parse eagerly at the constructor call site.
- [ ] Freeze the shorthand wrapper and AST.
- [ ] Add `Drome.shorthand()` and `Drome.sh()`.
- [ ] Export `Shorthand`, `ShorthandNode`, and supporting AST types.
- [ ] Ensure `source` and `ast` are enumerable and inspectable.
- [ ] Test alias equivalence and eager syntax errors.

### Likely files

- `packages/patterns/src/shorthand/index.ts`
- `packages/patterns/src/shorthand/types.ts`
- `packages/patterns/src/index.ts`
- `packages/fluid/src/index.ts`
- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/types.ts`

### Verification

- [ ] Run API and parser tests.
- [ ] Inspect inferred public types without adding avoidable explicit return annotations.

## Step 12.2 — Add argument dispatch and supported consumers

### Work

Route bare strings and reusable shorthand values through `normalizeShorthand()` while retaining existing structured forms.

### Tasks

- [ ] Add a shared dispatcher for one string, one `Shorthand`, or structured arguments.
- [ ] Require `Shorthand` to be the sole argument.
- [ ] Add shorthand to `.notes()`.
- [ ] Add shorthand to `.name()`.
- [ ] Add shorthand to `.variation()` and `.var()`.
- [ ] Add shorthand to `.xox()`.
- [ ] Preserve legacy compact XOX string behavior through the same timing representation.
- [ ] Preserve multiple structured string arguments where currently supported by dispatch rules.
- [ ] Test direct strings and `d.sh()` values through the same normalization path.

### Likely files

- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/event-state-transitions.ts`
- `packages/fluid/src/patterns/normalize-shorthand.ts`
- `packages/fluid/src/patterns/normalize-structured-input.ts`
- `packages/fluid/src/types.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/index.test.ts`

### Verification

- [ ] Run consumer-specific tests for all four methods.
- [ ] Run retained golden structured-input fixtures unchanged.
- [ ] Confirm unsupported consumers still reject shorthand through their existing types and validation.

## Step 12.3 — Enforce sample alias and schema validation rules

### Work

Apply the notation-safe sample alias convention consistently while preserving constructor `name:variation` shorthand.

### Tasks

- [ ] Restrict aliases to `[A-Za-z0-9]+` in sampler names and bank keys.
- [ ] Reject `:` in `.name()` structured and shorthand input.
- [ ] Preserve `d.sample("bd:2")` constructor behavior.
- [ ] Reject combined selectors passed to `.name()`.
- [ ] Preserve unrestricted sample URLs.
- [ ] Add direct schema validation coverage where the specification requires it.
- [ ] Add focused migration error messages.

### Likely files

- `packages/fluid/src/utils/sample-utils.ts`
- `packages/fluid/src/utils/sample-utils.test.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/index.ts`
- `packages/fluid/src/index.test.ts`
- `packages/schema/src/validate-graph.ts`
- `packages/schema/src/validate-graph.test.ts`
- `packages/schema/src/index.ts`, only if shared validation constants or types are added

### Verification

- [ ] Run Fluid and schema tests.
- [ ] Verify constructor shorthand and `.name()` intentionally differ only as specified.

## Step 12.4 — Complete end-to-end tests and documentation

### Work

Add public examples, final regression coverage, and cleanup any implementation-only exports.

### Tasks

- [ ] Add end-to-end syntax examples for every supported consumer.
- [ ] Add errors for malformed syntax, invalid targets, and expansion limits.
- [ ] Add exact tests for slowdown, speed cancellation, weighting, alternation, continuation transparency, and `valueMode` preservation.
- [ ] Add API documentation for reusable `d.sh()` values and direct strings.
- [ ] Update pattern terminology to cycle → patterns/bars → steps.
- [ ] Document intentional compatibility changes and sample-name restrictions.
- [ ] Verify the schema and audio engine do not parse or retain shorthand.
- [ ] Remove temporary internal exports and migration comments.

### Likely files

- `packages/fluid/README.md`
- `docs/concepts/patterns.md`
- `packages/patterns/README.md`
- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/instruments/event-schema-compatibility.test.ts`
- `packages/fluid/src/patterns/normalize-shorthand.test.ts`
- `packages/patterns/src/shorthand/parser.test.ts`
- `packages/patterns/src/shorthand/evaluate.test.ts`
- `plans/shorthand-syntax/syntax-examples.md`, if retained as a companion reference

### Verification

- [ ] Run the complete repository suite.
- [ ] Run formatting and `git diff --check`.
- [ ] Review public exports and generated declaration output.
- [ ] Confirm no legacy authored classes, adapters, or old compiler symbols remain without a documented responsibility.

## PR 12 completion gate

- [ ] All supported consumers accept bare shorthand strings and reusable shorthand values.
- [ ] Public AST data is typed, immutable, enumerable, and inspectable.
- [ ] Structured and shorthand input share one compiler path.
- [ ] Compatibility changes are tested and documented.
- [ ] No shorthand concept has leaked into the playback schema or audio engine.

---

# Global review checklist

Apply this checklist to every PR:

- [ ] The PR has one primary architectural or behavioral purpose.
- [ ] Behavior changes are not hidden inside refactors.
- [ ] Every new abstraction has focused unit tests.
- [ ] Complete schema fixtures cover production cutovers.
- [ ] State has one authoritative representation per lane.
- [ ] New compiler and transition code does not import superseded classes.
- [ ] Temporary migration dependencies are named and have a deletion PR.
- [ ] Limits fail explicitly rather than truncating or rounding.
- [ ] No processing-parameter behavior is moved into event cycles.
- [ ] Type checking, linting, tests, formatting, and `git diff --check` pass.
