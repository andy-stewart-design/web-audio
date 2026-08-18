# Sampler Duration and Direction Implementation Plan

## Context

Commit `a6bddb5e050a20450dfb12dc00f2d0341149e574` added sampler duration, playback direction, and a broader voice-lifecycle refactor. It was reverted by `7adb2f4` because the playback-management changes introduced regressions.

This plan restores only the independently useful source-selection features:

- normalized sampler duration relative to `start`;
- forward, reverse, and alternating sample direction;
- shared reversed-buffer preparation and caching.

The existing source start/stop, gain-envelope, retirement, destruction, and transport behavior must remain unchanged except where alternate direction needs a small state reset at an existing lifecycle boundary.

Reference: [`scratch-language-plan.md`](scratch-language-plan.md), especially Phases 3 and 4.

## Target API

```ts
d.sample("tay").start(0.25).duration(0.1).direction("alternate").push();
```

Direction aliases from the reverted implementation should remain supported:

```ts
d.sample("tay").dur(0.1).dir("alt");
```

## Scope

### Included

- `duration(...input)` and `dur(...input)` on samplers;
- mutually exclusive absolute-end and relative-duration region schemas;
- normalized duration resolution within file and sprite entries;
- loop windows derived from relative-duration regions;
- rhythmic step duration as the voice and gain-envelope duration for looping samplers;
- `direction(...)` and `dir(...)` on samplers;
- `"forward"`, `"reverse"`, and `"alternate"` directions;
- abbreviated direction inputs `"for"`, `"rev"`, and `"alt"`;
- reversed-buffer creation without mutating decoded originals;
- a shared `WeakMap` cache keyed by original `AudioBuffer` identity;
- reverse-buffer preparation during sampler loading;
- forward-coordinate region mapping onto reversed buffers;
- hit-aware alternate direction state;
- focused Fluid and audio-engine tests.

### Explicitly excluded

Do not restore or redesign:

- `_scheduleVoice()` or shared instrument voice tracking;
- source stop-time calculations;
- gain-envelope scheduling;
- `SOURCE_SILENT_TAIL`;
- controlled voice release or click-free teardown changes;
- `stopPlayback()`;
- retirement or destruction behavior;
- transport-wide lifecycle changes;
- monophony or voice replacement;
- changes to existing `AudioBufferSourceNode.start()`/`stop()` conventions;
- unrelated note, mask, detune, or fit behavior;
- loop lifecycle changes beyond selecting a loop window and using rhythmic step duration.

If duration or direction appears to require one of these changes, stop and reassess rather than expanding the implementation.

## Key design decisions

- `duration` is a normalized source length relative to the resolved normalized `start`.
- `end` remains an absolute normalized endpoint.
- `end()` and `duration()` are mutually exclusive; the latest call wins.
- Source-region coordinates always refer to the original forward buffer.
- A duration region resolves `end = min(start + duration, 1)`; start is never shifted backward.
- Static duration values must be finite and within `0–1`, inclusive.
- Random duration values retain existing region behavior: warn for configured ranges outside `0–1`, then clamp resolved values in the engine.
- Zero-length and invalid windows do not create voices.
- Sample-region duration and rhythmic voice duration are distinct for loops: the region defines the repeated material, while the note's step duration defines the gain envelope and scheduled voice lifetime.
- A looped default sampler with one full-bar step remains audible for one bar, even when its source buffer or selected region is shorter than a bar.
- Reverse playback uses a reversed copy and a positive playback rate, never a negative playback rate.
- For an original buffer of duration `B` and source region `[start, end]`, reverse offset is `B - end`.
- Reversed buffers are prepared while loading reverse-capable samplers, not during scheduling.
- The reverse cache is shared by engine sampler instances and does not retain original buffers unnecessarily.
- Alternate direction begins forward and toggles only after a voice is successfully emitted.
- Missing buffers and zero-length windows do not advance alternate state.
- Existing source scheduling and teardown remain authoritative.

---

## Phase 1 — Restore relative sampler duration

### Step 1.1 — Add a type-safe duration region schema

**Files:**

- `packages/schema/src/index.ts`

Represent static sampler regions as a union:

```ts
interface StaticEndRegionSchema {
  type: "static";
  start: ParameterSchema;
  end: ParameterSchema;
  duration?: never;
}

interface StaticDurationRegionSchema {
  type: "static";
  start: ParameterSchema;
  duration: ParameterSchema;
  end?: never;
}

type StaticRegionSchema = StaticEndRegionSchema | StaticDurationRegionSchema;
```

Export both specific region types if useful to consumers.

**Requirements:**

- Existing `{ start, end }` schemas remain supported.
- Duration remains a `ParameterSchema` until note scheduling.
- A static region cannot contain both `end` and `duration`.
- Chop region types remain unchanged.

**Acceptance criteria:**

- [ ] TypeScript accepts end regions and duration regions.
- [ ] TypeScript rejects regions containing both endpoint modes.
- [ ] Schema checks pass.

### Step 1.2 — Add the Fluid duration builder

**Files:**

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/index.test.ts`

Add:

```ts
duration(...input: CycleInput)
dur(...input: CycleInput)
```

Track duration independently in the builder:

- `end()` sets end and clears duration;
- `duration()` sets duration and clears end;
- `start()` remains independent;
- the latest endpoint-mode call wins.

Update region construction to receive named options rather than adding another positional argument.

**Validation:**

- static duration values must be finite and in `[0, 1]`;
- random duration ranges outside `[0, 1]` warn consistently with `start()` and `end()`;
- duration with `chop()` fails descriptively rather than being ignored;
- an explicit duration suppresses an implicit generated-fit region while preserving the sampler's fit configuration, matching existing explicit-region behavior.

**Acceptance criteria:**

- [ ] `.duration(0.15)` emits `{ type: "static", start, duration }`.
- [ ] `.start(0.4).duration(0.15)` preserves both values.
- [ ] `.end(0.8).duration(0.15)` emits duration only.
- [ ] `.duration(0.15).end(0.8)` emits end only.
- [ ] Static `0` and `1` are valid.
- [ ] Negative, greater-than-one, `NaN`, and infinite static values throw.
- [ ] Random duration remains random and step-addressable.
- [ ] `.dur()` behaves identically when called normally or extracted.
- [ ] Duration plus chop fails with a descriptive error.
- [ ] Existing start/end, chop, and fit tests remain valid.

### Step 1.3 — Resolve duration windows in the engine

**Files:**

- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

Extend `_resolveSourceWindow()` without changing voice scheduling.

For a duration region:

1. resolve and clamp normalized start at the note's `barIndex` and original `stepIndex`;
2. resolve and clamp normalized duration at the same indices;
3. compute `regionEnd = min(regionStart + duration, 1)`;
4. map the normalized region into the selected file or sprite entry;
5. reject zero-length or invalid windows before constructing an audio source.

Keep `sourceWindow.duration`, fit calculations, offsets, and non-looping playback-duration behavior otherwise unchanged.

For looping samplers:

- use a resolved relative-duration region as `loopStart`/`loopEnd`;
- treat the selected source region as the material to repeat, not as the voice lifetime;
- use `scheduledDuration` from the rhythmic step as the note context and gain-envelope duration;
- stop the source through the existing `_scheduleVoice()` behavior after that step duration and release tail;
- do not restore the reverted indefinite loop-sustain or controlled-voice lifecycle.

The sampler-local duration choice is therefore:

```ts
const duration =
  schema.loop || sourceWindow.isFittedChop
    ? scheduledDuration
    : schema.clipMode === "one-shot"
      ? playbackDuration
      : Math.min(scheduledDuration, playbackDuration);
```

Shared envelope scheduling and teardown remain unchanged.

**Acceptance criteria:**

- [ ] `.start(0.4).duration(0.15)` selects the same source frames as `.start(0.4).end(0.55)`.
- [ ] `.start(0.8).duration(0.3)` clamps to `0.8–1`.
- [ ] Duration resolves by original step index across mask gaps.
- [ ] Sprite-relative duration maps within the sprite entry.
- [ ] Zero duration creates no source and no voice-state side effects.
- [ ] Existing absolute-end playback remains unchanged.
- [ ] A short full-source loop uses the rhythmic step duration for its gain envelope.
- [ ] A relative-duration loop repeats only its selected loop window but remains active for the rhythmic step duration.
- [ ] `d.sample("hh").loop().push()` uses its default full-bar step as the gain-envelope duration, regardless of sample length.
- [ ] Non-looping source start and stop timing tests remain unchanged unless their selected source window intentionally changes.
- [ ] Looping source stop timing continues to use the existing release-tail behavior after the step ends.

---

## Phase 2 — Restore sampler direction

### Step 2.1 — Add direction to schema and Fluid

**Files:**

- `packages/schema/src/index.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/index.test.ts`

Add:

```ts
type SampleDirection = "forward" | "reverse" | "alternate";
```

Add sampler methods:

```ts
direction(direction: SampleDirection | "for" | "rev" | "alt")
dir(direction: SampleDirection | "for" | "rev" | "alt")
```

Normalize abbreviated inputs to full schema values. Default Fluid-generated sampler schemas to `"forward"`.

Decide during implementation whether `SamplerSchema.direction` should be required or optional for compatibility with hand-authored schemas and fixtures. If optional, all engine reads must use `schema.direction ?? "forward"`. Fluid output should still serialize it explicitly.

**Requirements:**

- Runtime validation rejects invalid strings from untyped callers.
- Direction remains sampler-only.
- Rhythmic `Instrument.reverse()` remains unrelated and unchanged.
- Extracted aliases remain bound to the sampler instance.

**Acceptance criteria:**

- [ ] Omitted direction behaves as forward.
- [ ] Full and abbreviated inputs emit canonical direction values.
- [ ] Invalid runtime input throws descriptively.
- [ ] Synthesizers do not expose sample direction.
- [ ] Existing rhythmic reverse behavior remains unchanged.

### Step 2.2 — Add the shared reversed-buffer cache

**Files:**

- `packages/audio-engine/src/utils/reversed-buffer-cache.ts`
- `packages/audio-engine/src/utils/reversed-buffer-cache.test.ts`
- `packages/audio-engine/src/index.ts`

Implement:

```ts
getReversedBuffer(
  ctx: AudioContext,
  cache: WeakMap<AudioBuffer, AudioBuffer>,
  original: AudioBuffer,
)
```

Create a new buffer with matching channel count, length, and sample rate. Reverse each channel independently and never mutate the original.

Add one reverse cache to the engine's existing sample cache:

```ts
reversed: new WeakMap<AudioBuffer, AudioBuffer>();
```

Do not change clock stop handling or instrument lifecycle in `AudioEngine`.

**Acceptance criteria:**

- [ ] Every channel is reversed correctly.
- [ ] The original buffer remains unchanged.
- [ ] Repeated requests for one original reuse the reversed buffer.
- [ ] Different originals produce different reversed buffers.
- [ ] The cache is shared across samplers created by one engine.

### Step 2.3 — Prepare reverse buffers during loading

**Files:**

- `packages/audio-engine/src/instruments/sample-buffer-store.ts`
- `packages/audio-engine/src/instruments/sample-buffer-store.test.ts`
- `packages/audio-engine/src/instruments/sampler.ts`

Extend `SampleCache` with the shared reverse cache and add a `prepareReverse` option to `SampleBufferStore`.

When `prepareReverse` is true:

- prepare reversed variants for already-resolved cached buffers;
- prepare reversed variants after newly decoded buffers resolve;
- prepare a fallback buffer when supplied;
- cover every preloaded variation and source key.

Allow playback-source lookup to request the reversed variant. Scheduling must not create a reversed buffer. If an expected reverse buffer is unavailable, warn and skip the hit using the existing unavailable-buffer behavior.

**Acceptance criteria:**

- [ ] Forward-only samplers do not allocate reversed buffers.
- [ ] Reverse and alternate samplers prepare reverse buffers during loading.
- [ ] Cached, decoded, fallback, variation, and multisample buffers are covered.
- [ ] Reverse scheduling performs no channel copying.
- [ ] Existing fetch and promise deduplication remain unchanged.

### Step 2.4 — Map source windows onto reversed buffers

**Files:**

- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

Resolve the source window in original forward coordinates first. Then select the playback buffer and offset.

For original source bounds in seconds:

```text
sourceStart = normalizedStart * buffer.duration
sourceEnd = normalizedEnd * buffer.duration
forwardOffset = sourceStart
reverseOffset = buffer.duration - sourceEnd
```

The selected duration remains `sourceEnd - sourceStart` in either direction.

**Requirements:**

- Mapping happens after file/sprite entry bounds and static region bounds resolve.
- Playback rate and detune remain positive and unchanged.
- Reverse never uses a negative playback rate.
- Existing fit calculations continue to use the forward-coordinate source duration.
- Whole-buffer forward playback may retain its existing undefined offset.
- Reverse playback supplies the mapped offset.

**Acceptance criteria:**

- [ ] Forward and reverse select the same source frames in opposite order.
- [ ] Non-zero start/end regions map correctly.
- [ ] Relative-duration regions map correctly in reverse.
- [ ] Clamped duration regions map correctly in reverse.
- [ ] Sprite-relative regions map against the full reversed decoded buffer.
- [ ] Fit rate, pitch rate, and detune magnitude are unchanged.

### Step 2.5 — Add hit-aware alternate direction

**Files:**

- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

Maintain private per-sampler state whose initial value is forward.

Direction selection must occur after note/mask resolution but alternation must advance only after all conditions required to emit a source have passed. Refactor the local sampler scheduling method to return whether it emitted a voice if needed; do not alter shared voice tracking.

**Requirements:**

- first emitted alternate hit is forward;
- each emitted hit toggles the next direction;
- suppressed masks do not toggle;
- missing playback sources do not toggle;
- zero-length or invalid source windows do not toggle;
- state persists across bars and empty bars;
- static forward/reverse modes do not mutate alternate state.

Use the existing `cancelFutureNotes()` transport path to reset alternate state if a transport restart reuses sampler instances. An override may call `super.cancelFutureNotes()` and then reset direction state. Do not introduce `stopPlayback()` or alter active-source teardown.

**Acceptance criteria:**

- [ ] Emitted hits alternate forward, reverse, forward, reverse.
- [ ] Mask gaps do not advance alternation.
- [ ] Zero-duration events do not advance alternation.
- [ ] Missing buffers do not advance alternation.
- [ ] Alternation persists across bars and empty bars.
- [ ] Existing transport stop behavior is unchanged apart from resetting the next alternate hit to forward.

---

## Phase 3 — Regression verification

### Step 3.1 — Add focused tests without importing lifecycle expectations

Restore or rewrite only tests that cover:

- duration schema construction and validation;
- end/duration precedence;
- duration engine resolution and clamping;
- zero-duration suppression;
- sprite-relative duration;
- duration indexing across mask gaps;
- short loop sources sustaining for their full rhythmic step;
- relative-duration loop windows remaining active for their full rhythmic step;
- reversed-buffer correctness and reuse;
- forward/reverse region mapping;
- alternate direction state and reset;
- forward-only avoidance of reverse allocation.

Do not restore tests from the reverted commit that assert:

- new source stop times;
- silent-tail timing;
- new gain-envelope automation machinery beyond asserting that existing automation uses the loop's rhythmic step duration;
- controlled voice release;
- transport fading;
- destruction or retirement waiting for new voice handles;
- looped sources remaining indefinitely active;
- click-free teardown invariants.

### Step 3.2 — Run focused package verification

```sh
pnpm --filter @web-audio/schema check
pnpm --filter @web-audio/schema lint
pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine test:ci
pnpm format

git diff --check
```

If focused checks pass, run the root suite:

```sh
pnpm check
pnpm lint
pnpm test
```

**Acceptance criteria:**

- [ ] Schema, Fluid, and audio-engine checks pass.
- [ ] Focused tests pass.
- [ ] Existing sampler playback-management tests pass without rewritten timing expectations.
- [ ] Root checks pass or unrelated pre-existing failures are recorded.
- [ ] Formatting and `git diff --check` pass.

### Step 3.3 — Review the final diff against the scope boundary

Before completion, compare the implementation with the reverted commit and confirm that none of these files changed unless required only for fixture compatibility:

- `packages/audio-engine/src/instruments/instrument.ts`
- `packages/audio-engine/src/types.ts`
- `packages/audio-engine/src/constants.ts`

Also confirm that `packages/audio-engine/src/index.ts` contains only the reverse-cache addition and no clock-stop lifecycle change.

**Acceptance criteria:**

- [ ] Shared voice scheduling is unchanged.
- [ ] Existing stop and envelope behavior is unchanged.
- [ ] Engine transport stop still uses its pre-existing behavior.
- [ ] No monophony or teardown work was reintroduced.
- [ ] The final diff is limited to duration, direction, reverse preparation, tests, and necessary schema fixture updates.

## Expected file changes

| Path                                                                | Expected change                                       |
| ------------------------------------------------------------------- | ----------------------------------------------------- |
| `packages/schema/src/index.ts`                                      | Duration-region union and sample direction type/field |
| `packages/fluid/src/instruments/sampler.ts`                         | Duration and direction APIs, aliases, defaults        |
| `packages/fluid/src/instruments/sampler-utils.ts`                   | Duration validation and region construction           |
| `packages/fluid/src/index.test.ts`                                  | Fluid duration/direction coverage                     |
| `packages/audio-engine/src/index.ts`                                | Shared reversed-buffer `WeakMap` only                 |
| `packages/audio-engine/src/utils/reversed-buffer-cache.ts`          | New reverse-copy helper                               |
| `packages/audio-engine/src/utils/reversed-buffer-cache.test.ts`     | Reverse-copy/cache tests                              |
| `packages/audio-engine/src/instruments/sample-buffer-store.ts`      | Reverse preparation and lookup                        |
| `packages/audio-engine/src/instruments/sample-buffer-store.test.ts` | Reverse preparation tests                             |
| `packages/audio-engine/src/instruments/sampler.ts`                  | Duration windows, direction mapping, alternation      |
| `packages/audio-engine/src/instruments/sampler.test.ts`             | Focused engine behavior and regressions               |
| Existing schema fixtures                                            | Add/default direction only where required by typing   |

## Final acceptance

The work is complete when this expression is supported:

```ts
d.sample("tay")
  .start(0.25)
  .duration(d.rand().range(0.065, 0.15).steps(16))
  .direction("alternate")
  .push();
```

and when it selects the expected forward/reverse source windows without changing the sampler's shared source scheduling, envelope machinery, release-tail behavior, retirement, destruction, or transport behavior. Looped voices are the intentional duration exception: their selected source window repeats for the rhythmic step duration rather than limiting the gain envelope to one traversal of that window.
