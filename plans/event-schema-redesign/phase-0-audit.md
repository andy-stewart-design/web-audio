# PR 1 Phase 0 Audit

## Baseline

The migration baseline was run before changing schema types. All required package test suites passed:

| Package                   | Test files | Tests | Result |
| ------------------------- | ---------: | ----: | ------ |
| `@web-audio/patterns`     |         15 |   118 | pass   |
| `@web-audio/fluid`        |         11 |   295 | pass   |
| `@web-audio/audio-engine` |         16 |   340 | pass   |

Commands:

```text
pnpm --filter @web-audio/patterns test:ci
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/audio-engine test:ci
```

The runs report existing non-failing warnings about the root `pnpm.overrides` field and the Fluid/audio-engine Vite `__dirname` configuration. No test failures were observed.

## Phase 0.2 fixture sequencing note

The target schema types begin in PR 1 Phase 1, Step 1.1 and the complete target instrument/validation surface lands through Step 1.3. Therefore `packages/audio-engine/src/test-utils/schema-fixtures.ts` is intentionally a temporary baseline fixture seam at this point. It centralizes the current schema shape so repeated fixtures can be migrated in one place, but it still contains the old `StaticSchema`, `RandomSchema.grid`, `NotesSchema`, `stepIndex`, and `polyphonic` fields. The implementation plan schedules target-schema conversion in Step 4.4 alongside the engine consumers that use the fixtures; no parallel compatibility schema is being introduced.

`packages/schema/src/validate-graph.test.ts` retains local direct fixtures because it is the schema package's validation-failure suite and cannot depend on an audio-engine test utility. Behavior-specific engine fixtures also remain local where their unusual geometry is the subject of the test.

## Migration disposition

The labels below describe the intended disposition during PR 1:

- **preserve** — retain observable musical/runtime behavior while changing representation as required;
- **intentional change in PR 1** — the old compiled representation or runtime policy is explicitly removed by the foundation PR;
- **intentional change deferred to PR 2** — behavior remains out of scope until variation/event semantics land;
- **intentional change deferred to PR 3** — behavior remains out of scope until sample-name patterning lands.

## Characterization coverage

Each behavior is listed separately so the audit remains readable on narrow screens.

- **Static notes with no mask**
  - **Disposition:** preserve
  - **Coverage:** `packages/patterns/src/masked-cycle.test.ts` — `keeps unmasked source content without a trigger grid`; `packages/audio-engine/src/instruments/resolve-note-events.test.ts` — `resolves dense unmasked notes`, `resolves sparse unmasked notes`

- **Static chords grouped by one onset**
  - **Disposition:** preserve
  - **Coverage:** `packages/audio-engine/src/instruments/resolve-note-events.test.ts` — `resolves a chord as one ordered multi-voice event`; `packages/audio-engine/src/instruments/synthesizer.test.ts` — `gives every chord voice the same hit index`; `packages/audio-engine/src/instruments/sampler.test.ts` — `preserves polyphonic source onsets under a mask`

- **Random notes, including note value `0`**
  - **Disposition:** preserve
  - **Coverage:** Existing random value addressing is covered by `resolve-note-events.test.ts` — `resolves random notes by hit index under a static/random mask` and `synthesizer.test.ts` — `resolves random notes by hit index under a static/random mask`. A new explicit zero-value characterization was added in `resolve-note-events.test.ts` — `preserves random note value 0 as an active voice`.

- **Fixed XOX masks**
  - **Disposition:** preserve
  - **Coverage:** `packages/fluid/src/instruments/instrument.test.ts` — `keeps synth source notes separate from the trigger mask`, `serializes all-active xox as an unmasked expanded source cycle`, and `characterizes static xox modifier ordering and timing`; `packages/patterns/src/masked-cycle.test.ts` — `preserves characterized modifier behavior after xox`

- **Fixed Euclidean, hex, and sequence masks**
  - **Disposition:** preserve
  - **Coverage:** `packages/fluid/src/instruments/instrument.test.ts` — the `euclid before xox`, `xox before euclid`, `hex after xox`, and `sequence after xox` fixtures; `packages/patterns/src/masked-cycle.test.ts` — `preserves order-sensitive rhythm modifiers around xox`

- **Random XOX masks, including `.steps(16, 0)`**
  - **Disposition:** preserve behavior, change representation in PR 1
  - **Coverage:** `packages/patterns/src/random-cycle.test.ts` — `creates a repeating sequence of active and empty bars`; `packages/fluid/src/instruments/instrument.test.ts` — `preserves a binary random cycle as a dynamic trigger mask`; `packages/audio-engine/src/instruments/synthesizer.test.ts` — `resolves dynamic masks and skips their empty bars`

- **Fixed rests do not consume hit-addressed values**
  - **Disposition:** preserve
  - **Coverage:** `packages/audio-engine/src/instruments/resolve-note-events.test.ts` — `does not consume hit indices for unmasked random structural rests`; `packages/audio-engine/src/instruments/synthesizer.test.ts` — `does not consume random note or parameter values for sparse structural rests`, `uses hit indices for static-masked event parameters while retaining sparse timing`; `packages/audio-engine/src/instruments/sampler.test.ts` — `relative duration advances by hit index across mask gaps`

- **Random timing misses do not consume note values**
  - **Disposition:** preserve
  - **Coverage:** `packages/audio-engine/src/instruments/resolve-note-events.test.ts` — `does not consume hit indices for random-mask misses`; `packages/audio-engine/src/instruments/synthesizer.test.ts` — `compresses note and parameter values around random-mask misses`, `addresses deterministic static and random lanes identically after random-mask misses`; `packages/audio-engine/src/instruments/sampler.test.ts` — `resolves random notes at consecutive hit indices under a random mask`

- **Random timing misses do not consume variation values**
  - **Disposition:** preserve
  - **Coverage:** `packages/audio-engine/src/instruments/sampler.test.ts` — `resolves variations by consecutive hit after random-mask misses`

- **Random timing misses do not consume processing values**
  - **Disposition:** preserve
  - **Coverage:** `packages/audio-engine/src/instruments/synthesizer.test.ts` — `does not schedule notes or event parameters for random-mask misses`, `compresses note and parameter values around random-mask misses`; `packages/audio-engine/src/instruments/sampler.test.ts` — `resolves shared sampler parameters by hit index`

- **Empty bars and all-rest bars remain silent**
  - **Disposition:** preserve
  - **Coverage:** `packages/audio-engine/src/instruments/resolve-note-events.test.ts` — `returns no events for empty source or mask bars`, `returns no events for all-rest structural grids`, `returns no events for an empty random source bar under a mask`; corresponding dynamic/empty-bar coverage exists in `synthesizer.test.ts` and `sampler.test.ts`

- **Multi-bar `fast`, `slow`, `stretch`, and `reverse`**
  - **Disposition:** preserve current behavior during migration; redesign of fractional semantics is deferred
  - **Coverage:** `packages/patterns/src/utils/speed.test.ts` — multi-bar fast/slow compression and expansion cases; `packages/patterns/src/utils/reverse.test.ts` — multi-bar bar/element reversal; `packages/patterns/src/utils/stretch.test.ts` — multi-bar repetition; `packages/patterns/src/masked-cycle.test.ts` — `preserves characterized modifier behavior after xox`; `packages/fluid/src/instruments/instrument.test.ts` — `characterizes static xox modifier ordering and timing`

- **Synth MIDI note scheduling**
  - **Disposition:** preserve
  - **Coverage:** `packages/audio-engine/src/instruments/synthesizer.test.ts` — `submits resolved pattern timing, original note, and gain-derived velocity`, `matches local note, gain, and mask timing under a random mask`, MIDI availability/zero-velocity cases

- **Sampler region playback**
  - **Disposition:** preserve
  - **Coverage:** `packages/audio-engine/src/instruments/sampler.test.ts` — static file regions, relative duration, sprite-relative regions, clamping, one-shot, loop, and reverse-region cases

- **Sampler chop playback**
  - **Disposition:** preserve
  - **Coverage:** `packages/fluid/src/index.test.ts` — chop schema and fit/chop addressing fixtures; `packages/audio-engine/src/instruments/sampler.test.ts` — chop slices, bounded chop, sprite composition, wrapping, and one-shot chop

- **Sampler fit playback**
  - **Disposition:** preserve
  - **Coverage:** `packages/fluid/src/index.test.ts` — `fit(2)`, `fit(3)`, fit plus chop, and source-type fixtures; `packages/audio-engine/src/instruments/sampler.test.ts` — fit rate, sprite duration, fit variation, and fit/chop scheduling

- **One-shot, clip, and loop playback**
  - **Disposition:** preserve
  - **Coverage:** `packages/fluid/src/index.test.ts` — clip and loop schema cases; `packages/audio-engine/src/instruments/sampler.test.ts` — one-shot duration and loop envelope/window cases

- **Reverse playback**
  - **Disposition:** preserve
  - **Coverage:** `packages/audio-engine/src/instruments/sampler.test.ts` — reverse buffer, absolute/relative region, sprite, loop-point, and duration cases; `packages/audio-engine/src/utils/reversed-buffer-cache.test.ts`

- **Sampler variations for simple files**
  - **Disposition:** preserve current selection behavior in PR 1
  - **Coverage:** `packages/fluid/src/index.test.ts` — variation syntax/defaults; `packages/audio-engine/src/instruments/sampler.test.ts` — selected variation, preload, and hit-index variation cases

- **Sampler variations for sprites**
  - **Disposition:** preserve current selection behavior in PR 1
  - **Coverage:** `packages/audio-engine/src/instruments/sampler.test.ts` — sprite variation region selection and shared-src fetch behavior

- **Sampler variations for multisamples/pitched sprites**
  - **Disposition:** preserve current source-key selection behavior in PR 1
  - **Coverage:** `packages/fluid/src/index.test.ts` — sorted source-key characterization; `packages/audio-engine/src/instruments/sampler.test.ts` — nearest source key, pitched sprite, multisample, region, and fit cases

- **Current preload behavior**
  - **Disposition:** preserve successful preload and deduplication where compatible; remove logical source-key/fallback policy
  - **Coverage:** `packages/audio-engine/src/engine.test.ts` — `preloads all statically known sampler variations before playback`, `preloads every source key × variation combination`, `deduplicates duplicate URLs while preloading source keys`; `packages/audio-engine/src/instruments/sampler.test.ts` — static variation preload and concurrent loading

- **Current URL/buffer cache behavior**
  - **Disposition:** preserve exact URL deduplication, cached hits, reverse-buffer reuse, and retry-on-failure
  - **Coverage:** `packages/audio-engine/src/instruments/sampler.test.ts` — cache hit and concurrent fetch cases; `packages/audio-engine/src/instruments/sample-buffer-store.test.ts` — cached buffers, promise deduplication, failures, reverse preparation, and source-key preload; `packages/audio-engine/src/utils/reversed-buffer-cache.test.ts`

- **Current graph update behavior**
  - **Disposition:** preserve
  - **Coverage:** `packages/audio-engine/src/engine.test.ts` — deferred prebar commit, last-write-wins, cloning, invalid-update isolation, routing, bus effects, and construction failure cases

- **Current graph retirement behavior**
  - **Disposition:** preserve lifecycle semantics
  - **Coverage:** `packages/audio-engine/src/engine.test.ts` — instrument/bus retirement and finished cleanup; `packages/audio-engine/src/instruments/instrument.test.ts` and `sampler.test.ts` — finished promises, cancellation, disconnect, and retirement

## Chop/fit call-order audit

These are the current call-order facts that must be retained unless a later phase explicitly changes them:

- **`fit(2).chop(n)`**
  - **Current behavior:** Generates chop timing across the fit phrase; slices and sequence bars retain their cross-bar addressing.
  - **Coverage:** `packages/fluid/src/index.test.ts` — `characterizes fit(2).chop($sliceCount) cross-bar slice addressing`, `fit(2).chop(8) emits 8 generated notes over 2 bars`

- **`fit(2).chop(n, sequence...)`**
  - **Current behavior:** Preserves the authored sequence bar shape instead of replacing it with generated full-bar sequence data.
  - **Coverage:** `packages/fluid/src/index.test.ts` — `distinguishes generated natural chop timing from authored sequence timing`, `fit(2).chop(8, ...) preserves the authored ... pattern`

- **`fit(2).notes(...)`**
  - **Current behavior:** Explicit notes replace generated fit notes, fit remains in the schema, and the implicit fit-only chop region is suppressed.
  - **Coverage:** `packages/fluid/src/index.test.ts` — `fit with explicit notes preserves explicit note timing and fit`, `explicit notes suppress fit default notes and implicit fit region`

- **`fit(2).chop(...).notes(...)`**
  - **Current behavior:** Explicit notes replace generated note values but preserve fit and explicit chop timing/region; values are addressed over the generated chop events.
  - **Coverage:** `packages/fluid/src/index.test.ts` — `explicit notes provide pitch values over chop timing`, `single explicit note repeats over chop timing`

- **`fit(2).start(...)` or `.duration(...)`**
  - **Current behavior:** An explicit region suppresses the implicit fit-only chop region while fit playback remains.
  - **Coverage:** `packages/fluid/src/index.test.ts` — `explicit region suppresses implicit fit region`, `duration() suppresses the generated fit region while retaining fit playback`

- **`duration(...).chop(...)` and `chop(...).duration(...)`**
  - **Current behavior:** The combination is rejected regardless of setter order.
  - **Coverage:** `packages/fluid/src/index.test.ts` — `duration() rejects chop combinations`

- **Dynamic/static region setters with chop**
  - **Current behavior:** Dynamic start/end values and invalid static bounds are rejected regardless of chaining order.
  - **Coverage:** `packages/fluid/src/index.test.ts` — `dynamic start/end are rejected with chop regardless of chaining order`, `invalid static start/end bounds are rejected with chop`

## Generated chop/fit transform exception

The target rule is that generated chop/fit timing is exempt from `fast`, `slow`, `stretch`, and `reverse`, regardless of whether the transform appears before or after `fit()`/`chop()`.

The legacy representation already satisfies that rule for `fast`, `stretch`, and `reverse`: each transform was characterized before and after both generated `fit(4)` and generated `chop(8)`, and the complete schema remains equal to its untransformed baseline.

`slow()` exposes one legacy state leak. In either call order with generated fit or chop, the generated notes and region remain unchanged, but the transformed default source grid serializes an unrelated two-bar static mask containing one active bar followed by one empty bar. The engine treats that stale mask as authoritative timing, so every second playback bar is silent even though fit/chop generated its own timing. PR 1 must remove that mask while moving generated timing into `TimingSchema`; this is an intentional correction to legacy behavior, not behavior to preserve.

Coverage: `packages/fluid/src/index.test.ts` — `keeps generated chop/fit timing exempt from fast, stretch, and reverse in either order` and `characterizes legacy slow mask leakage into generated chop/fit timing`.

## Rhythm reset behavior

Current setter behavior is also explicitly characterized because PR 2 changes it:

- **Static XOX followed by `.notes(...)`**
  - **Current behavior:** Replaces the source and clears the static mask.
  - **Disposition:** intentional change deferred to PR 2: value setters must no longer clear explicit rhythm.
  - **Coverage:** `packages/fluid/src/instruments/instrument.test.ts` — `replaces static source content and clears its mask`

- **Random XOX followed by `.notes(...)`**
  - **Current behavior:** Replaces the source and clears the random mask.
  - **Disposition:** intentional change deferred to PR 2: value setters must no longer clear explicit rhythm.
  - **Coverage:** `packages/fluid/src/instruments/instrument.test.ts` — `replaces random source content and clears its mask`

## Random seed/ribbon versus geometry audit

Random configuration and candidate geometry are separate baseline concerns:

- **Base seed and algorithm**
  - **Current behavior:** Defaults to seed `0` and `xor`; `algo("mulberry")` changes the resolver algorithm.
  - **Coverage:** `packages/patterns/src/random-cycle.test.ts` — default seed/algorithm and `algo()`; `packages/audio-engine/src/resolvers/random-resolver.test.ts` — deterministic values and algorithm difference
  - **PR 1 disposition:** preserve seed/algorithm metadata; move it to value or chance schemas

- **Ribbon segments**
  - **Current behavior:** Scalar and array seeds/lengths form ordered segments; mismatched arrays wrap by modulo; omitted length means an unbounded segment.
  - **Coverage:** `packages/patterns/src/random-cycle.test.ts` — all `ribbon()` cases; `packages/audio-engine/src/resolvers/random-resolver.test.ts` — segment looping
  - **PR 1 disposition:** preserve seed chronology and ribbon semantics

- **Numeric random value configuration**
  - **Current behavior:** Float/integer/binary type, range, quantization, and value maps determine generated values.
  - **Coverage:** `packages/patterns/src/random-cycle.test.ts` — type/range/quant/algo configuration; `packages/audio-engine/src/resolvers/random-resolver.test.ts` — range, integer, value map, binary, and deterministic cases
  - **PR 1 disposition:** preserve as `RandomNumberPattern` metadata; remove grid geometry from this schema

- **Candidate step geometry**
  - **Current behavior:** `steps()` creates bars and step locations; zero-count bars are explicit; Euclidean filtering changes active positions.
  - **Coverage:** `packages/patterns/src/random-cycle.test.ts` — `steps(4)`, `steps(16, 0, 8)`, and `euclid filters the inner cycle events`; `packages/patterns/src/masked-cycle.test.ts`
  - **PR 1 disposition:** compile to `TimingSchema` candidates and/or one chance condition

- **Binary chance policy**
  - **Current behavior:** Chance is currently attached to the random schema and is valid only for binary cycles; probability boundaries are accepted.
  - **Coverage:** `packages/patterns/src/random-cycle.test.ts` — chance serialization, latest value, boundaries, and binary-only validation; `packages/audio-engine/src/resolvers/random-resolver.test.ts` — binary chance
  - **PR 1 disposition:** intentional representation change in PR 1: extract one typed timing condition; preserve deterministic decisions

## Old compiled-schema inventory

The following inventory identifies the old fields and their current producers/consumers. These are migration targets, not APIs to preserve.

- **`StaticSchemaValue.value/offset/duration/stepIndex`**
  - **Current producers:** `packages/patterns/src/static-cycles.ts`, `packages/patterns/src/utils/chord-static-schema.ts`, Fluid sampler helpers
  - **Current consumers:** `packages/audio-engine/src/instruments/resolve-note-events.ts`, `static-onsets.ts`, instrument/sampler scheduling, preload/region helpers, and tests
  - **PR 1 disposition:** intentional change: values become value-only; offsets/durations become timing; `stepIndex` is removed

- **`StaticSchema` and `polyphonic`**
  - **Current producers:** `packages/patterns/src/static-cycles.ts`, chord helper, Fluid/generated sampler helpers
  - **Current consumers:** all pattern consumers, validation, runtime resolvers, and fixtures
  - **PR 1 disposition:** intentional change: generic static value cycles; voice groups become nested values

- **`RandomSchema.grid`**
  - **Current producers:** `packages/patterns/src/random-cycle.ts`
  - **Current consumers:** Fluid `midi-notes.ts`/sampler helpers, `RandomResolver`, note-event resolution, preload, and tests
  - **PR 1 disposition:** intentional change: numeric randomness uses `valuesPerBar`; timing owns candidate geometry

- **`RandomSchema.chance`**
  - **Current producers:** `packages/patterns/src/random-cycle.ts`
  - **Current consumers:** Fluid mask compilation and `RandomResolver`
  - **PR 1 disposition:** intentional change: only timing carries chance policy; ordinary numeric random values reject chance misuse

- **`NotesSchema` with `source`/`mask`**
  - **Current producers:** Fluid MIDI/sampler builders and schema types
  - **Current consumers:** `resolve-note-events.ts`, static-onset grouping, synth/sampler scheduling, tests
  - **PR 1 disposition:** intentional change: typed synth/sampler `events` with explicit timing

- **Timed `ParameterSchema`**
  - **Current producers:** Fluid `patterns/parameter.ts`, envelope/LFO/effect/region/bus producers
  - **Current consumers:** base instrument, runtime bus, random resolver, effect and automation scheduling, tests
  - **PR 1 disposition:** intentional change: processing fields use value-only `NumberPattern`

- **Top-level instrument `notes`**
  - **Current producers:** Fluid synth/sampler schema builders
  - **Current consumers:** engine instrument constructors/schedulers and tests
  - **PR 1 disposition:** intentional change: move under `events`; sampler notes become optional

- **Sampler `sample` and top-level `variation`**
  - **Current producers:** `packages/fluid/src/instruments/sampler.ts` and schema builder
  - **Current consumers:** audio-engine sampler, preload utility, tests
  - **PR 1 disposition:** intentional change: fixed sample becomes `events.sampleNames`; variation becomes optional `events.variationIndices`

- **`SamplerSchema.sourceKeys`**
  - **Current producers:** Fluid `sampler.ts`/`sampler-utils.ts`; direct fixtures
  - **Current consumers:** audio-engine sampler source selection and preload, Fluid/engine tests
  - **PR 1 disposition:** intentional change: derive keys from normalized bank data at runtime

- **`fallbackBuffer`, `fallbackBufferFor()`**
  - **Current producers:** `packages/audio-engine/src/index.ts`, `sampler.ts`, `sample-buffer-store.ts`
  - **Current consumers:** sampler scheduling and engine hot-swap path, tests
  - **PR 1 disposition:** intentional change: remove approximate old-buffer substitution

- **`hasInitialBuffer()` and sampler `isReady()`**
  - **Current producers:** `sample-buffer-store.ts`, `sampler.ts`
  - **Current consumers:** `hasInitialBuffer()` is used by sampler scheduling; `Sampler.isReady()` is covered by sampler tests only and is not consumed by the engine
  - **PR 1 disposition:** intentional change: remove sampler-wide readiness; load exact URLs lazily and skip only affected voices

- **Static onset grouping by serialized `stepIndex`**
  - **Current producers:** `packages/audio-engine/src/instruments/static-onsets.ts` and `resolve-note-events.ts`
  - **Current consumers:** synth/sampler event resolution and tests
  - **PR 1 disposition:** intentional change: static polyphony is explicit nested voice arrays

## Deferred behavior boundaries

The following baseline behavior is intentionally not expanded during Phase 0 or the PR 1 foundation:

- Variation-derived timing, explicit variation rests, simultaneous variation layers, density selection, modulo variation wrapping, event-wide alternate direction, and transformed random freshness are **intentional changes deferred to PR 2**. PR 1 preserves existing scalar variation playback where the new schema permits it.
- Sample-name patterning, `.name()`, unnamed sampler construction, name-derived timing, name layers, normalized authored name semantics, and multi-name preload are **intentional changes deferred to PR 3**. PR 1 continues using one fixed sample name per sampler.
- Existing out-of-range variation fallback may remain isolated during PR 1 and is an **intentional change deferred to PR 2**, where positive modulo selection becomes authoritative.
- The old schema representation itself is not compatibility behavior. All timed values, masks, grid indices, serialized source keys, fallback buffers, and sampler-wide readiness state are **intentional changes in PR 1**.

## Phase 0 completion checklist

### Step 0.1

- [x] The audit identifies every old compiled-schema field and its current producers/consumers.
- [x] Every behavior named in PR 1 Step 0.1 has an existing or newly added test reference.
- [x] Chop/fit call-order behavior is recorded explicitly, including the generated timing transform exception and legacy `slow()` mask leak that PR 1 must remove.
- [x] Random seed/ribbon behavior is recorded separately from grid geometry.
- [x] Baseline package tests pass before schema work starts.

### Step 0.2

- [x] Reusable baseline factories cover static/random patterns, timing/chance fixtures, default instruments, and file/sprite banks.
- [x] Repeated valid fixtures in audio-engine tests use the shared factory seam where practical.
- [x] Specialized and validation-failure fixtures remain local where their unusual shape is the subject.
- [x] Target-schema factory conversion is scheduled for Phase 4, Step 4.4, alongside target-schema engine migration.
