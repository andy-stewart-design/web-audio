# Sampler/Synthesizer refactor plan

## Goals

1. Reduce `Sampler` complexity.
2. Keep `Sampler` and `Synthesizer` structurally similar.
3. Extract sampler-only loading/cache/variation-buffer concerns.
4. Centralize shared voice-rendering logic in `Instrument`.
5. Avoid premature abstraction of note scheduling.
6. Keep every phase independently testable.

---

## Phase 0: Baseline behavior capture

### Purpose

Before changing structure, define what “same behavior” means.

### Files touched

Potentially test files only.

### Tasks

- Identify existing test coverage for:
  - sampler loading
  - sampler variation fallback
  - sampler random/sequence/fit scheduling
  - synth random/sequence scheduling
  - envelope scheduling
  - effect node chaining
  - detune envelope/LFO behavior
- If tests are sparse, add a small baseline test suite before refactoring.

### Suggested automated tests

#### Sampler loading / readiness

Verify:

- sampler is not ready before buffer is available
- sampler becomes ready after initial variation load
- fallback buffer makes sampler ready
- failed load does not crash

#### Sampler cache behavior

Verify:

- same URL uses resolved cache if present
- duplicate loads share `cache.promises`
- failed promise is removed from `cache.promises`

#### Sampler scheduling

Verify:

- sequence mode schedules expected number of buffer sources
- random mode skips steps with value `0`
- fit mode schedules only on matching bar windows
- one-shot duration uses sample duration when not looping
- non-one-shot duration uses note duration

#### Synth scheduling

Verify:

- sequence mode schedules expected oscillator sources
- random mode skips steps with value `0`
- MIDI value maps to oscillator frequency
- oscillator stop time includes release padding

### Suggested manual tests

Use an existing demo/composition and verify:

- sampler plays immediately when preloaded
- fallback buffer prevents silence during load
- sample variations still change as expected
- fit-mode loops/stretching still sounds correct
- synth notes/effects/detune still sound unchanged

### Verification checkpoint

No production code behavior changes. Tests should pass before moving on.

---

## Phase 1: Extract `SampleBufferStore`

### Purpose

Move sampler asset/buffer lifecycle out of `Sampler`.

### New file

```txt
packages/audio-engine/src/instruments/sample-buffer-store.ts
```

### Changed file

```txt
packages/audio-engine/src/instruments/sampler.ts
```

### Responsibility boundary

#### `SampleBufferStore` owns

- bank/sample/index to URL resolution
- decoded buffer map
- shared cache access
- in-flight promise reuse
- lazy-loading missing variations
- initial buffer tracking
- fallback buffer usage
- warning on missing bank/sample/variation/load failure

#### `Sampler` still owns

- bar scheduling
- note-mode branching
- variation index resolution
- note timing/rate/duration calculation
- source creation
- voice rendering, for now

### Important design decision

Keep this in `Sampler`:

```ts
private _resolveVariationIndex(barIndex: number, stepIndex: number): number
```

Reason: variation index resolution uses `_resolve(...)`, random resolvers, and musical bar/step context. That belongs with instrument scheduling, not asset loading.

### Proposed `SampleBufferStore` API

```ts
interface SampleBufferStoreOptions {
  ctx: AudioContext;
  banks: Record<string, BankSchema>;
  cache: SampleCache;
  bank: string;
  sample: string;
  initialVariationIndex: number;
  fallbackBuffer?: AudioBuffer | null;
}

class SampleBufferStore {
  constructor(options: SampleBufferStoreOptions);

  preload(variationIndices: number[]): Promise<void>;

  getPlaybackBuffer(
    variationIndex: number,
    barIndex: number,
  ): AudioBuffer | null;

  getInitialPlaybackBuffer(): AudioBuffer | null;

  hasInitialBuffer(): boolean;

  fallbackBufferFor(bank: string, sample: string): AudioBuffer | null;
}
```

### Migration details

Move from `Sampler` into `SampleBufferStore`:

- `_resolveUrl`
- `_loadVariation`
- `_bufferForVariation`
- `_buffers`
- `_buffer`
- `_fallbackBuffer`
- direct `_banks`
- direct `_cache`

`Sampler` constructor changes from storing banks/cache/fallback itself to constructing:

```ts
this._bufferStore = new SampleBufferStore({
  ctx,
  banks,
  cache,
  bank: schema.bank,
  sample: schema.sample,
  initialVariationIndex: this._initialVariationIndex,
  fallbackBuffer,
});
```

`Sampler.load()` becomes:

```ts
async load(): Promise<void> {
  await this._bufferStore.preload(preloadVariationIndices(this._schema));
}
```

`Sampler.isReady()` becomes:

```ts
isReady(): boolean {
  return this._bufferStore.hasInitialBuffer();
}
```

`Sampler.fallbackBufferFor(schema)` becomes:

```ts
fallbackBufferFor(schema: SamplerSchema): AudioBuffer | null {
  return this._bufferStore.fallbackBufferFor(schema.bank, schema.sample);
}
```

Buffer retrieval changes from:

```ts
const buffer = this._bufferForVariation(variationIndex, barIndex);
```

to:

```ts
const buffer = this._bufferStore.getPlaybackBuffer(variationIndex, barIndex);
```

### Automated tests

Add focused tests for `SampleBufferStore`.

#### Test: resolves cached buffer

Given cache contains resolved URL, calling `preload([0])` should populate the store and `hasInitialBuffer()` should return true.

#### Test: reuses in-flight promise

Given two stores or two preload calls ask for same URL, fetch/decode should happen once.

#### Test: missing bank warns and returns null

Given unknown bank, `preload([0])` does not throw, and `getPlaybackBuffer(...)` returns null.

#### Test: missing sample warns and returns null

Given unknown sample, same behavior.

#### Test: fallback initial buffer

Given fallback buffer and initial variation not loaded, `hasInitialBuffer()` is true and initial playback buffer returns fallback.

#### Test: lazy-load missing variation

Given variation 3 is requested but not loaded, `getPlaybackBuffer(3, barIndex)` returns null and triggers async load.

### Sampler regression tests

Existing sampler tests should still pass unchanged except for any imports/mocks that target private internals.

Specifically verify:

- `load()` preloads the same variation indices as before
- schedule behavior is unchanged
- warnings are still understandable
- fallback behavior is unchanged

### Manual test

Run a composition using:

- a sampler with normal sequence notes
- a sampler with random notes
- a sampler with fit mode
- a sampler using variations
- a sampler starting with fallback buffer

Expected result: sounds identical to before.

### Verification checkpoint

At end of Phase 1:

- `Sampler` no longer contains fetch/decode/cache/url logic.
- `Sampler` still schedules voices exactly as before.
- All sampler behavior remains unchanged.

---

## Phase 2: Extract shared voice rendering into `Instrument`

### Purpose

Remove duplicated low-level rendering logic from `Sampler` and `Synthesizer`.

### Changed files

```txt
packages/audio-engine/src/instruments/instrument.ts
packages/audio-engine/src/instruments/sampler.ts
packages/audio-engine/src/instruments/synthesizer.ts
```

### Responsibility boundary

#### `Sampler` owns

- buffer selection
- note timing
- sample duration/rate logic
- `AudioBufferSourceNode` creation

#### `Synthesizer` owns

- MIDI-to-frequency conversion
- oscillator settings
- `OscillatorNode` creation

#### `Instrument` owns

- gain node creation
- gain envelope scheduling
- detune envelope/LFO wiring
- effect node building
- graph wiring
- source start/stop
- cleanup tracking

### Proposed type

```ts
interface ScheduleVoiceOptions {
  source: AudioScheduledSourceNode;
  detuneParam?: AudioParam;
  detune?: ResolvedDetune;
  gainEnvelope: EnvelopeSchema;
  effects: EffectSchema[];
  barIndex: number;
  stepIndex: number;
  startTime: number;
  noteDuration: number;
  endTime: number;
  stopTime?: number;
}
```

### Proposed helper

```ts
protected _scheduleVoice({
  source,
  detuneParam,
  detune,
  gainEnvelope,
  effects,
  barIndex,
  stepIndex,
  startTime,
  noteDuration,
  endTime,
  stopTime,
}: ScheduleVoiceOptions): void {
  const gain = new GainNode(this._ctx);

  const releaseDur = this._scheduleParamEnvelope(
    gain.gain,
    gainEnvelope,
    barIndex,
    stepIndex,
    noteDuration,
    endTime,
  );

  if (detuneParam && detune) {
    if (detune.type === "envelope") {
      this._scheduleParamEnvelope(
        detuneParam,
        detune.schema,
        barIndex,
        stepIndex,
        noteDuration,
        endTime,
      );
    } else if (detune.type === "lfo") {
      const lfoNode = this._lfoNodes.get(detune.schema.id);
      if (lfoNode) lfoNode.connect(detuneParam);
    }
  }

  const effectNodes = effects.map((effect) =>
    this._buildEffectNode(
      effect,
      barIndex,
      stepIndex,
      startTime,
      noteDuration,
      endTime,
    ),
  );

  source.connect(gain);

  const chain: AudioNode[] = [gain, ...effectNodes];
  chain.reduce((src, dst) => {
    src.connect(dst);
    return dst;
  });

  chain[chain.length - 1].connect(this._outputNode);

  source.start(startTime);
  source.stop(stopTime ?? endTime + releaseDur + 0.05);

  this._track(source, chain, startTime);
}
```

### Migration details

#### In `Synthesizer._scheduleNote`

Keep:

- timing calculation
- detune resolution
- oscillator creation

Replace duplicated rendering with:

```ts
this._scheduleVoice({
  source: osc,
  detuneParam: osc.detune,
  detune,
  gainEnvelope: this._schema.gain,
  effects: this._schema.effects,
  barIndex,
  stepIndex: note.stepIndex,
  startTime,
  noteDuration,
  endTime,
});
```

#### In `Sampler._scheduleNote`

Keep:

- timing calculation
- duration calculation
- detune resolution
- buffer source creation

Replace duplicated rendering with:

```ts
this._scheduleVoice({
  source,
  detuneParam: source.detune,
  detune,
  gainEnvelope: this._schema.gain,
  effects: this._schema.effects,
  barIndex,
  stepIndex: note.stepIndex,
  startTime,
  noteDuration,
  endTime,
});
```

#### In sampler fit mode

Either:

1. use `_scheduleVoice(...)` with `stepIndex: 0`; or
2. leave fit mode unchanged until Phase 3.

Recommendation: include fit mode in `_scheduleVoice`, but explicitly preserve current stop behavior using `stopTime`.

```ts
this._scheduleVoice({
  source,
  detuneParam: source.detune,
  detune,
  gainEnvelope: this._schema.gain,
  effects: this._schema.effects,
  barIndex,
  stepIndex: 0,
  startTime: barStartTime,
  noteDuration: fitDuration,
  endTime: barStartTime + fitDuration,
  stopTime: barStartTime + fitDuration,
});
```

This avoids an accidental behavior change around release tails.

### Automated tests

#### Shared voice helper tests

If tests can mock Web Audio nodes, verify:

- gain node is inserted between source and effects
- effects are connected in order
- final node connects to output
- source starts at `startTime`
- source stops at default `endTime + release + 0.05`
- explicit `stopTime` overrides default
- detune envelope schedules onto `detuneParam`
- detune LFO connects to `detuneParam`

#### Sampler regression tests

Verify same as Phase 1, especially:

- one-shot stop timing
- loop stop timing
- fit-mode stop timing
- effect chain still present

#### Synth regression tests

Verify:

- oscillator source still created with same waveform/frequency/detune
- stop timing unchanged
- effects still applied
- detune behavior unchanged

### Manual test

Use a patch/composition with:

- synth detune envelope
- synth detune LFO
- sampler detune envelope
- sampler filter/gain effects
- sampler fit mode

Expected result: same audible behavior as before.

### Verification checkpoint

At end of Phase 2:

- `Sampler._scheduleNote` and `Synthesizer._scheduleNote` no longer contain duplicated graph-wiring/effect/envelope code.
- `Instrument` owns one shared rendering path.
- Source creation remains subclass-specific.
- Behavior is unchanged.

---

## Phase 3: Split sampler scheduling branches into per-mode methods

### Purpose

Make `Sampler.scheduleBar` small and readable.

### Changed file

```txt
packages/audio-engine/src/instruments/sampler.ts
```

### New private methods

```ts
private _scheduleFitBar(barIndex: number, barStartTime: number): void;

private _scheduleRandomBar(barIndex: number, barStartTime: number): void;

private _scheduleSequenceBar(barIndex: number, barStartTime: number): void;

private _scheduleSampleNote(
  buffer: AudioBuffer,
  note: StaticSchemaValue,
  barStartTime: number,
  barIndex: number,
): void;
```

Potentially rename existing `_scheduleNote` to `_scheduleSampleNote`.

### Target `scheduleBar`

```ts
scheduleBar(barIndex: number, barStartTime: number): void {
  if (!this._bufferStore.hasInitialBuffer()) {
    console.warn(
      `[Sampler] "${this._schema.bank}/${this._schema.sample}" not yet loaded — skipping bar ${barIndex}`,
    );
    return;
  }

  this._updateLfoParams(barIndex, barStartTime);

  switch (this._schema.notes.type) {
    case "fit":
      this._scheduleFitBar(barIndex, barStartTime);
      return;
    case "random":
      this._scheduleRandomBar(barIndex, barStartTime);
      return;
    default:
      this._scheduleSequenceBar(barIndex, barStartTime);
      return;
  }
}
```

### Automated tests

These should mostly be regression tests.

Verify:

- fit mode only schedules at `barIndex % notes.bars === 0`
- random mode resolves rates and skips inactive steps
- sequence mode schedules note cycle for current bar
- variation buffer lookup receives expected variation index
- missing variation skips individual note without aborting whole bar

### Manual test

Use samplers in all three note modes:

- fit
- random
- sequence

Expected result: no audible behavior change.

### Verification checkpoint

At end of Phase 3:

- `Sampler.scheduleBar` is easy to scan.
- All sampler scheduling branches are isolated.
- No behavior changes intended.

---

## Phase 4: Split synthesizer scheduling branches into per-mode methods

### Purpose

Make `Synthesizer` structurally parallel to `Sampler`.

### Changed file

```txt
packages/audio-engine/src/instruments/synthesizer.ts
```

### New private methods

```ts
private _scheduleRandomBar(barIndex: number, barStartTime: number): void;

private _scheduleSequenceBar(barIndex: number, barStartTime: number): void;

private _scheduleSynthNote(
  note: StaticSchemaValue,
  barStartTime: number,
  barIndex: number,
): void;
```

Rename existing `_scheduleNote` to `_scheduleSynthNote`.

### Target `scheduleBar`

```ts
scheduleBar(barIndex: number, barStartTime: number): void {
  this._updateLfoParams(barIndex, barStartTime);

  if (this._schema.notes.type === "random") {
    this._scheduleRandomBar(barIndex, barStartTime);
    return;
  }

  this._scheduleSequenceBar(barIndex, barStartTime);
}
```

### Automated tests

Verify:

- random mode skips zero-value steps
- random mode resolves generated MIDI values correctly
- sequence mode schedules current bar notes
- `_scheduleSynthNote` creates oscillator with expected frequency
- source rendering is still delegated through `_scheduleVoice`

### Manual test

Use synth patterns with:

- sequence notes
- random notes
- detune
- effects

Expected result: no audible behavior change.

### Verification checkpoint

At end of Phase 4:

- `Sampler` and `Synthesizer` have visibly similar structure.
- Scheduling remains intentionally separate.
- Voice rendering remains shared.

---

## Phase 5: Cleanup and naming pass

### Purpose

Remove leftover ambiguity and make class responsibilities obvious.

### Files touched

Potentially:

```txt
packages/audio-engine/src/instruments/instrument.ts
packages/audio-engine/src/instruments/sampler.ts
packages/audio-engine/src/instruments/synthesizer.ts
packages/audio-engine/src/instruments/sample-buffer-store.ts
```

### Tasks

- Ensure naming makes responsibilities clear:
  - `_scheduleSampleNote`
  - `_scheduleSynthNote`
  - `_scheduleVoice`
  - `SampleBufferStore.getPlaybackBuffer`
- Remove obsolete comments.
- Add targeted comments only where behavior is non-obvious:
  - fallback buffer behavior
  - lazy variation loading
  - fit-mode stop timing
- Verify warnings are still useful and not duplicated.
- Confirm no stale private fields remain in `Sampler`.

### Automated checks

Run:

- typecheck
- lint
- full test suite
- build

### Manual test

Do one full playback smoke test.

Expected result:

- no runtime errors
- no unexpected console warning spam
- sampler and synth both sound correct

### Verification checkpoint

At end of Phase 5:

- `Sampler` reads as a scheduler/source factory.
- `Synthesizer` reads as a scheduler/source factory.
- `Instrument` reads as shared rendering infrastructure.
- `SampleBufferStore` reads as sampler asset infrastructure.

---

## Recommended implementation order

1. **Phase 0**: baseline tests/behavior capture
2. **Phase 1**: `SampleBufferStore`
3. **Phase 2**: `_scheduleVoice`
4. **Phase 3**: sampler scheduling method split
5. **Phase 4**: synth scheduling method split
6. **Phase 5**: cleanup

The key is that Phase 1 and Phase 2 each improve the architecture independently:

- Phase 1 reduces sampler state/asset complexity.
- Phase 2 removes voice-rendering duplication.
- Phase 3/4 are readability and symmetry passes.

Avoid combining Phase 1 and Phase 2 in one PR/commit because if something breaks, it will be much harder to tell whether the bug came from buffer lifecycle changes or graph-scheduling changes.

────────────────────────────────────────────────────────────────────────────────

Summary of the entire refactor

### Files changed

┌─────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────┐
│ File │ What happened │
├─────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ sample-buffer-store.ts │ New — extracted all sampler asset/buffer lifecycle │
├─────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ sample-buffer-store.test.ts │ New — focused unit tests for the store │
├─────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ sampler.ts │ Refactored — delegates loading to SampleBufferStore, delegates voice rendering to │
│ │ Instrument.\_scheduleVoice(), split scheduleBar into per-mode methods │
├─────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ synthesizer.ts │ Refactored — delegates voice rendering to Instrument.\_scheduleVoice(), split scheduleBar into │
│ │ per-mode methods │
├─────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ instrument.ts │ Extended — added shared \_scheduleVoice() method │
└─────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────┘

### Architecture after refactor

```
  Instrument (abstract)
  ├── _scheduleVoice()      ← shared gain/envelope/effects/graph wiring
  ├── _buildEffectNode()
  ├── _scheduleParamEnvelope()
  ├── _resolveDetune()
  └── ...

  Sampler extends Instrument
  ├── SampleBufferStore     ← asset loading/cache/fallback
  ├── scheduleBar()         ← dispatch to per-mode methods
  ├── _scheduleFitBar()
  ├── _scheduleRandomBar()
  ├── _scheduleSequenceBar()
  └── _scheduleSampleNote() ← creates AudioBufferSourceNode, delegates to _scheduleVoice()

  Synthesizer extends Instrument
  ├── scheduleBar()         ← dispatch to per-mode methods
  ├── _scheduleRandomBar()
  ├── _scheduleSequenceBar()
  └── _scheduleSynthNote()  ← creates OscillatorNode, delegates to _scheduleVoice()
```

### Key design decisions preserved

- \_resolveVariationIndex stays in Sampler (musical scheduling concern)
- stopTime option in \_scheduleVoice preserves fit-mode's no-release-tail behavior
- SampleBufferStore removed redundant \_buffer field, uses \_buffers Map as single source of truth
