# Sampler PR4 Region + Chop Implementation Plan

## Context

This plan implements `plans/sampler-pr4-region-chop-prd.md` as a sequence of tracer-bullet vertical slices. Each phase cuts through schema, Fluid, engine, tests, and manual verification so progress is audible and independently verifiable.

## Key design decisions

- Sampler playback remains note-triggered.
- `fit` becomes independent from `notes`: `notes` is always pitch intent, `fit` is timing/stretch intent.
- `.notes()` no longer clears `.fit()`.
- Region/chop values are normalized relative to the resolved sample entry, not the raw decoded buffer.
- Runtime resolution order is: note → source key → variation → sample entry → region/chop → pitch/fit rate → schedule.
- `playbackRate = pitchRate * fitRate`.
- For `fit + chop`, `fitRate` is computed from the full selected source window before slicing, not from each slice.
- `clipMode` semantics remain: clipped mode uses `min(noteDuration, selectedSourceDuration / playbackRate)` for all source windows; one-shot plays the full selected source duration.
- `.chop()` stores natural-order slices; sequence selects slice indices at runtime.
- Chop indices wrap modulo slice count in the engine. Fluid warns for statically detectable out-of-range indices.
- `.start()` / `.end()` may be dynamic standalone, but must be scalar static values when combined with `.chop()`.
- `fit(bars)` requires a positive integer.
- If no explicit notes are provided, Fluid synthesizes helpful fit/chop note schemas.
- `.fit(bars)` with no explicit notes/chop emits generated notes plus an implicit generated chop region so the schema fully encodes source segmentation.

---

## Phase 1: Schema split + fit as a rate modifier

Tracer bullet: the sampler schema supports independent `notes` and `fit`, and a simple fitted sample can play through the normal note scheduling path.

### Step 1.1 — Update schema shape

**Files:** `packages/schema/src/index.ts`

Update `SamplerSchema`:

```ts
interface SamplerSchema extends InstrumentSchema {
  type: "sampler";
  bank: string;
  sample: string;
  variation: ParameterSchema;
  notes: ParameterSchema;
  fit: FitSchema | null;
  region: RegionSchema | null;
  sourceKeys: number[];
  loop: boolean;
  clipMode: ClipMode;
}
```

Add placeholder/exported region types now, even if only `null` is emitted in this phase:

```ts
interface StaticRegionSchema {
  type: "static";
  start: ParameterSchema;
  end: ParameterSchema;
}

interface ChopSliceSchema {
  start: number;
  end: number;
}

interface ChopRegionSchema {
  type: "chop";
  slices: ChopSliceSchema[];
  sequence: ParameterSchema;
}

type RegionSchema = StaticRegionSchema | ChopRegionSchema;
```

**Acceptance criteria:**

- [x] Region schema types are exported from `@web-audio/schema`.
- [x] `SamplerSchema.notes` is always `ParameterSchema`.
- [x] `SamplerSchema.fit` is `FitSchema | null`.
- [x] `SamplerSchema.region` is `RegionSchema | null`.
- [x] Schema package type-checks.

### Step 1.2 — Fluid emits independent fit

**Files:** `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/index.test.ts`

- `.fit(bars)` sets internal `_fit` instead of replacing notes.
- `.notes()` no longer clears `_fit`.
- `fit(bars)` validates `bars` as a positive integer and throws otherwise.
- Existing samplers emit `region: null`.
- Samplers without `.fit()` emit `fit: null`.

**Acceptance criteria:**

- [x] `.fit(2).getSchema()` emits `fit: { type: "fit", bars: 2 }` and `notes` as a `ParameterSchema`.
- [x] `.fit(2).notes([0, 12])` emits both explicit notes and `fit`.
- [x] `.notes()` does not clear `fit`.
- [x] `.fit(1.5)`, `.fit(0)`, and `.fit(-1)` throw.

### Step 1.3 — Engine applies fitRate in normal note scheduling

**Files:** `packages/audio-engine/src/instruments/sampler.ts`

- Remove the `notes.type === "fit"` scheduling branch.
- Treat `schema.notes` as `ParameterSchema` in all paths.
- Compute `fitRate` for the selected source window when `schema.fit` is present.
- Compute `playbackRate = pitchRate * fitRate`.
- Keep `region: null` behavior equivalent to full file/sprite entry windows.

**Acceptance criteria:**

- [x] Engine no longer branches on `notes.type === "fit"`.
- [x] `fitRate` composes with pitch rate.
- [x] Existing non-fit sampler tests still pass after schema updates.

### Automated testing

- [x] `pnpm --filter @web-audio/schema exec tsc --noEmit`
- [x] `pnpm --filter @web-audio/fluid test:ci`
- [x] `pnpm --filter @web-audio/audio-engine test:ci`

### Manual verification

Use a simple file sample:

```ts
d.loadSamples({ loop: ["loop.wav"] });
d.sample("loop").bank("user").fit(1).notes(0).push();
```

Verify:

- [x] Audio plays through normal sampler scheduling.
- [x] Changing `.notes(12)` audibly changes pitch while fit still affects timing/rate.
- [x] No warning about unsupported pitched/fit source keys appears.

---

## Phase 2: `.start()` / `.end()` for file samples

Tracer bullet: a file sample can be trimmed end-to-end.

### Step 2.1 — Fluid region API

**Files:** `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/index.test.ts`

Add:

```ts
.start(...input: CycleInput | [RandomCycle])
.end(...input: CycleInput | [RandomCycle])
```

Emit:

```ts
region: {
  type: "static",
  start: ParameterSchema,
  end: ParameterSchema,
}
```

Defaults:

- `.start(x)` defaults end to `1`.
- `.end(x)` defaults start to `0`.

Validation:

- Static/cycling values must be finite numbers in `[0, 1]`.
- If both start/end are scalar static, require `start < end`.
- Random ranges outside `[0, 1]` warn when detectable.

**Acceptance criteria:**

- [ ] `.start(0.25)` emits start `0.25`, end `1`.
- [ ] `.end(0.75)` emits start `0`, end `0.75`.
- [ ] `.start([0, 0.25])` emits cycling start schema.
- [ ] `.start(0.75).end(0.25)` throws.
- [ ] Invalid numeric bounds throw.

### Step 2.2 — Engine schedules static file regions

**Files:** `packages/audio-engine/src/instruments/sampler.ts`

- Resolve `region.start` and `region.end` per note.
- Clamp resolved values to `[0, 1]` defensively.
- Skip and warn when resolved `end <= start`.
- Map region to offset/duration within a file entry.
- Apply clipped-mode min rule uniformly for file regions.

**Acceptance criteria:**

- [ ] `.start(0.5).end(1)` on a 2s file starts at offset `1s`.
- [ ] Region source duration controls one-shot length.
- [ ] Clipped mode releases at `min(noteDuration, regionDuration / playbackRate)`.
- [ ] Invalid resolved dynamic window skips and warns.

### Automated testing

- [ ] Fluid schema tests for `.start()` / `.end()`.
- [ ] Engine tests for file offset/duration/release timing.
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`

### Manual verification

```ts
d.loadSamples({ loop: ["loop.wav"] });
d.sample("loop").bank("user").start(0.5).clip(false).push();
```

Verify:

- [ ] Playback starts halfway through the file.
- [ ] `.end(0.75)` audibly stops earlier.
- [ ] `.clip(false)` lets the selected region play out.
- [ ] Default notes are unchanged by standalone `.start()` / `.end()`.

---

## Phase 3: `.start()` / `.end()` with sprites and multisamples

Tracer bullet: regions apply within the resolved sample entry, not the raw buffer.

### Step 3.1 — Compose static regions with sprite entry windows

**Files:** `packages/audio-engine/src/instruments/sampler.ts`

For a sprite entry `[entry.start, entry.end]`, map user region values into that window:

```ts
absoluteStart = entry.start + region.start * (entry.end - entry.start);
absoluteEnd = entry.start + region.end * (entry.end - entry.start);
```

**Acceptance criteria:**

- [ ] Sprite `[0.25, 0.5]` plus `.start(0.5).end(1)` plays decoded-buffer window `[0.375, 0.5]`.
- [ ] Source-key and variation resolution happen before region mapping.
- [ ] Region mapping works for pitched sprites and multisamples.

### Automated testing

- [ ] Engine test for sprite entry + static region offset.
- [ ] Engine test for pitched sprite/multisample selected entry + region.
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`

### Manual verification

Use a sprite bank:

```ts
d.sample("fart", 2).bank("effects").start(0.5).clip(false).push();
```

Verify:

- [ ] Playback starts halfway through the selected sprite variation, not halfway through the whole sprite file.
- [ ] Switching variations still applies `.start()` relative to the selected variation.
- [ ] Pitched sprite samples still choose the expected source key before trimming.

---

## Phase 4: Basic `.chop()` for file samples

Tracer bullet: a file sample can be chopped and reordered.

### Step 4.1 — Fluid chop API and schema

**Files:** `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/index.test.ts`

Add:

```ts
.chop(sliceCount: number, ...sequence: CycleInput | [RandomCycle])
```

Rules:

- `sliceCount` must be a positive integer.
- Omitted sequence defaults to `[0, 1, ..., sliceCount - 1]`.
- Slices are stored in natural order.
- Sequence selects slice indices at runtime.
- Static out-of-range sequence values warn, including negative values.

Emit:

```ts
region: {
  type: "chop",
  slices: ChopSliceSchema[],
  sequence: ParameterSchema,
}
```

**Acceptance criteria:**

- [ ] `.chop(4)` emits 4 natural slices and sequence `[0,1,2,3]`.
- [ ] `.chop(4, [0,2,1,3])` emits natural slices and authored sequence.
- [ ] `.chop(0)`, `.chop(-1)`, `.chop(1.5)` throw.
- [ ] Static sequence values outside `[0, sliceCount - 1]` warn but are preserved.

### Step 4.2 — Engine schedules chop slices

**Files:** `packages/audio-engine/src/instruments/sampler.ts`

- Resolve `region.sequence` per note.
- Convert resolved value to an integer index.
- Wrap index modulo slice count using negative-safe modulo.
- Map the selected slice into the resolved entry window.
- Schedule offset/duration using the selected slice.

**Acceptance criteria:**

- [ ] `.chop(4, [0,2,1,3])` schedules slices in authored order.
- [ ] Index `-1` wraps to last slice.
- [ ] Index `4` with 4 slices wraps to `0`.
- [ ] File slices schedule correct offsets and durations.

### Step 4.3 — Fluid default notes for chop

If no explicit notes were provided:

- `.chop(8)` emits 8 notes over 1 bar.
- `.chop(8, [0,2,1,3])` emits 4 notes over 1 bar.

**Acceptance criteria:**

- [ ] Default notes use sequence step count when available.
- [ ] Default notes use `sliceCount` when no explicit sequence is provided.
- [ ] Explicit `.notes()` overrides generated chop notes.

### Automated testing

- [ ] Fluid tests for chop schema/default notes/warnings.
- [ ] Engine tests for slice selection/wrapping/scheduling.
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`

### Manual verification

```ts
d.loadSamples({ break: ["break.wav"] });
d.sample("break").bank("user").chop(4, [0, 2, 1, 3]).push();
```

Verify:

- [ ] Four slices play in the reordered sequence.
- [ ] `.chop(4)` plays slices in natural order.
- [ ] Out-of-range static indices wrap audibly and warn.

---

## Phase 5: `.fit(n)` default segmentation

Tracer bullet: `.fit(n)` with no explicit notes/chop plays the full source across `n` bars via generated notes and an implicit generated chop region.

### Step 5.1 — Fluid generated fit defaults

**Files:** `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/index.test.ts`

When `.fit(bars)` is present and neither explicit notes nor explicit region/chop were provided:

- Emit generated notes over `bars` bars.
- Emit an implicit generated chop region with `bars` natural slices.
- Sequence one slice per bar: `.fit(2)` behaves like `.fit(2).chop(2, 0, 1)`.
- Generated note value uses the lowest available `sourceKey`.

Examples:

```txt
fit(2):
bar 0 → source [0, 0.5]
bar 1 → source [0.5, 1]

fit(3):
bar 0 → source [0, 0.333...]
bar 1 → source [0.333..., 0.666...]
bar 2 → source [0.666..., 1]
```

**Acceptance criteria:**

- [ ] `.fit(2)` emits a 2-bar notes cycle.
- [ ] `.fit(2)` emits an implicit chop region with two slices and a 2-bar sequence.
- [ ] `.fit(3)` emits three slices over three bars.
- [ ] For `sourceKeys: [45, 57]`, generated note value is `45`.

### Step 5.2 — Engine uses generated region normally

No engine inference from note shape is allowed. The engine should simply schedule the generated notes and generated chop region from the schema.

**Acceptance criteria:**

- [ ] Engine does not special-case implicit fit segmentation.
- [ ] `.fit(2)` schedules first half on bar 0, second half on bar 1 through ordinary chop scheduling.
- [ ] `fitRate` is computed from the full selected source window.

### Automated testing

- [ ] Fluid tests for generated notes and implicit chop region.
- [ ] Engine integration test for `.fit(2)` schema scheduling.
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`

### Manual verification

```ts
d.loadSamples({ loop: ["loop.wav"] });
d.sample("loop").bank("user").fit(2).push();
d.sample("loop").bank("user").fit(3).push();
```

Verify:

- [ ] `fit(2)` plays the first half on bar 0 and second half on bar 1.
- [ ] `fit(3)` plays thirds across three bars.
- [ ] No intermediate bar retriggers the first segment incorrectly.
- [ ] Pitched multisample `.fit(2)` without explicit notes plays at the lowest source key, not target note `0`.

---

## Phase 6: `fit + chop`

Tracer bullet: a fitted breakbeat can be chopped across the fit span.

### Step 6.1 — Fluid default notes for `fit + chop`

**Files:** `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/index.test.ts`

When explicit chop is present:

- Use the user-authored chop region, not the implicit fit-only chop region.
- If no explicit notes are provided, generate notes over `fit.bars` bars.
- Default note count comes from sequence step count when available, otherwise `sliceCount`.

**Acceptance criteria:**

- [ ] `.fit(2).chop(8)` emits 8 notes over 2 bars.
- [ ] `.fit(2).chop(8, [0,2,1,3])` emits 4 notes over 2 bars.
- [ ] Explicit `.notes()` overrides generated fit/chop notes.
- [ ] Explicit chop suppresses implicit fit-only chop region.

### Step 6.2 — Engine global fitRate for chopped playback

**Files:** `packages/audio-engine/src/instruments/sampler.ts`

- For chop, compute `fitRate` from the full selected source window before slicing.
- Each slice uses the same global `fitRate`.
- Slice duration is `sliceSourceDuration / (fitRate * pitchRate)`.

**Acceptance criteria:**

- [ ] `.fit(2).chop(8)` uses global fitRate, not per-slice fitRate.
- [ ] Equal slices line up across the generated fit span when pitchRate is 1.
- [ ] Explicit notes can create gaps/overlaps without engine correction.

### Automated testing

- [ ] Fluid tests for default note counts/spans.
- [ ] Engine tests for global fitRate with chop.
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`

### Manual verification

```ts
d.sample("break").bank("user").fit(2).chop(8).push();
d.sample("break").bank("user").fit(2).chop(8, [0, 2, 1, 3]).push();
```

Verify:

- [ ] `fit(2).chop(8)` plays 8 slices across 2 bars.
- [ ] Reordered static sequence changes the audible slice order.
- [ ] The break timing feels fitted to the 2-bar span.

---

## Phase 7: Random chop sequence

Tracer bullet: random chop selects a different slice per generated trigger.

### Step 7.1 — Fluid expands random sequence step masks

**Files:** `packages/fluid/src/instruments/sampler.ts`, random/parameter helpers as needed

For random chop sequences:

- If `.steps(n)` is explicit, preserve it and use `n` default notes.
- If no explicit steps are present, expand the random sequence mask to the default chop note count.

**Acceptance criteria:**

- [ ] `.chop(8, d.rand().int().range(0, 7))` generates 8 notes and an 8-step random sequence mask.
- [ ] `.chop(8, d.rand().int().range(0, 7).steps(4))` generates 4 notes and preserves the 4-step mask.
- [ ] Engine resolves random slice values per generated trigger, not once per bar.

### Automated testing

- [ ] Fluid tests for random sequence mask/default note count.
- [ ] Engine test proving different step indices can resolve different random slice indices.
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`

### Manual verification

```ts
d.sample("break")
  .bank("user")
  .fit(2)
  .chop(8, d.rand().int().range(0, 7))
  .push();

d.sample("break")
  .bank("user")
  .fit(2)
  .chop(8, d.rand().int().range(0, 7).steps(4))
  .push();
```

Verify:

- [ ] Random slices vary across generated triggers.
- [ ] `.steps(4)` produces fewer random trigger positions than the 8-step default.
- [ ] Repeated playback is deterministic for the same random seed/algorithm behavior.

---

## Phase 8: Explicit notes + fit/chop/pitch composition

Tracer bullet: user-authored notes override defaults and pitch fitted/chopped slices.

### Step 8.1 — Explicit note precedence

**Files:** `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/index.test.ts`

- Track explicit `.notes()` calls internally.
- Explicit notes override generated fit/chop notes.
- Explicit notes do not clear `fit` or `region`.

**Acceptance criteria:**

- [ ] `.fit(2).chop(8).notes([0, 12])` emits the explicit 2-step notes schema.
- [ ] `fit` remains present after `.notes()`.
- [ ] `region` remains present after `.notes()`.
- [ ] Generated defaults are not emitted when explicit notes exist.

### Step 8.2 — Engine pitch × fit composition

**Files:** `packages/audio-engine/src/instruments/sampler.ts`

- For explicit notes, use the same `playbackRate = pitchRate * fitRate` rule.
- Do not try to align explicit note timing to `fit.bars`.

**Acceptance criteria:**

- [ ] Notes transpose fitted/chopped slices.
- [ ] Explicit notes can intentionally create gaps/overlaps.
- [ ] Pitched multisample source-key selection still works before chop/region mapping.

### Automated testing

- [ ] Fluid explicit-notes precedence tests.
- [ ] Engine playbackRate composition tests.
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`

### Manual verification

```ts
d.sample("break").bank("user").fit(2).chop(8).notes([0, 12]).push();
```

Verify:

- [ ] Explicit note rhythm replaces generated 8-note default rhythm.
- [ ] Alternating notes audibly pitch slices.
- [ ] Fit still affects the base playback rate.

---

## Phase 9: Start/end + chop windowing

Tracer bullet: chop operates inside a static selected sub-window.

### Step 9.1 — Fluid precomputes bounded chop slices

**Files:** `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/index.test.ts`

When static scalar start/end are combined with chop:

- Precompute slices inside `[start, end]`.
- Reject dynamic start/end with chop during schema generation.
- Throw regardless of chaining order.

**Acceptance criteria:**

- [ ] `.start(0.25).end(0.75).chop(4)` emits 4 slices bounded inside `[0.25, 0.75]`.
- [ ] `.start([0, 0.5]).chop(4)` throws.
- [ ] `.chop(4).start([0, 0.5])` also throws during schema generation.
- [ ] `.start(d.rand().range(0, 0.5)).chop(4)` throws.

### Step 9.2 — Engine schedules bounded slices normally

No new engine special case should be needed if chop slices are already bounded in schema and mapped relative to the resolved entry.

**Acceptance criteria:**

- [ ] Bounded slices schedule correct offsets on files.
- [ ] Bounded slices compose correctly with sprite entry windows.

### Automated testing

- [ ] Fluid tests for bounded slice schema and validation.
- [ ] Engine tests for bounded file/sprite chop offsets.
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`

### Manual verification

```ts
d.sample("break").bank("user").start(0.25).end(0.75).chop(4).push();
```

Verify:

- [ ] Only the middle half of the break is chopped.
- [ ] The four slices are distributed across that middle-half window.
- [ ] Dynamic start/end + chop examples throw clear Fluid errors.

---

## Phase 10: Final integration hardening

Tracer bullet: region/chop/fit work with sprites, pitched sprites, multisamples, and variations.

### Step 10.1 — Fill integration test gaps

**Files:** `packages/fluid/src/index.test.ts`, `packages/audio-engine/src/instruments/sampler.test.ts`, possibly `packages/audio-engine/src/engine.test.ts`

Add coverage for:

- Pitched sprite + chop.
- Sprite variations + chop.
- Multisample + start/end/chop.
- Variation + chop sequence.
- Fit + pitched multisample default lowest source key.
- One-shot + chop overlap/selected-duration behavior.

**Acceptance criteria:**

- [ ] Pitched sprite chooses nearest source key, then maps chop within that sprite region.
- [ ] Variation selection happens before region/chop mapping.
- [ ] Shared sprite files still fetch once.
- [ ] Preload behavior does not need region/chop awareness.

### Step 10.2 — Full verification

Run:

- [ ] `pnpm --filter @web-audio/schema exec tsc --noEmit`
- [ ] `pnpm --filter @web-audio/fluid check`
- [ ] `pnpm --filter @web-audio/fluid lint`
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine check`
- [ ] `pnpm --filter @web-audio/audio-engine lint`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`

### Manual verification

Run these scenarios in the app:

```ts
d.sample("fart").bank("effects").chop(4).push();
```

- [ ] Sprite sample chops relative to its sprite region.

```ts
d.sample("piano").bank("acoustic").notes([45, 57, 60]).chop(2).push();
```

- [ ] Pitched multisample selects expected source keys and chops each selected entry.

```ts
d.sample("harp").bank("sprites").fit(2).chop(4).push();
```

- [ ] Pitched sprite/fitted chop works without double-applying sprite offsets.

```ts
d.sample("break")
  .bank("user")
  .fit(2)
  .chop(8, d.rand().int().range(0, 7))
  .push();
```

- [ ] Random fitted chop is musically usable and varies per trigger.

```ts
d.sample("break")
  .bank("user")
  .start(0.25)
  .end(0.75)
  .fit(2)
  .chop(4, [0, 2, 1, 3])
  .push();
```

- [ ] Start/end, fit, chop, and sequence reordering compose as expected.

---

## Verification commands

Use after each phase as appropriate:

1. `pnpm --filter @web-audio/schema exec tsc --noEmit`
2. `pnpm --filter @web-audio/fluid check`
3. `pnpm --filter @web-audio/fluid lint`
4. `pnpm --filter @web-audio/fluid test:ci`
5. `pnpm --filter @web-audio/audio-engine check`
6. `pnpm --filter @web-audio/audio-engine lint`
7. `pnpm --filter @web-audio/audio-engine test:ci`
