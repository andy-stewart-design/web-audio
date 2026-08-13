# Scratch Language API Implementation Plan

## Context

This plan implements [`scratch-language-prd.md`](scratch-language-prd.md) in independently testable phases. The work adds general-purpose random trigger masks, relative sample duration, sample playback direction, explicit sampler monophony, timing nudge, and conventional swing to Fluid and the audio engine.

The target scratch expression is:

```ts
d.sample("tay")
  .bank("user")
  .xox(d.rand().bin().chance(0.6).steps(16, 0))
  .duration(d.rand().range(0.065, 0.15).steps(16))
  .direction("alternate")
  .mono()
  .nudge(d.rand().range(-0.1, 0.1).steps(16))
  .detune(d.lfo(0, 700).speed(7.66))
  .push();
```

The implementation crosses four core packages:

```text
@web-audio/fluid
        │
        ├── @web-audio/patterns
        └── @web-audio/schema
                    │
                    ▼
        @web-audio/audio-engine
```

Each phase should leave those package boundaries coherent and testable. Do not defer core click-prevention work until after direction and monophony: rapid, detune-modulated retriggering is the principal use case.

## Key design decisions

- `RandomCycle.steps(...counts)` describes a repeating sequence of per-bar grids; `0` is an empty bar.
- Empty bars occupy time and advance the global bar/random timeline but contain no steps to resolve.
- `RandomCycle.chance()` is valid only when the final random data type is binary.
- Chance is independent per eligible step, seeded and deterministic, not an exact-density operation.
- Random input to `xox()` remains a dynamic trigger mask and does not replace the instrument's note/pitch values; it establishes the trigger grid and underlying notes cycle across that grid as they do for static `xox()`.
- Suppressed triggers do not compress or re-index duration, nudge, swing, or other step-addressed parameters.
- `Sampler.duration()` is a normalized source length relative to the resolved `start`; `end` remains an absolute normalized endpoint.
- `end()` and `duration()` are mutually exclusive and the latest call wins.
- `Sampler.direction()` accepts `"forward"`, `"reverse"`, or `"alternate"`; alternation advances only when a voice is emitted.
- Source-region coordinates always refer to the original forward buffer.
- Reversed buffers are prepared during loading only for reverse-capable sampler schemas and cached by original `AudioBuffer`.
- Samplers remain polyphonic by default; `.mono()` enables one active voice per sampler instance.
- Mono replacement uses the previous voice's gain-envelope release rather than a separate choke-time API.
- `Instrument.nudge()` is a patternable signed offset measured in final step lengths.
- `Instrument.swing()` is conventional odd-step delay and varies only by bar.
- Swing and nudge affect onset, not event duration, and their combined onset remains within its originating bar.
- Gated sampler playback does not pass a third duration argument to `AudioBufferSourceNode.start()`.
- Under LFO-modulated detune, gate timing uses nominal/base playback speed rather than attempting sample-frame-exact dynamic-rate tracking.
- Gain reaches effective silence before a gated or replaced source is stopped and disconnected.

## Implementation status (2026-08-12)

### Completed and committed

- **Phase 1** — patterned random bars, binary-only chance, deterministic chance resolution, and defensive empty-bar resolver handling.
- **Phase 1.5** — binary random notes now preserve root/scale meaning: without a scale they select root/root-plus-one-semitone; with a scale they select degrees 0/1.
- **Phase 2, dynamic path** — binary `RandomCycle` input to `xox()` is represented as a dynamic mask, resolves per grid position, suppresses voices without re-indexing source-specific parameters, and skips empty mask bars without resolving them.

### Phase 2 architecture derivations

Implementation clarified two schema terms that were not fixed in the original plan:

```ts
notes: {
  source: ParameterSchema,
  mask?: ParameterSchema,
}
```

- `notes.source` is the note/pitch source; `notes.mask` is trigger eligibility plus its final timing grid. This replaces the former top-level `triggerMask` experiment and is the only supported schema shape.
- `RandomSchema.grid` is the random schema's structural `StaticSchema`; it replaces the ambiguous former `RandomSchema.cycle`. Static schemas retain their own `cycle` field. Engine code therefore reads `notes.source.grid.cycle` for a random source and `notes.mask.grid.cycle` for a random mask, never `.cycle.cycle`.
- Static `xox()` currently uses a temporary compatibility implementation that combines source values and rests, then derives source/mask schemas. It preserves existing modifier behavior but is intentionally not the final design.

### Immediate next step

Before Phase 2 can be closed, implement [`masked-cycle-refactor-plan.md`](masked-cycle-refactor-plan.md). It replaces the temporary static combine/reconstruct path with an internal paired masked-cycle representation while characterizing and preserving static modifier ordering. Do not begin Phase 3 until that plan's completion criteria are met.

## Scope guardrails

Do not add these features while implementing this plan:

- exact-density random patterns;
- cross-instrument choke groups;
- monophonic-by-default samplers;
- patterned sample direction or `"alternate-reverse"`;
- reverse playback on synthesizers;
- absolute-time sampler duration units;
- random/per-step swing;
- an independent mono fade/choke parameter;
- arbitrary random values as `xox` masks;
- special Euclid-plus-`xox` composition semantics.

---

## Phase 1 — Patterned random bars and binary chance

Tracer bullet: a `RandomCycle` can describe active and empty bars, resolve a deterministic binary probability other than 50%, and retain existing random behavior when the new APIs are not used.

### Step 1.1 — Make random step counts patternable by bar

**Files:** `packages/patterns/src/random-cycle.ts`, `packages/patterns/src/random-cycle.test.ts`, static-cycle tests as needed

Change:

```ts
steps(n: number)
```

to:

```ts
steps(...counts: number[])
```

Build one structural mask bar per count:

- positive `n` creates `n` evenly distributed active positions;
- `0` creates `[]` for that bar;
- the outer cycle repeats indefinitely through existing bar modulo behavior.

Validation requirements:

- require at least one argument;
- every count must be a finite, non-negative integer;
- reject negative, fractional, infinite, and `NaN` values;
- preserve the current behavior and schema for `.steps(n)`;
- do not invent a synthetic event for an empty bar.

Confirm `BinaryCycle.getStaticSchema()` retains empty inner arrays and does not divide by zero because it never maps an event in an empty pattern.

**Acceptance criteria:**

- [x] `.steps(16)` remains schema-compatible with current behavior.
- [x] `.steps(16, 0, 8)` emits structural bars with 16, 0, and 8 positions.
- [x] Bar offsets and durations are correct within each non-empty bar.
- [x] The three-bar structure repeats through existing cycle indexing.
- [x] Empty bars contain no scheduled values.
- [x] Invalid counts throw descriptive `RandomCycle` errors.
- [x] Patterns package check, lint, and tests pass.

### Step 1.2 — Add binary chance to schema and Fluid random builders

**Files:** `packages/schema/src/index.ts`, `packages/patterns/src/random-cycle.ts`, `packages/patterns/src/random-cycle.test.ts`

Add an optional/defaulted binary probability to `RandomSchema` and expose:

```ts
chance(probability: number)
```

Requirements:

- accept finite values from `0` through `1`, inclusive;
- reject invalid values immediately at `.chance()`;
- retain the latest value after repeated calls;
- allow `.chance()` and `.bin()` in either call order;
- validate in `getRandomSchema()` that configured chance is legal only when the final data type is `"binary"`;
- switching to `.int()` or final float output leaves the builder invalid rather than silently clearing chance;
- omit chance or encode its default consistently so `.bin()` remains behaviorally backward-compatible with 50/50 output.

Keep the schema narrow: chance belongs to random binary resolution, not to every parameter or instrument.

**Acceptance criteria:**

- [x] `.bin().chance(0.6)` and `.chance(0.6).bin()` produce equivalent schemas.
- [x] `.chance(0)`, `.chance(0.5)`, `.chance(0.6)`, and `.chance(1)` serialize correctly.
- [x] Repeated calls use the latest chance value.
- [x] Final float/integer configurations with chance fail during schema generation.
- [x] Out-of-range and non-finite probabilities throw.
- [x] Existing random schemas without chance remain valid.
- [x] Schema and patterns package checks pass.

### Step 1.3 — Resolve deterministic binary probability

**Files:** `packages/audio-engine/src/resolvers/random-resolver.ts`, `packages/audio-engine/src/utils/random.ts`, `packages/audio-engine/src/resolvers/random-resolver.test.ts`, `packages/audio-engine/src/utils/random.test.ts`

Apply the configured chance when mapping a seeded random float to binary output.

Requirements:

- each active mask position is an independent Bernoulli trial;
- identical schema, bar, and step inputs produce identical outputs;
- `chance(0)` always resolves to `0` and `chance(1)` always resolves to `1`;
- explicit/default 50% behavior retains the existing seeded result sequence where practical;
- threshold orientation remains an internal detail;
- float, integer, quantized, and `valueMap` paths remain unchanged;
- an empty mask bar is never resolved by normal scheduling; add a defensive failure or safe handling so modulo by zero cannot silently produce `undefined`/`NaN` if called incorrectly.

**Acceptance criteria:**

- [x] Chance extremes are exact.
- [x] A representative 60% sequence is deterministic across resolver instances.
- [x] Different absolute bars continue to generate fresh deterministic values without a ribbon.
- [x] Ribbon segment loops retain current deterministic behavior.
- [x] Empty-bar resolution cannot cause an unhelpful modulo-by-zero result.
- [x] Existing resolver tests for float, integer, quantization, algorithms, ribbons, and value maps pass unchanged.
- [x] Audio-engine check, lint, and focused tests pass.

---

## Phase 1.5 — Preserve binary random-note semantics with root and scale

Tracer bullet: `.notes(d.rand().bin().steps(4))` resolves only two notes while applying `root()` and optional `scale()` exactly as static note values do.

### Step 1.5.1 — Apply note-value transforms before random note selection

**Status:** Complete.

**Files:** `packages/fluid/src/patterns/midi-notes.ts`, `packages/fluid/src/patterns/notes.test.ts`, related Fluid integration tests

Current random notes with `scale()` are converted into a full scale `valueMap`, whose resolver path bypasses `RandomSchema.dataType`; this makes `.bin()` select from every mapped scale degree. Random notes without `scale()` also bypass the normal root-offset transform.

Refactor random-note schema construction so the final random type remains meaningful in every note context:

- binary random notes select only values represented by binary output `0` and `1`;
- without `scale()`, apply `root()` as a chromatic MIDI offset, so binary output selects the root and root plus one semitone;
- with `scale()`, map binary output to scale degrees `0` and `1`, so `.root("a3").scale("min").notes(d.rand().bin())` selects `A3` and `B3`;
- preserve existing float/integer random-note behavior, including configured ranges, scale degree mapping, `valueMap` behavior, ribbons, and deterministic resolution;
- make the implementation type-driven rather than adding a special engine-side exception for `.bin()`.

The preferred implementation may use a value map sized to the random output domain where appropriate, but it must not let raw random floats bypass binary resolution. If the existing `valueMap` resolver path cannot preserve the random data type, adjust that boundary with focused engine coverage rather than duplicating scale logic in the engine.

**Acceptance criteria:**

- [x] `.root("a3").notes(d.rand().bin().steps(4))` resolves only `A3` and `A♯3`.
- [x] `.root("a3").scale("min").notes(d.rand().bin().steps(4))` resolves only `A3` and `B3`.
- [x] Binary random notes remain deterministic with and without ribbons.
- [x] Float and integer random notes retain their existing root, scale, range, and value-map behavior.
- [x] The random resolver does not bypass binary chance/data-type mapping merely because a note value map is present.
- [x] Fluid and audio-engine checks, lint, and focused tests pass.

---

## Phase 2 — Dynamic random trigger masks in `xox`

Tracer bullet: `.xox(d.rand().bin().chance(0.6).steps(16, 0))` gates a sampler's default trigger dynamically, producing a probabilistic active bar followed by a silent bar without converting binary values into pitches.

### Step 2.1 — Represent a dynamic note trigger mask explicitly

**Status:** Partially complete. The strict `notes.source` / `notes.mask` schema and engine scheduling migration are in place. Static modifier compatibility is deferred to the immediate masked-cycle refactor described above; do not mark this step complete until that work lands.

**Files:** `packages/schema/src/index.ts`, `packages/fluid/src/patterns/midi-notes.ts`, `packages/fluid/src/patterns/sample-notes.ts`, `packages/fluid/src/instruments/instrument.ts`, related tests

Replace the former ambiguous random-note structural-grid usage with an explicit schema representation for a note source plus an optional trigger mask. The finalized schema shape is:

```ts
notes: {
  source: ParameterSchema,
  mask?: ParameterSchema,
}
```

For random schemas, use `RandomSchema.grid` for structural positions; reserve `mask` for trigger eligibility.

Requirements:

- preserve the underlying static or random note schema separately from the mask;
- allow the mask to be static or random as required by existing and new `xox()` paths;
- avoid treating binary `1` as MIDI note 1 or changing sampler pitch;
- maintain compatibility for existing schemas generated by `notes()`, `euclid()`, `hex()`, `sequence()`, and static `xox()`;
- keep transform composition behavior equivalent to current `applyPattern()` semantics;
- do not add special handling for combining Euclid and `xox` beyond preserving current modifier order/behavior;
- choose one schema migration rather than maintaining parallel scheduling implementations indefinitely.

Before editing, add characterization tests for current static `xox` behavior on synth and sampler cycles. Use those tests to constrain the schema refactor.

**Acceptance criteria:**

- [ ] Notes and trigger eligibility are structurally distinguishable in schema.
- [ ] A sampler mask hit retains its default source key/pitch.
- [ ] Static `xox`, Euclid, hex, sequence, and notes behavior remains equivalent.
- [ ] Existing serialized fixtures/tests are updated intentionally rather than through broad snapshots.
- [ ] The schema does not encode a random mask as random pitch values.
- [ ] Schema and Fluid checks/tests pass.

### Step 2.2 — Overload `xox()` for binary `RandomCycle`

**Status:** Complete.

**Files:** `packages/fluid/src/instruments/instrument.ts`, `packages/fluid/src/patterns/midi-notes.ts`, `packages/fluid/src/utils/validate.ts`, `packages/fluid/src/index.test.ts`, focused pattern tests

Support:

```ts
.xox(d.rand().bin().chance(0.6).steps(16, 0))
```

Requirements:

- retain current static `xox(...input)` signatures;
- accept exactly one `RandomCycle` as the dynamic overload;
- reject random cycles whose final type is not binary;
- preserve the random schema as the mask instead of passing the object through `utils/xox.ts` as a truthy scalar;
- ensure empty random bars remain empty mask bars;
- ensure later schema generation, rather than call order, validates the final random type;
- keep `.notes(RandomCycle)` semantics distinct from `.xox(RandomCycle)`.

**Acceptance criteria:**

- [x] TypeScript accepts static `xox` inputs and one binary `RandomCycle`.
- [x] Runtime schema construction rejects float/integer random masks.
- [x] `.xox(RandomCycle)` does not become static `[1]`.
- [x] `.notes(RandomCycle)` continues to produce random note values rather than a mask.
- [x] Empty bars survive Fluid schema construction.
- [x] Fluid check, lint, and focused tests pass.

### Step 2.3 — Schedule dynamic masks in synth and sampler engines

**Status:** Complete for dynamic masks; static-mask modifier-composition verification remains part of the Phase 2 masked-cycle completion gate.

**Files:** `packages/audio-engine/src/instruments/instrument.ts`, `packages/audio-engine/src/instruments/sampler.ts`, `packages/audio-engine/src/instruments/synthesizer.ts`, relevant instrument tests

Resolve the trigger mask at each structural grid position before scheduling the underlying note/voice.

Requirements:

- random masks resolve by absolute bar and original `stepIndex`;
- a mask value of `0` suppresses scheduling entirely;
- a mask value of `1` schedules the underlying note with its original pitch/value;
- empty bars schedule no voices and do not invoke `RandomResolver.resolve()`;
- no-ribbon active bars produce fresh deterministic masks each occurrence;
- ribbon masks repeat according to existing ribbon semantics;
- mask gaps do not re-index variation, region, detune, gain, or later timing parameters;
- remove or resolve the sampler's existing random-notes/mask TODO as part of the unified path.

**Acceptance criteria:**

- [x] A 16-step/empty-bar random mask schedules no events in every second bar.
- [x] Active bars change deterministically over time without a ribbon.
- [x] Ribbon-configured masks repeat at their configured period.
- [x] Sampler hits retain normal source pitch.
- [x] Synth notes retain their underlying MIDI values.
- [x] Suppressed positions do not resolve/schedule voice-specific work.
- [x] Audio-engine sampler and synthesizer tests pass.

---

## Phase 3 — Relative sampler duration

Tracer bullet: a sampler can resolve a normalized source length relative to its start for every grid position, while existing absolute `end()` behavior remains intact.

### Step 3.1 — Add duration to Fluid region construction

**Files:** `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/instruments/sampler-utils.ts`, `packages/fluid/src/index.test.ts`, `packages/fluid/src/utils/sample-utils.test.ts`

Add:

```ts
duration(...input: CycleInput)
```

Track duration separately from end in the builder, but clear the previous mode when either setter is called:

- `end()` clears configured duration;
- `duration()` clears configured end;
- last call wins.

Requirements:

- accept static and random/patterned `CycleInput` like `start()` and `end()`;
- validate static duration values as finite and within `0–1`;
- warn consistently for random ranges outside `0–1` if engine clamping remains the established random-region policy;
- preserve `start()` independently;
- define how duration interacts with `fit()` and `chop()` using existing region precedence: reject unsupported combinations explicitly rather than silently ignoring duration;
- leave samplers without start/end/duration on the current full-source/default path.

**Acceptance criteria:**

- [ ] `.duration(0.15)` produces a relative-duration region schema.
- [ ] `.end(0.8).duration(0.15)` uses duration; the reverse call order uses end.
- [ ] Static `0` and `1` are valid; invalid static values throw.
- [ ] Random/pattern duration schemas remain random and step-addressable.
- [ ] Existing start/end, fit, chop, and generated-fit tests remain valid.
- [ ] Unsupported duration combinations fail descriptively.
- [ ] Fluid check, lint, and tests pass.

### Step 3.2 — Extend the region schema without conflating endpoint and length

**Files:** `packages/schema/src/index.ts`, all schema consumers identified by TypeScript

Represent a static sampler region as one of:

- absolute `start` plus `end`; or
- `start` plus relative `duration`.

Use a discriminated shape or another type-safe representation that prevents both endpoint modes from being present simultaneously. Do not encode duration into an end schema prematurely because start and duration must resolve together at each note's grid position.

**Acceptance criteria:**

- [ ] TypeScript makes ambiguous end-plus-duration regions unrepresentable.
- [ ] Existing absolute region schemas remain clear and supported.
- [ ] Duration remains a `ParameterSchema` until engine resolution.
- [ ] Schema check passes across all dependent packages.

### Step 3.3 — Resolve relative source windows in the audio engine

**Files:** `packages/audio-engine/src/instruments/sampler.ts`, `packages/audio-engine/src/instruments/sampler.test.ts`

For each note:

1. resolve normalized start at `barIndex`/`stepIndex`;
2. resolve either absolute end or relative duration at the same indices;
3. compute `end = min(start + duration, 1)` for duration regions;
4. map the normalized region into file or sprite entry bounds;
5. skip zero-length windows before constructing a voice.

Requirements:

- clamp random resolved values using the established source-region policy;
- never shift start backward to satisfy duration;
- maintain existing sprite coordinate mapping;
- keep source duration separate from wall-clock gate duration;
- static/pattern detune naturally changes traversal time;
- for looping samplers, use the resolved duration region as the loop region and continue looping until another lifecycle operation stops it;
- a skipped zero-duration event performs no voice-state side effects in later phases.

**Acceptance criteria:**

- [ ] `.start(0.4).duration(0.15)` resolves the same source region as `.start(0.4).end(0.55)`.
- [ ] `.start(0.8).duration(0.3)` clamps to `0.8–1`.
- [ ] Duration resolves by original grid index across chance gaps.
- [ ] Sprite regions map relative duration within the sprite entry correctly.
- [ ] Zero duration creates no source or scheduled voice.
- [ ] Existing end-region playback remains unchanged.
- [ ] Audio-engine sampler tests pass.

---

## Phase 4 — Reverse buffers and sampler direction

Tracer bullet: forward, reverse, and alternating hits traverse the same resolved source region, while reverse-capable buffers are prepared before scheduling and shared across sampler instances.

### Step 4.1 — Add sampler direction to Fluid and schema

**Files:** `packages/schema/src/index.ts`, `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/index.test.ts`

Add a `SampleDirection` type and:

```ts
direction("forward" | "reverse" | "alternate");
```

Requirements:

- sampler-only API;
- default to `"forward"`;
- reject all other strings at compile time and runtime where untyped input can enter;
- keep it distinct from `Instrument.reverse()`, which remains a rhythmic transform;
- serialize direction explicitly or default it consistently without changing old observable behavior.

**Acceptance criteria:**

- [ ] All three direction values produce the expected sampler schema.
- [ ] Omitted direction behaves as forward.
- [ ] Synthesizers do not expose sample direction.
- [ ] Existing rhythmic `.reverse()` tests remain unchanged.
- [ ] Schema and Fluid checks/tests pass.

### Step 4.2 — Add a shared reversed-buffer cache

**Files:** `packages/audio-engine/src/instruments/sample-buffer-store.ts`, optional new `packages/audio-engine/src/instruments/reversed-buffer-cache.ts`, related tests

Create reversed copies by allocating a new `AudioBuffer` and reversing every channel independently. Never mutate the decoded original.

Requirements:

- cache by original `AudioBuffer` identity, preferably with `WeakMap<AudioBuffer, AudioBuffer>` so unused originals are not retained solely by the cache;
- share cache ownership at engine/cache scope so different sampler instances can reuse a reversed buffer;
- preload reversed variants during `Sampler.load()` only when direction is `"reverse"` or `"alternate"`;
- include every preloaded variation/source key that the sampler may use;
- do not perform channel copying from `scheduleBar()` or the first reverse event;
- forward-only samplers create no reversed buffers;
- fallback buffers follow the same preparation path.

If current sample cache ownership cannot share a reverse cache cleanly, add it beside `SampleCache` and thread it through engine sampler construction rather than creating module-global mutable state.

**Acceptance criteria:**

- [ ] Every channel is reversed into a distinct buffer and the original remains unchanged.
- [ ] Repeated requests for one original return the same reversed object.
- [ ] Different originals receive different reversed buffers.
- [ ] Forward-only load performs no reversal.
- [ ] Reverse/alternate load completes reversal before the sampler is ready to schedule.
- [ ] Variations, multisample source keys, and fallback buffers are covered.
- [ ] Buffer-store focused tests pass.

### Step 4.3 — Map forward regions onto reversed buffers

**Files:** `packages/audio-engine/src/instruments/sampler.ts`, sampler tests

After resolving the region in original-buffer coordinates, choose the playback buffer and map offset for reverse traversal.

For original buffer duration `B`, original region `[start, end]`, and source-region duration `D = end - start`:

```text
forward offset = start
reverse offset = B - end
```

The reversed source then traverses the same material from original `end` toward original `start`.

Requirements:

- perform mapping after file/sprite entry and region bounds are resolved;
- preserve source-region duration and fit calculations;
- use positive playback rate/detune for both directions;
- do not invert detune values or LFO phase;
- test non-zero starts, clamped ends, sprite entries, and whole-buffer playback.

**Acceptance criteria:**

- [ ] Forward and reverse hits address identical source frames in opposite order.
- [ ] `.start(0.25).duration(0.1)` reverses original region `0.25–0.35`.
- [ ] Sprite-relative regions map correctly onto the full reversed decoded buffer.
- [ ] Pitch rate, fit rate, and detune magnitude are unchanged by direction.
- [ ] Reverse playback never relies on a negative playback rate.

### Step 4.4 — Implement hit-aware alternate direction state

**Dependency:** Complete Step 5.1 before wiring reverse or alternate voice scheduling. Direction schema and reversed-buffer preparation may precede it, but all emitted reverse/alternate voices must use the click-free gate and teardown lifecycle.

**Files:** `packages/audio-engine/src/instruments/sampler.ts`, lifecycle code/tests as needed

Maintain per-sampler direction state:

- first emitted alternate voice is forward;
- each emitted voice toggles the next direction;
- suppressed masks, missing buffers, invalid windows, and zero-duration regions do not toggle;
- empty bars do not reset or toggle;
- state persists across bar boundaries;
- a new engine/sampler instance starts forward;
- retirement/destruction discards the state naturally;
- if transport restart reuses sampler instances, add an explicit reset hook at the correct lifecycle boundary.

Direction selection must happen only after all conditions required to emit a voice have passed, but before buffer/offset selection.

**Acceptance criteria:**

- [ ] Audible alternate sequence is forward, reverse, forward, reverse.
- [ ] Chance gaps do not cause two successive emitted hits to use the same direction.
- [ ] Zero-duration and unavailable-source events do not advance alternation.
- [ ] Alternation continues across empty bars.
- [ ] Transport restart resets the next alternate hit to forward.
- [ ] Static forward/reverse modes remain stateless.

---

## Phase 5 — Click-free source gating and explicit monophony

Tracer bullet: rapid alternating sampler hits can self-choke without clicks, while samplers remain polyphonic unless `.mono()` is enabled.

### Step 5.1 — Separate audible gate completion from source teardown

**Files:** `packages/audio-engine/src/instruments/instrument.ts`, `packages/audio-engine/src/instruments/sampler.ts`, `packages/audio-engine/src/utils/compute-envelope.ts`, related tests

Refactor voice scheduling only as much as necessary to expose and control a sampler voice's gain and teardown lifecycle safely.

Requirements:

- keep `source.start(note.startTime, offset)` with no third duration argument;
- schedule the voice gain envelope as the audible gate;
- ensure gain reaches exact/effective zero before `source.stop()`;
- stop after a short silent tail rather than exactly at a waveform discontinuity;
- for static detune, use playback speed when calculating nominal source traversal time;
- for envelope/LFO detune, derive the nominal gate from base playback speed and prioritize silent teardown over sample-frame-exact stopping;
- make teardown idempotent so natural end, mono replacement, cancellation, retirement, and destruction cannot double-stop/disconnect unsafely;
- preserve synthesizer scheduling unless a shared lifecycle refactor intentionally improves both paths;
- preserve MIDI binding cleanup and instrument `finished` behavior.

The implementation may introduce an internal tracked-voice handle with gain, source, start/end state, and cleanup methods. Keep it private to the engine; do not expose AudioNodes in schema or Fluid.

**Acceptance criteria:**

- [ ] Gated sampler voices never call `source.start()` with a duration argument.
- [ ] Gain reaches silence before scheduled source stop.
- [ ] Static and LFO-detuned short hits clean up after the gate.
- [ ] Cancellation/destruction remain safe for future and active voices.
- [ ] Instrument retirement resolves only after tracked voices are cleaned up.
- [ ] Existing effect, envelope, MIDI, and synthesizer tests pass.

### Step 5.2 — Add explicit sampler monophony

**Files:** `packages/schema/src/index.ts`, `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/index.test.ts`

Add:

```ts
mono((enabled = true));
```

Requirements:

- schema default is false/polyphonic;
- `.mono()` enables and `.mono(false)` disables;
- no fade/choke argument;
- do not add mono to base Instrument or Synthesizer in this scope;
- document that mono is per sampler instance, not a choke group.

**Acceptance criteria:**

- [ ] Omitted mono preserves polyphony.
- [ ] `.mono()` and `.mono(false)` serialize correctly.
- [ ] Synthesizers do not expose the API.
- [ ] Fluid and schema checks/tests pass.

### Step 5.3 — Fade and replace the previous mono voice

**Files:** `packages/audio-engine/src/instruments/sampler.ts`, `packages/audio-engine/src/instruments/instrument.ts`, sampler/instrument tests

Track the currently active emitted voice for mono samplers. When a new valid voice is emitted:

1. hold/cancel the previous voice gain at the replacement time;
2. ramp it to exact zero over its existing resolved gain-envelope release duration;
3. stop it after the fade and silent tail;
4. schedule and store the new active voice.

Requirements:

- use `cancelAndHoldAtTime()` where available in the supported environment/test doubles, or an equivalent exact-current-value strategy;
- do not use an asymptotic target followed by a stop at a still-audible gain;
- suppressed, unavailable, and zero-duration events do not replace the active voice;
- mono state persists across bars;
- looped voices continue until replaced and then fade/stop normally;
- polyphonic samplers retain overlap behavior;
- clearing/destroying the active voice clears mono bookkeeping;
- direction alternation advances exactly once for the newly emitted voice, independent of replacement cleanup.

**Acceptance criteria:**

- [ ] Mono sampler never retains two audibly active voices after the replacement fade.
- [ ] Previous gain reaches zero before source stop.
- [ ] Polyphonic sampler behavior is unchanged.
- [ ] A chance gap does not choke a sustained active voice.
- [ ] A zero-duration event does not choke or advance direction.
- [ ] Looped mono voices stop on the next valid hit.
- [ ] Mono replacement works across bar boundaries.
- [ ] Focused tests cover short release, non-zero release, looping, cancellation, and teardown.

### Step 5.4 — Add click-regression test coverage

**Files:** audio-engine test helpers and sampler tests

Web Audio mocks cannot prove perceptual quality, but they can enforce the scheduling invariants that fixed the demo:

- no third `start()` duration argument;
- explicit gain ramp to zero;
- source stop strictly after fade completion;
- reverse and forward paths use the same gating strategy;
- mono replacement holds/cancels prior automation before ramping;
- LFO detune does not cause a hard source cutoff at nominal source duration.

**Acceptance criteria:**

- [ ] Tests fail if hard-duration source start is reintroduced.
- [ ] Tests fail if stop is scheduled before gain reaches zero.
- [ ] Tests cover forward, reverse, alternate, and mono replacement paths.
- [ ] Browser listening remains an explicit later acceptance gate rather than being claimed by unit tests.

---

## Phase 6 — Patternable nudge

Tracer bullet: any instrument can move each emitted onset early or late by a patternable fraction of its final rhythmic step without changing duration or parameter indexing.

### Step 6.1 — Add nudge to Fluid and schema

**Files:** `packages/schema/src/index.ts`, `packages/fluid/src/instruments/instrument.ts`, `packages/fluid/src/index.test.ts`, focused instrument tests

Add:

```ts
nudge(...input: CycleInput)
```

Store nudge as a `ParameterSchema` on base `InstrumentSchema`.

Requirements:

- default to static `0`;
- accept static patterns and `RandomCycle`;
- values represent fractions of final step duration;
- validate static values as finite and within `-0.5–0.5`;
- validate random configured ranges where statically knowable; reject or warn consistently with parameter validation policy, but the engine must never schedule outside the supported range;
- expose nudge on sampler and synthesizer through base Instrument;
- keep nudge separate from sample source offset.

**Acceptance criteria:**

- [ ] `.nudge([0.1, 0, -0.1, 0.05])` preserves a four-position parameter pattern.
- [ ] Random nudge remains a random parameter schema.
- [ ] Omitted nudge resolves to zero.
- [ ] Invalid static values throw.
- [ ] Sampler and synth schemas contain the same timing-parameter shape.
- [ ] Schema and Fluid checks/tests pass.

### Step 6.2 — Centralize onset timing resolution

**Files:** `packages/audio-engine/src/instruments/instrument.ts`, sampler and synthesizer scheduling files, focused tests

Add a shared protected timing resolver that receives:

- bar index and bar start time;
- original grid offset and step index;
- final note/step duration after `fast`, `slow`, and `stretch` have transformed the static schema;
- nudge schema;
- later, swing amount.

For nudge-only scheduling:

```text
nudgeSeconds = resolvedNudge * finalStepDurationSeconds
startTime = clamp(gridTime + nudgeSeconds, barStart, barEnd)
```

Requirements:

- resolve nudge at original `barIndex`/`stepIndex`;
- apply after rhythmic transformations because schema `note.duration` is the final step length;
- preserve the original note duration and derive `endTime` from shifted `startTime + duration`;
- clamp onset to bar start/end, including negative nudge on the first step; an onset exactly at bar end remains scheduled with its originating grid position;
- permit tails beyond bar end;
- permit coincident events without sorting/re-indexing them;
- update envelope, detune, effects, MIDI, and source scheduling to use shifted note context consistently.

**Acceptance criteria:**

- [ ] Positive/negative nudge moves onset by the expected fraction of final step duration.
- [ ] First-step negative nudge clamps to bar start.
- [ ] Last-step positive nudge clamps to bar end.
- [ ] Event duration is unchanged after onset movement.
- [ ] `fast`, `slow`, and `stretch` alter the absolute nudge amount through final step duration.
- [ ] Chance gaps do not compress nudge indexing.
- [ ] Synth and sampler timing tests pass.

---

## Phase 7 — Conventional swing

Tracer bullet: instruments can apply a coherent bar-level swing amount that delays odd grid positions while composing additively with nudge.

### Step 7.1 — Add bar-level swing to Fluid and schema

**Files:** `packages/schema/src/index.ts`, `packages/fluid/src/instruments/instrument.ts`, `packages/fluid/src/index.test.ts`

Add:

```ts
swing(...amounts: number[])
```

Swing is intentionally not a general `CycleInput`:

- one number applies to every bar;
- multiple numbers cycle by bar;
- random cycles and nested per-step arrays are not accepted;
- values must be finite and within `0–1`;
- default is `0`.

Represent swing as a bar-level numeric cycle or another schema shape that cannot be mistaken for a step-addressed `ParameterSchema`.

**Acceptance criteria:**

- [ ] `.swing(0.25)` applies one bar-level amount.
- [ ] `.swing(0.25, 0.5)` alternates amounts by bar indefinitely.
- [ ] Empty arguments, nested patterns, random cycles, and invalid values fail clearly.
- [ ] Omitted swing remains straight.
- [ ] Sampler and synth inherit swing.
- [ ] Schema and Fluid checks/tests pass.

### Step 7.2 — Apply conventional odd-step delay

**Files:** `packages/audio-engine/src/instruments/instrument.ts`, sampler/synthesizer tests

Extend the shared timing resolver:

```text
swingDelay = odd(stepIndex) ? swingAmount * finalStepDuration : 0
nudgeOffset = resolvedNudge * finalStepDuration
startTime = clamp(gridTime + swingDelay + nudgeOffset, barStart, barEnd)
```

Requirements:

- use zero-based odd `stepIndex` values `1`, `3`, `5`, ...;
- determine swing from grid position, not emitted-hit count;
- resolve one swing amount by absolute bar index;
- use the same final unswung step duration for both swing and nudge;
- preserve event duration;
- do not re-index after chance gaps;
- clamp only final onset, not individual components;
- `.swing(1 / 3)` produces conventional 2:1 triplet timing on an even grid;
- `.swing(1)` may place an odd step on the next grid boundary, subject to bar clamp.

**Acceptance criteria:**

- [ ] Even grid positions stay straight when nudge is zero.
- [ ] Odd positions receive the expected swing delay.
- [ ] Chance-suppressed odd positions do not change later swing assignment.
- [ ] Swing and nudge combine additively from the same step duration.
- [ ] Bar-varying swing cycles repeat indefinitely.
- [ ] Shifted event tails may cross bars while onsets do not.
- [ ] Synth and sampler timing tests pass.

---

## Phase 8 — Scratch integration, documentation, and verification

Tracer bullet: the finalized language expression reproduces the core scratch behavior against the Tay sample, and all package-level behavior is documented and verified.

### Step 8.1 — Add a focused Fluid integration fixture/test

**Files:** `packages/fluid/src/index.test.ts`, audio-engine integration tests or a dedicated fixture file

Construct the complete scratch schema:

```ts
d.sample("tay")
  .bank("user")
  .xox(d.rand().bin().chance(0.6).steps(16, 0))
  .duration(d.rand().range(0.065, 0.15).steps(16))
  .direction("alternate")
  .mono()
  .nudge(d.rand().range(-0.1, 0.1).steps(16))
  .detune(d.lfo(0, 700).speed(7.66))
  .push();
```

Requirements:

- verify the public chain compiles without casts or internal schema construction;
- assert structural properties rather than one giant brittle snapshot;
- test alignment across the 16-step active bar and empty rest bar;
- retain the existing release expression as a separate composition example rather than adding release-specific APIs.

**Acceptance criteria:**

- [ ] Target syntax type-checks and produces a valid `DromeSchema`.
- [ ] Random mask, duration, direction, mono, nudge, and detune survive into their intended schema fields.
- [ ] Empty rest bar is represented without a synthetic event.
- [ ] Release remains expressible through existing `end` and detune-envelope APIs.

### Step 8.2 — Update user-facing API documentation and examples

**Files:** relevant package READMEs/docs/examples discovered during implementation, optionally `notes/snippets.js`; do not overwrite unrelated local edits

Document:

- `steps(...counts)` per-bar semantics and `0` as an empty bar;
- binary-only `chance()` and independent probability semantics;
- random masks in `xox()`;
- absolute `end` versus relative `duration`;
- sample direction and rhythmic `reverse()` distinction;
- explicit per-sampler `mono()`;
- nudge units/range and difference from source offset;
- conventional swing units and odd-step behavior;
- cycles-per-bar LFO speed, including that `7.66` approximates 3 Hz only at 94 BPM.

If `notes/snippets.js` is used, preserve the user's existing uncommitted changes and edit only after reviewing them.

**Acceptance criteria:**

- [ ] Every new method has syntax, units, defaults, validation, and one example.
- [ ] Documentation distinguishes chance from exact hit count.
- [ ] Documentation distinguishes nudge from swing.
- [ ] Documentation distinguishes sample direction from rhythmic reverse.
- [ ] Scratch and release examples are both shown without implying the release needs new APIs.

### Step 8.3 — Update the scratch demo to mirror finalized language semantics

**Files:** `apps/demos/src/components/scratch.ts`, `apps/demos/src/pages/scratching.astro`, explanatory copy/tests as appropriate

Use the existing raw Web Audio demo as the manual reference harness. Align labels/explanations with the final APIs without replacing the demo's explicit raw-node implementation.

Requirements:

- explain that random timing variation maps to `nudge`, not `swing`;
- show the finalized Fluid expression beside the controls or in the explanation;
- retain explicit source loading and raw node graph visibility;
- ensure the demo's no-third-duration gain-gating fix remains in place;
- do not make the demos app depend on the production audio engine solely for this explanation.

**Acceptance criteria:**

- [ ] Demo terminology matches the implemented language.
- [ ] The displayed code corresponds to the active-bar/empty-bar structure.
- [ ] Existing demo loading, forward/reverse playback, and cleanup remain functional.
- [ ] Demos check, lint, and build pass.

### Step 8.4 — Run required automated verification

Run focused package commands after each phase and the complete suite at the end:

```sh
pnpm --filter @web-audio/schema check
pnpm --filter @web-audio/schema lint
pnpm --filter @web-audio/patterns check
pnpm --filter @web-audio/patterns lint
pnpm --filter @web-audio/patterns test:ci
pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter demos check
pnpm --filter demos lint
pnpm --filter demos build
pnpm check
pnpm lint
pnpm test
pnpm format
```

Do not run a development server without asking first.

**Acceptance criteria:**

- [ ] All focused package checks, lint, and tests pass.
- [ ] Demos check, lint, and build pass.
- [ ] Root checks, lint, tests, and format pass, or unrelated pre-existing failures are recorded.
- [ ] No generated build output is committed unintentionally.
- [ ] `git diff --check` passes.

### Step 8.5 — Manual browser/audio verification

Use the Tay sample and a current Chromium-based browser. Compare the engine result with the raw scratch demo.

#### Random rhythm

- [ ] The first bar has 16 potential hit positions at 60% independent chance.
- [ ] The second bar is silent.
- [ ] The two-bar structure repeats indefinitely.
- [ ] Restarting with identical random/ribbon configuration reproduces deterministic results as designed.
- [ ] A configured ribbon loops while no-ribbon randomness continues.

#### Duration and direction

- [ ] Hit lengths vary across the configured normalized range.
- [ ] Moving `start` preserves relative duration semantics.
- [ ] Forward/reverse hits use matching source material.
- [ ] Alternate direction advances only on emitted hits and begins forward after restart.

#### Voice behavior

- [ ] Polyphonic playback remains possible without `.mono()`.
- [ ] `.mono()` fades the prior hit before replacement.
- [ ] Mono state persists across bars and handles looped voices.
- [ ] Rapid forward/reverse retriggers do not produce source-stop clicks.
- [ ] Static and LFO-modulated detune remain click-free under representative scratch settings.

#### Timing

- [ ] Nudge moves individual grid positions early and late as expected.
- [ ] Negative first-step nudge does not schedule before the bar.
- [ ] Swing delays odd positions conventionally.
- [ ] Swing and nudge compose without shortening hits.
- [ ] Chance gaps do not change later nudge/swing alignment.

#### Lifecycle and performance

- [ ] Reverse preparation does not block the first scheduled reverse hit.
- [ ] Forward-only samplers do not allocate reversed buffers.
- [ ] Repeated reverse hits reuse cached buffers.
- [ ] Stop/restart and engine replacement clean up voices and reset alternate state correctly.
- [ ] No audio continues after destruction.

---

## Phase 9 — Closeout

### Step 9.1 — Reconcile implementation with the PRD

Review [`scratch-language-prd.md`](scratch-language-prd.md) after implementation.

Requirements:

- update only implementation-detail sections where the final architecture differs;
- do not silently change public semantics to match implementation shortcuts;
- record any deferred acceptance item explicitly;
- preserve intentional open details that remain internal.

**Acceptance criteria:**

- [ ] PRD and implementation plan describe the shipped public behavior accurately.
- [ ] Any deviation has an explicit rationale and follow-up.
- [ ] No core click-free, determinism, or alignment requirement is deferred without review.

### Step 9.2 — Record follow-ups without expanding scope

Potential follow-ups, only if implementation evidence warrants them:

- `"alternate-reverse"` direction;
- independent mono fade configuration;
- cross-instrument choke groups;
- exact-density random masks;
- additional timing units;
- richer groove templates;
- reversed-buffer memory instrumentation.

**Acceptance criteria:**

- [ ] Follow-ups are not partially implemented in this plan.
- [ ] TODOs link to an explicit plan/issue rather than hiding unresolved behavior.
- [ ] The final target scratch and release examples remain concise and supported.

## Expected file change summary

| Path                                                           | Expected change                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/schema/src/index.ts`                                 | Random chance, note-mask, sampler region/direction/mono, and timing schema types |
| `packages/patterns/src/random-cycle.ts`                        | Variadic steps and binary chance builder                                         |
| `packages/patterns/src/random-cycle.test.ts`                   | Per-bar steps and chance validation tests                                        |
| `packages/audio-engine/src/resolvers/random-resolver.ts`       | Deterministic chance resolution and empty-mask defense                           |
| `packages/fluid/src/patterns/midi-notes.ts`                    | Explicit dynamic trigger-mask handling                                           |
| `packages/fluid/src/instruments/instrument.ts`                 | Random `xox`, nudge, and swing APIs                                              |
| `packages/fluid/src/instruments/sampler.ts`                    | Duration, direction, and mono APIs                                               |
| `packages/fluid/src/instruments/sampler-utils.ts`              | Relative-duration region construction and validation                             |
| `packages/audio-engine/src/instruments/sample-buffer-store.ts` | Demand-driven reversed-buffer preparation/cache integration                      |
| `packages/audio-engine/src/instruments/instrument.ts`          | Shared timing resolution and safe tracked-voice lifecycle                        |
| `packages/audio-engine/src/instruments/sampler.ts`             | Masks, relative windows, direction, alternation, mono, and gated teardown        |
| `packages/audio-engine/src/instruments/synthesizer.ts`         | Dynamic masks and shared onset timing                                            |
| `packages/**/**.test.ts`                                       | Focused regression and integration coverage                                      |
| `apps/demos/src/components/scratch.ts`                         | Manual reference harness alignment, if needed                                    |
| `apps/demos/src/pages/scratching.astro`                        | Final Fluid example and terminology                                              |
| Relevant READMEs/docs                                          | Public API semantics and examples                                                |
