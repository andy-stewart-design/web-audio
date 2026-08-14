# Masked Cycle Refactor Plan

## Status

Completed (2026-08-14)

## Context

The scratch-language work introduced an explicit public schema shape:

```ts
notes: {
  source: ParameterSchema;
  mask?: ParameterSchema;
}
```

This correctly separates pitch/value selection (`source`) from trigger eligibility and timing (`mask`).

However, static `xox()` currently preserves legacy modifier behavior by combining notes and rests into one nullable cycle:

```ts
[60, 64] + [1, 0, 1] -> [60, null, 64]
```

It later reconstructs `source` and `mask` during schema generation. That is behaviorally compatible, but it obscures the model and relies on `_hasStaticMask` to distinguish “no mask” from “a static mask was applied.”

This plan replaces the combine-then-reconstruct approach with an internal paired masked-cycle representation. It must preserve existing static pattern modifier behavior, including modifier ordering around `xox()`.

## Goal

Represent static source values and their trigger grid separately throughout Fluid pattern construction, so schema generation is a direct serialization step:

```ts
{
  source: [60, 64],
  mask: [1, 0, 1],
}
```

No nullable combined cycle, source reconstruction, or `_hasStaticMask` state should remain.

## Non-goals

- Changing public `xox()` semantics.
- Changing random `xox(RandomCycle)` behavior.
- Changing random-note structural grids (`RandomSchema.grid`).
- Adding new pattern modifiers.
- Changing synth or sampler scheduling behavior beyond preserving existing behavior under the clearer representation.

## Design constraints

- Static modifier chains must produce the same scheduled pitches, offsets, durations, bars, and rests as before the refactor.
- Modifier order remains meaningful and is preserved.
- The representation is internal to Fluid/patterns; engine schemas remain `notes.source` plus optional `notes.mask`.
- Do not create separate modifier implementations in `MidiNotes`, `SampleNotes`, synth, and sampler.
- Do not use `as any` or weaken schema types to bridge the transition.

## Target representation

Introduce an internal generic representation, conceptually:

```ts
interface MaskedCycle<T> {
  source: Cycle<T>;
  mask: Cycle<0 | 1>;
}
```

Important: `source` is the repeating source content, while `mask` is the final event grid. The representation must retain sufficient information to preserve the current behavior where source values cycle across active mask positions.

For example:

```ts
notes: [60, 64]
xox:   [1, 0, 1, 1]

source: [60, 64]
mask:   [1, 0, 1, 1]

resulting events: [60, null, 64, 60]
```

The internal API should make the final resulting event grid explicit where needed, rather than requiring callers to infer it from unrelated arrays.

## Phase 1 — Characterize current behavior

Tracer bullet: the current implementation’s static modifier behavior is captured as executable tests before its internal representation changes.

### Step 1.1 — Add focused legacy composition fixtures

**Files:** `packages/fluid/src/instruments/instrument.test.ts`, `packages/patterns/src/**/*.test.ts` as appropriate, audio-engine scheduling tests where schema-only assertions are insufficient

Add tests that assert final source/mask schemas and/or scheduled output for static chains. Cover both synthesizer and sampler where their default source values differ.

Minimum cases:

```ts
.notes([60, 64]).xox([1, 0, 1])
.notes([60, 64]).xox([1, 0, 1]).slow(2)
.notes([60, 64]).xox([1, 0, 1]).fast(2)
.notes([60, 64]).xox([1, 0, 1]).reverse()
.notes([60, 64]).xox([1, 0, 1]).stretch(2, 2)
.notes([60, 64]).euclid(2, 4).xox([1, 0, 1, 1])
.notes([60, 64]).xox([1, 0, 1, 1]).euclid(2, 4)
.notes([60, 64]).xox([1, 0, 1, 1]).hex("a")
.notes([60, 64]).xox([1, 0, 1, 1]).sequence(4, 0, 2)
```

For each case, record:

- final active source-note sequence;
- final mask positions and bar structure;
- offsets, durations, and `stepIndex` values;
- behavior across multiple bars when applicable.

Do not use broad snapshots alone. Assert the properties that define compatibility.

**Acceptance criteria:**

- [ ] Each listed modifier family has at least one order-sensitive characterization case.
- [ ] Tests demonstrate the distinction between modifiers before and after `xox()`.
- [ ] Synth and sampler coverage confirms equivalent mask timing semantics.
- [ ] Existing focused tests pass before implementation begins.

## Phase 2 — Build shared masked-cycle primitives

Tracer bullet: a reusable internal abstraction can apply existing rhythm transforms to a source/mask pair without combining values and null rests.

### Step 2.1 — Define the internal API and ownership

**Files:** likely `packages/patterns/src/masked-cycle.ts`, `packages/patterns/src/types.ts`, `packages/patterns/src/index.ts`, new tests

Create a narrowly scoped internal abstraction in `@web-audio/patterns`. It should support:

- constructing an unmasked cycle from source content;
- applying a static binary mask;
- obtaining final source events and mask/grid data for schema serialization;
- applying existing pattern operations without exposing nullable implementation details.

Choose names that distinguish clearly between:

- source content;
- final trigger grid;
- final active events.

Do not call unrelated structural timing data a “mask.” `RandomSchema.grid` remains separate from this abstraction.

**Acceptance criteria:**

- [ ] The abstraction has no dependency on Fluid instruments or audio-engine classes.
- [ ] Its public/internal types make source content and trigger grid distinguishable.
- [ ] It can express an unmasked source cycle and a source cycle with static `xox()`.
- [ ] Tests cover source cycling over active mask positions and empty/all-rest masks.

### Step 2.2 — Port modifier semantics into shared operations

**Files:** `packages/patterns/src/masked-cycle.ts`, existing pattern utility modules as needed, tests

Implement paired behavior for the existing modifier families:

- rhythm application: `xox`, `euclid`, `hex`, `sequence`;
- time/grid transforms: `fast`, `slow`, `stretch`, `reverse`.

The implementation may reuse existing `applyPattern`, `fast`, `slow`, `stretch`, and `reverse` utilities internally. It must not duplicate their algorithms in Fluid.

For every operation, define whether it:

- composes trigger eligibility onto the current final grid;
- transforms the current final grid and its active event order; or
- transforms source content before it is projected onto a subsequent grid.

These definitions are not new public semantics; they are an explicit implementation of the behavior characterized in Phase 1.

**Acceptance criteria:**

- [ ] All Phase 1 fixtures pass against the masked-cycle operations.
- [ ] Source values cycle only across active grid positions, as static `xox()` does today.
- [ ] Rests remain timing positions; they are not compressed away before timing transforms.
- [ ] Empty bars and all-rest patterns remain representable without divide-by-zero behavior.
- [ ] Patterns check, lint, and tests pass.

## Phase 3 — Migrate Fluid note construction

Tracer bullet: `MidiNotes` and `SampleNotes` construct and serialize static source/mask pairs directly.

### Step 3.1 — Replace static combined-cycle state in `MidiNotes`

**Files:** `packages/fluid/src/patterns/midi-notes.ts`, `packages/fluid/src/patterns/sample-notes.ts`, related tests

Replace the static nullable combined-cycle behavior with the masked-cycle abstraction.

Requirements:

- static `notes()` initializes or replaces source content appropriately;
- static `xox()` updates trigger/grid state directly;
- chaining static modifiers delegates to the shared masked-cycle operations;
- `notes(RandomCycle)` remains distinct from static masked cycles;
- `xox(RandomCycle)` remains a dynamic mask and retains its existing binary validation behavior;
- calling a replacement method follows current builder semantics and does not leave stale mask state.

Remove `_hasStaticMask` and any reconstruction from `null` values.

**Acceptance criteria:**

- [ ] No `_hasStaticMask` remains.
- [ ] Static `xox()` does not create a nullable source cycle as an intermediate representation.
- [ ] Random source notes and random masks continue to use their existing dedicated paths.
- [ ] Fluid tests from Phase 1 pass unchanged.

### Step 3.2 — Serialize direct source and mask schemas

**Files:** `packages/fluid/src/instruments/synthesizer.ts`, `packages/fluid/src/instruments/sampler.ts`, Fluid integration tests

Serialize only the explicit schema form:

```ts
notes: {
  source: ParameterSchema,
  mask?: ParameterSchema,
}
```

For a static masked cycle:

- `source` contains the final active values in their required cycle order;
- `mask` contains the final timing/grid positions;
- no data is inferred by scanning null values.

For a static unmasked cycle, either omit `mask` or use the established schema convention for no mask; retain the existing optional-mask contract.

**Acceptance criteria:**

- [ ] Static xox schema is directly produced from paired state.
- [ ] Synth and sampler serialize equivalent timing masks.
- [ ] No flattened notes schema or compatibility bridge is introduced.
- [ ] Target scratch random-mask syntax remains unchanged.

## Phase 4 — Verify engine compatibility and remove obsolete paths

Tracer bullet: engine scheduling consumes the direct schema without behavior drift.

### Step 4.1 — Confirm static mask scheduling equivalence

**Files:** `packages/audio-engine/src/instruments/synthesizer.ts`, `packages/audio-engine/src/instruments/sampler.ts`, focused tests

The engine should continue to consume:

```ts
const source = schema.notes.source;
const mask = schema.notes.mask;
```

No engine reconstruction or Fluid-internal compatibility workaround should be added.

Add scheduling assertions for representative Phase 1 fixtures, checking actual scheduled source/oscillator count, pitch, start time, and duration.

**Acceptance criteria:**

- [ ] Static source notes cycle across active static mask positions.
- [ ] Dynamic binary masks still suppress and emit at their resolved grid positions.
- [ ] Chance gaps do not re-index source-specific parameters.
- [ ] Empty dynamic mask bars schedule no voices and do not resolve random values.
- [ ] Synth and sampler tests pass.

### Step 4.2 — Remove obsolete code and document the invariant

**Files:** implementation files and relevant docs/comments discovered during the refactor

Remove:

- null-based source reconstruction;
- `_hasStaticMask`;
- compatibility-only comments or state;
- any stale reference to `notes.mask.cycle` or the previous ambiguous schema model.

Add a concise internal comment only if needed to explain the invariant that source values are consumed across active mask positions, not raw grid positions.

**Acceptance criteria:**

- [ ] No static path combines notes with null rests and later separates them.
- [ ] No stale TODO or old-schema compatibility field remains.
- [ ] Search confirms no `.cycle.cycle` access remains.
- [ ] `git diff --check` passes.

## Verification

After each phase, run focused commands:

```sh
pnpm --filter @web-audio/patterns check
pnpm --filter @web-audio/patterns lint
pnpm --filter @web-audio/patterns test:ci
pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine test:ci
```

At completion:

```sh
pnpm check
pnpm lint
pnpm test
git diff --check
```

Do not run a development server without asking first.

## Completion criteria

The refactor is complete when static `xox()` is represented internally as an explicit source/mask pair, all existing modifier ordering behavior is preserved by tests, the public nested note schema is direct and unambiguous, and no combine-then-reconstruct implementation remains.
