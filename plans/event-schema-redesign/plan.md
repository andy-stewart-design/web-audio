# Event Schema Redesign Implementation Plan

## Context

The current playback schema combines event timing with note and parameter values:

- `StaticSchemaValue` contains `value`, `offset`, `duration`, and `stepIndex`;
- `RandomSchema` contains a timed static `grid`;
- `NotesSchema` combines a note source with an optional mask;
- sampler name and source keys are scalar instrument fields;
- note geometry is the engine's primary source of event existence.

That model now supports hit-based value resolution, but it is still optimized around synthesizers. It cannot cleanly express sample-name patterns, variation-derived timing, or sampler layers without making notes carry unrelated scheduling policy.

This plan implements [`spec.md`](./spec.md). The target model is:

```txt
TimingSchema       → when candidate events happen
ValuePattern<T>    → values consumed by surviving hits
Instrument events  → instrument-specific event values
```

Fluid compiles authoring intent into that model. The engine resolves and schedules it mechanically.

## Scope and non-goals

### In scope

- one explicit timing schema shared by synths and samplers;
- value-only static and random numeric patterns;
- typed synth and sampler event schemas;
- fixed and random rhythm compilation in Fluid;
- variation-derived and sample-name-derived timing;
- static polyphony for notes, names, and variations;
- event-wide transforms with fresh random expansion;
- source-key derivation from normalized bank data;
- exact URL-based loading and reversed-buffer caching;
- strict graph validation;
- complete removal of the old compiled event schema.

### Out of scope

- random sample-name choice;
- patterned sampler constructor arguments;
- per-voice effects, gain, detune, routing, or playback settings;
- redesigning generated chop/fit transform semantics;
- delayed playback after a buffer misses its scheduled time;
- approximate hot-swap buffer substitution;
- old/new schema compatibility unions.

## Required implementation boundaries

- `@web-audio/patterns` owns reusable cycle representation and transformations.
- `@web-audio/fluid` owns authoring semantics, timing priority, rest removal, and schema compilation.
- `@web-audio/schema` owns playback-plan types and structural/cross-field validation.
- `@web-audio/audio-engine` owns deterministic resolution, resource lookup, and scheduling.
- The engine must not inspect Fluid-only intent flags.
- Do not use `as any`, `never` casts as migration escapes, or schema weakening.
- Do not merge any PR with a partially migrated schema.

## Pull request sequence

1. **PR 1 — Event schema foundation:** replace the old schema atomically across all packages and make timing explicit.
2. **PR 2 — Variation semantics:** add variation timing, rests, layers, event transforms, modulo selection, and event-based alternate direction.
3. **PR 3 — Sample-name patterning:** add `.name()`, normalized name patterns, multi-name playback, and multi-name preload.

Each PR must be independently releasable and green. Phases inside PR 1 describe implementation order only; intermediate commits may be temporarily broken because the schema migration itself is atomic.

---

# PR 1 — Event Schema Foundation

## Goal

Replace the note-driven playback schema with separate timing and value patterns for both instruments. Preserve current musical behavior wherever the new representation permits it, while removing serialized grid indices, random grids, source keys, fallback buffers, and sampler-wide readiness.

PR 1 continues to use one fixed sample name per sampler. Existing variation values still work, but variations do not become timing candidates or layered voice groups until PR 2.

## Phase 0: Characterize the migration baseline

### Step 0.1 — Record current behavior before changing types

**Files:**

- `packages/patterns/src/masked-cycle.test.ts`
- `packages/patterns/src/random-cycle.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/fluid/src/index.test.ts`
- `packages/audio-engine/src/instruments/resolve-note-events.test.ts`
- `packages/audio-engine/src/instruments/synthesizer.test.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/engine.test.ts`
- `plans/event-schema-redesign/phase-0-audit.md` (new)

Add or identify characterization coverage for:

- static notes with no mask;
- static chords grouped by one onset;
- random notes, including note value `0`;
- fixed XOX, Euclidean, hex, and sequence masks;
- random XOX masks with `.steps(16, 0)`;
- rests not consuming hit-addressed processing values;
- random misses not consuming note, variation, or processing values;
- multi-bar fast, slow, stretch, and reverse;
- synth MIDI note scheduling;
- region, chop, fit, one-shot, clip, loop, and reverse playback;
- sampler variations across simple files, sprites, and multisamples;
- current preload and cache behavior;
- current graph update and retirement behavior.

Write the audit as a migration checklist. Mark each behavior as:

```txt
preserve
intentional change in PR 1
intentional change deferred to PR 2
intentional change deferred to PR 3
```

Do not preserve old schema shapes merely because a fixture asserts them.

**Acceptance criteria:**

- [x] The audit identifies every old field and every producer/consumer.
- [x] Every behavior named above has an existing or newly added test reference.
- [x] Chop/fit call-order behavior is recorded explicitly.
- [x] Random seed/ribbon behavior is recorded separately from grid geometry.
- [x] The baseline package tests pass before schema work starts.

**Testing:**

- [x] `pnpm --filter @web-audio/patterns test:ci`
- [x] `pnpm --filter @web-audio/fluid test:ci`
- [x] `pnpm --filter @web-audio/audio-engine test:ci`

---

### Step 0.2 — Introduce a reusable baseline test fixture seam

**Files:**

- `packages/audio-engine/src/test-utils/schema-fixtures.ts` (new)
- `packages/audio-engine/src/engine.test.ts`
- `packages/audio-engine/src/instruments/instrument.test.ts`
- `packages/audio-engine/src/instruments/synthesizer.test.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/buses/runtime-bus.test.ts`

The old shape is repeated extensively in engine tests. Before replacing authoritative schema types, centralize repeated valid fixtures behind typed baseline factories for:

- static numeric patterns;
- random numeric patterns;
- timing-shaped bars and schemas;
- chance-shaped conditions;
- default synth schemas;
- default sampler schemas;
- file and sprite banks.

At this step the factories intentionally return valid current-schema values. Do not introduce provisional target types or a compatibility schema before `@web-audio/schema` owns the authoritative definitions. Factories must allow narrow typed overrides and avoid broad `Partial<DromeSchema>` trees that can construct invalid fixtures accidentally. Step 1.4 converts this seam to the target schema after the target instrument types and validator exist.

**Acceptance criteria:**

- [x] New tests can construct complete current schemas without casts.
- [x] Fixture defaults satisfy the current `validateDromeGraph()`.
- [x] Overrides remain local to the behavior under test.
- [x] Repeated valid engine fixtures use the shared seam where practical.
- [x] Specialized and validation-failure fixtures are deliberately retained locally.
- [x] No provisional target schema or compatibility union is introduced.

---

## Phase 1: Replace schema types and validation

### Step 1.1 — Define value-only patterns and timing

**Files:**

- `packages/schema/src/index.ts`

Replace the sequencing section with the target types from the specification:

```ts
interface StaticValuePattern<T> {
  type: "static";
  cycle: T[][];
}

interface RandomNumberPattern {
  type: "random-number";
  valuesPerBar: number[];
  dataType: "float" | "integer" | "binary";
  segments: { seed: number; len?: number }[];
  range?: { min: number; max: number };
  quantValue?: number;
  algorithm: "xor" | "mulberry";
  valueMap?: number[];
  order: "forward" | "reverse";
}

interface TimingStep {
  offset: number;
  duration: number;
}

interface ChanceCondition {
  type: "chance";
  probability: number;
  segments: { seed: number; len?: number }[];
  algorithm: "xor" | "mulberry";
  order: "forward" | "reverse";
}

interface TimingSchema {
  cycle: TimingStep[][];
  condition?: ChanceCondition;
}
```

Add aliases for:

- `NumberPattern`;
- `NotePattern`;
- `SampleNamePattern`;
- `VariationIndexPattern`.

Remove:

- `StaticSchemaValue`;
- `StaticSchema`;
- `RandomSchema`;
- `NotesSchema`;
- `ParameterSchema` if no public use remains after migration.

If `ParameterSchema` is retained temporarily as a deprecated alias inside the PR, remove it before merge. The final exported API must use the target names.

**Acceptance criteria:**

- [ ] Static values contain values only.
- [ ] Random values contain `valuesPerBar` and no `grid`.
- [ ] Timing contains only offsets, durations, and one optional condition.
- [ ] There is no serialized `stepIndex` or `polyphonic` flag.
- [ ] `RandomNumberPattern` cannot carry timing chance policy.
- [ ] Target types are exported from `@web-audio/schema`.

**Testing:**

- [ ] `pnpm --filter @web-audio/schema check`

---

### Step 1.2 — Add typed instrument event schemas

**Files:**

- `packages/schema/src/index.ts`

Introduce:

```ts
interface SynthEventSchema {
  timing: TimingSchema;
  notes: NotePattern;
}

interface SamplerEventSchema {
  timing: TimingSchema;
  notes?: NotePattern;
  sampleNames: SampleNamePattern;
  variationIndices?: VariationIndexPattern;
}

interface InstrumentSchema<TEvents> {
  events: TEvents;
  gain: EnvelopeSchema;
  effects: EffectSchema[];
  detune: AudioParamSchema;
  muted: boolean;
  route: string;
  sends: Record<string, number>;
}
```

Move synth and sampler event values under `events`.

PR 1 sampler rules:

- emit the current scalar sample as a one-value `sampleNames` pattern;
- omit `notes` when the sampler has no explicit pitch intent and does not need note values for an existing composition rule;
- omit `variationIndices` only when variation is semantically the default `0`;
- otherwise serialize the existing variation pattern under `events.variationIndices`.

Remove `SamplerSchema.sourceKeys`, `SamplerSchema.sample`, top-level `variation`, and top-level instrument `notes`.

Update all numeric consumers:

- envelopes;
- LFO outputs;
- effect parameters;
- static regions;
- chop sequences.

These fields use `NumberPattern`, not event timing.

**Acceptance criteria:**

- [ ] Synth notes remain required and default to explicit note `60`.
- [ ] Sampler names are represented as event values even before `.name()` exists.
- [ ] Sampler notes and variations use absence defaults.
- [ ] Shared processing remains outside `events`.
- [ ] `DromeSchema.instruments` uses only target synth/sampler types.
- [ ] No schema compatibility union exists.

**Testing:**

- [ ] Type-level fixtures cover synth, natural-pitch sampler, pitched sampler, static variation, random variation, region, chop, and fit schemas.
- [ ] `pnpm --filter @web-audio/schema check`

---

### Step 1.3 — Expand `validateDromeGraph()` into full playback-plan validation

**Files:**

- `packages/schema/src/validate-graph.ts`
- `packages/schema/src/validate-graph.test.ts`

Add focused validators for:

- static numeric patterns;
- random numeric patterns;
- static event voice patterns;
- timing cycles;
- chance conditions;
- synth events;
- sampler events;
- envelopes, LFOs, effects, regions, routes, sends, and buses;
- existing canonical route and bus names;
- non-empty PR 1 bank and fixed sample identifiers, with final trimming and collision checks added in PR 3.

Required timing checks:

- cycle is non-empty;
- empty bars are allowed;
- offsets are finite and in `[0, 1)`;
- offsets are strictly increasing and unique;
- durations are finite and positive;
- durations may exceed one bar.

Required random checks:

- `valuesPerBar` is non-empty;
- each count is a finite non-negative integer;
- segments, lengths, seeds, ranges, quantization, value maps, algorithms, and order are valid;
- an unbounded ribbon is represented by exactly one segment without `len`;
- reverse order is accepted without altering seed chronology.

Required event checks:

- static voice groups are non-empty;
- every numeric voice value is finite;
- every PR 1 fixed sample name is non-empty, with canonical-name validation added alongside `.name()` in PR 3;
- `null` is the only entry in a silent static bar;
- a silent static bar aligns with an empty timing bar;
- a zero `valuesPerBar` entry aligns with an empty timing bar when used as an event field;
- synth notes are present;
- sampler sample names are present and contain at least one real name;
- optional sampler notes and variations obey the same timing alignment.

Resource availability is not a validation concern. Missing banks, sample names, URLs, buffers, and MIDI devices remain runtime warnings.

**Acceptance criteria:**

- [ ] Validation covers every schema branch, not only bus parameters.
- [ ] Invalid direct schemas fail before graph commit.
- [ ] Long timing durations remain valid.
- [ ] Empty timing bars are valid.
- [ ] Unsorted or duplicate timing offsets are rejected.
- [ ] Invalid event/value cross-field alignment is rejected.
- [ ] Missing external resources do not invalidate an otherwise valid graph.
- [ ] Validation errors include precise schema paths.

**Testing:**

- [ ] Positive tests cover every valid pattern and event union member.
- [ ] Table-driven negative tests cover each invariant above.
- [ ] `pnpm --filter @web-audio/schema test:ci`

`AudioEngine.update()` validation-isolation coverage lands in Step 4.4 after the engine consumes the target instrument schema; do not add a temporary old/new schema bridge here.

---

### Step 1.4 — Convert the shared fixture seam to the target schema

**Files:**

- `packages/schema/src/validate-graph.test.ts`
- `packages/audio-engine/src/test-utils/schema-fixtures.ts`
- `packages/audio-engine/src/engine.test.ts`
- `packages/audio-engine/src/instruments/instrument.test.ts`
- `packages/audio-engine/src/instruments/synthesizer.test.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/buses/runtime-bus.test.ts`

Convert the Phase 0 baseline factories to authoritative target-schema values now that the value, timing, event, instrument, and validation types exist. Remove every old fixture-only `StaticSchema`, `RandomSchema.grid`, `NotesSchema`, `stepIndex`, and `polyphonic` field rather than retaining compatibility helpers.

Factories must return valid target-schema values and allow narrow typed overrides. Keep behavior-specific fixtures local where unusual geometry is the subject of the test, and keep validation-failure fixtures local to the schema package.

**Acceptance criteria:**

- [ ] New tests can construct complete target schemas without casts.
- [ ] Fixture defaults satisfy the expanded `validateDromeGraph()`.
- [ ] Overrides remain local to the behavior under test.
- [ ] Existing valid direct fixtures are migrated or deliberately retained because their unusual shape is under test.
- [ ] No old-schema fixture helper or compatibility union remains.

**Testing:**

- [ ] `pnpm --filter @web-audio/schema test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine check`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`

---

## Phase 2: Migrate reusable pattern serialization

### Step 2.1 — Serialize static cycles as values only

**Files:**

- `packages/patterns/src/types.ts`
- `packages/patterns/src/index.ts`
- `packages/patterns/src/static-cycles.ts`
- `packages/patterns/src/value-cycle.test.ts`
- `packages/patterns/src/binary-cycle.test.ts`
- `packages/patterns/src/utils/chord-static-schema.ts`
- `packages/patterns/src/utils/chord-static-schema.test.ts`

Change `ValueCycle` serialization from timed objects to `StaticValuePattern<number>`:

```ts
{ type: "static", cycle: [[10, 20, 30]] }
```

Give binary geometry a timing-specific serializer rather than encoding `value: 1`. A fixed binary pattern should compile to:

```ts
{
  cycle: [[
    { offset: 0, duration: 0.25 },
    { offset: 0.5, duration: 0.25 },
  ]],
}
```

Replace `getChordStaticSchema()` with a helper that returns grouped note values:

```ts
{ type: "static", cycle: [[[60], [64, 67]]] }
```

Do not retain timed-value serializer overloads.

**Acceptance criteria:**

- [ ] `ValueCycle` preserves zero and all finite numeric data.
- [ ] Binary timing omits fixed rests entirely.
- [ ] Chords are represented by nested values, not duplicate timed objects.
- [ ] No patterns export references old schema types.

**Testing:**

- [ ] Single- and multi-bar numeric cycles serialize correctly.
- [ ] Empty numeric bars have explicit validation behavior.
- [ ] Sparse Euclidean/XOX/hex/sequence timing preserves offsets and durations without indices.
- [ ] Chord voice order is stable.

---

### Step 2.2 — Split random value shape from random timing condition

**Files:**

- `packages/patterns/src/random-cycle.ts`
- `packages/patterns/src/random-cycle.test.ts`
- `packages/patterns/src/types.ts`
- `packages/patterns/src/index.ts`

Expose enough immutable data for Fluid to compile either:

- a `RandomNumberPattern`; or
- a timing `ChanceCondition` plus candidate timing.

`RandomNumberPattern.valuesPerBar` comes from active random pattern positions after fixed pattern operations. It has no timed grid.

When a binary random cycle is supplied to `.xox()`:

- `.chance(p)` becomes `ChanceCondition.probability = p`;
- no explicit chance uses binary probability `0.5`;
- probability `1` compiles as fixed timing without a condition;
- probability `0` compiles as empty timing;
- only one condition is serialized.

A chance-configured random cycle used as an ordinary numeric value is not representable by `RandomNumberPattern`. Reject that misuse with a clear Fluid/pattern error rather than adding chance policy back to the numeric schema.

Add `order: "forward" | "reverse"` to random value output even though PR 2 completes event-wide reverse behavior.

**Acceptance criteria:**

- [ ] Random value schemas contain counts only.
- [ ] `.steps(16, 0, 8)` emits `valuesPerBar: [16, 0, 8]`.
- [ ] Random timing extracts one specialized chance condition.
- [ ] Numeric random output and timing chance cannot be confused.
- [ ] Seeds, ribbons, ranges, quantization, value maps, and algorithms are preserved.

**Testing:**

- [ ] Default random schema.
- [ ] Multi-bar counts including zero.
- [ ] Bounded and unbounded ribbons.
- [ ] Binary XOX with default, zero, one, and fractional probability.
- [ ] Chance used outside timing fails explicitly.

---

### Step 2.3 — Expose source values and trigger geometry from `MaskedCycle`

**Files:**

- `packages/patterns/src/masked-cycle.ts`
- `packages/patterns/src/masked-cycle.test.ts`
- `packages/patterns/src/base-cycle.ts`
- `packages/patterns/src/pattern-cycle.ts`

Keep `MaskedCycle`'s internal separation of source and grid. Add target-facing accessors that let Fluid obtain:

- source values grouped by authored hit;
- fixed candidate timing after pattern modifiers;
- the fixed rest filter;
- transformed active source references where needed.

Do not expose grid step indices in schema-facing data.

Preserve these invariants:

- an active trigger advances source hit addressing;
- a fixed rest does not consume a source value;
- duplicate chord voices remain one hit;
- an empty bar remains an explicit bar;
- fixed modifiers compose in call order.

**Acceptance criteria:**

- [ ] Fluid can compile timing without reconstructing it from serialized note values.
- [ ] Fluid can compile values without retaining timing objects.
- [ ] No runtime engine type depends on `MaskedCycle` internals.
- [ ] Existing pattern composition behavior has target-shape coverage.

---

## Phase 3: Compile target schemas in Fluid

### Step 3.1 — Convert numeric `Parameter` output

**Files:**

- `packages/fluid/src/patterns/parameter.ts`
- `packages/fluid/src/automations/envelope.ts`
- `packages/fluid/src/automations/lfo.ts`
- `packages/fluid/src/effects/filter.ts`
- `packages/fluid/src/effects/gain.ts`
- `packages/fluid/src/buses/bus.ts`
- associated tests

Make `Parameter.getSchema()` return `NumberPattern`.

Update every processing schema producer to use value-only numeric patterns. Processing patterns keep independent bar/hit wrapping and never contribute timing.

Ensure zero remains ordinary data. No processing serializer may filter values based on truthiness.

**Acceptance criteria:**

- [ ] Static processing cycles serialize as raw numbers.
- [ ] Random processing cycles serialize with `valuesPerBar`.
- [ ] Envelopes, LFOs, effects, regions, buses, detune, and gain compile without timing fields.
- [ ] Existing Fluid chaining APIs remain unchanged.

**Testing:**

- [ ] Static and random gain/detune/effect values.
- [ ] Envelope max/ADSR order independence remains intact.
- [ ] LFO bar values remain resolvable.
- [ ] Bus values remain bar-addressed by their first value.

---

### Step 3.2 — Add a Fluid timing compiler

**Files:**

- `packages/fluid/src/instruments/event-pattern-compiler.ts` (new)
- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/patterns/midi-notes.ts`
- `packages/fluid/src/instruments/instrument.test.ts`

Create a Fluid-owned compiler that accepts the current note/rhythm state and emits:

```ts
{
  timing: TimingSchema;
  notes: NotePattern;
}
```

PR 1 behavior:

- static note geometry supplies candidate timing when no stronger timing exists;
- a fixed mask becomes the timing cycle directly;
- fixed rests are omitted before serialization;
- a random XOX mask becomes candidate timing plus one chance condition;
- random note values use their active geometry for timing but serialize independently;
- synth defaults compile to note `60` and one event per bar;
- root and scale transform note values, not timing.

Track explicit rhythm state separately from note value replacement so PR 2 can enforce the final setter-priority rules without another schema change.

**Acceptance criteria:**

- [ ] Fixed masks do not serialize as value patterns.
- [ ] Random masks do not serialize a duplicate random grid.
- [ ] Static chords produce one timing entry and one note voice group.
- [ ] Random note zero remains a playable note value.
- [ ] Timing entries are canonical before validation.

**Testing:**

- [ ] Default synth.
- [ ] Static notes and chords.
- [ ] Static notes with rests.
- [ ] Random notes with fixed timing.
- [ ] Fixed and random XOX.
- [ ] Euclidean, hex, and sequence composition.
- [ ] Multi-bar empty timing.

---

### Step 3.3 — Migrate synth and sampler schema builders atomically

**Files:**

- `packages/fluid/src/instruments/synthesizer.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/patterns/sample-notes.ts`
- `packages/fluid/src/index.ts`
- `packages/fluid/src/types.ts`
- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`

Synth output:

```ts
{
  type: "synthesizer",
  events: { timing, notes },
  // shared fields
}
```

Sampler output in PR 1:

```ts
{
  type: "sampler",
  bank,
  events: {
    timing,
    sampleNames: { type: "static", cycle: [[[sampleName]]] },
    notes?,
    variationIndices?,
  },
  // fit, region, shared fields
}
```

Refactor `sampler-utils.ts` so generated chop/fit helpers return timing and value-only sequence data. Remove helper logic that copies offsets/durations/step indices into dummy notes.

Track sampler pitch intent separately from timing intent:

- `.notes()` supplies note values and may participate in timing;
- `.root()` and `.scale()` create or alter optional note values but never claim timing;
- a sampler with none of those calls omits `events.notes` and uses natural pitch.

Remove Fluid source-key discovery from the sampler schema. Unknown banks and samples may still warn when Fluid can detect them, but they do not produce `[0]` fallback metadata.

Preserve current chop/fit outputs and long durations:

```txt
chop(1).fit(4) → one event lasting four bars
chop(2).fit(4) → two events lasting two bars
chop(8).fit(4) → eight events lasting half a bar
```

**Acceptance criteria:**

- [ ] Every Fluid instrument emits the target event shape.
- [ ] No Fluid output contains old notes/mask/source/grid fields.
- [ ] Natural-pitch samplers omit `events.notes`.
- [ ] `.root()`/`.scale()` may cause sampler notes to serialize without changing timing ownership.
- [ ] Default variation omits `events.variationIndices`.
- [ ] Existing explicit variation values serialize under the new field.
- [ ] Generated chop/fit timing is preserved.
- [ ] `getSchema()` validates its completed graph.

**Testing:**

- [ ] Full schema snapshots for synth and sampler variants.
- [ ] Mixed synth/sampler graph.
- [ ] Existing routing, sends, MIDI output, effects, and banks survive migration.
- [ ] Unknown bank/sample warnings contain no fake source-key fallback.
- [ ] `pnpm --filter @web-audio/fluid check`
- [ ] `pnpm --filter @web-audio/fluid test:ci`

---

## Phase 4: Replace engine event resolution

### Step 4.1 — Resolve timing independently

**Files:**

- `packages/audio-engine/src/instruments/resolve-timing.ts` (new)
- `packages/audio-engine/src/instruments/resolve-timing.test.ts` (new)
- `packages/audio-engine/src/resolvers/chance-resolver.ts` (new, if kept separate)
- `packages/audio-engine/src/resolvers/chance-resolver.test.ts` (new)
- `packages/audio-engine/src/utils/random.ts`

Implement a resolver that returns:

```ts
interface ResolvedTimingEvent {
  hitIndex: number;
  offset: number;
  duration: number;
}
```

For one playback bar:

1. wrap to the timing cycle bar;
2. iterate canonical candidates in order;
3. evaluate one chance result per candidate when present;
4. discard failed candidates;
5. number survivors consecutively from zero.

Chance generation uses the same seed/ribbon algorithms as numeric randomness but remains a typed timing concern.

Do not pass source values or grid positions into this resolver.

**Acceptance criteria:**

- [ ] Fixed timing returns every candidate unchanged except for assigned hit index.
- [ ] Chance is evaluated once per candidate event.
- [ ] Failed candidates do not leave hit-number gaps.
- [ ] Empty bars return no events.
- [ ] Timing durations over one bar survive unchanged.
- [ ] Reverse order reverses decisions inside a bar without reversing absolute seed progression.

**Testing:**

- [ ] Fixed one- and multi-bar timing.
- [ ] Deterministic seeded chance results.
- [ ] Probability boundaries.
- [ ] Empty and long-duration bars.
- [ ] Failure-independent hit numbering.

---

### Step 4.2 — Resolve value-only static and random patterns

**Files:**

- `packages/audio-engine/src/resolvers/random-resolver.ts`
- `packages/audio-engine/src/resolvers/random-resolver.test.ts`
- `packages/audio-engine/src/instruments/resolve-event-value.ts` (new)
- `packages/audio-engine/src/instruments/resolve-event-value.test.ts` (new)
- `packages/audio-engine/src/instruments/instrument.ts`
- `packages/audio-engine/src/buses/runtime-bus.ts`
- `packages/audio-engine/src/buses/runtime-bus.test.ts`

Update `RandomResolver` to generate exactly `valuesPerBar[barIndex % length]` values. Apply `order` after generation. Keep seed/ribbon progression tied to playback `barIndex`.

Add generic static value resolution:

```txt
bar = cycle[barIndex modulo cycle.length]
value = bar[hitIndex modulo bar.length]
```

Validated unreachable empty bars must never reach this operation.

Update the base instrument and runtime bus to resolve `NumberPattern` rather than old parameter schemas.

**Acceptance criteria:**

- [ ] Static value lookup ignores timing offsets because none exist.
- [ ] Random generation count comes only from `valuesPerBar`.
- [ ] Static and random patterns wrap independently by bar and hit.
- [ ] Random reverse affects result order within each bar.
- [ ] Processing values resolve by final surviving hit.
- [ ] Bus parameters continue resolving their first value per bar.

**Testing:**

- [ ] Static zero, negative, and fractional values.
- [ ] Random zero-count unreachable bars.
- [ ] Random float, integer, binary, quantized, ranged, and mapped values.
- [ ] Ribbon progression and cache behavior.
- [ ] Runtime bus transitions with static/random target patterns.

---

### Step 4.3 — Add typed synth and sampler event resolvers

**Files:**

- `packages/audio-engine/src/instruments/resolve-synth-events.ts` (new)
- `packages/audio-engine/src/instruments/resolve-synth-events.test.ts` (new)
- `packages/audio-engine/src/instruments/resolve-sampler-events.ts` (new)
- `packages/audio-engine/src/instruments/resolve-sampler-events.test.ts` (new)
- `packages/audio-engine/src/instruments/resolve-note-events.ts` (remove)
- `packages/audio-engine/src/instruments/resolve-note-events.test.ts` (remove)
- `packages/audio-engine/src/instruments/static-onsets.ts` (remove)
- `packages/audio-engine/src/instruments/static-onsets.test.ts` (remove)
- `packages/audio-engine/src/types.ts`

Synth resolution:

1. resolve timing;
2. resolve static note group or one random scalar for each hit;
3. return notes as a voice array.

Sampler resolution in PR 1:

1. resolve timing;
2. resolve optional note group;
3. resolve the fixed one-name group;
4. resolve optional variation scalar/group;
5. build complete sampler voice objects.

Implement longest-array wrapping now, even though PR 2 and PR 3 expose more authoring paths. This prevents later engine-policy changes.

Remove onset grouping. Static polyphony is explicit in value arrays.

**Acceptance criteria:**

- [ ] Resolvers consume `TimingSchema` first.
- [ ] Static note zero is not a rest.
- [ ] Random note/variation scalars normalize to one-value groups.
- [ ] Sampler absence defaults are represented without fake schema values.
- [ ] Longest-array pairing and wrapping are deterministic.
- [ ] No resolver reads `stepIndex`, offsets from values, or `polyphonic` flags.

**Testing:**

- [ ] Synth scalar, chord, and random notes.
- [ ] Sampler natural pitch and default variation.
- [ ] Static and random explicit variation.
- [ ] Unequal note/name/variation group lengths.
- [ ] Multi-bar wrapping and empty timing bars.

---

### Step 4.4 — Migrate synth and sampler scheduling

**Files:**

- `packages/audio-engine/src/instruments/synthesizer.ts`
- `packages/audio-engine/src/instruments/synthesizer.test.ts`
- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/instruments/instrument.ts`
- `packages/audio-engine/src/midi-output-scheduler.test.ts`

Both instruments should:

1. resolve events for the bar;
2. convert normalized timing to audio times;
3. build one `EventScheduleContext` per event/voice duration;
4. resolve processing values with the final hit number;
5. schedule voices.

Synth requirements:

- every chord voice shares the event hit number;
- MIDI note output mirrors audio voices;
- velocity continues to derive from resolved gain envelope max.

Sampler requirements:

- complete voice identity is resolved before bank/buffer lookup;
- missing resources skip only the affected voice;
- failures do not alter later hit indices;
- per-voice source windows and actual durations remain independent;
- shared region/chop values use the event hit number.

**Acceptance criteria:**

- [ ] Synth and sampler share timing semantics.
- [ ] Processing resolution is unchanged for successful events.
- [ ] Random timing misses consume no processing values.
- [ ] Missing sampler resources do not shift subsequent patterns.
- [ ] Existing envelopes, detune, effects, MIDI, regions, fit, loop, clip, and direction behavior remains covered.

**Testing:**

- [ ] `AudioEngine.update()` tests prove failed validation leaves pending/active state unchanged.

---

## Phase 5: Derive sampler sources and simplify buffer loading

### Step 5.1 — Derive source keys from bank data

**Files:**

- `packages/audio-engine/src/utils/resolve-sample-entry.ts`
- `packages/audio-engine/src/utils/resolve-sample-entry.test.ts`
- `packages/audio-engine/src/instruments/resolve-sampler-events.ts`
- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`

Add engine helpers to:

- resolve a normalized bank and sample by exact canonical name;
- derive and sort numeric source keys;
- cache derived keys by bank/sample identity;
- select the nearest key with deterministic lower-key tie behavior;
- select the lowest key for natural-pitch playback.

Do not serialize fallback source keys for missing resources.

PR 1 may preserve current out-of-range variation fallback until PR 2 introduces modulo wrapping, but isolate that choice in one helper so PR 2 is a small, tested change.

**Acceptance criteria:**

- [ ] Simple samples derive `[0]` from bank data.
- [ ] Multisamples and pitched sprites derive sorted MIDI keys.
- [ ] Natural pitch uses the selected lowest key at pitch rate `1`.
- [ ] Missing banks, names, keys, or entries return `null` and warn at the appropriate boundary.
- [ ] No schema or Fluid helper returns `sourceKeys`.

**Testing:**

- [ ] Simple file, file variations, sprite, multisample, and pitched sprite lookup.
- [ ] Nearest-key exact, lower, upper, and midpoint cases.
- [ ] Missing-resource cases.

---

### Step 5.2 — Replace `SampleBufferStore` with shared exact-URL caching

**Files:**

- `packages/audio-engine/src/instruments/sample-buffer-store.ts` (remove)
- `packages/audio-engine/src/instruments/sample-buffer-store.test.ts` (replace)
- `packages/audio-engine/src/instruments/sample-buffer-cache.ts` (new)
- `packages/audio-engine/src/instruments/sample-buffer-cache.test.ts` (new)
- `packages/audio-engine/src/utils/reversed-buffer-cache.ts`
- `packages/audio-engine/src/utils/reversed-buffer-cache.test.ts`
- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/index.ts`
- `packages/audio-engine/src/engine.test.ts`

Create one engine-owned resource cache keyed by resolved URL:

```txt
resolved URL → AudioBuffer
loading URL  → Promise<AudioBuffer | null>
AudioBuffer  → reversed AudioBuffer
```

The runtime sampler should resolve an entry first, then ask for that exact URL. Do not keep a sampler-local logical map keyed by variation/source key.

Remove:

- initial variation/source identity;
- fallback buffers inherited from prior graphs;
- `fallbackBufferFor()`;
- `hasInitialBuffer()`;
- sampler `isReady()`;
- schedule-bar-wide readiness checks.

On an unloaded exact URL:

- start or reuse its background load;
- warn and skip that voice at its scheduled time;
- allow later hits to use the loaded result;
- do not delay or substitute playback.

Prepare reverse buffers through the shared weak cache when reverse or alternate direction may require them.

**Acceptance criteria:**

- [ ] Two logical entries with the same URL share one fetch/decode.
- [ ] Different URLs never substitute for each other.
- [ ] A missing variation does not block already loaded voices.
- [ ] Failed loads are warning-producing and retryable.
- [ ] Sprite metadata remains attached to the logical entry, not the URL cache.
- [ ] Retiring graphs may continue using shared decoded buffers safely.

**Testing:**

- [ ] Concurrent URL deduplication.
- [ ] Resolved synchronous cache hit after `prepare()`.
- [ ] Lazy miss followed by later successful playback.
- [ ] Fetch/decode failure and retry.
- [ ] Shared sprite URL with distinct regions.
- [ ] Forward/reverse cache reuse.
- [ ] No approximate hot-swap regression.

---

### Step 5.3 — Rebuild preload planning from event patterns and bank data

**Files:**

- `packages/audio-engine/src/utils/preload-variations.ts` (replace or rename)
- `packages/audio-engine/src/utils/preload-variations.test.ts` (new if renamed coverage is absent)
- `packages/audio-engine/src/index.ts`
- `packages/audio-engine/src/engine.test.ts`

For each sampler in PR 1:

1. collect the statically fixed sample name;
2. derive all source keys from bank data;
3. infer a provably complete variation set when possible;
4. otherwise include every available variation for each source key;
5. resolve entries to URLs;
6. deduplicate URLs globally;
7. preload and optionally reverse each URL.

Safe finite variation sources include:

- absent variation, which means `0`;
- every value in a static variation pattern;
- every value in a finite random `valueMap`;
- a small finite integer range.

If rounding, later wrapping, reversed ranges, quantization, or broad random output makes a smaller set uncertain, preload all variations rather than guessing.

**Acceptance criteria:**

- [ ] Preload uses bank-derived source keys.
- [ ] Every provably possible static variation URL is included.
- [ ] Unknown/broad random variation preloads all available entries.
- [ ] Duplicate URLs load once across instruments and identities.
- [ ] Missing resources warn and do not reject `prepare()`.

**Testing:**

- [ ] Default, static, mapped random, finite integer random, and broad random variation plans.
- [ ] Multiple source keys with different variation counts.
- [ ] Shared URLs and sprites.
- [ ] Reverse/alternate preparation.

---

## Phase 6: PR 1 integration and cleanup

### Step 6.1 — Remove old schema and runtime code completely

**Files:** all packages and tests

Search for and remove target-obsolete references:

```txt
StaticSchemaValue
StaticSchema
RandomSchema.grid
NotesSchema
stepIndex
polyphonic
sourceKeys
notes.source
notes.mask
fallbackBuffer
fallbackBufferFor
isReady()
```

Some authoring internals may still use local step positions. They must not reuse removed schema names or cross the Fluid/engine boundary.

**Acceptance criteria:**

- [ ] Repository search finds no old compiled-schema field usage.
- [ ] No compatibility parser or union remains.
- [ ] No unsafe cast was added to finish migration.
- [ ] Build output exports only target schema types.

---

### Step 6.2 — Update docs and package examples for the foundation

**Files:**

- `README.md`
- `packages/fluid/README.md`
- `packages/audio-engine/README.md`
- `docs/concepts/patterns.md`
- `docs/concepts/developer-terms.md`
- `docs/concepts/glossary.md`
- sample schema snippets elsewhere in the repository

Document:

- timing versus event values versus processing values;
- hit-based resolution after timing filters;
- no serialized step indices;
- sampler natural-pitch/default-variation absence;
- exact URL loading behavior;
- direct-schema validation requirements.

Do not document `.name()` or final variation timing until their PRs land.

**Acceptance criteria:**

- [ ] No docs show the old schema.
- [ ] Public examples remain runnable against PR 1.
- [ ] Terminology uses “event,” “hit,” “voice,” and “timing” consistently.

---

### Step 6.3 — Verify PR 1

**Automated verification:**

- [ ] `pnpm exec prettier --check plans/event-schema-redesign/spec.md plans/event-schema-redesign/plan.md`
- [ ] `pnpm --filter @web-audio/schema check`
- [ ] `pnpm --filter @web-audio/schema test:ci`
- [ ] `pnpm --filter @web-audio/patterns check`
- [ ] `pnpm --filter @web-audio/patterns test:ci`
- [ ] `pnpm --filter @web-audio/fluid check`
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine check`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`
- [ ] `pnpm check`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `git diff --check`

**Manual verification, only with user permission:**

- [ ] Default synth and MIDI output.
- [ ] Default sampler natural pitch.
- [ ] Static and random rhythm masks.
- [ ] Variation cycling.
- [ ] Multisample pitch selection.
- [ ] Sprite regions.
- [ ] Chop/fit combinations.
- [ ] Reverse and alternate playback.
- [ ] Live update where a new exact URL skips until loaded without substituting an old buffer.

---

# PR 2 — Variation Timing and Event Semantics

## Goal

Make variation indices full core event values. They may supply fallback timing, contain rests and simultaneous values, participate in event transforms, and create layered sampler voices. Keep one fixed sample name in this PR.

## Phase 1: Add variation authoring shapes and state

### Step 1.1 — Support variation bars, hits, voices, and rests

**Files:**

- `packages/fluid/src/types.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/sampler.test.ts`
- `packages/fluid/src/utils/validate.ts`
- reusable pattern files introduced in PR 1

Define typed variation input with dimensions:

```txt
outer arguments → bars
array entries   → sequential hits
nested arrays   → simultaneous variation values
null            → whole-hit rest
```

Examples to support:

```ts
.var([0, 1, 2]);
.var(0, 1, 2);
.var([[0, 1], [2], [3, 4]]);
.var([0, null, 2]);
.var([], [1]);
.var(d.rand().int().steps(4));
```

Reject:

- `.var()` and `.variation()` with no arguments;
- `null` inside a simultaneous group;
- empty active voice groups;
- non-finite static values.

The constructor variation remains scalar in `d.sample("bd", value)` and `d.sample("bd:value")`.

**Acceptance criteria:**

- [ ] `.var()` and `.variation()` are exact aliases.
- [ ] Last setter wins for variation values.
- [ ] Random variation remains scalar per hit.
- [ ] Explicit silent bars survive in Fluid state for timing compilation.
- [ ] No constructor array form type-checks.

**Testing:**

- [ ] Every supported dimension and invalid shape.
- [ ] Multi-bar and uneven voice counts.
- [ ] Negative and fractional finite values remain authorable.
- [ ] Zero is an active variation value.

---

### Step 1.2 — Decouple explicit rhythm state from value setters

**Files:**

- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/patterns/midi-notes.ts`
- `packages/fluid/src/instruments/event-pattern-compiler.ts`
- `packages/fluid/src/instruments/instrument.test.ts`

Ensure `.notes()`, `.var()`, and later `.name()` replace only their own lane. They must not clear explicit rhythm.

Represent explicit timing state independently:

- fixed rhythm methods compose in call order;
- a random `.xox()` replaces earlier candidate timing and condition;
- a later random `.xox()` replaces the previous random state;
- fixed rhythm methods after random XOX reshape candidates while retaining one condition.

Do not serialize authoring flags.

**Acceptance criteria:**

- [ ] Notes after rhythm do not clear rhythm.
- [ ] Variations after rhythm do not clear rhythm.
- [ ] Repeated random XOX is last-write-wins.
- [ ] Only one chance condition reaches the schema.
- [ ] Fixed masks are compiled away.

**Testing:**

- [ ] Every setter/rhythm call-order pair.
- [ ] Fixed → random → fixed composition.
- [ ] Random → random replacement.
- [ ] Probability zero/one simplification after composition.

---

## Phase 2: Implement timing ownership and rest filtering

### Step 2.1 — Add deterministic density comparison

**Files:**

- `packages/fluid/src/instruments/event-pattern-compiler.ts`
- `packages/fluid/src/instruments/event-pattern-compiler.test.ts` (new)

When no stronger chop/fit or explicit rhythm state supplies timing, compare explicitly authored notes and variations.

Rules:

1. A rest-bearing candidate takes priority so authored silence is preserved.
2. Competing rest-bearing candidates use `notes > variationIndices` in PR 2.
3. Otherwise compare average sequential hits per bar.
4. Compare `hitsA * barsB` with `hitsB * barsA`; do not use floating point.
5. A simultaneous voice group counts as one hit.
6. Density ties use `notes > variationIndices`.
7. Root/scale-derived sampler notes do not become timing candidates by themselves.
8. If no candidate is explicit, use one event per bar.

The compiler records only the winning timing result, not why it won.

**Acceptance criteria:**

- [ ] A denser variation pattern can supply timing.
- [ ] A denser note pattern can supply timing.
- [ ] Notes win exact density ties.
- [ ] Explicit rests beat a denser non-rest pattern.
- [ ] Multi-bar averages compare correctly.
- [ ] Chord size does not affect density.

**Testing:**

- [ ] `notes(60).var([0,1,2])` gives three hits.
- [ ] `notes([60,64]).var(0,1,2)` gives two hits over the combined phrase.
- [ ] Equal-density cycles with different bar counts.
- [ ] Silent bars and interleaved rests.
- [ ] Chord/layer density.

---

### Step 2.2 — Compile all explicit core rests into timing

**Files:**

- `packages/fluid/src/instruments/event-pattern-compiler.ts`
- `packages/fluid/src/instruments/event-pattern-compiler.test.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/schema/src/validate-graph.test.ts`

After choosing candidate timing, intersect it with fixed availability from every explicitly authored core event lane.

Rules:

- notes and variations may remove candidates;
- explicit rhythm cannot recreate a rested event;
- rests are aligned by each lane's authored bar/hit geometry before final hit numbering;
- all fixed rests disappear from serialized timing;
- whole silent bars serialize as empty timing bars and `[null]` value bars;
- random `valuesPerBar: 0` aligns with empty timing bars;
- active numeric zero remains data.

**Acceptance criteria:**

- [ ] A rest in either lane removes the corresponding candidate.
- [ ] Multiple rest masks combine deterministically.
- [ ] Surviving values are re-addressed by consecutive hit number.
- [ ] Direct schema validation catches mismatched silent bars.
- [ ] Failure-independent hit indexing is unchanged.

**Testing:**

- [ ] Notes rests over variation timing.
- [ ] Variation rests over note timing.
- [ ] Both over explicit XOX/Euclidean timing.
- [ ] Multi-bar wrapping.
- [ ] Zero note/variation values remain active.

---

### Step 2.3 — Preserve chop and fit as stronger timing rules

**Files:**

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/index.test.ts`

Integrate variation timing without changing generated chop/fit semantics.

Required precedence:

- existing generated chop/fit and explicit rhythm/note composition remains intact;
- name/variation fallback timing applies only when no stronger existing rule owns timing;
- variation values still resolve by final chop/fit hit;
- generated chop/fit timing remains exempt from event transforms;
- explicit note/chop/fit call-order behavior matches the Phase 0 audit.

**Acceptance criteria:**

- [ ] `.fit(4)` timing is unchanged by a denser variation pattern.
- [ ] `.chop(8).var([0,1])` keeps eight chop events and wraps variation by hit.
- [ ] Long chop/fit durations remain valid.
- [ ] Existing explicit-note/chop behavior remains covered.

---

## Phase 3: Rebuild event transforms

### Step 3.1 — Implement bounded rational speed utilities

**Files:**

- `packages/patterns/src/utils/speed.ts`
- `packages/patterns/src/utils/speed.test.ts`
- `packages/patterns/src/base-cycle.ts`
- `packages/patterns/src/masked-cycle.ts`

Replace integer rounding with positive rational rates.

Requirements:

- `.fast(n)` multiplies current rate;
- `.slow(n)` divides current rate;
- `fast(1.5)` equals `fast(3).slow(2)`;
- rates operate over complete multi-bar cycles;
- zero, negative, and non-finite rates throw;
- unsupported irrational approximations throw;
- expansion limits are explicit and tested.

Choose and document:

- rational approximation tolerance;
- maximum denominator;
- maximum compiled bars;
- maximum compiled events.

Use one shared guard for all schema-expanding transforms. Do not silently truncate.

**Acceptance criteria:**

- [ ] Whole-cycle integer behavior remains correct.
- [ ] Supported fractional rates are exact within documented tolerance.
- [ ] Composed rates reduce before expansion.
- [ ] Unreasonable rates and expansions fail with actionable errors.

**Testing:**

- [ ] `2`, `0.5`, `1.5`, `4/3`-like input, and composed rates.
- [ ] Multi-bar compression and expansion.
- [ ] Invalid and over-limit cases.

---

### Step 3.2 — Make stretch validation strict

**Files:**

- `packages/patterns/src/utils/stretch.ts`
- `packages/patterns/src/utils/stretch.test.ts`
- `packages/patterns/src/base-cycle.ts`

Require positive finite integers for `bars` and `steps`. Remove rounding and `Math.max(..., 1)` fallback behavior.

**Acceptance criteria:**

- [ ] Valid stretch output preserves bar and hit order.
- [ ] Zero, negative, fractional, `NaN`, and infinite values throw.
- [ ] Errors identify the invalid argument.

---

### Step 3.3 — Apply transforms to complete static event combinations

**Files:**

- `packages/fluid/src/instruments/event-pattern-compiler.ts`
- `packages/fluid/src/instruments/event-pattern-compiler.test.ts`
- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/instruments/sampler.ts`

At each procedural transform call, apply the operation to the ordinary event state that currently exists:

- timing;
- notes;
- fixed sample name;
- variations.

Static combinations move together. A scalar lane broadcasts across transformed event rows rather than creating transform-induced rests.

Example:

```txt
before: bd/0, bd/1, bd/2
after slow(2): same three rows spread across two bars
```

Do not transform each scalar lane with the old rest-producing `slow()` independently.

A later setter replaces only its own lane with a new untransformed pattern. Preserve procedural call order.

When static cycles must be combined, expand to their least common repeating period only within the shared schema-expansion limits.

**Acceptance criteria:**

- [ ] Notes and variations stay paired under reverse.
- [ ] Scalar values remain available for every transformed event.
- [ ] Fast compresses and slow expands complete multi-bar phrases.
- [ ] Reverse reverses bar order and hit order.
- [ ] Simultaneous voice order never changes.
- [ ] Later setters are not retroactively transformed.
- [ ] Generated chop/fit timing remains exempt.

**Testing:**

- [ ] Scalar note plus multi-value variation under every transform.
- [ ] Chords plus layered variations.
- [ ] Different finite cycle lengths and LCM guard.
- [ ] Transform/setter call-order matrices.
- [ ] Chop/fit exemption tests.

---

### Step 3.4 — Expand random shape without repeating random results

**Files:**

- `packages/patterns/src/random-cycle.ts`
- `packages/patterns/src/random-cycle.test.ts`
- `packages/fluid/src/instruments/event-pattern-compiler.ts`
- `packages/audio-engine/src/resolvers/random-resolver.test.ts`
- `packages/audio-engine/src/instruments/resolve-timing.test.ts`

Transform random generation metadata, not resolved output:

- fast creates additional value slots and chance candidates;
- slow redistributes random slots over expanded bars;
- stretch creates fresh random values and chance decisions in repeated bars;
- reverse reverses finite shape and generated values inside each bar;
- seed/ribbon progression remains tied to playback time.

Static and random lanes may coexist in one event. Static rows transform together while random scalar values resolve against transformed hit indices and broadcast to voices.

**Acceptance criteria:**

- [ ] Fast random output does not repeat a pre-resolved phrase.
- [ ] Stretch generates distinct deterministic bars for distinct playback bars.
- [ ] Reverse is deterministic and keeps seed chronology forward.
- [ ] Chance conditions receive the same transformed candidate shape as timing.

**Testing:**

- [ ] Seeded expected sequences for every transform.
- [ ] Static name/note with random variation.
- [ ] Random notes with static layered variation.
- [ ] Random timing plus random values use independent resolver state.

---

## Phase 4: Complete variation runtime semantics

### Step 4.1 — Resolve layered variations and broadcast random values

**Files:**

- `packages/audio-engine/src/instruments/resolve-sampler-events.ts`
- `packages/audio-engine/src/instruments/resolve-sampler-events.test.ts`
- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

Use the longest of note, fixed-name, and variation arrays as event voice count. Wrap shorter arrays.

Random variation produces one scalar for the hit and broadcasts across all simultaneous voices.

Every resolved voice carries its own requested variation value before bank lookup.

**Acceptance criteria:**

- [ ] Static variation layers create simultaneous sampler voices.
- [ ] Uneven note and variation groups wrap predictably.
- [ ] Random variation broadcasts one result per event.
- [ ] A failed voice does not prevent sibling voices from playing.
- [ ] One chance decision gates the complete layered event.

**Testing:**

- [ ] One note/three variations.
- [ ] Three notes/one variation.
- [ ] Two notes/three variations.
- [ ] Random variation with static chord.
- [ ] Partial and complete resource failure.

---

### Step 4.2 — Round and positively wrap variation indices

**Files:**

- `packages/audio-engine/src/utils/resolve-sample-entry.ts`
- `packages/audio-engine/src/utils/resolve-sample-entry.test.ts`
- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

For each voice:

1. select sample name and source key;
2. read that entry's variation count;
3. apply `Math.round()`;
4. apply positive modulo;
5. resolve the wrapped entry.

Remove fallback-to-zero behavior for out-of-range indices.

**Acceptance criteria:**

- [ ] Positive overflow wraps.
- [ ] Negative indices wrap.
- [ ] Fractional values round before wrapping.
- [ ] Wrapping uses the selected name/key variation count.
- [ ] Empty variation arrays skip the affected voice.

**Testing:**

- [ ] Boundary table for counts one through four.
- [ ] Different variation counts across source keys.
- [ ] Static and random variation values.
- [ ] Preload and runtime use identical normalization logic.

---

### Step 4.3 — Make alternate direction event-based

**Files:**

- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

Resolve direction once before scheduling the event's voices.

Rules:

```txt
zero emitted voices   → do not advance
one or more voices    → advance once
```

Every emitted voice in the event uses the same direction. Cancellation and playback reset restore forward as next direction.

**Acceptance criteria:**

- [ ] Layered voices all play in the same direction.
- [ ] Partial success advances once.
- [ ] Complete failure does not advance.
- [ ] Cancellation resets alternate state.

---

### Step 4.4 — Update preload planning for wrapped layered variation sets

**Files:**

- preload utility introduced in PR 1
- `packages/audio-engine/src/index.ts`
- `packages/audio-engine/src/engine.test.ts`

Compute possible rounded/wrapped indices for every source key. Layered static groups add all values. Random sources narrow only when the possible set is provably finite; otherwise include all variations.

Preload must not assume every source key has the same variation count.

**Acceptance criteria:**

- [ ] Negative and overflowing static values preload their wrapped targets.
- [ ] Layered groups preload every target.
- [ ] Unknown random output preloads all available variations.
- [ ] Runtime never uses a normalization rule different from preload.

---

## Phase 5: PR 2 integration and documentation

### Step 5.1 — Add end-to-end variation fixtures

**Files:**

- `packages/fluid/src/index.test.ts`
- `packages/audio-engine/src/engine.test.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/schema/src/validate-graph.test.ts`

Add end-to-end coverage for:

- variation-owned timing;
- note-owned timing;
- density ties;
- explicit rests and silent bars;
- explicit rhythm plus rests;
- static variation layers;
- random scalar broadcast;
- event transforms;
- modulo wrapping;
- failure-independent hits;
- event-based alternate direction;
- chop/fit precedence.

**Acceptance criteria:**

- [ ] Every PR 2 behavior appears in both Fluid schema tests and engine resolution/scheduling tests where applicable.
- [ ] Tests distinguish timing hit number from authored grid position.
- [ ] No test restores an old schema concept.

---

### Step 5.2 — Document variation event semantics

**Files:**

- `packages/fluid/README.md`
- `packages/audio-engine/README.md`
- `docs/concepts/patterns.md`
- `docs/concepts/glossary.md`
- `README.md` where relevant

Document:

- variation bars/hits/layers/rests;
- density fallback and tie priority;
- explicit rhythm priority;
- modulo variation selection;
- random scalar broadcast;
- event-based alternate direction;
- procedural transforms and chop/fit exception.

**Acceptance criteria:**

- [ ] Examples match target schema and runtime behavior.
- [ ] Random freshness and static row preservation are stated explicitly.
- [ ] No documentation implies variation zero is a rest.

---

### Step 5.3 — Verify PR 2

**Automated verification:**

- [ ] `pnpm --filter @web-audio/schema test:ci`
- [ ] `pnpm --filter @web-audio/patterns test:ci`
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`
- [ ] `pnpm check`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `git diff --check`

**Manual verification, only with user permission:**

- [ ] Audible static variation cycle.
- [ ] Variation-derived timing.
- [ ] Simultaneous variation layers.
- [ ] Random variation under fast/stretch/reverse.
- [ ] Alternate direction with layers and partial failures.
- [ ] Variation layers across multisamples, sprites, regions, chop, and fit.

---

# PR 3 — Sample-Name Patterning

## Goal

Make sample names full static core event values. Add `.name()`, unnamed sampler construction, normalized name/bank identities, name-derived timing, layered names, per-name source resolution, and complete multi-name preload.

Random sample-name choice remains a future extension.

## Phase 1: Add the public name API

### Step 1.1 — Make `d.sample()` optionally unnamed and parse shorthand strictly

**Files:**

- `packages/fluid/src/index.ts`
- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/types.ts`

Support:

```ts
d.sample();
d.sample("bd");
d.sample("bd", 2);
d.sample("bd:2");
```

Reject patterned constructor arguments at type and runtime boundaries.

Strict shorthand rules:

- trim the complete token and both parsed parts;
- allow exactly one colon;
- require a non-empty name;
- require a finite numeric suffix;
- allow negative and fractional suffixes;
- reject a suffix combined with the second argument;
- reject multiple colons;
- defer rounding to variation resolution.

An unnamed sampler may exist while chaining but must have a real name before `getSchema()`.

**Acceptance criteria:**

- [ ] All valid constructor forms produce equivalent canonical state where expected.
- [ ] Invalid shorthand throws actionable errors.
- [ ] Array constructors do not type-check and fail defensively at runtime.
- [ ] `d.sample()` does not fail until schema generation if `.name()` has not yet supplied a name.

**Testing:**

- [ ] Whitespace around token/name/variation.
- [ ] Negative and fractional variations.
- [ ] Empty, whitespace-only, malformed, duplicate, and multi-colon cases.
- [ ] Constructor plus second-argument conflict.

---

### Step 1.2 — Add `.name()` with bars, hits, voices, and rests

**Files:**

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/sampler.test.ts`
- `packages/fluid/src/types.ts`
- reusable generic event-pattern code from PR 2

Support:

```ts
.name(["bd", "sd"]);       // one bar, two hits
.name("bd", "sd");         // two bars
.name([["bd", "hh"]]);     // one layered hit
.name(["bd", null, "sd"]); // explicit rest
.name([], ["sd"]);          // silent bar, then active bar
```

Rules:

- trim every authored name;
- reject names that become empty;
- reject `null` inside a simultaneous group;
- reject empty active groups;
- reject `.name()` with no arguments;
- require at least one real name somewhere before schema generation;
- treat colons passed to `.name()` literally;
- make repeated `.name()` calls last-write-wins;
- completely replace the constructor name.

The replaced constructor name must not remain in schema, preload, warnings, or runtime fallback state.

**Acceptance criteria:**

- [ ] Static name patterns compile to `SampleNamePattern`.
- [ ] Simultaneous names preserve authored order and duplicates.
- [ ] Explicit rests remain available to the timing compiler.
- [ ] Constructor replacement is complete.
- [ ] Random name patterns are rejected for now with a clear type/runtime boundary.

**Testing:**

- [ ] Every valid shape and invalid nesting form.
- [ ] Trimming and duplicate names.
- [ ] Literal colon names via `.name()`.
- [ ] Last-write-wins and constructor replacement.
- [ ] All-silent name pattern rejection.

---

## Phase 2: Canonicalize banks and sample keys

### Step 2.1 — Normalize bank names consistently

**Files:**

- `packages/fluid/src/index.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/utils/sample-utils.ts`
- `packages/fluid/src/utils/sample-utils.test.ts`
- `packages/fluid/src/index.test.ts`

Trim bank names at every Fluid boundary:

- `.bank()`;
- named `loadSamples()` input;
- external manifest input;
- built-in bank resolution;
- `_resolveBank()`;
- schema bank map insertion.

Reject names that become empty. Reject collisions produced by trimming instead of overwriting silently.

User-defined bank precedence over a built-in bank of the same canonical name remains unchanged.

**Acceptance criteria:**

- [ ] Authored and loaded bank names share one canonical form.
- [ ] Canonical collisions throw before graph generation.
- [ ] Compiled bank keys and sampler `bank` fields match exactly.
- [ ] Built-in lookup remains deterministic.

---

### Step 2.2 — Normalize sample keys in every bank shape

**Files:**

- `packages/fluid/src/utils/sample-utils.ts`
- `packages/fluid/src/utils/sample-utils.test.ts`
- `packages/fluid/src/banks/*.ts`
- `packages/schema/src/validate-graph.ts`
- `packages/schema/src/validate-graph.test.ts`

Trim sample keys while normalizing:

- flat sample banks;
- banked sample banks;
- multisample banks;
- sprite banks;
- pitched sprite banks;
- built-in `BankDefinition` values.

Reject:

- keys that become empty;
- two keys that collapse to one canonical name;
- direct compiled schemas containing non-canonical names.

Do not trim or rewrite URLs.

**Acceptance criteria:**

- [ ] Authored names and normalized bank keys use the same canonical identity.
- [ ] Collision detection works for every manifest shape.
- [ ] Multisample pitch-key normalization remains independent from sample-name normalization.
- [ ] Direct invalid schemas fail validation.

**Testing:**

- [ ] Whitespace keys in every supported bank format.
- [ ] Canonical collision tables.
- [ ] Base URL and sprite source preservation.
- [ ] External JSON manifests.

---

## Phase 3: Add sample names to timing and transforms

### Step 3.1 — Extend timing inference to names

**Files:**

- `packages/fluid/src/instruments/event-pattern-compiler.ts`
- `packages/fluid/src/instruments/event-pattern-compiler.test.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/index.test.ts`

Add sample names as the middle-priority timing candidate:

```txt
notes > sample names > variation indices
```

Rules remain:

1. stronger chop/fit and explicit rhythm state wins;
2. explicit rests/silent bars take priority over density;
3. otherwise highest average sequential hits per bar wins;
4. priority breaks exact ties;
5. every explicit core rest filters final candidate timing;
6. simultaneous names count as one hit;
7. a constructor scalar provides default identity but does not beat a denser explicitly authored lane.

**Acceptance criteria:**

- [ ] A denser name pattern can supply timing.
- [ ] Notes beat names on a tie.
- [ ] Names beat variations on a tie.
- [ ] Name rests filter explicit rhythm.
- [ ] Name layers count as one event.
- [ ] The schema contains only final timing.

**Testing:**

- [ ] All pairwise and three-way density comparisons.
- [ ] Multi-bar average density.
- [ ] Competing explicit silence.
- [ ] Constructor scalar plus name/variation patterns.
- [ ] Chop/fit priority.

---

### Step 3.2 — Include names in static event transforms

**Files:**

- `packages/fluid/src/instruments/event-pattern-compiler.ts`
- `packages/fluid/src/instruments/event-pattern-compiler.test.ts`
- `packages/fluid/src/instruments/sampler.ts`

Static name/note/variation combinations move together under fast, slow, stretch, and reverse.

Requirements:

- scalar constructor or `.name("bd")` broadcasts across transformed events;
- name sequences stay paired with static note and variation rows;
- reverse changes bar and hit order but not voice order inside one name group;
- later `.name()` replaces prior transformed name state;
- generated chop/fit timing remains exempt.

**Acceptance criteria:**

- [ ] Reversing `bd/0, sd/1` produces `sd/1, bd/0`.
- [ ] Slow never creates accidental missing-name bars for a scalar name.
- [ ] Fast and stretch preserve complete static combinations.
- [ ] Random note/variation values remain fresh and broadcast against transformed name rows.

---

## Phase 4: Resolve and schedule multi-name events

### Step 4.1 — Resolve names as one sampler voice dimension

**Files:**

- `packages/audio-engine/src/instruments/resolve-sampler-events.ts`
- `packages/audio-engine/src/instruments/resolve-sampler-events.test.ts`
- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

Resolve note, name, and variation arrays for each surviving hit. Voice count is their maximum length; shorter arrays wrap.

Name patterns are static in PR 3. Preserve duplicates because duplicate authored names mean duplicate simultaneous voices.

Each complete voice object contains:

```ts
{
  note?: number;
  sampleName: string;
  requestedVariationIndex: number;
}
```

**Acceptance criteria:**

- [ ] Sequential names create sequential source identities.
- [ ] Layered names create simultaneous voices.
- [ ] Name/note/variation arrays wrap exactly as specified.
- [ ] Random numeric fields broadcast one scalar across name layers.
- [ ] One chance decision gates all name layers.

**Testing:**

- [ ] Name-only sequencing.
- [ ] Layered names with one note/variation.
- [ ] Unequal arrays in every longest-field configuration.
- [ ] Duplicate names.
- [ ] Partial missing-name failure.

---

### Step 4.2 — Resolve source keys, natural pitch, and variations per name

**Files:**

- `packages/audio-engine/src/utils/resolve-sample-entry.ts`
- `packages/audio-engine/src/utils/resolve-sample-entry.test.ts`
- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

For every resolved voice independently:

1. find `bank.samples[sampleName]`;
2. derive/cached sorted source keys for that name;
3. use the lowest key for absent notes, producing pitch rate `1`;
4. otherwise select nearest source key and calculate pitch rate;
5. round and wrap variation within that name/key's entry count;
6. resolve the logical entry and exact URL;
7. calculate region/chop, fit, playback, and actual duration for that source.

A missing bank/name/key/entry warns and skips only that voice.

**Acceptance criteria:**

- [ ] Different names in one hit may select different source keys.
- [ ] Natural pitch is calculated separately per name.
- [ ] Variation wrapping uses each name/key's own count.
- [ ] Different source durations produce independent stop times.
- [ ] Shared processing settings still resolve once per event hit and apply to every voice.

**Testing:**

- [ ] Simple file plus multisample in one event.
- [ ] Two multisamples with different lowest keys.
- [ ] Sprite and file layers.
- [ ] Different variation counts and source durations.
- [ ] Region, chop, fit, loop, clip, forward, reverse, and alternate behavior.

---

### Step 4.3 — Keep alternate direction and failure semantics event-wide

**Files:**

- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

Reuse PR 2 event direction for multi-name layers:

- choose direction once;
- schedule all available voices with it;
- advance once if at least one name plays;
- do not advance if all names fail.

Failures do not shift later name, note, variation, gain, region, or direction hit addressing.

**Acceptance criteria:**

- [ ] Mixed successful/missing names advance alternate once.
- [ ] All-missing name events do not advance.
- [ ] Later events retain their planned identities.

---

## Phase 5: Preload all possible named sources

### Step 5.1 — Build the name/key/variation preload cross-product

**Files:**

- preload utility introduced in PR 1
- `packages/audio-engine/src/index.ts`
- `packages/audio-engine/src/engine.test.ts`

For every static name that can occur:

1. deduplicate the canonical name for planning only;
2. derive all source keys for that name;
3. calculate the safe possible variation set per key;
4. resolve all entries;
5. deduplicate exact URLs globally;
6. preload and prepare reverse buffers as needed.

Duplicate names remain duplicate playback voices even though preload URLs deduplicate.

Missing names warn and do not prevent known names from preloading.

**Acceptance criteria:**

- [ ] Every known static name is considered.
- [ ] Every source key for every name is considered.
- [ ] Variation narrowing is safe per name/key.
- [ ] Shared URLs fetch/decode once.
- [ ] Missing names do not invalidate the schema or block `prepare()`.

**Testing:**

- [ ] Sequential and layered name sets.
- [ ] Duplicate names and shared URLs.
- [ ] Mixed files, sprites, and multisamples.
- [ ] Different variation counts.
- [ ] Missing bank/name/entry cases.
- [ ] Reverse and alternate preparation.

---

### Step 5.2 — Verify lazy loading for name-pattern updates

**Files:**

- `packages/audio-engine/src/instruments/sample-buffer-cache.test.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/engine.test.ts`

Exercise live graph updates where `.name()` introduces URLs that were not previously loaded.

Required behavior:

- exact cached names play immediately;
- new URLs begin loading in the background;
- affected voices skip on time;
- sibling cached voices still play;
- no prior name's buffer substitutes;
- later hits play after load completes.

**Acceptance criteria:**

- [ ] Multi-name updates are independent per URL.
- [ ] One in-flight fetch is shared across graphs/instruments.
- [ ] No sampler-wide readiness state returns.
- [ ] Retirement remains safe while loads are in flight.

---

## Phase 6: Future-proofing, docs, and final integration

### Step 6.1 — Preserve a typed path for future random sample choice

**Files:**

- `packages/schema/src/index.ts`
- `packages/fluid/src/types.ts`
- event-pattern compiler files
- schema and Fluid type tests

Do not implement `RandomChoicePattern<string>` or `d.choice()`.

Verify by type/architecture review that a future union member can provide:

- `valuesPerBar` for density and shape;
- finite string choices for preload;
- seed/ribbon/algorithm/order metadata;
- one scalar name per hit that broadcasts across longer voice arrays.

Do not add unused runtime branches or placeholder schema values.

**Acceptance criteria:**

- [ ] Timing does not depend on numeric-only name behavior.
- [ ] Name resolution is isolated behind the typed sampler event resolver.
- [ ] Preload collection accepts a finite-name-set abstraction.
- [ ] No random-name feature is exposed publicly.

---

### Step 6.2 — Update final public documentation

**Files:**

- `README.md`
- `packages/fluid/README.md`
- `packages/audio-engine/README.md`
- `docs/concepts/patterns.md`
- `docs/concepts/developer-terms.md`
- `docs/concepts/glossary.md`
- demos/snippets that show sampler APIs

Document:

- `d.sample()` construction forms;
- strict colon shorthand;
- `.name()` replacement semantics;
- name/variation/note dimensions;
- rests and silent bars;
- density and priority rules;
- static layering and wrapping;
- random numeric broadcast;
- natural pitch per name;
- variation modulo behavior;
- exact loading and missing-resource behavior;
- transform scope and chop/fit exception;
- random name choice as future work, not current API.

**Acceptance criteria:**

- [ ] Every public example is valid TypeScript.
- [ ] No constructor example patterns names or variations.
- [ ] No docs describe sample or variation zero as timing/rest data.
- [ ] Schema examples use `events`, `timing`, and value-only patterns.

---

### Step 6.3 — Final end-to-end coverage

**Files:**

- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/engine.test.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/schema/src/validate-graph.test.ts`
- documentation examples where testable

Add matrix coverage for:

| Dimension      | Cases                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| Timing owner   | explicit rhythm, notes, names, variations, chop, fit, default            |
| Timing filter  | fixed rests, silent bars, random chance                                  |
| Value shape    | scalar, sequence, multi-bar, layered, random numeric                     |
| Source         | file, file variations, sprite, multisample, pitched sprite               |
| Pitch          | absent/natural, exact key, nearest key, chord                            |
| Playback       | clip, one-shot, loop, forward, reverse, alternate                        |
| Region         | none, start/end, duration, chop, fit                                     |
| Resource state | preloaded, lazy, missing bank, missing name, missing entry, failed fetch |
| Transform      | fast, slow, stretch, reverse, composed and call-order cases              |

Prefer focused unit cases over one enormous combinatorial test, but ensure every row/column interaction with distinct behavior is represented.

**Acceptance criteria:**

- [ ] Schema, Fluid, resolver, scheduler, preload, and cache layers each have direct tests.
- [ ] End-to-end tests prove policy is compiled in Fluid rather than recreated in the engine.
- [ ] Missing resources never shift later hits.
- [ ] Static voice order and duplicate voices remain stable.

---

### Step 6.4 — Verify PR 3 and the complete redesign

**Automated verification:**

- [ ] `pnpm exec prettier --check plans/event-schema-redesign/spec.md plans/event-schema-redesign/plan.md`
- [ ] `pnpm --filter @web-audio/schema check`
- [ ] `pnpm --filter @web-audio/schema test:ci`
- [ ] `pnpm --filter @web-audio/patterns check`
- [ ] `pnpm --filter @web-audio/patterns test:ci`
- [ ] `pnpm --filter @web-audio/fluid check`
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine check`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`
- [ ] `pnpm check`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `git diff --check`

**Manual verification, only with user permission:**

- [ ] Sequential drum names from one sampler.
- [ ] Layered kick/hat and mixed file/sprite voices.
- [ ] Name-derived timing and explicit rhythm override.
- [ ] Name rests and silent bars.
- [ ] Different natural pitches in one layered event.
- [ ] Name/variation/note transforms.
- [ ] Missing name skips while sibling voice plays.
- [ ] Live name update loads exact URLs without fallback substitution.

---

# File Change Summary

## `@web-audio/schema`

| File                                         | Change                                                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/schema/src/index.ts`               | Add timing/value/event types; make instruments generic over events; remove old timed-value, note-mask, source-key, and scalar sampler fields. |
| `packages/schema/src/validate-graph.ts`      | Validate the complete playback plan and event/value/timing cross-field invariants.                                                            |
| `packages/schema/src/validate-graph.test.ts` | Add exhaustive valid/invalid schema coverage.                                                                                                 |

## `@web-audio/patterns`

| File                                                 | Change                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/patterns/src/types.ts`                     | Export target schema types and retain only package-owned authoring cycle types.          |
| `packages/patterns/src/static-cycles.ts`             | Serialize raw values and fixed timing separately.                                        |
| `packages/patterns/src/random-cycle.ts`              | Serialize random counts/configuration and expose timing chance configuration.            |
| `packages/patterns/src/masked-cycle.ts`              | Expose independent source values and fixed trigger geometry without schema grid indices. |
| `packages/patterns/src/base-cycle.ts`                | Use strict transform validation and rational speed behavior.                             |
| `packages/patterns/src/utils/chord-static-schema.ts` | Replace timed chord serialization with grouped static values.                            |
| `packages/patterns/src/utils/speed.ts`               | Implement whole-cycle bounded rational speed transforms.                                 |
| `packages/patterns/src/utils/stretch.ts`             | Reject invalid stretch counts instead of rounding.                                       |
| `packages/patterns/src/utils/reverse.ts`             | Preserve complete-cycle bar/hit reversal and voice order.                                |

## `@web-audio/fluid`

| File                                                       | Change                                                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/fluid/src/instruments/event-pattern-compiler.ts` | New Fluid-owned timing selection, rest filtering, static row combination, transform, and schema compilation.     |
| `packages/fluid/src/instruments/instrument.ts`             | Keep explicit timing state separate from core event value lanes and route transforms through the event compiler. |
| `packages/fluid/src/instruments/synthesizer.ts`            | Emit `SynthEventSchema`.                                                                                         |
| `packages/fluid/src/instruments/sampler.ts`                | Emit `SamplerEventSchema`; add variation layers/rests and later `.name()`/unnamed construction.                  |
| `packages/fluid/src/instruments/sampler-utils.ts`          | Generate timing and value-only chop/fit/region data; remove dummy notes and source keys.                         |
| `packages/fluid/src/patterns/midi-notes.ts`                | Compile grouped note values independently from timing and retain root/scale value mapping.                       |
| `packages/fluid/src/patterns/sample-notes.ts`              | Support optional sampler note intent without owning timing by default.                                           |
| `packages/fluid/src/patterns/parameter.ts`                 | Emit `NumberPattern`.                                                                                            |
| `packages/fluid/src/utils/sample-utils.ts`                 | Canonicalize bank/sample keys and reject trim collisions.                                                        |
| `packages/fluid/src/index.ts`                              | Add optional sampler name, strict shorthand, normalized banks, and target graph output.                          |
| `packages/fluid/src/types.ts`                              | Add typed note/name/variation pattern inputs and reject constructor pattern arrays.                              |

## `@web-audio/audio-engine`

| File                                                              | Change                                                                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/audio-engine/src/instruments/resolve-timing.ts`         | New fixed/chance timing resolver with final hit numbering.                              |
| `packages/audio-engine/src/instruments/resolve-event-value.ts`    | New value-only static/random resolver helper.                                           |
| `packages/audio-engine/src/instruments/resolve-synth-events.ts`   | New typed synth event resolver.                                                         |
| `packages/audio-engine/src/instruments/resolve-sampler-events.ts` | New typed sampler event/voice resolver.                                                 |
| `packages/audio-engine/src/instruments/resolve-note-events.ts`    | Remove after typed resolvers replace it.                                                |
| `packages/audio-engine/src/instruments/static-onsets.ts`          | Remove; static polyphony is explicit in arrays.                                         |
| `packages/audio-engine/src/resolvers/random-resolver.ts`          | Generate from `valuesPerBar` and apply per-bar order.                                   |
| `packages/audio-engine/src/instruments/instrument.ts`             | Resolve value-only processing patterns by final event hit.                              |
| `packages/audio-engine/src/instruments/synthesizer.ts`            | Schedule typed synth events.                                                            |
| `packages/audio-engine/src/instruments/sampler.ts`                | Resolve and schedule complete per-name/per-variation voices with event-wide direction.  |
| `packages/audio-engine/src/instruments/sample-buffer-cache.ts`    | New shared exact-URL fetch/decode/reverse cache.                                        |
| `packages/audio-engine/src/instruments/sample-buffer-store.ts`    | Remove sampler-local logical buffer state and fallback behavior.                        |
| `packages/audio-engine/src/utils/resolve-sample-entry.ts`         | Derive source keys, choose nearest keys, and round/wrap variation indices per name/key. |
| `packages/audio-engine/src/utils/preload-variations.ts`           | Replace with safe name/key/variation URL planning.                                      |
| `packages/audio-engine/src/index.ts`                              | Own shared cache, preload target URLs, and instantiate target-schema instruments.       |
| `packages/audio-engine/src/types.ts`                              | Add resolved timing/synth/sampler event types and retain hit-based schedule context.    |

## Documentation

| File                               | Change                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `README.md`                        | Update public examples where schema or sampler patterning appears.         |
| `packages/fluid/README.md`         | Document final authoring semantics.                                        |
| `packages/audio-engine/README.md`  | Document playback-plan resolution and loading behavior.                    |
| `docs/concepts/patterns.md`        | Explain timing/value separation, density, rests, transforms, and wrapping. |
| `docs/concepts/developer-terms.md` | Define compiled timing, event values, hits, and voices.                    |
| `docs/concepts/glossary.md`        | Keep user-facing terms consistent.                                         |

# Completion checklist

- [ ] Both instruments use explicit `TimingSchema`.
- [ ] Static and random values contain no timing geometry.
- [ ] Fluid compiles fixed masks and rests away.
- [ ] Random timing uses one optional chance condition.
- [ ] The engine numbers only surviving events.
- [ ] Notes, names, variations, and processing values resolve by final hit.
- [ ] Notes, names, and variations support static simultaneous values.
- [ ] Random numeric values broadcast across voices.
- [ ] Timing fallback uses explicit silence, density, and documented priority.
- [ ] Static event combinations stay together under transforms.
- [ ] Random transform expansion creates fresh values and decisions.
- [ ] Generated chop/fit behavior remains compatible.
- [ ] Source keys come from normalized bank data.
- [ ] Variations round and positively wrap per name/key.
- [ ] Missing resources skip only affected voices.
- [ ] Alternate direction advances once per successful event.
- [ ] Buffer reuse is exact-URL based only.
- [ ] Sampler-wide readiness and approximate fallback are removed.
- [ ] Bank and sample names are canonical and trim-collision-safe.
- [ ] No old/new schema compatibility path remains.
- [ ] Random sample choice can be added later without changing timing.
- [ ] All package and workspace checks pass.
