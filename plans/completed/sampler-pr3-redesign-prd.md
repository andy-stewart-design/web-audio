# Sampler PR3 Redesign PRD

## Context

The original PR3 plan attempted to add multisampling and audio sprites by widening `BankSchema.samples` to accept several authoring shapes directly. During design review, we found that this would push too much interpretation into the audio engine and left audio sprites underspecified because sprite regions had no source file URL.

This PRD supersedes the original PR3 shape in `plans/sampler-plan.md` and captures the revised direction.

## Goals

- Support simple one-shot samples with no extra user ceremony.
- Support named custom banks and flat `user` banks as already introduced in PR2.
- Support multisampled pitched instruments, e.g. piano samples at A2/A3 with variations.
- Support audio sprite kits, e.g. OP-1-style drum kits where many hits live inside one shared audio file.
- Keep the public `loadSamples()` API ergonomic.
- Normalize flexible user input into a homogeneous schema for engine consumption.
- Keep the engine as dumb as practical: fluid handles authoring normalization and musical parsing; the engine only performs bounded sampler runtime work needed for scheduling and randomness.

## Non-goals

- Do not add bare string sample shorthand yet. Keep simple samples as `string[]` to avoid interface noise.
- Do not change the established sampler note mental model: `.notes(n)` is relative to `.root(...)`, not absolute MIDI when a root is set.
- Do not require users to define normalized schema manually.

## User-facing authoring shapes

### Flat simple samples

```ts
d.loadSamples({
  bd: ["bd.wav"],
});
```

Registers into the reserved `"user"` bank.

### Named simple bank

```ts
d.loadSamples({
  name: "drums",
  samples: {
    bd: ["bd.wav"],
  },
});
```

### Named multisample bank

```ts
d.loadSamples({
  name: "acoustic",
  samples: {
    piano: {
      a2: ["a2-v1.wav", "a2-v2.wav"],
      a3: ["a3-v1.wav", "a3-v2.wav"],
    },
  },
});
```

Pitch keys such as `a2` and `a3` are authoring conveniences. Fluid resolves them to normalized numeric keys. Multisample leaves must be `string[]`; bare string leaves like `a2: "file.wav"` are intentionally invalid.

### Sprite bank

Sprite banks lift the shared source file to a top-level `sprite` field. Sample leaves are arrays of normalized `[start, end]` regions from `0` to `1`. This mirrors file samples: file leaves are arrays of URL variations, and sprite leaves are arrays of region variations.

```ts
d.loadSamples({
  name: "op1",
  sprite: "kit.wav",
  samples: {
    bd: [[0.0, 0.08]],
    sd: [[0.1, 0.18]],
    ch: [[0.2, 0.24]],
    oh: [[0.25, 0.4]],
  },
});
```

Sprite regions can have variations by adding more regions to the array:

```ts
d.loadSamples({
  name: "op1",
  sprite: "kit.wav",
  samples: {
    bd: [
      [0.0, 0.08],
      [0.42, 0.5],
    ],
    sd: [[0.1, 0.18]],
    ch: [[0.2, 0.24]],
    oh: [[0.25, 0.4]],
  },
});
```

Then existing sampler and variation syntax works naturally:

```ts
d.sample("bd", 0).bank("op1").push();
d.sample("bd", 1).bank("op1").push();
d.sample("bd").bank("op1").variation([0, 1]).push();
```

### Pitched sprite bank

The same sprite format can represent pitched multisampled instruments. In that case, the sample contains pitch keys whose leaves are arrays of sprite regions.

```ts
d.loadSamples({
  name: "acoustic",
  sprite: "piano-sprite.wav",
  samples: {
    piano: {
      a2: [[0.0, 0.16]],
      a3: [[0.2, 0.36]],
      a4: [[0.4, 0.56]],
    },
  },
});
```

With variations:

```ts
d.loadSamples({
  name: "acoustic",
  sprite: "piano-sprite.wav",
  samples: {
    piano: {
      a2: [
        [0.0, 0.16],
        [0.17, 0.32],
      ],
      a3: [[0.33, 0.49]],
    },
  },
});
```

## Normalized bank schema

Fluid should normalize all banks before emitting `DromeSchema`.

```ts
interface BankSchema {
  samples: Record<string, NormalizedSampleSchema>;
}

type NormalizedSampleSchema = Record<string, SampleVariationSchema[]>;
// inner key is normalized source/root pitch, e.g. "0", "45", "57"

type SampleVariationSchema =
  | FileSampleVariationSchema
  | SpriteSampleVariationSchema;

interface FileSampleVariationSchema {
  type: "file";
  src: string;
}

interface SpriteSampleVariationSchema {
  type: "sprite";
  src: string;
  start: number;
  end: number;
}
```

### Normalized simple sample

Author input:

```ts
{
  bd: ["bd.wav"];
}
```

Schema:

```ts
{
  banks: {
    user: {
      samples: {
        bd: {
          "0": [{ type: "file", src: "bd.wav" }],
        },
      },
    },
  },
}
```

### Normalized multisample

Author input:

```ts
{
  name: "acoustic",
  samples: {
    piano: {
      a2: ["file-01.wav", "file-02.wav"],
      a3: ["file-03.wav", "file-04.wav"],
    },
  },
}
```

Schema:

```ts
{
  banks: {
    acoustic: {
      samples: {
        piano: {
          "45": [
            { type: "file", src: "file-01.wav" },
            { type: "file", src: "file-02.wav" },
          ],
          "57": [
            { type: "file", src: "file-03.wav" },
            { type: "file", src: "file-04.wav" },
          ],
        },
      },
    },
  },
}
```

### Normalized sprite kit

Sprite kits use many sample names, usually with the default unpitched key `"0"`, all pointing into regions of one shared source file.

```ts
{
  banks: {
    op1: {
      samples: {
        bd: {
          "0": [{ type: "sprite", src: "kit.wav", start: 0.0, end: 0.08 }],
        },
        sd: {
          "0": [{ type: "sprite", src: "kit.wav", start: 0.1, end: 0.18 }],
        },
      },
    },
  },
}
```

### Normalized pitched sprite instrument

Sprites can also represent pitched multisampled instruments. In this case, one sample name has many normalized pitch keys, and each key points to a region in a shared source file.

```ts
{
  banks: {
    acoustic: {
      samples: {
        piano: {
          "45": [
            { type: "sprite", src: "piano-sprite.wav", start: 0.0, end: 0.16 },
          ],
          "57": [
            { type: "sprite", src: "piano-sprite.wav", start: 0.2, end: 0.36 },
          ],
          "69": [
            { type: "sprite", src: "piano-sprite.wav", start: 0.4, end: 0.56 },
          ],
        },
      },
    },
  },
}
```

Fluid treats this like any other multisample: it normalizes the available pitch keys and emits them in the sampler schema. The engine resolves the current note/variation at schedule time, selects the nearest source key, computes the playback rate, loads `piano-sprite.wav`, and schedules the selected sprite region.

## Sampler note semantics

The sampler should preserve the existing musical mental model:

```ts
.root("A3").notes(0)  // natural/root pitch
.root("A3").notes(12) // one octave up, playbackRate 2.0
```

For single pitched samples, users must explicitly set `.root(...)` to play chromatically:

```ts
d.sample("piano")
  .bank("acoustic")
  .root("A3")
  .scale("min")
  .notes([0, 2, 4, 6])
  .push();
```

Without a root, simple drum-style samples default to natural playback:

```ts
d.sample("bd").bank("tr909").hex(0xf).push(); // playbackRate 1.0
```

## SamplerSchema redesign

`notes` and `variation` should remain separate parameters. This preserves the existing system model where each parameter can be static, cycling, or random independently.

To support multisampling, `SamplerSchema` adds `sourceKeys`: the sorted normalized source/root pitches available for this sampler. The bank still contains the actual sample variation entries keyed by stringified source pitch.

This changes the current PR1 sampler behavior: `notes` should carry resolved target note values, not precomputed playback rates. Playback rate is computed by the engine after selecting the nearest source key. This is necessary so random `notes` and random `variation` can resolve independently at schedule time.

```ts
interface SamplerSchema extends InstrumentSchema {
  type: "sampler";
  bank: string;
  sample: string;
  variation: ParameterSchema;
  notes: ParameterSchema | FitSchema;
  sourceKeys: number[]; // e.g. [0], [45, 57], [45, 57, 69]
  loop: boolean;
  clipMode: ClipMode;
}
```

Example emitted sampler schema:

```ts
{
  type: "sampler",
  bank: "acoustic",
  sample: "piano",
  variation: { type: "static", cycle: [[{ value: 0, duration: 1 }]] },
  notes: { type: "static", cycle: [[{ value: 57, duration: 1 }]] },
  sourceKeys: [45, 57, 69],
  loop: false,
  clipMode: "clipped",
  gain,
  detune,
  effects,
}
```

At schedule time, the engine resolves `notes` and `variation`, selects the nearest `sourceKeys` entry, computes playback rate, and then looks up:

```ts
banks[bank].samples[sample][String(sourceKey)][variation];
```

### Randomness

Random sampler behavior should use the same architecture as the rest of the system: random schemas are passed to the engine and resolved at schedule time. Because `notes` and `variation` remain separate parameters, all combinations are supported:

```ts
d.sample("piano").notes([0, 2, 4]).variation(d.rand().int().range(0, 2));
d.sample("piano").notes(d.rand().int().range(0, 12)).variation([0, 1]);
d.sample("piano")
  .notes(d.rand().int().range(0, 12))
  .variation(d.rand().int().range(0, 2));
```

The engine resolves each parameter independently, then performs the same source-key selection and playback-rate calculation.

## Fluid responsibilities

Fluid should:

1. Normalize all bank definitions into `BankSchema`.
2. Parse pitch keys like `a2` into numeric keys like `"45"`.
3. Normalize simple samples to source key `"0"`.
4. Resolve `.root()`, `.scale()`, and `.notes()` into the existing `notes` `ParameterSchema` values.
5. Preserve `variation` as its own `ParameterSchema`.
6. Emit sorted numeric `sourceKeys` for each sampler from the normalized bank sample.

Implementation should avoid a broad two-pass schema refactor. `Drome` should expose an internal `_resolveBank(name)` helper that normalizes user/custom banks first and built-in banks second. `Sampler.getSchema()` can call this helper through its existing host reference to derive `sourceKeys`.

When a bank or sample is missing, fluid should emit a loud warning and fall back to `sourceKeys: [0]` so schema generation remains resilient. The engine may still warn and skip at schedule time if the source entry cannot be resolved.

## Engine responsibilities

The engine should:

1. Resolve the current note from `notes` using the existing parameter/random machinery.
2. Resolve the current variation index from `variation` independently.
3. Select the nearest source key from `sourceKeys`.
4. Compute playback rate with `2 ** ((note - sourceKey) / 12)`.
5. Resolve `banks[bank].samples[sample][String(sourceKey)][variation]`, falling back to variation `0` if needed.
6. Fetch/cache by `src`.
7. Set `node.playbackRate.value = playbackRate`.
8. For `type: "file"`, start normally.
9. For `type: "sprite"`, start at `start * buffer.duration` and stop after `(end - start) * buffer.duration / playbackRate` or equivalent Web Audio scheduling.
10. Apply gain, effects, detune, loop, and clip mode as before.

Entry resolution should be centralized in a shared pure utility, e.g. `resolveSampleEntry(...)`, so prepare-time preloading and runtime scheduling cannot drift. A URL-only helper can be derived from it for preload collection, but runtime scheduling needs full file/sprite metadata.

`prepare()` should preload the cartesian product of `sourceKeys × preloadVariationIndices(schema)`. This ensures all runtime-selectable source keys are ready, including random-note cases. URL-level deduplication should ensure shared sprite files are fetched once.

The engine should not:

- parse note names
- infer root pitches
- understand scales
- normalize bank authoring shapes

## FitSchema behavior

`fit(bars)` is for duration-fitting loop-style material, not pitched multisample selection.

Rules:

- `fit()` is valid for simple file samples with source key `0`.
- `fit()` is valid for sprite regions with source key `0`.
- `fit()` should preserve independent variation selection.
- For file samples, playback rate is `buffer.duration / (bars * barDuration)`.
- For sprite samples, playback rate is `regionDuration / (bars * barDuration)`, where `regionDuration = (end - start) * buffer.duration`.
- Fluid should throw if `fit()` is used with a multisampled pitched sample whose `sourceKeys` are not exactly `[0]`.

## Interaction with future chopping/start/end work

PR3 introduces bank-defined source regions for sprite entries:

```ts
{ type: "sprite", src: "kit.wav", start: 0.2, end: 0.6 }
```

PR4 will introduce sampler-defined playback regions via `.start()`, `.end()`, and `.chop()`. These two concepts should compose with a clear rule:

**Bank-defined source regions define the available source window. Sampler-defined playback regions operate inside that source window.**

For file samples, the implicit source window is `[0, 1]`.

For sprite samples, the source window is `[entry.start, entry.end]`.

Example:

```ts
// source sprite region
{ start: 0.2, end: 0.6 }

// sampler region
d.sample("loop").start(0.5).end(1.0)
```

The actual buffer window is:

```ts
sourceStart = 0.2
sourceEnd = 0.6
sourceLength = 0.4

actualStart = sourceStart + 0.5 * sourceLength // 0.4
actualEnd = sourceStart + 1.0 * sourceLength   // 0.6
```

`chop()` should follow the same rule: slices are computed relative to the selected source window, not necessarily the whole buffer. This allows chopping normal files, drum sprite regions, and pitched sprite regions with one consistent model.

## Default sampler root

Sampler note resolution should default to root `0`, matching the synth/MidiNotes mental model.

This changes the current `SampleNotes` default from A4/69 to `0`.

Rationale:

- Simple drum samples still play naturally by default: note `0`, source key `0`, playback rate `1`.
- `d.sample("piano").notes(45)` can resolve to target note `45` when no root is set.
- Pitched single samples still require an explicit `.root(...)` to identify the sample's natural pitch.
- `.root("A3").notes(0)` resolves to target note `57`; with source key `57`, playback rate is `1`.

## Open questions

None currently.

## Implementation notes

- `SampleNotes.getSchema()` should return MIDI target values directly; remove playback-rate remapping from fluid.
- `Drome._resolveBank(name)` should be internal/non-private so `Sampler.getSchema()` can derive `sourceKeys` without a two-pass schema build.
- `fit()` validation should happen in `Sampler.getSchema()`, where `_fit`, bank, sample, and resolved `sourceKeys` are all available.
- Missing banks/samples should warn during schema generation and use `sourceKeys: [0]` as a fallback.

## Acceptance criteria

- Simple existing built-in banks still work after normalization.
- Flat `loadSamples({ bd: ["bd.wav"] })` normalizes to `bd: { "0": [...] }`.
- Named multisample banks normalize pitch keys to numeric string keys.
- `d.sample("piano", 0).bank("acoustic").root("A2").notes(0)` emits notes that resolve to `45`, variation `0`, and `sourceKeys` including `45`.
- `d.sample("piano", 1).bank("acoustic").root("A2").notes(0)` emits notes that resolve to `45`, variation `1`, and `sourceKeys` including `45`.
- `d.sample("piano").bank("acoustic").root("A3").notes(12)` emits notes that resolve one octave above A3 and `sourceKeys` for nearest-key engine selection.
- Sprite authoring supports shared `sprite` source files with `[start, end][]` leaves.
- Sprite authoring supports variations by adding multiple `[start, end]` regions to the leaf array.
- Sprite sample definitions normalize to entries containing both `src` and normalized offsets.
- Random notes and random variation remain independently representable because `notes` and `variation` stay separate in `SamplerSchema`.
- Engine tests demonstrate that engine resolves notes and variation independently, selects the nearest `sourceKeys` entry, computes playback rate, and consumes normalized file/sprite entries.
