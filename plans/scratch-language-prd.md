# Scratch Language API PRD

## Status

Proposed

## Summary

Add general-purpose rhythm, sampler, voice-allocation, and timing APIs needed to express a turntable-style scratch effect in Drome.

Target scratch expression:

```ts
d.sample("tay")
  .bank("user")
  .xox(d.rand().bin().chance(0.6).steps(16, 0))
  .duration(d.rand().range(0.065, 0.15).steps(16))
  .direction("alternate")
  .mono()
  .nudge(d.rand().range(-0.1, 0.1).steps(16))
  .detune(d.lfo(0, 700).speed(7.66));
```

The release phrase is already expressible with existing APIs and is not the primary subject of this work:

```ts
d.sample("tay")
  .bank("user")
  .end(0, 0.375, 0, 1)
  .detune(d.env(-1200, 0).a(0, 0.25, 0, 0.075).d(0).s(1).r(0))
  .push();
```

## Goals

- Express probabilistic trigger masks through the existing random and `xox` concepts.
- Allow random patterns to describe different step counts across repeating bars, including empty bars.
- Define sampler duration relative to the resolved source start.
- Support forward, reverse, and hit-aware alternating sample playback.
- Make sampler self-choking explicit rather than changing the default polyphonic behavior.
- Support patternable timing displacement independently from conventional swing.
- Preserve deterministic random behavior.
- Ensure rapid, detune-modulated retriggering is click-free.

## Non-goals

- Exact-density random rhythms that guarantee a fixed number of hits per bar.
- Cross-instrument choke groups.
- Making every sampler monophonic.
- Step-patterned playback direction.
- Reverse playback for synthesizers or MIDI instruments.
- Treating `duration` as seconds, beats, or wall-clock gate length.
- Using `swing` as a synonym for random timing jitter.

## Requirements

### 1. Patternable random step counts

Change `RandomCycle.steps()` from a single step count to a repeating per-bar pattern:

```ts
d.rand().steps(16, 0, 8);
```

Semantics:

- Bar 1 contains 16 evenly distributed random positions.
- Bar 2 is empty and emits no values.
- Bar 3 contains 8 evenly distributed random positions.
- The three-bar structure repeats indefinitely.
- Empty bars still occupy time and advance the global random/bar timeline.
- Without a ribbon, each occurrence of an active bar produces fresh deterministic randomness indefinitely.
- With a ribbon, randomness loops according to the existing ribbon configuration.

An empty bar may be represented by an empty pattern. The scheduler must not ask `RandomResolver` to resolve a step in an empty bar.

### 2. Binary random chance

Add `RandomCycle.chance(probability)`:

```ts
d.rand().bin().chance(0.6);
```

Semantics:

- `chance` is valid only when the random cycle's final data type is binary.
- Call order need not matter; final schema validation enforces the binary requirement.
- `probability` must be within `0–1`, inclusive. Invalid values throw rather than clamp.
- `chance(0)` always produces `0`.
- `chance(1)` always produces `1`.
- `bin()` without `chance()` remains equivalent to a 50% chance and preserves current behavior.
- Repeated calls use the latest value.
- Each eligible step is an independent Bernoulli trial; chance does not guarantee an exact hit count.
- Results remain deterministic for the same seed/ribbon, bar, step, and probability.
- Internal threshold orientation is not public API, provided the probability and determinism contracts hold.

### 3. Random trigger masks in `xox`

Allow `Instrument.xox()` to accept a binary `RandomCycle`:

```ts
d.sample("tay").xox(d.rand().bin().chance(0.6).steps(16, 0));
```

Semantics:

- The random cycle is preserved as a dynamic trigger mask, not materialized once during schema construction.
- The mask resolves independently for each active bar unless ribbon configuration causes it to loop.
- The mask establishes the resulting trigger grid, following existing static `xox` semantics: underlying note values cycle across that grid.
- A `1` preserves the underlying note/sample trigger at that grid position.
- A `0` suppresses the trigger.
- An empty random bar suppresses the instrument for that bar.
- Non-binary random cycles passed to `xox` are invalid and throw during schema construction.
- Composition with existing pattern modifiers retains the system's current behavior; no special Euclid/`xox` behavior is introduced.
- Suppressed steps do not compress or re-index other parameter patterns.

### 4. Relative sampler duration

Add `Sampler.duration(...input)` with the same patternable input forms as `start` and `end`.

`duration` is a normalized length relative to the resolved source start:

```ts
resolvedEnd = Math.min(resolvedStart + resolvedDuration, 1);
```

Examples:

```ts
.start(0.4).end(0.55)      // absolute source region 0.40–0.55
.start(0.4).duration(0.15) // relative source region 0.40–0.55
```

Semantics:

- Values are normalized against the total source buffer and must be within `0–1`.
- `0` is valid and produces no voice.
- A duration extending beyond the buffer is clamped at `1`; the start is not shifted backward.
- Patterned/random start and duration values resolve for the same scheduled grid position before calculating the endpoint.
- `end()` and `duration()` are mutually exclusive; the most recently called method wins and clears the other configuration.
- Duration patterns remain indexed by grid position, including when chance suppresses intervening hits.
- Duration describes source material, not wall-clock time. Detune naturally changes how long traversal takes.
- For looping samplers, duration defines the source loop region; the loop continues until another mechanism stops it.

### 5. Sampler playback direction

Add `Sampler.direction(mode)`:

```ts
.direction("forward" | "reverse" | "alternate")
```

Semantics:

- The default is `"forward"`, preserving existing behavior.
- Direction is sampler-only.
- `"alternate"` begins forward and changes direction only after a voice is actually emitted.
- Suppressed mask steps and zero-duration events do not advance alternation.
- Alternation persists across bars and empty/rest periods.
- Restarting transport resets alternation to forward; pausing/resuming preserves state when those operations are distinct.
- `start`, `end`, and `duration` always describe coordinates in the original forward buffer.
- A reverse hit traverses the same resolved forward region backward.
- Detune and playback-rate modulation retain the same values and phase in both directions.
- The existing `Instrument.reverse()` continues to mean reversing the rhythmic pattern and is unrelated.

#### Reversed-buffer lifecycle

- Reverse full decoded buffers rather than individual regions.
- Prepare reversed buffers during sampler loading only when the schema uses `"reverse"` or `"alternate"`.
- Cache reversed buffers by their original `AudioBuffer` so sampler instances and variations can reuse them.
- Forward-only samplers incur no reversed-buffer memory cost.
- Do not reverse a buffer while scheduling the first reverse hit.

### 6. Explicit sampler monophony

Add `Sampler.mono(enabled = true)`:

```ts
.mono()
.mono(false)
```

Semantics:

- Samplers remain polyphonic by default.
- Monophony applies only within one sampler instance; it is not a cross-instrument choke group.
- Emitting a new voice fades and stops that sampler's previous active voice.
- The fade uses the previous voice's existing gain-envelope release value.
- A suppressed or zero-duration hit neither chokes the active voice nor advances alternate direction.
- Voice state persists across bar boundaries.
- Voice state clears when playback restarts or the sampler is retired/destroyed.
- A new monophonic hit also fades and stops a previous looped voice. Without a new hit, the loop continues normally.

No independent mono fade argument or choke-group API is included initially.

### 7. Patternable timing nudge

Add `Instrument.nudge(...input)` as a general scheduling parameter:

```ts
.nudge([0.1, 0, -0.1, 0.05])
.nudge(d.rand().range(-0.1, 0.1).steps(16))
```

Semantics:

- Nudge is available to all instruments because it changes event scheduling, not sample playback.
- Values are fractions of the final resolved step duration.
- Accepted range is `-0.5–0.5`, inclusive; invalid values throw rather than clamp.
- Negative values move an onset early; positive values move it late.
- Nudge resolves by original grid position. Suppressed hits do not compress its indexing.
- Nudge uses the final step duration after rhythmic transformations such as `fast`, `slow`, and `stretch`.
- Only onset moves; note/sample duration is preserved and audio tails may cross bar boundaries.
- The resulting onset is clamped to the current bar's start and end boundaries; an onset exactly at the end boundary remains scheduled and associated with its originating grid position.
- Coincident events are allowed; the scheduler does not reorder or silently alter user values.

### 8. Conventional swing

Add `Instrument.swing(...amounts)` for conventional alternating-grid swing:

```ts
.swing(0.25)
.swing(0.25, 0.5) // alternating per-bar amounts
```

Semantics:

- Swing is available to all instruments.
- Swing amounts are static, bar-level values; random and per-step variation belong in `nudge`.
- Values are within `0–1`, inclusive.
- `0` is straight timing.
- `1 / 3` delays every second step by one third of a step, producing conventional 2:1 triplet swing.
- Odd zero-based grid indices (`1`, `3`, `5`, ...) receive the delay.
- Swing follows grid positions, not emitted-hit count.
- Suppressed steps do not change which later positions are swung.
- Swing and nudge use the original final step duration and combine additively:

```text
onset = grid time + swing delay + nudge offset
```

- Clamp the combined onset to the current bar boundaries.
- Preserve the event's original duration.

## Click-free playback requirements

Click-free rapid retriggering is part of feature acceptance, not a follow-up enhancement.

- Do not pass a third duration argument to `AudioBufferSourceNode.start()` for gated sampler playback.
- Start sources with scheduling time and source offset only:

```ts
source.start(when, offset);
```

- Use a per-voice gain envelope as the audible gate.
- Fade gain to effective silence before stopping and disconnecting a source.
- Apply the same principle to natural region completion and monophonic replacement.
- Under static detune, account for playback speed when deriving nominal traversal/gate timing.
- Under LFO-modulated detune, derive the gate from nominal/base playback speed and prioritize click-free gating over sample-frame-exact boundaries.
- Reverse sources must contain enough underlying buffer data to remain alive through their gain gate.

## State and alignment rules

- Chance, duration, and nudge resolve using bar and grid-step position.
- Chance suppresses an event without compressing other parameter patterns.
- Alternate direction is intentionally stateful and advances by emitted voice rather than grid position.
- Empty bars advance global time and random bar position but contain no steps to resolve.
- Mono voice state and alternate-direction state persist across bars.

## Implementation plan

### Increment 1: Random trigger patterns

- Make `RandomCycle.steps(...counts)` variadic.
- Add binary-only `RandomCycle.chance()`.
- Extend schemas and resolver behavior as needed.
- Allow binary `RandomCycle` input in `xox()`.
- Preserve dynamic masks through Fluid and engine scheduling.

### Increment 2: Sampler regions and reversed buffers

- Add Fluid/schema support for `duration`.
- Resolve duration relative to start.
- Implement reversed-buffer creation, mapping, loading, and shared caching.

### Increment 3: Direction and monophony

- Add sampler direction schema and playback behavior.
- Add stateful emitted-hit alternation.
- Add explicit sampler monophony and release-based voice replacement.
- Implement click-free source gating and teardown.

### Increment 4: Scheduling modifiers

- Add patternable instrument `nudge`.
- Add conventional bar-level instrument `swing`.
- Apply timing after rhythmic transformations and before audio scheduling.

### Increment 5: Integration

- Add the finalized scratch expression to an example/demo.
- Verify behavior in a browser with the Tay sample.
- Document LFO speed as cycles per bar; `7.66` approximates 3 Hz only at 94 BPM.

## Acceptance criteria

### Randomness and masks

- `steps(16, 0, 8)` repeats a 16-step bar, empty bar, and 8-step bar indefinitely.
- Empty bars schedule no events and do not cause resolver errors.
- Identical random configuration and timeline produce identical results.
- No-ribbon randomness continues across bars; ribbon randomness loops as configured.
- `chance(0)`, `chance(0.5)`, `chance(0.6)`, and `chance(1)` have the specified behavior.
- Invalid chance values and non-binary chance/mask configurations throw.
- Random `xox` masks preserve the sampler's normal source pitch on active steps.

### Duration and direction

- Duration resolves relative to start and clamps at the buffer end.
- The latest `end`/`duration` call wins.
- Forward and reverse playback traverse the same source region in opposite directions.
- Alternate direction ignores suppressed and zero-duration steps.
- Alternate direction starts forward after transport restart.
- Reversed buffers are shared and are not created for forward-only samplers.

### Voice behavior

- Polyphonic behavior remains the default.
- Mono retriggers fade previous normal and looped voices using envelope release.
- Mono state persists across bars and clears on restart/retirement/destruction.
- Rapid alternating hits with static and LFO detune do not produce audible clicks from source termination.
- Gated playback does not use the third `source.start()` duration argument.

### Timing

- Nudge resolves per grid position and uses the final transformed step duration.
- Swing delays odd grid positions conventionally.
- Chance gaps do not re-index nudge or swing.
- Swing and nudge combine additively.
- Shifted onsets remain within their originating bar while event tails may cross it.

## Open implementation details

The following are intentionally left to implementation as long as the public behavior above is preserved:

- Exact schema shape for dynamic random masks.
- Internal random-threshold orientation.
- Exact location of the shared reversed-buffer cache.
- Exact silent-tail duration before a faded source is stopped and disconnected.
