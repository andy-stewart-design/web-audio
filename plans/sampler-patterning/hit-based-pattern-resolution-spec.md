# Hit-Based Event Pattern Resolution Specification

## Overview

Instrument rhythms determine when events occur. Once a rhythm has selected the active events in a bar, every event-addressed value pattern should advance once per surviving hit. Rests should not consume values.

The runtime currently mixes two indexing models:

- static note values under a mask advance by emitted-hit order;
- random note values, sampler variation, gain, detune, envelopes, effects, and sampler regions generally resolve from the original rhythmic grid `stepIndex`.

For example, a two-hit Euclidean rhythm over four grid positions produces hits at grid indices `0` and `2`. Static notes currently consume value indices `0` and `1`, while gain and sampler variation consume value indices `0` and `2`.

This work standardizes synthesizers and samplers on hit-based resolution for all event-addressed value lanes:

```txt
rhythm/mask decides which grid positions become hits
→ surviving hits receive consecutive hit indices
→ all event-addressed value patterns resolve by hit index
```

Grid positions continue to determine event timing. Only value resolution changes.

This specification is a prerequisite for the sampler-patterning work in `spec.md`. That specification must be updated to use hit-based identity resolution before its implementation plan is finalized.

## Goals

- Establish one deterministic indexing model for event-addressed values across synthesizers and samplers.
- Make rests invisible to value-pattern advancement.
- Preserve rhythmic offsets and durations from the authored or generated onset geometry.
- Preserve normal bar-cycle semantics and independent pattern wrapping.
- Make static and random value patterns follow the same indexing rule.
- Preserve polyphonic behavior: simultaneous voices belonging to one onset share one hit index.
- Give future sampler sample-name patterns the same resolution semantics as notes and variation.
- Keep behavior independent of whether an intended hit successfully produces audio.

## Non-goals

- Do not change which APIs create onset geometry.
- Do not change the output geometry of `.notes()`, `.euclid()`, `.xox()`, `.hex()`, `.sequence()`, `.fast()`, `.slow()`, `.stretch()`, `.reverse()`, sampler `.chop()`, or sampler `.fit()`.
- Do not change pattern bar syntax or pattern wrapping rules.
- Do not redesign `StaticSchema`, `RandomSchema`, or `NotesSchema`.
- Do not remove grid `stepIndex` metadata from serialized pattern geometry.
- Do not make continuous or bar-level systems hit-addressed. LFO phase, bus automation, routing, sends, and other non-event scheduling retain their existing models.
- Do not add patterned sample names or variation-derived sampler onsets in this PR.
- Do not change alternate sample-direction advancement or sample fallback behavior.

## Terminology

### Grid step

A position in onset geometry. A grid step carries timing metadata such as:

```ts
{
  offset: number;
  duration: number;
  stepIndex: number;
}
```

Its `stepIndex` identifies its position in the rhythmic grid. Grid steps may be removed or deactivated by static or random masks.

### Hit

An active onset that survives all rhythm and mask decisions and is eligible for event scheduling.

A hit exists before downstream playback succeeds. A sampler hit still counts if its sample entry or buffer is unavailable, its region is invalid, or playback is otherwise skipped after onset selection.

A random-mask miss is not a hit.

### Hit index

The zero-based ordinal of a surviving hit within its scheduled bar:

```txt
Grid:       0  1  2  3
Mask:       x  -  x  -
Hit index:  0     1
```

Hit indices restart at `0` for each bar. The existing `barIndex` continues to select and wrap pattern bars.

### Event-addressed value lane

Any pattern sampled in response to an instrument hit. This includes note values and parameters used to construct or schedule that event.

## Core semantic rule

> Rhythms decide when hits occur. Every event-addressed value pattern advances once per hit. Rests do not consume values.

For each scheduled bar:

1. Resolve the final onset geometry and masks using their grid semantics.
2. Enumerate surviving onset slots in scheduling order.
3. Assign consecutive hit indices beginning at `0`.
4. Resolve every event-addressed value lane using `barIndex` and `hitIndex`.
5. Use the onset geometry's offset and duration to schedule the event.

Conceptually:

```ts
resolve(valuePattern, barIndex, hitIndex);
```

The grid `stepIndex` is not used to select downstream event values.

## Scheduling order

Hits are enumerated in the stable order provided by the final onset geometry for the current bar. In normal generated schemas, this is chronological offset order.

Implementations must not renumber later hits based on runtime success or failure. Hit indices are assigned from intended onset geometry before sample lookup, region validation, voice creation, muting, or other downstream work.

## Pattern wrapping and bar semantics

Hit-based indexing does not change the existing distinction between steps within one bar and values across bars.

A one-bar two-step value pattern:

```ts
.gain([0.25, 1])
```

resolves successive hits in each bar as:

```txt
0.25, 1, 0.25, 1, ...
```

A two-bar one-step-per-bar pattern:

```ts
.gain(0.25, 1)
```

resolves every hit in the first selected pattern bar to `0.25` and every hit in the second selected pattern bar to `1`.

Value patterns continue to wrap independently by their own bar count and per-bar step count.

## Masks

### Static masks

Static masks determine the active grid positions before hit indices are assigned.

For example:

```ts
d.synth().notes([0, 2]).gain([0.25, 1]).euclid(2, 4).push();
```

produces:

```txt
Grid step:  0     2
Hit index:  0     1
Note:       0     2
Gain:       0.25  1
```

The events retain the offsets and durations of grid steps `0` and `2`.

### Random masks

A random mask must first resolve whether each candidate grid position is active. The mask itself necessarily uses its grid position during this onset-selection phase.

Only successful mask pulses receive hit indices. A miss does not consume values:

```txt
Candidate grid:  0  1  2  3
Resolved mask:   x  -  -  x
Hit index:       0        1
```

All downstream static and random value lanes resolve at hit indices `0` and `1`.

### Composed and transformed masks

When rhythm methods are composed or transformed, hit indices are assigned only after the final mask geometry is known. Intermediate active positions do not consume values.

Call order and existing rhythm-composition behavior remain unchanged.

## Notes and polyphony

Static notes already generally advance by active-hit order under masks. This behavior becomes the explicit cross-codebase rule.

Random notes must also resolve by hit index rather than grid `stepIndex`.

A chord is one onset slot with multiple voices. Every voice in the chord:

- shares the same `barIndex` and `hitIndex`;
- shares event-addressed gain, detune, envelope, and effect values selected for that hit;
- retains its own note value and voice scheduling.

The next onset after a chord advances the hit index by one, not by the number of voices in the chord.

## Synthesizer value resolution

The following synthesizer lanes become hit-based wherever they are event-addressed:

- static and random notes;
- detune parameter patterns;
- gain-envelope maximum, attack, decay, sustain, and release patterns;
- event-addressed effect parameters;
- values used to derive per-note MIDI output such as resolved gain/velocity.

For example:

```ts
d.synth().notes([0, 2]).detune([0, 100]).euclid(2, 4).push();
```

uses detune values `0` and `100`, not values at detune indices `0` and `2`.

## Sampler value resolution

The following existing sampler lanes become hit-based:

- notes;
- variation;
- detune;
- gain and gain-envelope parameters;
- effect parameters;
- static region `start`, `end`, and `duration` patterns;
- chop sequence values;
- any other value pattern resolved for an individual sample event.

Future patterned sample names will also resolve by hit index.

For example:

```ts
d.sample("bd").notes([0, 0]).var([0, 1]).euclid(2, 4).push();
```

uses variations `0` and `1` on the two hits.

After sample-name patterning is implemented:

```ts
d.sample().name(["bd", "piano"]).euclid(2, 4).push();
```

will use `bd` for hit `0` and `piano` for hit `1`, while scheduling them at grid positions `0` and `2`.

## Intended hits and failed playback

Value selection must not depend on whether audio is ultimately emitted.

The engine assigns the hit index before:

- resolving a sampler name or sample entry;
- checking buffer availability;
- applying out-of-range variation fallback;
- validating the resolved source window;
- creating an audio source node;
- applying mute or zero gain.

If hit `1` cannot produce audio, the next intended onset is still hit `2`. Missing or invalid playback must not shift later note, variation, region, gain, or effect values.

Sampler alternate direction retains its existing independent rule: it advances only after successful event emission. Hit indexing must not be coupled to alternate-direction state.

## Static and random pattern consistency

Given the same value-pattern geometry, static and random lanes must be addressed with the same `barIndex` and `hitIndex`.

Random resolvers retain their existing seed, algorithm, segment, range, quantization, chance, and value-map behavior. Only the index used to select the event's resolved random value changes from grid position to hit position.

A rhythm edit that adds or removes a rest may shift the random values assigned to later hits because it changes hit order. This is intentional and follows the rule that random values belong to hits rather than silent grid positions.

## Schema behavior

No public schema change is required.

`StaticSchemaValue.stepIndex` remains part of serialized geometry and continues to describe the originating pattern/grid position. It remains useful for masks, visualization, geometry transforms, and schema inspection.

The runtime must derive hit indices from the final active onset slots. It must not permanently reinterpret serialized `stepIndex` as hit index, because sparse masks still need their original grid metadata.

An internal scheduling context may distinguish the concepts explicitly:

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

This is conceptual rather than a required exported type. Downstream event-addressed resolution uses `hitIndex`; grid geometry and mask evaluation use `gridStepIndex`.

## Systems that remain non-hit-addressed

The following do not resolve once per instrument hit and therefore retain their existing behavior:

- rhythm and mask evaluation;
- event offsets and durations;
- LFO phase and continuous LFO output;
- bar-level bus updates;
- routing and send configuration;
- MIDI CC live input;
- global sampler modes such as loop, clip mode, and direction.

A parameter nested inside an event-created effect remains hit-addressed even though continuous modulators connected to that parameter remain time-based.

## Compatibility

This is an intentional behavior change for instruments that combine:

- sparse or probabilistic onset geometry; and
- multi-step event-addressed value patterns.

For a two-hit rhythm at grid positions `0` and `2`, affected lanes previously selected values `0` and `2`; they now select values `0` and `1`.

The most visible changes include:

- synth gain, detune, envelope, and effect patterns under masks;
- random notes under masks;
- sampler variation under masks;
- sampler region and chop-sequence patterns under masks;
- random event values whose selection previously followed sparse grid indices.

The following remain unchanged:

- event count;
- event offsets and durations;
- mask geometry;
- static note consumption by active hits;
- value resolution for ordinary dense patterns where hit and grid indices are identical;
- pattern bar selection and wrapping;
- continuous and bar-level systems listed above.

Documentation should call out the semantic change rather than present it as an internal refactor.

## Implementation requirements

- Synthesizer and sampler scheduling must use the same hit-indexing policy.
- Shared event-resolution code must receive an explicit hit index rather than implicitly treating geometry `stepIndex` as the value index.
- Hit indices must be assigned after final mask resolution and before downstream scheduling can fail.
- Hit indices must restart for each bar.
- Polyphonic voices from one onset must share an index.
- Static and random event-addressed schemas must receive the same index.
- Existing serialized grid `stepIndex` values must remain intact.
- The implementation must avoid instrument-specific exceptions for existing event-addressed lanes.
- Future event-addressed lanes should use hit index by default.

## Acceptance criteria

### Shared semantics

- A sparse static mask assigns consecutive hit indices to active positions.
- A random-mask miss does not consume a hit index.
- Hit indices restart at `0` for each scheduled bar.
- Multi-bar value patterns continue to select bars using `barIndex`.
- Per-bar value steps wrap using hit index.
- Event offsets and durations remain identical before and after the change.
- Multiple voices in one chord share all hit-addressed parameter values.
- A skipped or failed sampler event does not renumber later intended hits.

### Synthesizer

- Static notes under masks retain their existing hit-based order.
- Random notes under masks become hit-based.
- Gain patterns under masks resolve by hit index.
- Detune patterns under masks resolve by hit index.
- Gain-envelope component patterns under masks resolve by hit index.
- Event-addressed effect parameter patterns under masks resolve by hit index.
- MIDI note output reflects the same hit-resolved note and gain values as audio scheduling.

### Sampler

- Notes under masks retain hit-based order.
- Variation under masks resolves by hit index.
- Gain, detune, envelope, and effect patterns resolve by hit index.
- Static region patterns resolve by hit index.
- Chop sequence values resolve by hit index without changing chop-generated timing.
- Fit-generated timing remains unchanged while its event-addressed values use hit index.
- Alternate direction still advances only after successful emission.

### Regression boundaries

- Dense unmasked synth and sampler patterns retain their values and timing.
- Rhythm method composition and call-order behavior remain unchanged.
- Pattern schemas retain original grid `stepIndex` metadata.
- LFO, bus, routing, sends, loop, clip, and direction behavior remains unchanged except where an existing event-addressed nested parameter now uses hit index.

## Documentation requirements

Update the public pattern/rhythm documentation to explain:

- rhythms determine hit timing;
- rests do not consume event-addressed values;
- value patterns advance by active-hit order;
- bar syntax remains independent from hit indexing;
- chords count as one hit for parameter resolution;
- random-mask misses do not consume values.

Update the developer glossary to distinguish:

- grid step and grid `stepIndex`;
- hit and hit index;
- onset geometry;
- event-addressed value lanes.

The sampler-patterning specification must then replace its original-grid-index requirements for sample name and variation with hit-index requirements.

## Verification

Run the relevant package and repository checks:

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
pnpm check
pnpm lint
pnpm test
pnpm format
git diff --check
```

Regression tests should compare both scheduled geometry and resolved values. Tests that assert only event counts are insufficient for this semantic change.

## Final semantic summary

```txt
Rhythms and masks decide which grid positions become hits.
Surviving hits are numbered consecutively within each bar.
Every event-addressed value pattern resolves by that hit index.
Rests and random-mask misses do not consume values.
Timing remains attached to the original rhythmic grid.
```
