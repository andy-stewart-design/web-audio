# Sampler PR4 Region + Chop PRD

## Overview

PR4 adds source-region controls and sample chopping to the sampler. Users can trim playback with `.start()` / `.end()`, divide selected source material into slices with `.chop()`, and combine those controls with existing sampler features: multisampling, sprite entries, variations, random parameters, pitch notes, and `fit()`.

This PR also cleans up sampler timing semantics by making `fit` independent from `notes`. Playback remains note-triggered; `fit` becomes a playback-rate modifier that composes with pitch, region, and chop.

## Goals

- Add `.start()` and `.end()` to select normalized source regions.
- Add `.chop()` to split selected source material into equal slices and sequence them.
- Make region/chop controls work for files, sprites, multisamples, pitched sprites, and variations.
- Make `fit()` composable with notes and chop by moving it to an independent schema field.
- Preserve the PR3 mental model where `notes`, `variation`, and source-key selection remain independent.
- Preserve existing `clipMode` semantics: selected source material may be clipped to note duration or allowed to play out.

## Non-goals

- Reverse playback.
- Time-stretching independent of pitch. `fit()` still works by changing playback rate.
- Dynamic chop window recomputation from cycling/random `.start()` / `.end()` values.
- Per-slice envelopes or per-slice effects.

## User-facing API

### `.start()` / `.end()`

```ts
d.sample("loop").start(0.25).end(0.75).push();
```

`.start()` and `.end()` accept the same parameter-style inputs as other sampler parameters:

```ts
d.sample("loop").start(0.25);
d.sample("loop").start([0, 0.25, 0.5]);
d.sample("loop").start(d.rand().range(0, 0.5));
```

Standalone `.start()` / `.end()` may be static, cycling, or random. In schema, both are represented as `ParameterSchema`s inside `region.start` and `region.end`. The engine resolves those parameters per note trigger using the current `barIndex` and `stepIndex`.

### `.chop()`

```ts
d.sample("break").chop(8).push();
d.sample("break").chop(8, [0, 2, 1, 3]).push();
d.sample("break").chop(8, d.rand().int().range(0, 7)).push();
```

`.chop(sliceCount, sequence?)` divides the selected source window into `sliceCount` equal slices. Slices are stored in natural order. The `sequence` parameter selects slice indices at runtime.

If no sequence is provided, `.chop(8)` defaults to `[0, 1, 2, 3, 4, 5, 6, 7]`.

`sliceCount` must be a positive integer; invalid values throw in Fluid.

### `.fit()` composition

`fit()` becomes independent from notes:

```ts
d.sample("break").fit(2).push();
d.sample("break").fit(2).chop(8).push();
d.sample("break").fit(2).chop(8).notes([0, 12]).push();
```

`fit()` computes a timing playback-rate modifier. Notes still represent pitch intent.

## Core semantics

### Region values are relative to the resolved sample entry

Sampler playback first resolves the selected sample entry:

```txt
note → nearest sourceKey → variation → file/sprite entry
```

Then region/chop is applied within that resolved entry.

For a file entry, the base region is `[0, 1]` of the decoded buffer.

For a sprite entry:

```ts
{ type: "sprite", src: "kit.wav", start: 0.25, end: 0.5 }
```

`.start(0.5).end(1)` means the second half of that sprite region, not the second half of the full sprite file.

`ChopSliceSchema.start` and `ChopSliceSchema.end` use the same coordinate space: they are normalized positions within the selected source window. They are not decoded-buffer-normalized positions and they are not seconds. The engine maps them into buffer offsets by scaling them against the resolved entry window for each trigger. This is especially important for pitched sprites and multisamples, where each trigger may resolve to a different entry window.

### Scheduling order

Runtime scheduling order:

```txt
resolve note
→ choose nearest sourceKey
→ resolve variation
→ resolve sample entry
→ derive entry base window
→ apply static region or chop slice
→ compute pitchRate
→ compute fitRate if present
→ schedule AudioBufferSourceNode
```

### Playback-rate composition

```ts
playbackRate = pitchRate * fitRate;
```

Where:

```ts
pitchRate = 2 ** ((targetNote - sourceKey) / 12);
fitRate = selectedSourceDuration / (fit.bars * barDuration);
```

If no `fit` is present, `fitRate` is `1`.

If pitch notes transpose away from the selected source key, exact fit duration changes because pitch also changes playback speed. This is intentional.

When `fit` is combined with `chop`, `fitRate` is computed from the full selected source window before slicing, not from the individual slice duration. Each slice uses the same global `fitRate`:

```ts
fitRate = fullSelectedWindowDuration / (fit.bars * barDuration);
slicePlaybackDuration = sliceSourceDuration / (fitRate * pitchRate);
```

Explicit `.notes()` always controls trigger timing. If explicit notes do not span `fit.bars`, that is allowed; `fit` remains a rate modifier and the user is responsible for rhythmic alignment. This can intentionally create gaps, overlaps, or pitch-dependent duration changes.

### Clip mode

Region/chop defines the selected source material duration. Existing clip behavior still applies:

- `clipMode: "clipped"`: play `min(noteDuration, selectedSourceDuration / playbackRate)`
- `clipMode: "one-shot"`: play full selected source duration adjusted by playback rate

The clipped-mode `min(...)` rule applies uniformly to all selected source windows: full files, sprites, static regions, and chop slices. This intentionally moves release/end-envelope timing to the selected source end when that source window is shorter than the note duration, avoiding silent tails before release.

In one-shot mode, generated note durations still determine trigger spacing, but each trigger may play its full selected source duration even if that overlaps or extends beyond the generated note duration.

## Default note generation

Playback remains note-triggered. Fluid may generate helpful default notes only when the user has not explicitly called `.notes()`.

Precedence:

```txt
explicit notes > chop default notes > fit default notes > normal default notes
```

Rules:

- `.fit(2).push()` emits one default note spanning 2 bars.
- `.chop(8).push()` emits 8 default notes over 1 bar.
- `.fit(2).chop(8).push()` emits 8 default notes over 2 bars.
- `.fit(2).chop(8).notes(...)` uses explicit user notes; generated defaults are ignored.

For chop default notes:

- If a static/cycling sequence has an explicit step count, use that count.
- If sequence is omitted, use `sliceCount`.
- If sequence is random with explicit `.steps(n)`, use `n`.
- If sequence is random without explicit steps, use `sliceCount`.

Examples:

```ts
.chop(8); // 8 default notes
.chop(8, [0, 2, 1, 3]); // 4 default notes
.chop(8, d.rand().int().range(0, 7)); // 8 default notes
.chop(8, d.rand().int().range(0, 7).steps(4)); // 4 default notes
```

Standalone `.start()` / `.end()` do not affect default note generation.

### Generated note schema shape

Fluid synthesizes default notes in `Sampler.getSchema()` or equivalent schema-building code, not in the engine. The sampler must track whether `.notes()` was explicitly called, for example with an internal `_explicitNotes` flag. Explicit notes always win.

Generated fit/chop notes may span multiple bars. They should be encoded as a multi-bar `StaticSchema.cycle` so they do not retrigger incorrectly on intermediate bars.

Generated default fit/chop note values should use the lowest available `sourceKey` for the sampler when source keys are known. For unpitched samples this remains `0`; for pitched samples like `[45, 57, 69]`, the generated default note value is `45`. This prevents `.fit(2)` on a pitched multisample from defaulting to target note `0` and producing an extreme pitch/rate shift. Explicit `.notes()` always overrides this default.

For `.fit(2)` with no explicit notes and `sourceKeys: [0]`:

```ts
{
  type: "static",
  polyphonic: false,
  cycle: [
    [{ value: 0, offset: 0, duration: 2, stepIndex: 0 }],
    [],
  ],
}
```

For `.fit(2).chop(8)` with no explicit notes, Fluid emits a 2-bar cycle with 8 evenly distributed triggers across the 2-bar span. A valid shape is 4 notes in bar 0 and 4 notes in bar 1, each with `duration: 0.25` in its local bar. Equivalent multi-bar layouts are acceptable as long as trigger timing and duration are identical.

For `.chop(8, d.rand().int().range(0, 7))`, Fluid must make the random sequence resolve over 8 steps unless the user explicitly supplied a step count. Conceptually, Fluid injects the default step count into the random sequence mask. For `.steps(4)`, the explicit 4-step mask is preserved.

## Validation and warnings

### `.start()` / `.end()`

Fluid validation:

- Static/cycling values must be finite numbers in `[0, 1]`.
- If both start and end are single static numbers, require `start < end`.
- Random values are allowed.
- If a random range is obviously outside `[0, 1]`, warn rather than throw.

Engine behavior:

- Clamp resolved start/end to `[0, 1]` defensively.
- If resolved `end <= start`, skip the note and warn.
- Do not swap start/end.

### `.start()` / `.end()` with `.chop()`

When combined with `.chop()`, start/end must be single static numeric values because Fluid precomputes chop slices.

Valid:

```ts
d.sample("loop").start(0.25).end(0.75).chop(4);
```

Invalid:

```ts
d.sample("loop").start([0, 0.5]).chop(4);
d.sample("loop").start(d.rand().range(0, 0.5)).chop(4);
```

For chop composition, Fluid must require:

```txt
0 <= start < end <= 1
```

Validation should happen during Fluid schema generation so all chaining orders are caught, including `.chop(4).start([0, 0.5])`. Fluid may also throw earlier from `.chop()` when it can detect invalid existing start/end state. Dynamic start/end inputs are invalid with chop even if they happen to contain one repeated value, because Fluid needs a scalar static window for deterministic slice precomputation.

### Chop indices

Out-of-range chop sequence indices are allowed but should produce user feedback when detectable.

Fluid:

- Warn when statically authored sequence values, including negative values, are outside `[0, sliceCount - 1]`.
- Preserve authored values in the emitted schema.

Engine:

- Wrap resolved sequence values modulo `sliceCount`.

Examples for `sliceCount = 7`:

```txt
-1 → 6
7  → 0
8  → 1
```

## Schema changes

All new schema types are added to and exported from `@web-audio/schema`.

### Region schemas

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

### Sampler schema

Current:

```ts
notes: ParameterSchema | FitSchema;
```

New:

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

This is a breaking schema cleanup. `.notes()` no longer clears `.fit()`, and `fit` no longer replaces `notes`.

This establishes the final sampler intent model:

```txt
notes     = pitch intent
variation = sample variation intent
fit       = timing/stretch intent
region    = source-window/chop intent
```

## Acceptance criteria

### Schema

- `StaticRegionSchema`, `ChopSliceSchema`, `ChopRegionSchema`, and `RegionSchema` are exported.
- `SamplerSchema.notes` is always `ParameterSchema`.
- `SamplerSchema.fit` is `FitSchema | null`.
- `SamplerSchema.region` is `RegionSchema | null`.

### Fluid

- `.start()` and `.end()` emit `region: { type: "static", start, end }`.
- `.start()` defaults missing end to `1`.
- `.end()` defaults missing start to `0`.
- `.chop()` validates `sliceCount` as a positive integer.
- `.chop()` emits natural-order slices and a sequence parameter.
- `.chop(8)` defaults sequence to `[0..7]`.
- `.start().end().chop()` precomputes slices inside the static window.
- `.start()` / `.end()` dynamic inputs are rejected when composed with `.chop()`.
- `fit` no longer replaces `notes`.
- `.fit(2)` with no explicit notes emits a multi-bar default note schema spanning 2 bars without retriggering on bar 1.
- `.chop(8)` with no explicit notes emits default notes over 1 bar.
- `.fit(2).chop(8)` with no explicit notes emits default notes over 2 bars.
- Explicit `.notes()` overrides generated fit/chop defaults.
- `.notes()` no longer clears `fit`.
- Random chop sequences without explicit `.steps()` are expanded to the default chop note count.
- Old `fit()` source-key restriction is removed.

### Engine

- Engine no longer branches on `notes.type === "fit"`; `notes` is always a `ParameterSchema`.
- All sampler playback is note-triggered, and `fit` is applied during playback-rate calculation.
- Static regions schedule with correct offset and selected duration.
- Static regions compose with sprite entries by applying region values within the sprite window.
- Chop slices schedule correct source windows.
- Chop sequence values are wrapped modulo slice count.
- Region/chop duration respects `clipMode`.
- `fitRate` composes with `pitchRate`.
- `fit` applies to the selected source window.
- `fit + chop` computes `fitRate` from the full selected source window, then schedules note-triggered slices using that global fit rate.
- Pitched multisamples and pitched sprites work with start/end/chop/fit.

## Manual verification scenarios

- `d.sample("loop").start(0.5).clip(false).push()` plays the second half of the loop.
- `d.sample("loop").start(0.25).end(0.75).fit(2).push()` stretches the middle half over 2 bars.
- `d.sample("break").chop(4, [0, 2, 1, 3]).push()` rearranges slices.
- `d.sample("break").fit(2).chop(8).push()` plays 8 slices across 2 bars.
- `d.sample("break").fit(2).chop(8, d.rand().int().range(0, 7)).push()` randomizes slices.
- `d.sample("break").fit(2).chop(8).notes([0, 12]).push()` pitches triggered slices while preserving fit-rate composition.
- Sprite kit samples can be trimmed and chopped relative to their sprite regions.
- Pitched sprite samples can be chopped and still select nearest source keys correctly.
