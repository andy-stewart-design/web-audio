# Sampler PR3 Design Decisions

These decisions were reached through a structured design review of `sampler-pr3-redesign-plan.md`. Each item identifies the original gap or ambiguity, the decision reached, and the concrete implementation action required.

---

## 1. Note semantics: MIDI values, not playback rates

**Gap:** The existing `SampleNotes.getSchema()` converts MIDI values to playback rates in fluid, so `note.value` in the schema is already a float (e.g. `1.0`, `2.0`). The PR3 plan changes this but doesn't spell out the migration or flag it as a breaking change.

**Decision:** `notes` always carries raw MIDI target values. Playback rate is always computed by the engine. There is no dual-mode behavior — the same semantics apply to simple drums, pitched single samples, and multisampled instruments alike.

**Actions:**

- Remove the `_remapToPlaybackRate` method from `SampleNotes`.
- `SampleNotes.getSchema()` returns MIDI note values directly (same as `MidiNotes.getSchema()`).
- Update the engine's `_scheduleSampleNote` — `note.value` is now a MIDI integer, not a playback rate. Playback rate is computed after source-key selection: `2 ** ((note - sourceKey) / 12)`.
- Update all existing fluid and engine tests that assert playback rate values from `SampleNotes` — they now assert MIDI values instead.
- Update engine tests that pass `note.value` directly to `playbackRate` — insert the rate calculation.

---

## 2. Default sampler root changes from A4 (69) to 0

**Gap:** The plan mentions changing the default root to `0` but doesn't explain the consequences for existing users or tests.

**Decision:** Default root is `0`. Drums play at rate `1.0` by default (`2 ** ((0 - 0) / 12) = 1`). Pitched work always requires an explicit `.root()` call. This is the more honest default — it means "no root set, play at natural pitch."

**Actions:**

- Change `DEFAULT_ROOT` in `SampleNotes` from `69` to `0`.
- Update `SampleNotes` constructor to call `super.root(0)`.
- Update all `SampleNotes` tests — existing assertions like "root A4, note 0 → rate 1.0" become "default note 0 → value 0".
- Confirm that existing drum-style sampler integration tests still produce audibly correct output (rate `1.0` still results from `2 ** ((0 - 0) / 12)`).

---

## 3. `sourceKeys` derived via `_host`, not a two-pass `getSchema()`

**Gap:** The plan says `Drome.getSchema()` needs two passes — first resolve banks, then build sampler schemas with `sourceKeys`. It doesn't specify how `Sampler.getSchema()` gets bank access.

**Decision:** No two-pass architecture needed. `Sampler` already holds `this._host` (a `Drome` reference). `Drome` exposes an internal `_resolveBank(name)` helper. It should not be TypeScript `private`, because `Sampler.getSchema()` calls it directly to derive `sourceKeys`. `Drome.getSchema()` stays a single pass.

**Actions:**

- Add `_resolveBank(name: string): NormalizedBankSchema | null` to `Drome`. It checks `this._banks[name]` first, then falls back to resolving from `BUILT_IN_BANKS[name]`. Returns `null` if neither is found.
- In `Sampler.getSchema()`, call `this._host?._resolveBank(this._bank)` to get the normalized bank.
- Derive `sourceKeys` from the normalized bank:
  ```ts
  const normalizedSample = this._host
    ?._resolveBank(this._bank)
    ?.samples[this._sample];
  const sourceKeys = normalizedSample
    ? Object.keys(normalizedSample).map(Number).sort((a, b) => a - b)
    : [0];
  ```
- `sourceKeys` is included in `SamplerSchema` directly from `Sampler.getSchema()` — `Drome` does not patch it.

---

## 4. `fit()` validation happens at `getSchema()` time

**Gap:** The plan says fluid should throw if `fit()` is used with a pitched multisample, but doesn't specify where or when the validation occurs. Validating at `.fit()` call time is too early — the bank may not be registered yet.

**Decision:** Validate in `Sampler.getSchema()`. This is the only point where `_fit`, the bank name, and the resolved `sourceKeys` are all simultaneously available.

**Actions:**

- In `Sampler.getSchema()`, after deriving `sourceKeys`, add:
  ```ts
  if (this._fit && !(sourceKeys.length === 1 && sourceKeys[0] === 0)) {
    throw new Error(
      `[Sampler] fit() is only valid for unpitched samples (sourceKeys: [0]). ` +
      `"${this._bank}/${this._sample}" has sourceKeys: [${sourceKeys.join(", ")}].`
    );
  }
  ```
- Add unit tests: simple sample + `fit(2)` succeeds; sprite region + `fit(2)` succeeds; multisample piano + `fit(2)` throws with a descriptive message.

---

## 5. `prepare()` pre-loads all source key × variation index combinations

**Gap:** `prepare()` currently iterates `preloadVariationIndices(schema)` for variation indices only. With multisamples, source keys are an additional dimension — and for random notes, all source keys must be pre-loaded since the engine selects among them at schedule time.

**Decision:** Pre-load the full cartesian product of `schema.sourceKeys × preloadVariationIndices(schema)`. The existing `Set<string>` deduplication in `prepare()` ensures sprite files shared across source keys are only fetched once.

**Actions:**

- Update `prepare()` in `AudioEngine` to iterate `sourceKeys`:
  ```ts
  for (const schema of samplerSchemas) {
    for (const sourceKey of schema.sourceKeys) {
      for (const variationIndex of preloadVariationIndices(schema)) {
        const url = resolveSampleUrl({ banks, bank: schema.bank, sample: schema.sample, sourceKey, variationIndex });
        if (url) urls.add(url);
      }
    }
  }
  ```
- `preloadVariationIndices` itself does not need to change — it still operates on the `variation` parameter schema only.
- Add unit test: multisample schema with 3 source keys and 2 variations results in up to 6 URL lookups (deduplicated by the `Set`).

---

## 6. Sample entry resolution duplication eliminated via shared utility

**Gap:** URL/source resolution is duplicated in `SampleBufferStore` (runtime scheduling) and `AudioEngine` (prepare-time URL collection). PR3 makes both more complex — both need to handle source keys as a second dimension, and runtime scheduling needs sprite metadata in addition to URLs.

**Decision:** Extract a shared pure utility function `resolveSampleEntry`. Both consumers call it. A small `resolveSampleUrl` helper can derive `entry.src` for prepare-time preload code. `AudioEngine._resolveUrl` is deleted entirely.

**Actions:**

- Create `packages/audio-engine/src/utils/resolve-sample-entry.ts`:
  ```ts
  function resolveSampleEntry({
    banks,
    bank,
    sample,
    sourceKey,
    variationIndex,
  }: {
    banks: Record<string, NormalizedBankSchema>;
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
- Delete `AudioEngine._resolveUrl`. Replace prepare-time call sites with `resolveSampleUrl(...)`.
- Update runtime scheduling / `SampleBufferStore` to call `resolveSampleEntry(...)` so sprite metadata is available.
- Widen `SampleBufferStore._buffers` from `Map<number, AudioBuffer>` to `Map<string, AudioBuffer>`, keyed by `"${sourceKey}:${variationIndex}"` where needed.
- Add unit tests for `resolveSampleEntry`: correct file entry returned, correct sprite entry returned, fallback to variation `0` when index out of range, `null` returned for missing bank/sample/key.

---

## 7. `loadSamples()` types use `Named<T>` and `SpriteBank<S>` generics

**Gap:** PR3 adds four new authoring shapes (multisample, sprite, pitched sprite, and flat/named variants of each), which would naively produce eight separate types and eight type guards. The user API must remain unchanged.

**Decision:** Use two generic utility types to reduce duplication. `SampleBank` and `NamedSampleBank` remain unchanged (they are structurally different from the rest). Named variants of the three new shapes use `Named<T> = T & { name: string }`. The two sprite shapes share a `SpriteBank<S>` generic. Type guards use a composable `isNamed` helper rather than dedicated named-variant guards.

**Actions:**

- Add to `packages/fluid/src/types.ts`:
  ```ts
  type SpriteRegion = [number, number];
  type SpriteLeaf = SpriteRegion[];

  type SpriteBank<S> = { sprite: string; samples: S };
  type SpriteSampleBank = SpriteBank<Record<string, SpriteLeaf>>;
  type PitchedSpriteSampleBank = SpriteBank<Record<string, Record<string, SpriteLeaf>>>;
  type MultiSampleBank = { samples: Record<string, Record<string, string[]>> };

  type Named<T> = T & { name: string };

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

- Add to `packages/fluid/src/utils/sample-utils.ts`:
  ```ts
  function isNamed(obj: unknown): obj is { name: string } {
    return !!obj && typeof obj === "object" && typeof (obj as Record<string, unknown>).name === "string";
  }

  function isSpriteSampleBank(obj: unknown): obj is SpriteSampleBank { ... }
  function isPitchedSpriteSampleBank(obj: unknown): obj is PitchedSpriteSampleBank { ... }
  function isMultiSampleBank(obj: unknown): obj is MultiSampleBank { ... }
  ```

- Update `_validateLoadSamplesInput` in `Drome` to check all shapes, using `isNamed` for named variant detection:
  ```ts
  if (isSpriteSampleBank(input) && isNamed(input)) { ... }
  if (isSpriteSampleBank(input)) { ... }
  // etc.
  ```

- Add unit tests for each type guard with valid and invalid inputs, including rejection tests for `a2: "file.wav"` and sprite leaves like `bd: [0, 0.1]`.

---

## 8. Missing bank fallback: `sourceKeys: [0]` with loud warnings

**Gap:** When a bank is unknown, the plan says emit `sourceKeys: [0]` as a fallback. But the engine will also fail at schedule time — the fallback produces a valid-looking schema that still results in silence.

**Decision:** Keep `sourceKeys: [0]` as the fallback. Emit a loud, specific warning at schema build time (in `Sampler.getSchema()`) and allow the engine's existing schedule-time warning to fire as well. Two warnings is better than one — fluid tells the user the bank isn't registered, the engine tells them playback was skipped. No hard throw at schema build time.

**Actions:**

- In `Sampler.getSchema()`, when `_resolveBank` returns `null`:
  ```ts
  console.warn(
    `[Sampler] Bank "${this._bank}" not found — did you forget to call loadSamples()? ` +
    `Defaulting to sourceKeys: [0]. This sampler will not produce audio.`
  );
  ```
- When the bank is found but the sample name is missing within it:
  ```ts
  console.warn(
    `[Sampler] Sample "${this._sample}" not found in bank "${this._bank}". ` +
    `Defaulting to sourceKeys: [0]. This sampler will not produce audio.`
  );
  ```
- Add unit tests: unknown bank logs the bank warning and emits `sourceKeys: [0]`; known bank with unknown sample logs the sample warning and emits `sourceKeys: [0]`.
