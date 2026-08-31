# Sampler Patterning Specification

## Overview

Sampler patterns currently have one primary event grid: notes. Other patterned sampler values, including variation, are resolved only when a note event occurs.

This means:

```ts
d.sample("bd").var([0, 1, 2, 3]).push();
```

currently emits one kick per bar using variation `0`, because the sampler's implicit note pattern contains only one hit.

Sampler identity patterns should be able to provide useful implicit event geometry when the user has not authored a stronger onset pattern. This work will ship in two PRs:

1. **Patterned variation as an implicit onset source.**
2. **Patternable sample names with precedence over variation.**

Both PRs build on the hit-based event resolution defined in [`hit-based-pattern-resolution-spec.md`](./hit-based-pattern-resolution-spec.md): onset authority determines event geometry, surviving onsets receive bar-local hit indices, and all event-addressed values resolve by hit index.

Synthesizer behavior does not change.

## Goals

- Make patterned sampler variation produce matching implicit triggers when no stronger onset pattern exists.
- Add patternable sample names through `.name()` and the `d.sample(...)` constructor.
- Preserve notes and explicit rhythm methods as the primary source of sampler onset geometry.
- Make precedence deterministic and independent of method call order.
- Keep identity values independent: note, sample name, and variation continue to resolve separately for each event.
- Preserve existing fit, chop, masking, pitch, region, direction, clipping, looping, routing, and effects behavior.
- Keep non-identity parameter patterns from creating events implicitly.

## Non-goals

- Do not change synth patterning semantics.
- Do not infer sampler events from every patterned method.
- Patterned `gain`, `detune`, `start`, `end`, `duration`, envelopes, and effects do not create onsets.
- Do not use a "longest pattern wins" rule.
- Do not make bank names patternable.
- Do not add random sample-name selection in these PRs. Sample-name patterns are static/cycling string patterns.
- Do not change variation fallback behavior for out-of-range variation indices.
- Do not redesign the general pattern language solely to support string values.

## Mental model

A sampler has one **onset authority** and several independently resolved value lanes.

The onset authority determines:

- how many candidate events occur;
- each event's offset and duration;
- each event's grid `stepIndex`;
- the bar cycle used for event geometry.

After final mask evaluation, surviving onsets receive consecutive hit indices within the bar. At each intended hit, the engine independently resolves by `(barIndex, hitIndex)`:

- note/pitch;
- sample name;
- sample variation;
- regions and chop sequence;
- gain, detune, effects, and other event-addressed parameters.

A lower-priority pattern may supply values without changing the event geometry selected by a higher-priority pattern. Grid `stepIndex` remains geometry metadata and is not used to select these values.

## Onset precedence

Sampler onset authority uses the following precedence:

```txt
explicit or sampler-generated onset geometry
> explicit sample-name pattern
> explicit variation pattern
> default one event per bar
```

### 1. Explicit or sampler-generated onset geometry

This category preserves the existing behavior of:

- `.notes()`;
- `.euclid()`;
- `.xox()`;
- `.hex()`;
- `.sequence()`;
- `.fast()`;
- `.slow()`;
- `.stretch()`;
- `.reverse()`;
- `.chop()` default/generated timing;
- `.fit()` default/generated timing.

These APIs remain authoritative over sample name and variation. Existing composition rules between notes, masks, chop, and fit remain unchanged unless this specification explicitly says otherwise.

Examples:

```ts
d.sample("bd").notes([0, 0, 0]).var([0, 1, 2, 3]).push();
// 3 events; variation resolves at hit indices 0, 1, and 2.

d.sample("bd").var([0, 1, 2, 3]).euclid(2, 4).push();
// 2 events at the Euclidean positions.
// Variation uses hit indices 0 and 1, regardless of grid gaps.

d.sample("break").chop(8).var([0, 1, 2, 3]).push();
// Existing chop-generated onset behavior wins.

d.sample("loop").fit(2).var([0, 1]).push();
// Existing fit-generated timing wins; variation must not add loop retriggers.
```

Calling an explicit rhythm method must count as explicit onset intent even when its immediate effect on the default one-step note pattern is trivial. Precedence must not depend on whether Fluid happens to detect a changed step count.

### 2. Explicit sample-name pattern

An explicit `.name(...)` call supplies onset geometry when no stronger onset source exists.

A string-array constructor is equivalent explicit name intent:

```ts
d.sample(["bd", "sd", "bd", "sd"]).push();
```

A required scalar identity passed through the existing constructor is not, by itself, explicit name-pattern onset intent:

```ts
d.sample("bd").var([0, 1, 2, 3]).push();
// Variation remains eligible to produce 4 events.
```

An explicit scalar `.name()` call does establish name precedence:

```ts
d.sample("bd").name("sd").var([0, 1, 2, 3]).push();
// 1 event because the explicit name pattern wins.
```

This distinction lets the existing required sample identity coexist with variation-derived onset geometry while keeping `.name()` precedence explicit and predictable.

### 3. Explicit variation pattern

An explicit `.variation(...)` or `.var(...)` call supplies onset geometry when there is no stronger onset source.

```ts
d.sample("bd").var([0, 1, 2, 3]).push();
// 4 evenly spaced events using variations 0, 1, 2, and 3.
```

Numeric pattern syntax keeps its existing bar semantics:

```ts
d.sample("bd").var([0, 1, 2, 3]).push();
// One bar containing 4 steps.

d.sample("bd").var(0, 1, 2, 3).push();
// Four bars containing 1 step each.
```

### 4. Default onset

With no explicit onset, name pattern, or variation pattern, sampler behavior remains one event per bar:

```ts
d.sample("bd").push();
```

## Call-order behavior

Precedence is semantic, not based on the last method called.

These are equivalent:

```ts
d.sample("bd").notes([0, 0]).var([0, 1, 2, 3]).push();
d.sample("bd").var([0, 1, 2, 3]).notes([0, 0]).push();
```

These are also equivalent:

```ts
d.sample("bd").name(["bd", "sd"]).var([0, 1, 2, 3]).push();
d.sample("bd").var([0, 1, 2, 3]).name(["bd", "sd"]).push();
```

Both name examples emit two events because explicit name geometry takes precedence over variation geometry.

## Conflicting identity pattern lengths

Name takes precedence over variation; pattern lengths are never merged and the longest pattern does not win.

```ts
d.sample().name(["bd", "sd"]).var([0, 1, 2, 3]).push();
```

This emits two events. The name onsets receive hit indices `0` and `1`, producing variation values `0` and `1`.

When a lower-priority value pattern is shorter than the onset pattern, normal parameter wrapping applies:

```ts
d.sample().name(["bd", "sd", "bd", "sd"]).var([0, 1]).push();
// Names:      bd, sd, bd, sd
// Variations:  0,  1,  0,  1
```

Masks retain their original grid geometry, but identity patterns advance only for surviving hits. Rest positions and random-mask misses do not consume sample names or variation values.

## Patterns that do not create onsets

Only onset APIs and eligible sampler identity patterns participate in onset precedence.

For example:

```ts
d.sample("bd").gain([0.5, 1]).push();
```

still emits one event per bar. The gain pattern is sampled at that event.

The same rule applies to:

- `detune`;
- `start`;
- `end`;
- `duration`;
- gain-envelope parameters;
- effect parameters;
- sampler direction;
- clip and loop modes;
- routing and sends.

This is an intentionally curated hierarchy, not a general rule that any multi-step parameter creates events.

---

# PR 1: Variation-derived implicit onsets

## Scope

PR 1 changes only variation-derived default event generation. It does not add patterned sample names and should not require an audio-engine or public schema redesign.

## Public behavior

The following becomes equivalent in event geometry:

```ts
d.sample("bd").var([0, 1, 2, 3]).push();

d.sample("bd").notes([0, 0, 0, 0]).var([0, 1, 2, 3]).push();
```

The equivalence is limited to simple static geometry. Internally, Fluid must derive notes from the variation schema rather than manufacturing an array only from a counted length.

## Fluid implementation requirements

`Sampler` must track whether variation was explicitly authored. The constructor's internal default variation `0` must not be treated as explicit variation intent.

`Sampler` must also track explicit onset intent from the note/rhythm methods listed in the precedence section. Existing `_explicitNotes` tracking alone is not sufficient because rhythm methods can author onset geometry without calling `.notes()`.

During schema generation:

1. Preserve existing explicit notes, masks, chop, and fit behavior.
2. If there is no stronger onset authority and variation was explicitly authored, derive a constant-note schema from the variation pattern's geometry.
3. Otherwise preserve the current default one-note schema.

The generated note value must use the sampler's lowest available source key:

```ts
sourceKeys[0] ?? 0;
```

This preserves natural playback for pitched multisamples as well as unpitched samples.

### Static variation

For a static variation schema, copy:

- cycle/bar structure;
- offsets;
- durations;
- step indices.

Replace only each step's value with the generated note value.

### Random variation

For a random variation schema, derive note geometry from `variation.grid` and replace each grid value with the generated note value.

This means:

```ts
d.sample("bd").var(d.rand().int().range(0, 4).steps(8)).push();
```

emits eight events when no stronger onset source exists.

A random variation with its default one-step grid still emits one event per bar.

### Masks

Explicit masks continue to determine active positions. Variation-derived note generation must not remove or rewrite the existing note mask.

Variation resolves using the final event's bar-local hit index, so gaps do not consume or skip variation values.

## PR 1 schema and engine behavior

`SamplerSchema` does not change in PR 1. It continues to contain:

```ts
sample: string;
variation: ParameterSchema;
notes: NotesSchema;
sourceKeys: number[];
```

The audio engine continues to schedule note events and resolves variation from each note's `barIndex` and runtime-derived `hitIndex`. The serialized grid `stepIndex` remains timing metadata.

Static variation preloading remains unchanged.

## PR 1 compatibility

The intentional behavior change is limited to samplers with:

- an explicitly authored variation pattern; and
- no stronger onset authority.

Existing code with explicit notes, rhythm masks, chop, or fit must retain its event count and timing.

Synthesizers are unaffected.

## PR 1 acceptance criteria

- `.var([0, 1, 2, 3])` emits four evenly spaced sampler events per bar when no stronger onset source exists.
- `.var(0, 1, 2, 3)` emits one event per bar over a four-bar variation cycle.
- `.notes([0, 0, 0]).var([0, 1, 2, 3])` emits three events per bar.
- Explicit note/variation behavior is independent of call order.
- `.euclid(2, 4).var([0, 1, 2, 3])` preserves Euclidean onset geometry and selects variations `0` then `1` by hit.
- `.xox()`, `.hex()`, `.sequence()`, note transforms, chop, and fit retain precedence.
- `fit()` does not gain additional retriggers from variation.
- Patterned gain, detune, region, duration, envelopes, and effects do not create events.
- Static multi-bar variation geometry is preserved.
- Random variation uses its random grid as fallback onset geometry.
- Pitched multisamples use the lowest source key for generated notes.
- Existing variation preloading still prepares every statically known variation.
- No public schema changes are required.

---

# PR 2: Patternable sample names

## Public API

### `.name()`

Add a sampler method accepting static/cycling string patterns:

```ts
name(...input: SampleNameInput): this
```

Conceptual input type:

```ts
type SampleNameInput = (string | string[])[];
```

It follows the same bar syntax as numeric parameter patterns:

```ts
d.sample().name(["bd", "sd", "bd", "sd"]).push();
// One bar with 4 events.

d.sample().name("bd", "sd").push();
// Two bars with 1 event per bar.
```

`.name()` replaces the sampler's previous name selection and marks sample name as explicit onset intent.

### Constructor forms

Preserve existing forms:

```ts
d.sample("bd");
d.sample("bd", 1);
d.sample("bd:1");
```

Add:

```ts
d.sample();
d.sample(["bd", "sd", "bd", "sd"]);
```

A string-array constructor is equivalent to an explicit `.name()` pattern:

```ts
d.sample(["bd", "sd"]);
d.sample().name(["bd", "sd"]);
```

The scalar `"name:variation"` shorthand remains supported only by the scalar string constructor. Names passed to `.name()` or an array constructor are literal sample names; colon variation parsing does not apply to them. Patterned variation should be expressed with `.var()`.

Calling `d.sample()` without eventually supplying a name is invalid and must throw during schema generation with a clear sampler-specific error.

## Name precedence

An explicit name pattern supplies onset geometry when no stronger onset source exists and always takes precedence over variation geometry.

```ts
d.sample().name(["bd", "sd"]).var([0, 1, 2, 3]).push();
// 2 events.
```

Explicit notes and rhythm still win:

```ts
d.sample().name(["bd", "sd", "hh", "cp"]).notes([0, 0, 0]).push();
// 3 events; names resolve as bd, sd, hh.

d.sample().name(["bd", "piano"]).euclid(2, 4).push();
// Hits occur at grid positions 0 and 2; names resolve as bd then piano.

d.sample("bd").var([0, 1]).euclid(2, 4).push();
// Hits occur at grid positions 0 and 2; variations resolve as 0 then 1.
```

## Sample-name schema

PR 2 changes `SamplerSchema.sample` from one fixed string to a static string-pattern schema.

Recommended exported schema:

```ts
interface SampleNameSchemaValue {
  value: string;
  offset: number;
  duration: number;
  stepIndex: number;
}

interface SampleNameSchema {
  type: "static";
  cycle: SampleNameSchemaValue[][];
}
```

`SampleNameSchema` is intentionally static/cycling in this PR. It does not accept `RandomSchema`.

The sampler schema becomes conceptually:

```ts
interface SamplerSchema extends InstrumentSchema {
  type: "sampler";
  bank: string;
  sample: SampleNameSchema;
  variation: ParameterSchema;
  notes: NotesSchema;
  fit: FitSchema | null;
  region: RegionSchema | null;
  sourceKeys: Record<string, number[]>;
  loop: boolean;
  clipMode: ClipMode;
  direction: SampleDirection;
}
```

For a fixed sample, Fluid emits a one-step sample-name pattern:

```ts
{
  type: "static",
  cycle: [[{
    value: "bd",
    offset: 0,
    duration: 1,
    stepIndex: 0,
  }]],
}
```

A shared internal generic static-pattern representation is acceptable, but the exported schema must retain string type safety. Do not encode sample names through `as any` or an untyped numeric value map.

## Source keys

Source keys vary by sample name, so PR 2 replaces the fixed array with a per-name record:

```ts
sourceKeys: Record<string, number[]>;
```

Example:

```ts
{
  bd: [0],
  piano: [45, 57, 69],
}
```

Fluid must collect every distinct name referenced by the static sample-name pattern and resolve source keys for each name from the selected bank.

For a missing bank or sample name, preserve the existing resilient behavior:

- warn during Fluid schema generation;
- use `[0]` as that name's fallback source-key list;
- allow the engine to warn and skip if no sample entry exists at playback time.

Duplicate names in a pattern are valid and must not cause duplicate source-key work or duplicate fetches.

## Fluid name-derived notes

When explicit name is the onset authority, Fluid derives constant-note geometry from the name schema in the same way PR 1 derives it from variation geometry.

For each sample-name step:

- preserve bar structure, offset, duration, and `stepIndex`;
- select the generated note value from that step's resolved name:

```ts
sourceKeys[name]?.[0] ?? 0;
```

This per-step rule is required because one name pattern may mix unpitched and pitched sample definitions.

When a stronger onset pattern exists, no name-derived notes are generated. The engine resolves the name independently at each explicit event step.

## Engine resolution

For every intended hit, the engine resolves in this order:

```txt
resolve sample name at barIndex + hitIndex
→ get source keys for that name
→ resolve note and choose nearest source key
→ resolve variation
→ resolve the sample entry
→ apply region/chop
→ compute pitch and fit rates
→ schedule playback
```

Sample-name and variation patterns wrap independently using their own bar counts and per-bar value lengths.

The engine resolves sample name from the event's bar-local `hitIndex`. Mask misses and rests do not consume sample names or variation values.

Alternate direction remains global to the sampler instance and advances only when an event is successfully emitted, even when successive events use different sample names.

## Buffer loading and storage

The engine's sampler buffer storage must no longer be bound to one fixed sample name.

Buffer addressing must include:

```txt
bank + sample name + source key + variation
```

URL-level cache deduplication must remain intact so multiple names or sprite entries sharing one source file fetch and decode it only once.

Prepare-time preloading must cover the conservative Cartesian product of:

- every statically referenced sample name;
- every source key for that name;
- every statically knowable variation index.

Out-of-range variation selection continues to fall back to variation `0` for the resolved name and source key.

A fallback buffer from an existing runtime sampler must never be reused for a different resolved sample name merely because variation and source key match.

Reverse-buffer preparation must include all preloaded name/source-key/variation entries when direction can require reverse playback.

## Regions, chop, fit, and playback modes

Regions and chop operate inside the entry selected after resolving name, source key, and variation.

Patterned names must compose with:

- file samples;
- sprite entries;
- pitched multisamples;
- pitched sprites;
- static regions;
- duration regions;
- chop sequences;
- fit playback rate;
- clipped and one-shot playback;
- loop mode;
- forward, reverse, and alternate direction.

`fit()` remains a stronger onset authority. A name pattern may select a different source on each fit-generated event, but it must not change fit's generated event count.

Fit rate is calculated from the source window selected for the current event. Patterned names therefore may produce different playback rates when their source durations differ.

## Validation

Fluid must reject:

- `.name()` with no values;
- empty name-pattern bars;
- empty sample-name strings;
- `d.sample()` with no eventual name;
- malformed nested inputs outside the documented static/cycling shape.

Names are lookup keys. Fluid must not silently trim or normalize them. Validation may reject whitespace-only names, but otherwise the authored string must be preserved exactly.

Missing names in a valid bank warn rather than throw, matching current missing-sample behavior.

## PR 2 compatibility and migration

Existing Fluid source remains valid:

```ts
d.sample("bd");
d.sample("bd", 1);
d.sample("bd:1");
```

The serialized `SamplerSchema` changes and all schema consumers must migrate atomically within PR 2:

- `@web-audio/schema`;
- `@web-audio/fluid`;
- `@web-audio/audio-engine`;
- visualizers, demos, fixtures, and tests that inspect sampler schema.

PR 2 should not retain a permanent `string | SampleNameSchema` union solely for internal migration convenience. The final schema should represent fixed and patterned names through one canonical shape.

## PR 2 acceptance criteria

### Fluid and schema

- `.name()` accepts one-bar and multi-bar static string patterns.
- `d.sample()` is valid when followed by `.name()`.
- `d.sample(["bd", "sd"])` is equivalent to `d.sample().name(["bd", "sd"])`.
- Existing scalar constructor and variation shorthand forms remain valid.
- A fixed scalar constructor serializes to a one-step `SampleNameSchema`.
- `sourceKeys` is emitted per distinct referenced sample name.
- Explicit name patterns take precedence over variation patterns.
- Explicit notes/rhythm, chop, and fit take precedence over name patterns.
- Precedence is independent of call order.
- Missing or empty name validation produces clear feedback.

### Engine

- A four-step name pattern schedules the expected four sample names.
- A two-step name pattern with a four-step variation pattern schedules two events.
- A four-step name pattern with a two-step variation pattern wraps variations as `0, 1, 0, 1`.
- Explicit three-step notes with a four-step name pattern schedule three events and resolve the first three names.
- Masks preserve original onset timing while names and variations advance by surviving hit.
- Multi-bar name and variation cycles wrap independently.
- Per-name source-key selection works for mixed unpitched and pitched names.
- Out-of-range variation falls back to variation `0` for the currently resolved name.
- Static preloading covers all referenced names, source keys, and known variations.
- Shared sprite/file URLs fetch and decode once.
- Forward, reverse, and alternate direction work across changing names.
- Regions, chop, fit, loop, clipped mode, and one-shot mode use the currently resolved sample entry.
- Missing runtime entries warn and skip without shifting later hit-resolved values or corrupting alternate-direction state.

---

# Documentation requirements

After each PR, update the sampler API documentation and examples.

PR 1 documentation must explain:

- variation can provide implicit sampler onset geometry;
- explicit notes/rhythm, chop, and fit retain precedence;
- variation syntax distinguishes steps within one bar from values across bars;
- non-identity parameter patterns do not create events.

PR 2 documentation must explain:

- `.name()` and array constructor syntax;
- sample-name bar/step syntax;
- name-over-variation precedence;
- explicit onset geometry over name precedence;
- independent wrapping of name and variation patterns;
- fixed bank scope and per-name source-key behavior;
- random sample-name selection is not yet supported.

The glossary's sample-name and sample-variation entries should link identity patterns back to the onset-authority model.

# Verification

Each PR must run the relevant repository checks after implementation:

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
```

Also run:

```sh
git diff --check
```

PR 1 should prioritize regression coverage proving existing explicit onset behavior is unchanged. PR 2 should include end-to-end schema and engine tests rather than testing name-pattern serialization and scheduling only in isolation.

# Final semantic summary

```txt
Explicit notes/rhythm, chop, or fit decide when sampler events occur.
Otherwise, an explicit sample-name pattern decides.
Otherwise, an explicit variation pattern decides.
Otherwise, the sampler emits one event per bar.

Each surviving onset receives a consecutive hit index within its bar.
At every hit, note, name, variation, and other event-addressed parameters
resolve independently using the event's bar index and hit index.
Rests and random-mask misses consume no values; grid timing remains unchanged.
```
