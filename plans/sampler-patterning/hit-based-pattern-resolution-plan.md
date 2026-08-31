# Hit-Based Event Pattern Resolution Implementation Plan

## Context

This plan implements `plans/sampler-patterning/hit-based-pattern-resolution-spec.md` as one prerequisite PR before variation-derived sampler onsets or patterned sample names.

The current engine mixes two value-addressing models under sparse rhythms:

- static notes are generally consumed in active-hit order;
- random notes under a separate mask, sampler variation, regions, envelopes, detune, and event-created effects generally resolve from the surviving onset's original grid `stepIndex`.

The target rule is:

```txt
rhythm and masks decide where hits occur
→ surviving onsets receive consecutive hit indices within the bar
→ every event-addressed value lane resolves by hit index
→ timing remains attached to the original grid geometry
```

This is an intentional sequencing semantic change, not an internal-only refactor. The implementation must preserve both concepts:

- **grid step index** for onset selection and timing metadata;
- **hit index** for event-addressed value resolution.

No public schema redesign is required.

## Key design decisions

- Hit indices are zero-based and restart for each scheduled bar.
- `barIndex` continues to select and wrap each value pattern's bars.
- Static and random masks resolve eligibility before hit indices are assigned.
- Random-mask misses and static rests do not consume hit indices.
- Hit indices are assigned from intended onset geometry before sample lookup, region validation, voice creation, or other downstream failure.
- Polyphonic voices from one onset share one hit index.
- `StaticSchemaValue.stepIndex` remains grid metadata and is not redefined as hit index.
- Event-addressed static and random patterns use the same `(barIndex, hitIndex)` address.
- LFO phase/bounds, buses, routing, sends, MIDI CC input, and global sampler modes retain their existing non-event addressing.
- Sampler alternate direction remains success-based and independent from hit indexing.
- The shared `Instrument` path should accept an explicit event context; subclasses should not smuggle hit index through a field still named `stepIndex`.
- The final implementation must not retain a permanent old/new indexing switch.

## Scope and PR boundary

This plan should ship as one prerequisite PR with phased commits. It includes:

- audio-engine scheduling changes for synths and samplers;
- focused Fluid normalization where generated sampler schemas currently depend on cross-bar/global `stepIndex` value addressing;
- tests for schema invariants and runtime value resolution;
- public and developer documentation;
- updates to the sampler-patterning specification where it currently requires grid-indexed name or variation resolution.

It does not include:

- variation-derived implicit sampler onsets;
- patterned sample names;
- sampler buffer-store migration for multiple names;
- public schema field additions;
- pattern-language redesign.

---

## Phase 1 — Characterize the semantic boundary

Tracer bullet: executable fixtures distinguish geometry from value addressing and identify every intentional compatibility change before scheduler internals move.

### Step 1.1 — Add a shared sparse-rhythm fixture matrix

**Files:**

- `packages/audio-engine/src/instruments/synthesizer.test.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- focused test helpers in those files or a small test-only helper module

Use a representative static mask with active positions at grid indices `0` and `2`:

```ts
[
  { value: 1, offset: 0, duration: 0.25, stepIndex: 0 },
  { value: 1, offset: 0.5, duration: 0.25, stepIndex: 2 },
];
```

Capture separately:

- scheduled offsets and durations;
- source note order;
- grid `stepIndex` metadata;
- values selected for event-addressed lanes.

Add or identify fixtures for:

- static notes under a static mask;
- static notes under a random mask;
- random notes under a static mask;
- random notes under a random mask;
- synth gain, detune, envelope components, and effect parameters;
- sampler variation;
- sampler static region start/end/duration;
- sampler chop sequence;
- multi-bar masks and value cycles;
- chords under sparse masks.

Tests added solely to characterize unchanged geometry should pass before production changes. Target hit-value assertions may be introduced with the implementation phase that makes them pass; do not leave committed skipped tests as the contract.

**Acceptance criteria:**

- [ ] Existing static note hit-order behavior is explicitly covered.
- [ ] Sparse-mask timing is asserted independently from resolved values.
- [ ] Every currently grid-addressed event lane named in the spec has an owning test location.
- [ ] Tests identify the existing region fixture named around “original grid indices” as an intentional expectation change.
- [ ] Existing focused package tests pass before scheduler changes begin.

### Step 1.2 — Audit all runtime index consumers

**Files:** production files are unchanged; record findings in tests or implementation notes as useful

Audit every event-time `_resolve(...)` call in:

- `packages/audio-engine/src/instruments/instrument.ts`;
- `packages/audio-engine/src/instruments/synthesizer.ts`;
- `packages/audio-engine/src/instruments/sampler.ts`.

Classify each call as one of:

1. **grid-addressed onset selection** — random mask eligibility;
2. **hit-addressed event value** — notes, variation, region, gain, envelopes, detune, and event-created effects;
3. **non-event/bar-level** — LFO initialization and per-bar bound updates.

The audit should specifically prevent broad replacement of every `_resolve(..., stepIndex)` call. Random-mask resolution must retain grid addressing, while LFO and bar-level callers must remain unchanged.

Also identify generated Fluid schemas that rely on global or sparse note `stepIndex` to select a companion value lane. At minimum, inspect generated `fit + chop` defaults and `getDefaultNotes(..., { globalStepIndex: true })`.

**Acceptance criteria:**

- [ ] Every audio-engine `_resolve()` caller has an explicit intended indexing category.
- [ ] Random-mask eligibility is marked as grid-addressed.
- [ ] Event-created effect and envelope resolution is marked as hit-addressed.
- [ ] LFO initialization and bar updates are marked as unchanged.
- [ ] Generated multi-bar sampler schemas that rely on global step addressing are listed for Phase 4.

---

## Phase 2 — Establish the internal event-position model

Tracer bullet: one dense synth or sampler bar can carry distinct hit and grid indices through the shared voice path without changing public schemas.

### Step 2.1 — Add an explicit internal event context

**Files:**

- `packages/audio-engine/src/instruments/instrument.ts`
- `packages/audio-engine/src/types.ts` if the context belongs with shared internal types
- `packages/audio-engine/src/instruments/instrument.test.ts`

Replace the ambiguous private note context with an explicit event-position model, conceptually:

```ts
interface EventScheduleContext {
  barIndex: number;
  hitIndex: number;
  gridStepIndex: number;
  startTime: number;
  duration: number;
  endTime: number;
}
```

Requirements:

- Shared event-addressed resolution uses `hitIndex`.
- Geometry and diagnostics may retain `gridStepIndex`.
- `_resolve()` itself remains a general pattern resolver; its caller chooses the correct index.
- `_resolveDetune()`, `_resolveEnvelope()`, `_applyParamSchema()`, `_buildEffectNode()`, and `_scheduleVoice()` must no longer infer value index from serialized geometry.
- LFO setup and per-bar updates remain explicitly bar-level and continue to use their existing index `0` behavior.
- Do not export the event context from `@web-audio/schema`.

During this phase, a subclass not yet migrated may pass the same number for both indices to preserve its current behavior. That compatibility is temporary and must be removed when the subclass is migrated in later phases.

**Acceptance criteria:**

- [ ] Shared voice scheduling receives both hit and grid position explicitly.
- [ ] Event-created gain, envelope, detune, and effect resolution reads `hitIndex`.
- [ ] No shared event method reads `StaticSchemaValue.stepIndex` as a value index.
- [ ] Grid metadata remains available for timing/debugging without entering value resolution.
- [ ] No public schema type changes.

### Step 2.2 — Add shared static-onset grouping support

**Files:**

- a focused internal utility under `packages/audio-engine/src/instruments/`, if useful
- utility tests or instrument scheduler tests

Provide one tested way to enumerate static onset slots in stable order and assign consecutive hit indices.

The helper or equivalent scheduler logic must account for polyphony:

```txt
serialized voices:
stepIndex 0 → 60
stepIndex 0 → 64
stepIndex 2 → 67

scheduled hit indices:
60 and 64 → hit 0
67        → hit 1
```

Requirements:

- Group voices by onset slot, not merely by array element.
- Preserve voice order within a chord.
- Preserve the serialized geometry for every voice.
- Assign hit indices by first occurrence in stable scheduling order.
- Do not sort or mutate public schema arrays merely to derive indices.
- Empty bars produce no hits.

For a masked static source, source onset groups must cycle across active mask hits. The mask supplies geometry; the selected source group supplies one or more note values.

**Acceptance criteria:**

- [ ] Dense monophonic events receive indices `0..n-1`.
- [ ] Sparse serialized grid indices still receive consecutive hit indices.
- [ ] Chord voices share one hit index.
- [ ] Empty bars are handled without errors.
- [ ] Source onset groups can wrap across a longer active mask.

### Step 2.3 — Preserve schema and pattern-package boundaries

**Files:** focused schema/pattern tests only if a regression gap exists

Confirm that this runtime model does not require changing:

- `StaticSchemaValue`;
- `StaticSchema`;
- `RandomSchema`;
- `NotesSchema`;
- `MaskedCycle` serialization;
- grid `stepIndex` output from rhythm transforms.

Do not add `hitIndex` to serialized schema. It is derived from final runtime onset eligibility, especially for random masks, and therefore cannot always be authored at schema-generation time.

**Acceptance criteria:**

- [ ] Schema package public types remain unchanged.
- [ ] Pattern tests retain sparse grid `stepIndex` values after Euclidean/XOX/hex/sequence transforms.
- [ ] Runtime hit derivation does not rewrite schema objects.

---

## Phase 3 — Migrate synthesizer scheduling

Tracer bullet: synth notes and every event-created synth value lane advance by surviving hits under static and random masks.

### Step 3.1 — Migrate unmasked static and random note paths

**Files:**

- `packages/audio-engine/src/instruments/synthesizer.ts`
- `packages/audio-engine/src/instruments/synthesizer.test.ts`

For static note bars:

- enumerate onset slots in stable order;
- assign a bar-local hit index;
- schedule all voices in a chord with the same hit index;
- retain each note's offset, duration, and grid `stepIndex`.

For random note bars:

- use the random grid only for candidate timing/eligibility;
- assign hit indices only to active candidates;
- resolve random note values using hit index;
- retain grid metadata for scheduled timing.

A zero/rest candidate is not a hit and does not advance the counter.

**Acceptance criteria:**

- [ ] Dense unmasked synth output remains unchanged.
- [ ] Sparse unmasked/custom schemas resolve event parameters by hit order rather than grid `stepIndex`.
- [ ] Random structural rests do not consume random note or parameter values.
- [ ] Chord voices share gain, envelope, detune, and effect values.
- [ ] Chords advance the next hit index once, regardless of voice count.

### Step 3.2 — Migrate static-mask scheduling

**Files:**

- `packages/audio-engine/src/instruments/synthesizer.ts`
- `packages/audio-engine/src/instruments/synthesizer.test.ts`

Replace the current mixed `emittedIndex`/`maskStep.stepIndex` behavior with one explicit hit index:

1. enumerate active mask entries in their existing order;
2. assign the current hit index;
3. select the static source onset group using that hit index;
4. schedule every voice in that source group at mask timing;
5. resolve all downstream event lanes using the same hit index;
6. advance once for the next active mask entry.

The mask step's original `stepIndex` remains the event's grid position and must still control offset/duration metadata.

**Acceptance criteria:**

- [ ] `.notes([60, 64]).euclid(2, 4)` schedules `60` and `64` at grid positions `0` and `2`.
- [ ] A two-step gain pattern resolves values `0` and `1` for those hits, not grid-addressed values `0` and `2`.
- [ ] Detune, all gain-envelope components, and event-created effect parameters use the same hit index.
- [ ] Static source onset groups wrap over longer masks.
- [ ] Polyphonic source steps remain polyphonic under a mask.

### Step 3.3 — Migrate random-mask scheduling and MIDI output

**Files:**

- `packages/audio-engine/src/instruments/synthesizer.ts`
- `packages/audio-engine/src/instruments/synthesizer.test.ts`
- `packages/audio-engine/src/midi-output-scheduler.ts` only if test plumbing requires it; no semantic redesign expected

For a random mask:

- resolve each candidate's eligibility using `maskStep.stepIndex`;
- increment hit index only after a candidate survives;
- resolve static or random notes and every downstream lane using hit index.

Ensure MIDI note output uses the same resolved note and hit-addressed gain as local audio. Do not add a separate MIDI indexing path.

**Acceptance criteria:**

- [ ] Random-mask misses consume no note or parameter values.
- [ ] Static notes cycle across random-mask hits in active-hit order.
- [ ] Random notes resolve from hit index under a random mask.
- [ ] MIDI note, velocity, start time, and duration match local audio resolution.
- [ ] Synth timing and voice count remain determined solely by the mask.
- [ ] Audio-engine synth tests, check, and lint pass.

---

## Phase 4 — Normalize generated multi-bar sampler companions

Tracer bullet: generated `fit`/`chop` schemas preserve their audible sequence after bar-local hit indexing replaces global step addressing.

### Step 4.1 — Characterize generated cross-bar dependencies

**Files:**

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/index.test.ts`

Add focused schema and behavioral fixtures for generated multi-bar timing, especially:

```ts
d.sample("break").fit(2).chop(4).push();
d.sample("break").fit(2).chop(8).push();
d.sample("loop").fit(2).push();
```

Record:

- note bars and timing;
- note grid `stepIndex` metadata;
- generated chop sequence bars and values;
- expected slice order across bars.

The current implicit natural chop sequence may be one bar while generated notes use global step indices across multiple bars. Under bar-local hit indexing, that companion sequence must be represented with matching bar structure rather than relying on global note `stepIndex` lookup.

**Acceptance criteria:**

- [ ] `.fit(2).chop(4)` is covered end-to-end across both bars.
- [ ] `.fit(2).chop(8)` preserves all natural slices in order.
- [ ] Fit-only generated segmentation remains covered.
- [ ] Authored static/cycling chop sequences are distinguished from generated natural defaults.

### Step 4.2 — Align generated value bars with generated onset bars

**Files:**

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/index.test.ts`

When Fluid generates both onset timing and a companion natural chop sequence across multiple fit bars, serialize the companion sequence in bar-local hit order.

Conceptually, four natural slices over two generated bars should address as:

```txt
bar 0 hits 0,1 → slices 0,1
bar 1 hits 0,1 → slices 2,3
```

Requirements:

- Preserve note offsets, durations, event counts, and bar spans.
- Preserve authored chop sequence bar syntax; only generated companion defaults should be reshaped automatically.
- Do not change standalone `.chop()` one-bar behavior.
- Do not discard meaningful grid `stepIndex` metadata merely to make value resolution work.
- Audit whether `globalStepIndex` remains useful for geometry; remove it only if no consumer needs it after companion normalization.
- Keep generated fit-only region behavior equivalent.

**Acceptance criteria:**

- [ ] Generated fit/chop playback selects every intended natural slice once across its generated span.
- [ ] Value correctness no longer depends on cross-bar/global note `stepIndex` lookup.
- [ ] Authored one-bar and multi-bar chop sequences retain their documented syntax.
- [ ] No public sampler schema fields change.
- [ ] Fluid tests, check, and lint pass.

---

## Phase 5 — Migrate sampler scheduling

Tracer bullet: sampler notes, variation, regions, and all shared event parameters advance by intended hit order without changing timing, loading, or playback-mode behavior.

### Step 5.1 — Migrate sampler onset enumeration and note resolution

**Files:**

- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

Apply the same onset grouping and hit enumeration used by the synth:

- unmasked static notes group polyphonic voices by onset slot;
- static masks cycle source onset groups by hit index;
- random masks use grid index only for eligibility;
- random notes resolve by hit index;
- hit indices restart per bar;
- timing remains sourced from note or mask geometry.

Pass both hit and grid indices into sample-event scheduling. Do not overwrite the note geometry's serialized `stepIndex`.

**Acceptance criteria:**

- [ ] Existing sampler static notes retain active-hit order.
- [ ] Static and random note sources use the same hit policy.
- [ ] Random-mask misses consume no sampler note values.
- [ ] Sampler chords share one hit index and retain polyphonic scheduling.
- [ ] Dense unmasked sampler timing and pitch remain unchanged.

### Step 5.2 — Convert sampler variation and source-window values

**Files:**

- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

Resolve the following with `(barIndex, hitIndex)`:

- variation;
- static region start;
- static region end;
- static region duration;
- chop sequence.

Continue resolving in the established sampler order:

```txt
note/pitch
→ source key
→ variation
→ sample entry/buffer
→ region or chop
→ pitch and fit rates
→ schedule
```

The grid index remains available for timing and diagnostics but must not be passed into event-addressed value resolvers.

Update the existing region regression that expects values at grid indices `0` and `2`; it should expect values at hit indices `0` and `1` while preserving the same offsets.

**Acceptance criteria:**

- [ ] A sparse two-hit mask with `.var([0, 1])` selects variations `0` then `1`.
- [ ] Static region patterns advance through hits without rests consuming values.
- [ ] Chop sequence values advance through hits without changing chop timing.
- [ ] Fit playback rates and generated event counts remain unchanged.
- [ ] Out-of-range variation fallback still applies after hit-based variation selection.

### Step 5.3 — Route shared sampler parameters through hit context

**Files:**

- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/instrument.ts`
- corresponding tests

Ensure sampler events pass their hit index into the shared voice path so these lanes match synth behavior:

- gain maximum;
- ADSR attack, decay, sustain, and release;
- detune;
- filter parameters;
- gain-effect parameters;
- future event-created effects handled by the shared branch.

Do not alter:

- LFO phase or bar-bound updates;
- MIDI CC live bindings;
- loop/clip/direction globals;
- routing or sends.

**Acceptance criteria:**

- [ ] Synth and sampler use the same shared event-addressing contract.
- [ ] Sparse sampler gain, detune, envelope, and effects patterns resolve by hit.
- [ ] LFO and MIDI CC lifecycle tests remain unchanged.
- [ ] No sampler-specific fallback to grid indexing remains for event-created lanes.

### Step 5.4 — Lock intended-hit failure behavior

**Files:**

- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/instruments/sample-buffer-store.test.ts` only if focused store coverage is needed

Assign hit indices before operations that may fail. Add cases where an earlier intended hit is skipped because of:

- unavailable playback buffer or entry;
- invalid/zero source window;
- unavailable reverse buffer.

Later intended hits must retain their preassigned hit indices. Their variation, region, gain, and effects must not slide backward.

Keep alternate direction independent:

- failed/skipped playback does not advance alternate direction;
- the hit index still advances because the onset existed;
- later successful playback uses its own hit-resolved values and the unchanged alternate-direction state.

**Acceptance criteria:**

- [ ] A failed hit does not shift later event values.
- [ ] Invalid regions do not compress hit indexing.
- [ ] Missing buffers do not compress hit indexing.
- [ ] Alternate direction advances only after successful emission.
- [ ] Cancellation/reset behavior remains unchanged.
- [ ] Sampler tests, check, and lint pass.

---

## Phase 6 — Cross-cutting integration hardening

Tracer bullet: static/random, single/multi-bar, masked/unmasked, and polyphonic cases all obey one indexing rule across both instruments.

### Step 6.1 — Add a compact semantic matrix

**Files:**

- `packages/audio-engine/src/instruments/synthesizer.test.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/instruments/instrument.test.ts`
- `packages/fluid/src/index.test.ts` where generated schema is part of the case

Cover the cross-product selectively rather than duplicating every lane in every mode:

| Geometry           | Value source             | Required assertion                     |
| ------------------ | ------------------------ | -------------------------------------- |
| Dense static       | Static                   | Existing behavior unchanged            |
| Sparse static mask | Static                   | Hit indices compress rests             |
| Sparse static mask | Random                   | Random values use hit indices          |
| Random mask        | Static                   | Misses do not consume values           |
| Random mask        | Random                   | Eligibility uses grid; values use hits |
| Multi-bar mask     | Multi-bar values         | Bar and hit wrapping are independent   |
| Chord onset        | Static/random parameters | Voices share one hit index             |
| Failed sampler hit | Static/random values     | Later hits do not renumber             |

For random tests, assert deterministic resolved values for fixed schemas/seeds. Avoid assertions that merely accept any member of a range when the selected index is the behavior under test.

**Acceptance criteria:**

- [ ] Static and random addressing are proven equivalent at the same hit index.
- [ ] Multi-bar tests prove that hit indices restart while `barIndex` continues.
- [ ] Pattern wrapping within a bar is covered.
- [ ] Empty and all-rest bars schedule no voices and consume no values.
- [ ] Tests assert resolved values and timing, not only event count.

### Step 6.2 — Search for stale event/grid conflation

**Files:** all changed audio-engine and documentation files

Search for:

- event methods accepting only `stepIndex` where both meanings are possible;
- `_resolve(..., note.stepIndex)` in event-created paths;
- comments claiming rests preserve or consume parameter indices under the old model;
- tests named around “original grid indexing” for downstream values;
- sampler-specific `emittedIndex` behavior that differs from synth behavior.

Allow grid-index resolution only where justified by onset selection or non-event semantics.

**Acceptance criteria:**

- [ ] Every remaining grid-index resolver call is intentional and documented by context.
- [ ] No permanent compatibility flag chooses old versus new event indexing.
- [ ] Synth and sampler scheduler structure expresses the same hit policy.
- [ ] `git diff --check` passes.

---

## Phase 7 — Documentation and sampler-spec migration

Tracer bullet: public docs, developer terminology, and the follow-on sampler spec describe one consistent hit-based model.

### Step 7.1 — Update public pattern documentation

**Files:**

- `docs/concepts/patterns.md`
- `docs/concepts/glossary.md`
- sampler API documentation discovered during implementation, if it discusses masked parameter indexing

Document:

- rhythms and masks decide where hits occur;
- rests remain timing positions but do not consume event-addressed values;
- value patterns advance in active-hit order;
- pattern bars still wrap through `barIndex` independently;
- a chord is one hit with multiple voices;
- random-mask misses do not consume values.

Include a sparse-rhythm example with notes plus at least one non-note lane so the new behavior is visible.

**Acceptance criteria:**

- [ ] Public examples distinguish timing grid from value advancement.
- [ ] No documentation implies that silent steps consume gain, variation, or effect values.
- [ ] Chord and multi-bar semantics are explicit.
- [ ] Compatibility-sensitive wording is presented as an intentional change.

### Step 7.2 — Update developer terminology

**Files:**

- `docs/concepts/developer-terms.md`

Replace the current definition that says step index is generally used to look up per-step parameter values.

Define:

- grid step;
- grid `stepIndex`;
- hit;
- hit index;
- onset geometry;
- event-addressed value lane.

Clarify that the engine derives hit index after final mask resolution and that it is not serialized as a schema field.

**Acceptance criteria:**

- [ ] Grid and hit terminology cannot be confused in future scheduler work.
- [ ] Resolver documentation distinguishes general index lookup from the caller's semantic choice.
- [ ] Developer docs match internal type and variable names.

### Step 7.3 — Migrate the sampler-patterning specification

**Files:**

- `plans/sampler-patterning/spec.md`

Update all requirements that currently say sample name or variation uses the original grid `stepIndex`.

At minimum, revise:

- the mental model;
- Euclidean and mask examples;
- conflicting identity-pattern examples;
- PR 1 mask requirements and acceptance criteria;
- PR 2 engine resolution and mask requirements;
- failure/indexing language;
- final semantic summary.

The revised sampler rule should be:

```txt
onset authority determines event geometry
→ each surviving onset receives a hit index
→ note, sample name, variation, and every other event-addressed lane resolve by hit index
```

Do not begin implementing sampler names or variation-derived onsets in this prerequisite PR.

**Acceptance criteria:**

- [ ] No sampler-patterning requirement says rests consume name or variation values.
- [ ] `.name(["bd", "piano"]).euclid(2, 4)` specifies `bd` then `piano`.
- [ ] `.var([0, 1]).euclid(2, 4)` specifies variations `0` then `1`.
- [ ] The follow-on spec links to the prerequisite hit-index specification.

---

## Phase 8 — Verification and closeout

### Step 8.1 — Focused package verification

Run after the phase that changes each package:

```sh
pnpm --filter @web-audio/schema check
pnpm --filter @web-audio/schema lint
pnpm --filter @web-audio/schema test:ci

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

Schema and patterns are expected to have no production schema redesign, but their checks guard the serialization boundary.

### Step 8.2 — Workspace verification

At completion, run:

```sh
pnpm check
pnpm lint
pnpm test
pnpm format
git diff --check
```

Do not run a development server without asking first.

### Step 8.3 — Manual compatibility review

After automated checks pass, review representative existing sketches or demos containing:

- synth notes plus sparse gain/detune/effects;
- sampler variation under Euclidean/XOX rhythm;
- patterned sampler regions or chop sequence under rests;
- random masks;
- chords;
- fit plus generated chop across multiple bars.

Record intentional audible changes caused by values advancing per hit. Timing, event count, and onset positions should remain unchanged.

Do not launch a browser or development server without permission.

**Acceptance criteria:**

- [ ] All focused checks pass.
- [ ] Workspace check, lint, tests, and formatting pass.
- [ ] `git diff --check` passes.
- [ ] Manual review finds no onset-timing regressions.
- [ ] Any audible differences are explained by the documented hit-index semantic change.

## Completion criteria

This prerequisite is complete when:

- synthesizers and samplers assign consecutive hit indices after final onset eligibility is known;
- all event-addressed static and random value lanes resolve with `(barIndex, hitIndex)`;
- grid `stepIndex` remains intact for geometry and mask evaluation;
- rests and random-mask misses consume no values;
- chords share one hit index across their voices;
- failed sampler playback does not renumber later intended hits;
- generated multi-bar fit/chop behavior no longer depends on global step addressing;
- LFO, bus, routing, MIDI CC, and global sampler-mode semantics remain unchanged;
- public docs and developer terminology describe the new model;
- `plans/sampler-patterning/spec.md` is migrated to hit-based name and variation semantics;
- no sampler-name or variation-onset implementation has leaked into this PR.

## Recommended commit sequence

1. **Characterization fixtures and index-consumer audit**
2. **Internal event context and static-onset grouping**
3. **Synth hit-based scheduling**
4. **Fluid generated multi-bar companion normalization**
5. **Sampler hit-based scheduling**
6. **Random/failure/polyphony integration hardening**
7. **Documentation and sampler-spec migration**
8. **Workspace verification and closeout**

Keep geometry assertions and value assertions separate in tests. That separation is the main safeguard against accidentally changing rhythm while standardizing event-value advancement.
