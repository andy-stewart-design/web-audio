# Sampler PR3 Redesign Implementation Plan

## Context

This plan implements the redesigned sampler PR3 work described in `plans/sampler-pr3-redesign-prd.md`. It is an evolution of the original PR3 section in `plans/sampler-plan.md`.

The original PR3 plan widened `BankSchema.samples` directly to support simple samples, multisamples, and sprites. During design review, we found that approach made sprites underspecified and created too much schema ambiguity. The revised plan introduces:

- normalized bank schemas
- keyed multisamples
- shared-source audio sprites
- independent `notes` and `variation` parameters
- `sourceKeys` on `SamplerSchema`
- sampler note values as MIDI target values, not precomputed playback rates
- bounded engine-side source-key selection and playback-rate calculation

**Key design decisions:**

- User-facing `loadSamples()` remains ergonomic and accepts multiple authoring shapes.
- Fluid normalizes authoring shapes into one bank schema shape.
- Normalized sample keys are stringified source/root pitches: `"0"`, `"45"`, `"57"`, etc.
- `SamplerSchema.notes` and `SamplerSchema.variation` remain separate so static/cycling/random behavior composes naturally.
- `SamplerSchema.sourceKeys` lists available normalized source pitches as sorted numbers.
- `notes` now carries target MIDI note values, not precomputed playback rates. This is a breaking schema/behavior change from PR1 sampler internals.
- The engine resolves `notes` and `variation`, selects the nearest source key, computes playback rate, then schedules the selected file/sprite entry.
- Default sampler root changes from A4/69 to `0`.
- `fit()` is valid only for source key `[0]` samples/sprites and throws for pitched multisamples.

---

## Phase 1: Schema Types

Introduce normalized sample definitions and update `SamplerSchema` without changing runtime behavior yet.

### Step 1.1 — Add normalized sample variation types

**Files:** `packages/schema/src/index.ts`

Add exported schema types:

```ts
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

type SampleVariationSchema =
  | FileSampleVariationSchema
  | SpriteSampleVariationSchema;

type NormalizedSampleSchema = Record<string, SampleVariationSchema[]>;
```

Update `BankSchema`:

```ts
interface BankSchema {
  samples: Record<string, NormalizedSampleSchema>;
}
```

**Acceptance criteria:**

- [x] New sample variation types are exported from `@web-audio/schema`
- [x] `BankSchema.samples` accepts normalized sample definitions
- [x] Existing simple sample banks can be represented as `{ "0": [{ type: "file", src }] }`
- [x] Package type-checks cleanly

**Testing:**

- [x] Type-level: `pnpm --filter @web-audio/schema exec tsc --noEmit`

---

### Step 1.2 — Add `sourceKeys` to `SamplerSchema`

**Files:** `packages/schema/src/index.ts`

Update `SamplerSchema`:

```ts
interface SamplerSchema extends InstrumentSchema {
  type: "sampler";
  bank: string;
  sample: string;
  variation: ParameterSchema;
  notes: ParameterSchema | FitSchema;
  sourceKeys: number[];
  loop: boolean;
  clipMode: ClipMode;
}
```

`sourceKeys` should be sorted ascending and should contain the numeric form of each normalized sample key.

**Acceptance criteria:**

- [x] `SamplerSchema.sourceKeys` is required and typed as `number[]`
- [x] `notes` and `variation` remain separate schema fields
- [x] Package type-checks cleanly

**Testing:**

- [x] Type-level: `pnpm --filter @web-audio/schema exec tsc --noEmit`

---

## Phase 2: Fluid Bank Normalization

Normalize existing built-in/user/custom banks into the new bank schema shape.

### Step 2.1 — Normalize simple file samples

**Files:** `packages/fluid/src/index.ts`, `packages/fluid/src/banks/*.ts`

Update bank resolution so `string[]` authoring values become normalized file entries.

Author input:

```ts
{
  bd: ["bd.wav"];
}
```

Normalized schema:

```ts
{
  bd: {
    "0": [{ type: "file", src: "bd.wav" }],
  },
}
```

Built-in banks should normalize the same way after basePath URL resolution.

**Acceptance criteria:**

- [x] Flat `loadSamples({ bd: ["bd.wav"] })` emits `banks.user.samples.bd["0"][0]`
- [x] Built-in bank samples normalize to source key `"0"`
- [x] Resolved built-in URLs are stored as `{ type: "file", src: fullUrl }`
- [x] Existing simple sampler schema round-trips still work, except for expected normalized bank shape changes

**Testing:** `packages/fluid/src/index.test.ts`

- [x] Unit: flat user bank normalizes to `"0"` file entries
- [x] Unit: built-in tr909 bank normalizes to `"0"` file entries
- [x] Unit: custom bank with same name as built-in still takes precedence

---

### Step 2.2 — Normalize named multisample banks

**Files:** `packages/fluid/src/index.ts`

Support authoring shape:

```ts
d.loadSamples({
  name: "acoustic",
  samples: {
    piano: {
      a2: ["file-01.wav", "file-02.wav"],
      a3: ["file-03.wav", "file-04.wav"],
    },
  },
});
```

Normalize pitch keys using existing note-name parsing:

```ts
piano: {
  "45": [
    { type: "file", src: "file-01.wav" },
    { type: "file", src: "file-02.wav" },
  ],
  "57": [
    { type: "file", src: "file-03.wav" },
    { type: "file", src: "file-04.wav" },
  ],
}
```

**Acceptance criteria:**

- [x] Pitch keys like `a2` and `a3` normalize to numeric string keys
- [x] Variations are preserved in order
- [x] Named multisample bank does not pollute `user`
- [x] Invalid pitch keys throw a useful error

**Testing:** `packages/fluid/src/index.test.ts`

- [x] Unit: `a2` normalizes to `"45"`
- [x] Unit: `a3` normalizes to `"57"`
- [x] Unit: per-key variations preserve ordering
- [x] Unit: invalid pitch key throws

---

### Step 2.3 — Normalize sprite banks

**Files:** `packages/fluid/src/index.ts`

Support named and unnamed sprite bank authoring:

```ts
d.loadSamples({
  name: "op1",
  sprite: "kit.wav",
  samples: {
    bd: [[0.0, 0.08]],
    sd: [[0.1, 0.18]],
  },
});
```

Without `name`, register into `"user"`:

```ts
d.loadSamples({
  sprite: "kit.wav",
  samples: {
    bd: [[0.0, 0.08]],
  },
});
```

Normalize to:

```ts
bd: {
  "0": [{ type: "sprite", src: "kit.wav", start: 0.0, end: 0.08 }],
}
```

**Acceptance criteria:**

- [x] Named sprite banks normalize to sprite entries
- [x] Unnamed sprite banks register into `user`
- [x] Single-region `[[start, end]]` leaves normalize to one variation
- [x] Sprite entries include `src`, `start`, and `end`
- [x] Start/end values must be valid normalized offsets with `0 <= start < end <= 1`

**Testing:** `packages/fluid/src/index.test.ts`

- [x] Unit: named sprite kit normalizes correctly
- [x] Unit: unnamed sprite kit normalizes into `user`
- [x] Unit: bare `[start, end]` leaf is rejected
- [x] Unit: invalid region bounds throw

---

### Step 2.4 — Normalize sprite variations and pitched sprites

**Files:** `packages/fluid/src/index.ts`

Support sprite variations:

```ts
bd: [
  [0.0, 0.08],
  [0.42, 0.5],
];
```

Support pitched sprite instruments:

```ts
d.loadSamples({
  name: "acoustic",
  sprite: "piano-sprite.wav",
  samples: {
    piano: {
      a2: [[0.0, 0.16]],
      a3: [
        [0.2, 0.36],
        [0.37, 0.52],
      ],
    },
  },
});
```

**Acceptance criteria:**

- [x] Sprite variation arrays normalize to multiple sprite entries
- [x] Pitched sprite keys normalize to numeric string keys
- [x] Pitched sprite variation arrays preserve order
- [x] Single-region and multi-region leaves are both represented as arrays of regions

**Testing:** `packages/fluid/src/index.test.ts`

- [x] Unit: `bd: [[0, 0.1], [0.2, 0.3]]` creates two variations
- [x] Unit: pitched sprite `a2`/`a3` normalizes to `"45"`/`"57"`
- [x] Unit: `[[0, 0.1]]` creates one variation
- [x] Unit: single-region and multi-region sprite leaves normalize correctly

---

### Step 2.5 — Add `loadSamples()` authoring types and guards

**Files:** `packages/fluid/src/types.ts`, `packages/fluid/src/utils/sample-utils.ts`, `packages/fluid/src/index.ts`

Add explicit authoring types without allowing bare string sample shorthand.

```ts
type SpriteRegion = [number, number];
type SpriteLeaf = SpriteRegion[];

type Named<T> = T & { name: string };
type SpriteBank<S> = { sprite: string; samples: S };

type SpriteSampleBank = SpriteBank<Record<string, SpriteLeaf>>;
type PitchedSpriteSampleBank = SpriteBank<
  Record<string, Record<string, SpriteLeaf>>
>;
type MultiSampleBank = {
  samples: Record<string, Record<string, string[]>>;
};

type LoadSamplesInput =
  | SampleBank
  | NamedSampleBank
  | SpriteSampleBank
  | Named<SpriteSampleBank>
  | PitchedSpriteSampleBank
  | Named<PitchedSpriteSampleBank>
  | MultiSampleBank
  | Named<MultiSampleBank>;
```

`a2: "file.wav"` is intentionally invalid; multisample leaves must be `string[]`.

Use composable guards:

```ts
function isNamed(obj: unknown): obj is { name: string };
function isSpriteSampleBank(obj: unknown): obj is SpriteSampleBank;
function isPitchedSpriteSampleBank(
  obj: unknown,
): obj is PitchedSpriteSampleBank;
function isMultiSampleBank(obj: unknown): obj is MultiSampleBank;
```

**Acceptance criteria:**

- [x] All supported `loadSamples()` shapes are typed
- [x] Bare string file leaves are rejected for simple and multisample banks
- [x] Bare sprite region leaves like `[0, 0.1]` are rejected; sprite leaves must be `[[0, 0.1]]`
- [x] Named variants are detected with `isNamed()` instead of duplicate named guards
- [x] Invalid shapes throw the existing invalid manifest error or a clearer shape-specific error

**Testing:** `packages/fluid/src/utils/sample-utils.test.ts`, `packages/fluid/src/index.test.ts`

- [x] Unit: valid flat/named simple bank guards
- [x] Unit: valid flat/named sprite bank guards
- [x] Unit: valid flat/named pitched sprite bank guards
- [x] Unit: valid flat/named multisample bank guards
- [x] Unit: `a2: "file.wav"` is rejected
- [x] Unit: `bd: [0, 0.1]` is rejected for sprite banks

---

## Phase 3: Fluid Sampler Schema

Update sampler note semantics and emit `sourceKeys`.

### Step 3.1 — Change `SampleNotes` to emit MIDI target values

**Files:** `packages/fluid/src/patterns/sample-notes.ts`, `packages/fluid/src/patterns/sample-notes.test.ts`

Change default sampler root from A4/69 to `0` and remove playback-rate remapping from `SampleNotes`.

Important: after this redesign, sampler `notes` emits target MIDI note values, not playback rates. Playback rate will always be computed by the engine after source-key selection.

Implementation actions:

- Remove `_remapToPlaybackRate` from `SampleNotes`.
- Make `SampleNotes.getSchema()` return MIDI note values directly, matching `MidiNotes.getSchema()` semantics.
- Change `DEFAULT_ROOT` from `69` to `0` and call `super.root(0)` in the constructor.

**Acceptance criteria:**

- [ ] Default sampler note `0` resolves to value `0`
- [ ] `.root("A3").notes(0)` resolves to value `57`
- [ ] `.root("A3").notes(12)` resolves to value `69`
- [ ] Scale behavior remains aligned with `MidiNotes`
- [ ] No `SampleNotes` test asserts playback-rate values like `1.0` or `2.0`; tests assert MIDI target values instead

**Testing:** `packages/fluid/src/patterns/sample-notes.test.ts`

- [ ] Unit: default `notes(0)` emits `0`
- [ ] Unit: root A3 + note 0 emits `57`
- [ ] Unit: root A3 + note 12 emits `69`
- [ ] Unit: random + scale emits target note value map, not playback rates

---

### Step 3.2 — Emit `sourceKeys` from sampler schemas

**Files:** `packages/fluid/src/index.ts`, `packages/fluid/src/instruments/sampler.ts`

Avoid a broad two-pass schema refactor by letting `Sampler.getSchema()` derive `sourceKeys` through its existing host reference.

Add an internal Drome method:

```ts
_resolveBank(name: string): BankSchema | null
```

This method should check user/custom banks first, then built-in banks, normalize the result, and return `null` if no bank is found. It should not be TypeScript `private`, because `Sampler` needs to call it via `this._host`.

For each sampler, `Sampler.getSchema()` should:

- call `this._host?._resolveBank(this._bank)`
- look up `bank.samples[this._sample]`
- derive sorted numeric `sourceKeys` from its object keys
- include `sourceKeys` in `SamplerSchema`

Unknown banks/samples should warn loudly and default to `sourceKeys: [0]` so schema generation remains resilient.

**Acceptance criteria:**

- [ ] Simple samples emit `sourceKeys: [0]`
- [ ] Multisample piano emits `sourceKeys: [45, 57]`
- [ ] Pitched sprite piano emits `sourceKeys: [45, 57]`
- [ ] Unknown bank warns and emits fallback `sourceKeys: [0]`
- [ ] Known bank with unknown sample warns and emits fallback `sourceKeys: [0]`
- [ ] `Drome.getSchema()` remains deterministic

**Testing:** `packages/fluid/src/index.test.ts`

- [ ] Unit: simple user sample emits `sourceKeys: [0]`
- [ ] Unit: multisample emits sorted `sourceKeys`
- [ ] Unit: pitched sprite emits sorted `sourceKeys`
- [ ] Unit: unknown bank warning
- [ ] Unit: known bank with unknown sample warning

---

### Step 3.3 — Preserve independent `notes` and `variation`

**Files:** `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/index.test.ts`

Ensure `SamplerSchema` still contains separate `notes` and `variation` fields.

**Acceptance criteria:**

- [ ] Static/cycling notes emit as `ParameterSchema`
- [ ] Random notes emit as `RandomSchema`
- [ ] Static/cycling variation emits independently
- [ ] Random variation emits independently
- [ ] No resolved `playback` object is emitted

**Testing:** `packages/fluid/src/index.test.ts`

- [ ] Unit: `.notes([0, 2, 4]).variation(d.rand().int().range(0, 2))` emits static notes + random variation
- [ ] Unit: `.notes(d.rand().int().range(0, 12)).variation([0, 1])` emits random notes + static variation

---

### Step 3.4 — Validate `fit()` source key rules

**Files:** `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/index.ts`

`fit()` is valid only for samples whose `sourceKeys` are exactly `[0]`. Validate in `Sampler.getSchema()`, not in `.fit()`, because the relevant bank may not be registered until after `.fit()` is called.

**Acceptance criteria:**

- [ ] `fit()` works for simple file samples with source key `[0]`
- [ ] `fit()` works for sprite samples with source key `[0]`
- [ ] `fit()` throws for pitched multisamples with source keys like `[45, 57]`
- [ ] Error message explains that `fit()` is only valid for unpitched/loop-style samples and includes the bank/sample plus actual `sourceKeys`

**Testing:** `packages/fluid/src/index.test.ts`

- [ ] Unit: simple sample + `fit(2)` succeeds
- [ ] Unit: sprite region + `fit(2)` succeeds
- [ ] Unit: multisampled piano + `fit(2)` throws

---

## Phase 4: Engine Source Resolution

Update engine sampler playback to consume normalized banks and `sourceKeys`.

### Step 4.1 — Add shared sample entry resolution utilities

**Files:** `packages/audio-engine/src/utils/resolve-sample-entry.ts`, `packages/audio-engine/src/sampler.ts`, `packages/audio-engine/src/index.ts`

Extract normalized sample entry resolution into a shared pure utility so prepare-time preloading and runtime scheduling cannot drift.

```ts
function resolveSampleEntry({
  banks,
  bank,
  sample,
  sourceKey,
  variationIndex,
}: {
  banks: Record<string, BankSchema>;
  bank: string;
  sample: string;
  sourceKey: number;
  variationIndex: number;
}): SampleVariationSchema | null {
  const variations = banks[bank]?.samples[sample]?.[String(sourceKey)];
  return variations?.[variationIndex] ?? variations?.[0] ?? null;
}

function resolveSampleUrl(args: Parameters<typeof resolveSampleEntry>[0]) {
  return resolveSampleEntry(args)?.src ?? null;
}
```

Delete any duplicated `AudioEngine._resolveUrl` logic. Runtime buffer lookup should use the entry resolver, not a URL-only resolver, because sprite scheduling needs `type`, `start`, and `end` metadata.

`SampleBufferStore` should key cached buffers by source key + variation index where needed:

```ts
`${sourceKey}:${variationIndex}`
```

The shared buffer cache should still deduplicate by `entry.src` so multiple sprite regions from the same file fetch once.

**Acceptance criteria:**

- [ ] `resolveSampleEntry()` returns file entries
- [ ] `resolveSampleEntry()` returns sprite entries with metadata
- [ ] Out-of-range variations fall back to variation `0`
- [ ] Missing bank/sample/key returns `null`
- [ ] Prepare-time and runtime code both use the shared resolver

**Testing:** `packages/audio-engine/src/utils/resolve-sample-entry.test.ts`

- [ ] Unit: file entry resolved correctly
- [ ] Unit: sprite entry resolved correctly
- [ ] Unit: variation fallback
- [ ] Unit: missing bank/sample/key returns `null`

---

### Step 4.2 — Resolve normalized file entries

**Files:** `packages/audio-engine/src/sampler.ts`

Replace old URL resolution with normalized entry resolution:

1. Resolve note value from `schema.notes`
2. Resolve variation index from `schema.variation`
3. Select nearest source key from `schema.sourceKeys`
4. Compute playback rate: `2 ** ((note - sourceKey) / 12)`
5. Look up `banks[bank].samples[sample][String(sourceKey)][variation]`
6. Fall back to variation `0` if out of range

**Acceptance criteria:**

- [ ] Simple sample note `0`, source key `0` plays at playbackRate `1`
- [ ] Pitched sample note `57`, source key `57` plays at playbackRate `1`
- [ ] Pitched sample note `60`, source key `57` plays at `2 ** (3 / 12)`
- [ ] Out-of-range variation falls back to variation `0`
- [ ] Missing bank/sample/key logs warning and skips

**Testing:** `packages/audio-engine/src/sampler.test.ts`

- [ ] Unit: nearest source key selection
- [ ] Unit: playback rate calculation
- [ ] Unit: variation fallback
- [ ] Unit: normalized file URL fetch/cache path

---

### Step 4.3 — Preserve random notes and random variation at runtime

**Files:** `packages/audio-engine/src/sampler.ts`

Use existing parameter/random resolution machinery for both `notes` and `variation`.

**Acceptance criteria:**

- [ ] Random notes resolve per step/bar using existing random semantics
- [ ] Random variation resolves independently from notes
- [ ] Random notes affect nearest-key selection and playback rate
- [ ] Random variation affects selected variation entry only

**Testing:** `packages/audio-engine/src/sampler.test.ts`

- [ ] Unit: random note value changes selected source key/playback rate
- [ ] Unit: random variation changes selected variation entry
- [ ] Unit: random notes + random variation compose without schema changes

---

### Step 4.4 — Preload source key × variation combinations in `prepare()`

**Files:** `packages/audio-engine/src/index.ts`, `packages/audio-engine/src/utils/resolve-sample-entry.ts`

`AudioEngine.prepare()` must preload every source key that could be selected at runtime. This is especially important for random notes, where the selected source key is not known until scheduling.

For each sampler schema, preload the cartesian product:

```ts
schema.sourceKeys × preloadVariationIndices(schema)
```

Use `resolveSampleUrl()` for each pair and add URLs to a `Set<string>` so shared files, including sprite files referenced by many source keys/regions, are fetched once.

`preloadVariationIndices()` should continue to operate only on the `variation` parameter schema.

**Acceptance criteria:**

- [ ] Prepare preloads all source keys for each sampler
- [ ] Prepare preloads all statically discoverable variation indices for each source key
- [ ] Shared sprite files are deduplicated by URL
- [ ] Random notes do not cause missed buffers for nonzero source keys
- [ ] `preloadVariationIndices()` does not need source-key awareness

**Testing:** `packages/audio-engine/src/index.test.ts`

- [ ] Unit: 3 source keys × 2 variations performs up to 6 URL resolutions
- [ ] Unit: duplicate URLs are fetched once
- [ ] Unit: random notes with multiple `sourceKeys` preload all source keys

---

### Step 4.5 — Schedule normalized sprite entries

**Files:** `packages/audio-engine/src/sampler.ts`

For `type: "sprite"` entries:

- cache/fetch by `src`
- compute `offset = start * buffer.duration`
- compute `regionDuration = (end - start) * buffer.duration`
- start with offset
- stop after `regionDuration / playbackRate`, clipped by note duration when clip mode is `"clipped"`

**Acceptance criteria:**

- [ ] Sprite source file is fetched once and reused across regions
- [ ] `node.start()` uses the correct offset in seconds
- [ ] Sprite stop time accounts for region duration and playback rate
- [ ] Clip mode still clips to note duration when applicable
- [ ] Sprite variations select different regions from the same source file

**Testing:** `packages/audio-engine/src/sampler.test.ts`

- [ ] Unit: region `[0.0, 0.25]` on 4s buffer starts at 0s and lasts 1s at rate 1
- [ ] Unit: region `[0.5, 0.75]` on 4s buffer starts at 2s and lasts 1s at rate 1
- [ ] Unit: playbackRate `2` halves sprite playback duration
- [ ] Unit: two sprite regions with same `src` share one fetch

---

### Step 4.6 — Update `fit()` scheduling for normalized entries

**Files:** `packages/audio-engine/src/sampler.ts`

For `FitSchema`:

- select source key `0`
- resolve variation normally
- file entry duration is `buffer.duration`
- sprite entry duration is `(end - start) * buffer.duration`
- playback rate is `sourceDuration / (bars * barDuration)`

**Acceptance criteria:**

- [ ] `fit(2)` on file sample stretches full buffer to 2 bars
- [ ] `fit(2)` on sprite region stretches only the sprite region to 2 bars
- [ ] Variation selection still works for `fit()`
- [ ] Engine does not attempt nearest-key pitch selection for `fit()`

**Testing:** `packages/audio-engine/src/sampler.test.ts`

- [ ] Unit: file `fit(1)` preserves existing behavior
- [ ] Unit: sprite `fit(2)` uses region duration, not full buffer duration
- [ ] Unit: variation index selects correct file/sprite entry for fit

---

## Phase 5: Integration Tests + Manual Verification

End-to-end validation across schema, fluid, and engine.

### Step 5.1 — Fluid schema round-trip tests

**Files:** `packages/fluid/src/index.test.ts`

**Acceptance criteria:**

- [ ] Simple built-in sampler schema includes normalized bank entries and `sourceKeys: [0]`
- [ ] Flat user sample round-trips to normalized bank schema
- [ ] Named multisample bank round-trips with numeric keys and `sourceKeys`
- [ ] Sprite kit round-trips with shared `sprite` source normalized into entries
- [ ] Pitched sprite bank round-trips with numeric source keys
- [ ] Random notes and random variation remain separate fields

---

### Step 5.2 — Engine integration tests

**Files:** `packages/audio-engine/src/sampler.test.ts`

**Acceptance criteria:**

- [ ] Normalized simple sample produces same playback as pre-redesign simple sampler
- [ ] Multisample nearest-key selection produces correct URL and playback rate
- [ ] Sprite kit selects correct source region and caches shared file
- [ ] Pitched sprite selects nearest pitch region and computes playback rate
- [ ] Random notes and random variation are resolved independently
- [ ] `fit()` works for file and sprite source key `0`

---

### Step 5.3 — Manual audio verification

Using the sequencer app or web app:

**Scenarios:**

- [ ] `d.sample("bd").bank("tr909").hex(0xf).push()` plays naturally at rate `1`
- [ ] Flat user sample: `d.loadSamples({ kick: ["url.wav"] }); d.sample("kick").bank("user").push()` plays
- [ ] Multisampled piano: A2/A3 variations select expected source files
- [ ] Single pitched sample: `.root("A3").scale("min").notes([0,2,4,6])` plays a pitched arpeggio
- [ ] Sprite drum kit: `d.sample("bd").bank("op1")` and `d.sample("sd").bank("op1")` play distinct regions from one file
- [ ] Sprite variations: `d.sample("bd").bank("op1").variation([0,1])` alternates regions
- [ ] Pitched sprite piano plays chromatically from regions in one shared file
- [ ] `fit(2)` stretches a file loop and a sprite loop region correctly

---

## Verification Commands

Run after each relevant phase:

1. `pnpm --filter @web-audio/schema exec tsc --noEmit`
2. `pnpm --filter @web-audio/fluid exec vitest run`
3. `pnpm --filter @web-audio/audio-engine exec vitest run`

If package scripts expose broader checks, prefer those as well.
