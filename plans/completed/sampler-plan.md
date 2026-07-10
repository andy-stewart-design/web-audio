# Sampler Implementation Plan

## Context

The audio system currently has a single instrument type — `Synthesizer` — which wraps the Web Audio `OscillatorNode`. This plan adds a second instrument type, `Sampler`, wrapping `AudioBufferSourceNode`. Samplers share the same gain, effects, and automation infrastructure as the synth.

**Key design decisions:**

- A "note" for the sampler is a **playback rate** (float), not a frequency. The `Sampler` fluid class uses a `SamplerNotes` helper that converts MIDI pitch + root to a playback rate multiplier at schema build time (`2^((note - root) / 12)`). Root does not appear in the schema.
- Sample loading is **JIT** — the engine waits for all required samples to be loaded before the clock starts. If a sample is added mid-playback, the instrument is silently skipped until its sample is ready (console warning emitted on each miss).
- Sample playback defaults to **clipped** note-duration behavior for backwards compatibility. Fluid exposes `.clip()`, `.clip(true)`, and `.clip(false)`; disabling clip emits `clipMode: "one-shot"`, allowing non-looping samples to play through their natural buffer duration.
- Built-in sample banks are hosted on a **self-hosted CDN**. Bank manifests are defined as TypeScript constants in `packages/fluid/src/data/banks.ts` with full CDN URLs. Fluid inlines them into `DromeSchema.banks` at schema-build time — the engine reads URLs from the schema and has no CDN awareness.
- The reserved bank name `"user"` is the destination for `loadSamples({ name: ... })` calls using the flat (no-name) format.
- `fit(bars)` cannot be resolved in fluid (requires sample duration from the loaded buffer), so it is a first-class `FitSchema` value in the schema — the only exception to the fluid-smart principle.
- `chop(slices, sequence)` IS resolved in fluid to normalized 0–1 `{ start, end }` pairs. `start()` / `end()` constrain the window that chop operates within; fluid absorbs this composition before emitting the schema.
- Sprite offsets use **normalized 0–1** values (engine multiplies by `buffer.duration` at playback time).

**Implementation notes:**

- After Phase 3, we changed `_players` to `_instruments` in line with our work on the CONTEXT/Glossary

---

## PR 1: Core Sampler

Basic single-sample playback: note-duration clipping by default, optional one-shot playback, looping, `fit`, built-in banks, full gain/effects parity with `Synthesizer`. This PR also tuned default gain-envelope ramps for synths/samples and lowered the engine's minimum ramp clamp to preserve sample transients.

### Phase 1: Schema

#### Step 1.1 — Add `FitSchema`

**Files:** `packages/schema/src/index.ts`

```ts
interface FitSchema {
  type: "fit";
  bars: number;
}
```

**Acceptance criteria:**

- [x] `FitSchema` is exported from `@web-audio/schema`
- [x] Package type-checks cleanly: `pnpm --filter @web-audio/schema exec tsc --noEmit`

**Testing:**

- [x] Type-level only: `pnpm --filter @web-audio/schema exec tsc --noEmit`

---

#### Step 1.2 — Add `InstrumentSchema` base and `SamplerSchema`

**Files:** `packages/schema/src/index.ts`

`InstrumentSchema` is a base interface shared by all instruments. `SynthesizerSchema` and `SamplerSchema` extend it, removing the duplicated `gain`, `effects`, and `detune` fields.

```ts
interface InstrumentSchema {
  gain: EnvelopeSchema;
  effects: EffectSchema[];
  detune: ParameterSchema | EnvelopeSchema | LfoSchema;
}

interface SynthesizerSchema extends InstrumentSchema {
  type: "synthesizer";
  waveform: Waveform;
  notes: ParameterSchema;
}

type clipMode = "clipped" | "one-shot";

interface SamplerSchema extends InstrumentSchema {
  type: "sampler";
  bank: string;
  sample: string;
  variation: ParameterSchema;
  notes: ParameterSchema | FitSchema;
  loop: boolean;
  clipMode: ClipMode;
}
```

`notes` contains resolved playback rate multipliers (floats). `1.0` is the natural pitch at the root. `2.0` is one octave up. When `notes` is a `FitSchema`, the engine resolves the rate post-load.

**Acceptance criteria:**

- [x] `InstrumentSchema` base interface is exported from `@web-audio/schema`
- [x] `SamplerSchema` extends `InstrumentSchema` and is exported
- [x] `SynthesizerSchema` extends `InstrumentSchema`
- [x] `notes` accepts both `ParameterSchema` and `FitSchema`
- [x] `clipMode` accepts `"clipped" | "one-shot"`
- [x] Package type-checks cleanly

**Testing:**

- [x] Type-level only: `pnpm --filter @web-audio/schema exec tsc --noEmit`

---

#### Step 1.3 — Add `BankDefinition`, `BankSchema`, and update `DromeSchema`

**Files:** `packages/schema/src/index.ts`

Two distinct types are needed: `BankDefinition` is the authoring format (used in bank files and by `d.loadSamples()`); `BankSchema` is the resolved schema format (full URLs, lives in `DromeSchema`). Fluid resolves the former into the latter.

```ts
// Authoring format — basePath + relative paths
interface BankDefinition {
  basePath: string;
  samples: Record<string, string[]>;
}

// Schema format — full URLs only, engine reads these directly
interface BankSchema {
  samples: Record<string, string[]>;
}

interface DromeSchema {
  bpm?: number;
  instruments: (SynthesizerSchema | SamplerSchema)[];
  banks: Record<string, BankSchema>; // bank name → manifest (built-in and custom)
}
```

`banks` is always present (empty object if no instruments reference any banks). Both built-in and custom banks live here — the engine makes no distinction. Built-in bank manifests are inlined by fluid at schema-build time.

Note: `DromeSchema.instruments` uses an inline union rather than a named union type — `InstrumentSchema` is the base interface, not a union.

**Acceptance criteria:**

- [x] `BankSchema` is exported from `@web-audio/schema`
- [x] `BankDefinition` is exported from `@web-audio/schema`
- [x] `DromeSchema.banks` is present and typed correctly
- [x] `DromeSchema.instruments` accepts both synths and samplers
- [x] Package type-checks cleanly

**Testing:**

- [x] Type-level only: `pnpm --filter @web-audio/schema exec tsc --noEmit`

---

#### Step 1.4 — Define built-in bank constants

**Files:** `packages/fluid/src/banks/index.ts`, `packages/fluid/src/banks/tr808.ts`, `packages/fluid/src/banks/tr909.ts` (all new)

Each bank is a separate `.ts` file exporting a `BankDefinition` using `satisfies` for inline type-checking. The `index.ts` assembles them into a single `BUILT_IN_BANKS` map.

```ts
// tr909.ts
import type { BankDefinition } from "@web-audio/schema";

export default {
  basePath:
    "https://raw.githubusercontent.com/ritchse/tidal-drum-machines/main/machines/",
  samples: {
    bd: [
      "RolandTR909/rolandtr909-bd/Bassdrum-01.wav",
      "RolandTR909/rolandtr909-bd/Bassdrum-02.wav",
      // ...
    ],
    sd: ["RolandTR909/rolandtr909-sd/naredrum.wav" /* ... */],
    // ... remaining samples
  },
} satisfies BankDefinition;
```

```ts
// banks/index.ts
import type { BankDefinition } from "@web-audio/schema";
import tr808 from "./tr808";
import tr909 from "./tr909";

export const BUILT_IN_BANKS: Record<string, BankDefinition> = { tr808, tr909 };
export const DEFAULT_BANK = "tr808";
```

**Acceptance criteria:**

- [x] `tr808.ts` and `tr909.ts` each export a valid `BankDefinition`
- [x] `BUILT_IN_BANKS` and `DEFAULT_BANK` are exported from `banks/index.ts`
- [x] Each bank file uses `satisfies BankDefinition` for type-checking
- [x] All files type-check cleanly

**Testing:**

- [x] Unit: `BUILT_IN_BANKS.tr909.samples.bd` is a non-empty array of relative path strings
- [x] Unit: `BUILT_IN_BANKS.tr909.basePath` is a valid URL string

---

#### Step 1.5 — Inline referenced banks in `Drome.getSchema()`

**Files:** `packages/fluid/src/index.ts`

When building the `DromeSchema`, fluid collects the bank name from each `Sampler`, resolves the `BankDefinition` into a `BankSchema` by prepending `basePath` to each relative path, and places it in `DromeSchema.banks`. User-registered banks take precedence over built-in banks with the same name.

```ts
function resolveBank(def: BankDefinition): BankSchema {
  const samples: Record<string, string[]> = {};
  for (const [name, paths] of Object.entries(def.samples)) {
    samples[name] = paths.map((p) => def.basePath + p);
  }
  return { samples };
}

getSchema(): DromeSchema {
  const instruments = this._instruments.map((i) => i.getSchema());
  const banks: Record<string, BankSchema> = {};

  // Resolve user-registered banks first (they take precedence)
  for (const [name, def] of Object.entries(this._banks)) {
    banks[name] = resolveBank(def);
  }

  // Inline built-in banks for any referenced bank not already present
  for (const instrument of instruments) {
    if (instrument.type === "sampler") {
      const { bank: bankName } = instrument;
      if (!banks[bankName] && BUILT_IN_BANKS[bankName]) {
        banks[bankName] = resolveBank(BUILT_IN_BANKS[bankName]);
      }
    }
  }

  return { bpm: this._bpm, instruments, banks };
}
```

If a bank name is not found in either source, fluid logs a warning and omits it — the engine will skip that sampler.

**Acceptance criteria:**

- [x] `d.sample("bd").bank("tr808").push(); d.getSchema().banks["tr808"]` is populated
- [x] Only banks actually referenced by instruments are included in the schema
- [x] An unknown bank name logs a warning and is omitted

**Testing:**

- [x] Unit: schema with two tr808 instruments → `banks` contains `tr808` exactly once
- [x] Unit: schema with no samplers → `banks` is `{}`
- [x] Unit: unknown bank name logs a console warning

---

### Phase 2: Fluid — `Sampler` class

#### Step 2.1 — Implement `SampleNotes` helper

**Files:** `packages/fluid/src/patterns/sample-notes.ts` (new)

`SampleNotes extends MidiNotes` (formerly `Notes`, renamed to `MidiNotes`). Overrides `getSchema()` to remap MIDI values to playback rate multipliers (`2^((midi - root) / 12)`). Defaults root to A4 (69) in its constructor so `notes([0])` always produces rate `1.0` without requiring an explicit `.root()` call.

**Acceptance criteria:**

- [x] `SampleNotes.getSchema()` with root A4, note 0 (degree 0) produces `value: 1.0`
- [x] Degree 12 (one octave up) produces `value: 2.0`
- [x] Degree -12 (one octave down) produces `value: 0.5`
- [x] `RandomCycle` with scale remaps valueMap entries from MIDI to rates
- [x] `RandomCycle` without valueMap builds one from the range and clears `range`

**Testing:**

- [x] Unit: root A4, note A4 → rate 1.0
- [x] Unit: root A4, note A5 → rate 2.0
- [x] Unit: root A4, note A3 → rate 0.5
- [x] Unit: random + scale → valueMap remapped to rates
- [x] Unit: random + range, no valueMap → valueMap built, range cleared

---

#### Step 2.2 — Implement `Sampler` class and make `Instrument` abstract

**Files:** `packages/fluid/src/instruments/sampler.ts` (new), `packages/fluid/src/instruments/instrument.ts`, `packages/fluid/src/instruments/synthesizer.ts`

`Sampler extends Instrument` and overrides `_cycle` with a `SampleNotes` instance. `Instrument` is now `abstract` with `abstract getSchema(): SynthesizerSchema | SamplerSchema`. `_host` and `push()` moved from subclasses into `Instrument` — subclasses pass `host` to `super()`. Default bank is `DEFAULT_BANK` (`"tr909"`).

**Acceptance criteria:**

- [x] `d.sample("bd").getSchema()` returns a valid `SamplerSchema`
- [x] Default bank is `DEFAULT_BANK` (`"tr909"`)
- [x] `.bank("tr808")` changes the bank in the schema
- [x] `.fit(2)` sets `notes` to `{ type: "fit", bars: 2 }` in the schema
- [x] Calling `.notes([0])` after `.fit(2)` uses the note ParameterSchema (fit is cleared)
- [x] `.loop(true)` sets `loop: true` in the schema
- [x] `.clip()`, `.clip(true)`, and `.clip(false)` set `clipMode` appropriately
- [x] `.gain()`, `.fx()`, `.root()`, `.scale()` all work identically to `Synthesizer`
- [x] `_host` and `push()` live in `Instrument` base — not duplicated in subclasses
- [x] `Instrument` is abstract with `abstract getSchema()`

**Testing:**

- [x] `d.sample("bd").getSchema()` → `{ type: "sampler", bank: "tr909", sample: "bd", loop: false, ... }`
- [x] `d.sample("bd").bank("tr808").getSchema()` → `bank: "tr808"`
- [x] `d.sample("loop").fit(2).getSchema()` → `notes: { type: "fit", bars: 2 }`
- [x] `d.sample("loop").fit(2).notes([0]).getSchema()` → `notes` is a `ParameterSchema` (not FitSchema)
- [x] `d.sample("bd").root("A4").notes([0]).getSchema()` → `notes` has value `1.0`
- [x] `d.sample("bd").root("A4").notes([12]).getSchema()` → `notes` has value `2.0`
- [x] `d.sample("oh").clip(false).getSchema()` → `clipMode: "one-shot"`

---

#### Step 2.3 — Add `d.sample()` to `Drome`

**Files:** `packages/fluid/src/index.ts`

```ts
sample(nameOrToken: string, variation?: number) {
  const [sampleName, variationStr] = nameOrToken.split(":");
  const sampler = new Sampler(sampleName, { host: this });
  if (variationStr !== undefined) {
    sampler.variation(parseInt(variationStr, 10));
  } else if (variation !== undefined) {
    sampler.variation(variation);
  }
  return sampler;
}
```

Second argument is variation index only. Bank is always set via `.bank()`. `Drome._instruments` is `Set<Instrument>`, `push()` accepts `Instrument`, type assertion removed from `getSchema()`.

**Acceptance criteria:**

- [x] `d.sample("bd")` returns a `Sampler` with default bank and variation 0
- [x] `d.sample("bd:1")` sets variation to 1 via colon shorthand
- [x] `d.sample("bd", 1)` sets variation to 1 via second argument
- [x] `d.sample("bd").bank("tr808")` sets bank via chaining
- [x] `.push()` registers the sampler in Drome
- [x] `Drome._instruments` is `Set<Instrument>`, type assertion removed

**Testing:**

- [x] `d.sample("bd") instanceof Sampler`
- [x] `d.sample("bd").push()` — sampler appears in `d.getSchema().instruments`

---

### Phase 3: Engine — Sampler playback

#### Step 3.1 — Scaffold `Sampler` engine class with JIT loading

**Files:** `packages/audio-engine/src/sampler.ts` (new)

The engine `Sampler` class extends `Instrument`. It is responsible for fetching and caching `AudioBuffer` instances.

- **Constructor:** `(ctx, clock, { schema, banks, bufferCache, startingBar?, barStartTime? })`
- **`_buffer: AudioBuffer | null`** — null until loaded
- **`load(): Promise<void>`** — resolves the URL from `banks`, checks `bufferCache` before fetching. Sets `_buffer` on resolution.
- **`isReady(): boolean`** — returns `_buffer !== null`

URL resolution: `banks[schema.bank]?.samples[schema.sample]?.[variationIndex]`. No CDN logic in the engine — all URLs come from the schema.

**Acceptance criteria:**

- [x] `sampler.load()` reads the URL from `banks` and populates `_buffer`
- [x] `sampler.isReady()` returns `false` before load, `true` after
- [x] A failed fetch logs a console warning and leaves `_buffer` as null
- [x] Engine contains no hardcoded CDN URL or `CDN_BASE` constant
- [x] `_resolveDetune` moved to `Instrument` base class, accepting `detune` as a parameter

**Testing:**

- [x] Unit (mock fetch): `load()` reads the correct URL from the banks map and calls `decodeAudioData`
- [x] Unit: failed fetch logs a warning, `isReady()` remains false

---

#### Step 3.2 — `AudioEngine` integration: shared buffer cache, load-before-play, and mid-playback miss

**Files:** `packages/audio-engine/src/index.ts`, `packages/audio-engine/src/sampler.ts`, `apps/web/src/lib/client/audio.svelte.ts`, `apps/sequencer/src/App.tsx`

**Shared buffer cache:** `AudioEngine` holds `_bufferCache: Map<string, Promise<AudioBuffer | null>>` keyed by URL, persisting across commits. Passed to each `Sampler` via options. Deduplicates concurrent fetches — a second `load()` for the same URL awaits the in-flight promise.

**Load-before-play:** `AudioEngine.prepare()` creates the actual players (`_pendingPlayers`), fully loads all samplers, then stores them. `_commit()` uses `_pendingPlayers` directly when available — buffers are guaranteed ready before `scheduleBar` fires. App code calls `await engine.prepare()` before `clock.start()`.

**Mid-playback miss:** when `_commit()` fires without `_pendingPlayers` (schema updated without `prepare()`), players are created fresh and `load()` is called non-blocking. `scheduleBar` skips silently if `!isReady()` with a console warning.

**Acceptance criteria:**

- [x] `AudioEngine` holds a `_bufferCache` that persists across commits
- [x] Two samplers using the same URL share one fetch (cache hit on second)
- [x] Clock does not start until all sampler buffers are loaded
- [x] A sampler added while playing does not block other instruments
- [x] A not-yet-loaded sampler emits a console warning and produces no audio for that bar
- [x] Once loaded, the sampler plays normally from the next bar

**Testing:**

- [x] Unit: two samplers with the same URL result in one `fetch` call
- [x] Unit: buffer cache persists across `_commit()` calls — re-commit with same sampler does not re-fetch
- [x] Unit: `scheduleBar` on an unready sampler logs a warning and returns early

---

#### Step 3.3 — `scheduleBar`: per-note sample playback

**Files:** `packages/audio-engine/src/sampler.ts`

Mirrors the `Synthesizer` scheduling pattern. For each note in the resolved `ParameterSchema`, creates an `AudioBufferSourceNode` with `playbackRate` set to the resolved float value (output of `SampleNotes`), applies the gain envelope and effects chain via the shared base class methods, and schedules start/stop. `FitSchema` notes are stubbed — see Step 3.4.

**Acceptance criteria:**

- [x] A sample starts at the correct bar offset and, in default `clip` mode, stops at `startTime + duration * barDuration`
- [x] In `one-shot` mode, non-looping samples stop after their natural buffer duration adjusted by playback rate
- [x] `node.playbackRate.value` reflects the resolved note value
- [x] `node.loop` is set from `schema.loop`
- [x] Gain envelope is applied identically to the synth
- [x] Effects chain is constructed identically to the synth
- [x] Detune (static, envelope, LFO) handled via `_resolveDetune` from base class

**Testing:**

- [x] Unit (mock AudioContext): `scheduleBar` creates an `AudioBufferSourceNode` with correct `playbackRate` and scheduled start/stop times
- [x] Unit: loop flag is set correctly on the node
- [x] Unit: gain envelope ramps are scheduled at the correct timestamps
- [x] Unit: one-shot duration mode schedules stop/release from the adjusted buffer duration

---

#### Step 3.4 — `fit` resolution

**Files:** `packages/audio-engine/src/sampler.ts`

When `schema.notes.type === "fit"`:

```ts
const barDuration = this._clock.barDuration;
const playbackRate = this._buffer.duration / (schema.notes.bars * barDuration);

const node = ctx.createBufferSource();
node.buffer = this._buffer;
node.playbackRate.value = playbackRate;
node.loop = this._schema.loop;

// Duration spans N bars
const stopTime = barStartTime + schema.notes.bars * barDuration;
node.start(barStartTime);
node.stop(stopTime);
```

`fit` is only scheduled once per `bars`-bar window, not once per step.

**Acceptance criteria:**

- [x] `fit(2)` plays the sample over exactly 2 bars
- [x] Playback rate is calculated as `buffer.duration / (bars * barDuration)`
- [x] The node is stopped at `barStartTime + bars * barDuration`
- [x] `fit` is not re-triggered on every bar — only at the start of each N-bar window

**Testing:**

- [x] Unit: `fit(1)` on a 1-second buffer at 120 BPM (0.5s bar) → `playbackRate = 2.0`
- [x] Unit: `fit(2)` on a 2-second buffer at 120 BPM → `playbackRate = 1.0`
- [x] Unit: node stop time equals `barStartTime + bars * barDuration`

---

### Phase 4: Integration

#### Step 4.1 — Schema round-trip tests

**Files:** `packages/fluid/src/index.test.ts`

- [x] `d.sample("bd").getSchema()` — valid `SamplerSchema` in `instruments[]`
- [x] `d.sample("bd").bank("tr808").root("A4").notes([0, 3, 7]).getSchema()` — notes field is a ParameterSchema with float rates
- [x] `d.sample("loop").fit(2).loop(true).getSchema()` — `notes` is `FitSchema`, `loop: true`
- [x] `d.sample("oh").clip(false).getSchema()` — `clipMode: "one-shot"`
- [x] `d.sample("bd").gain(d.env(0, 1)).fx(d.lpf(800)).getSchema()` — gain and effects present
- [x] Mixed schema: synth + sampler both in `instruments[]`

---

#### Step 4.2 — Manual audio verification

Using the sequencer app:

- [x] `d.sample("bd").bank("tr808").push()` — bass drum plays on every beat
- [x] `d.sample("bd").bank("tr808").notes([0, 0, 12, 0]).root("A4").push()` — third hit is one octave up
- [x] `d.sample("breaks").bank("loops").fit(2).push()` — loop stretches to fill 2 bars
- [x] `d.sample("bd").bank("tr909").fx(d.hpf(400)).push()` — filtered drum hit
- [x] Sampler + synth playing simultaneously with no timing drift

---

## PR 2: Custom Sample Loading + Variations

Adds `d.loadSamples()`, the `"user"` reserved bank, named custom banks, variation selection, and external JSON file support.

### Phase 1: Schema

#### Step 1.1 — No schema changes required

`BankSchema` and `DromeSchema.banks` were introduced in PR 1. `SamplerSchema.variation` was also introduced in PR 1. No schema package changes are needed for PR 2 — it is purely fluid and engine work.

---

### Phase 2: Fluid

#### Step 2.1 — Add `variation()` to `Sampler` and parse shorthand forms

**Files:** `packages/fluid/src/instruments/sampler.ts`

`variation` is stored as a `Parameter` instance, defaulting to `0`.

```ts
variation(...input: CycleInput) {
  this._variation = new Parameter(...input);
  return this;
}
```

`d.sample("bd", 1)` — the second argument to `d.sample()` is a variation index only (bank is always set via `.bank()`):

```ts
// In Drome:
sample(nameOrToken: string, variation?: number) {
  const [sampleName, variationStr] = nameOrToken.split(":");
  const sampler = new Sampler(sampleName, { host: this });
  if (variationStr !== undefined) {
    sampler.variation(parseInt(variationStr, 10));
  } else if (variation !== undefined) {
    sampler.variation(variation);
  }
  return sampler;
}
```

`d.sample("bd:1")` — colon-split shorthand parsed inside `d.sample()`:

```ts
const [sampleName, variationStr] = nameOrToken.split(":");
if (variationStr !== undefined) sampler.variation(parseInt(variationStr, 10));
```

**Acceptance criteria:**

- [x] `d.sample("bd").variation(1).getSchema()` → `variation` ParameterSchema has value `1`
- [x] `d.sample("bd", 1).getSchema()` → same result as above
- [x] `d.sample("bd:1").getSchema()` → same result as above
- [x] `d.sample("bd").variation([0, 1, 2]).getSchema()` → `variation` is a cycling StaticSchema
- [x] `d.sample("bd").variation(d.rand().int().range(0, 2)).getSchema()` → `variation` is a RandomSchema
- [x] Default variation is `0`

**Testing:**

- [x] All three variation syntax forms produce identical schema output
- [x] Cycling variation schema resolves correctly
- [x] Random variation schema is a `RandomSchema`

---

#### Step 2.2 — Implement `loadSamples()` — flat format

**Files:** `packages/fluid/src/index.ts`

Flat format: `d.loadSamples({ kick: ["url1.wav", "url2.wav"] })` registers samples into the `"user"` bank.

```ts
loadSamples(input: Record<string, string[]>) {
  this._banks["user"] ??= { samples: {} };
  Object.assign(this._banks["user"].samples, input);
  return this;
}
```

**Acceptance criteria:**

- [x] `d.loadSamples({ kick: ["url.wav"] }).getSchema().banks["user"].samples.kick` equals `["url.wav"]`
- [x] Multiple calls to flat `loadSamples` merge into the `"user"` bank
- [x] `d.sample("kick").bank("user")` uses the registered sample

---

#### Step 2.3 — Implement `loadSamples()` — named bank format

**Files:** `packages/fluid/src/index.ts`

Named format: `d.loadSamples({ name: "mykit", samples: { kick: ["url.wav"] } })`.

Overload detection: if the input has a `name` string key, treat it as a named bank.

```ts
loadSamples(input: Record<string, string[]> | { name: string; samples: Record<string, string[]> }) {
  if ("name" in input && typeof input.name === "string") {
    this._banks[input.name] = { samples: input.samples };
  } else {
    this._banks["user"] ??= { samples: {} };
    Object.assign(this._banks["user"].samples, input as Record<string, string[]>);
  }
  return this;
}
```

**Acceptance criteria:**

- [x] `d.loadSamples({ name: "mykit", samples: { kick: ["url.wav"] } }).getSchema().customBanks["mykit"]` is present
- [x] Named bank does not pollute `"user"` bank
- [x] `d.sample("kick").bank("mykit")` resolves to the registered sample

---

#### Step 2.4 — Implement `loadSamples()` — external JSON file

**Files:** `packages/fluid/src/index.ts`

String argument triggers a fetch:

```ts
async loadSamples(input: string | Record<string, string[]> | { name: string; samples: Record<string, string[]> }) {
  if (typeof input === "string") {
    const res = await fetch(input);
    const json = await res.json();
    return this.loadSamples(json); // delegate to existing overloads
  }
  // ... existing logic
}
```

The fetch is awaited in fluid before the schema is emitted. The resolved data is inlined — the engine never sees a URL-to-a-manifest.

**Acceptance criteria:**

- [x] `await d.loadSamples("https://example.com/samples.json")` fetches and inlines the bank
- [x] The fetched JSON must match the named bank or flat format schema
- [x] Engine schema contains the fully resolved `customBanks` entry (no URL reference)

**Testing:**

- [x] Unit (mock fetch): `loadSamples("https://...")` calls fetch and processes the result as if it were an inline object
- [x] Unit: schema after async load matches schema from equivalent inline call

---

### Phase 3: Engine

#### Step 3.1 — Variation URL resolution

**Files:** `packages/audio-engine/src/sampler.ts`

Update `_resolveUrl()` to look up the variation index in the banks map. No CDN logic — the URL is always read from `schema.banks`:

```ts
private _resolveUrl(variationIndex: number): string {
  const bank = this._banks[this._schema.bank];
  const variations = bank?.samples[this._schema.sample];
  return variations?.[variationIndex] ?? variations?.[0];
}
```

The engine receives `banks` from the `DromeSchema` via its constructor — same map for built-in and custom banks alike.

**Acceptance criteria:**

- [x] URL is read from `banks[bank].samples[sample][variationIndex]`
- [x] Falls back to index 0 if the requested variation index is out of range
- [x] Engine contains no special-case logic for built-in vs. custom banks

---

#### Step 3.2 — Variation selection in `scheduleBar`

**Files:** `packages/audio-engine/src/sampler.ts`

Resolve the `variation` ParameterSchema per step to get the variation index. Load (and cache) the buffer for that variation:

```ts
private _buffers = new Map<number, AudioBuffer>(); // variation index → buffer

private async _loadVariation(index: number): Promise<void> {
  if (this._buffers.has(index)) return;
  const url = this._resolveUrl(index);
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  this._buffers.set(index, await this._ctx.decodeAudioData(arrayBuffer));
}
```

In `scheduleBar`, resolve the variation index per step, pick the correct buffer, and proceed with playback.

**Acceptance criteria:**

- [x] Each distinct variation index fetches and caches its own buffer
- [x] Variation 0 is pre-loaded on `load()`; others are loaded on demand
- [x] An unloaded variation causes a silent skip (same behaviour as unready sampler)
- [x] Cycling variations (`[0, 1, 2]`) each play their respective buffer

**Testing:**

- [x] Unit: cycling variation `[0, 1, 2]` results in three `_loadVariation` calls
- [x] Unit: second access to variation 0 does not re-fetch

---

### Phase 4: Integration

#### Step 4.1 — Schema round-trip tests

- [x] `d.loadSamples({ kick: ["url.wav"] }).sample("kick").bank("user").getSchema()` — `banks.user.samples.kick` present
- [x] Named bank round-trip
- [x] Variation cycling: `d.sample("bd").variation([0, 1, 2]).getSchema().variation` is a StaticSchema
- [x] Custom bank with same name as a built-in bank takes precedence in `DromeSchema.banks`

#### Step 4.2 — Manual verification

- [x] `d.loadSamples({ kick: ["url.wav"] }); d.sample("kick").bank("user").push()` — custom sample plays
- [x] `d.sample("bd:0").bank("tr808").push()` and `d.sample("bd:1").bank("tr808").push()` — audibly different variations
- [x] External JSON manifest loads and plays correctly

---

## PR 3: Multi-sampling + Audio Sprites

Extends the `CustomBankSchema` to support multi-sample maps (note → file(s)) and sprite maps (note → [start, end] in 0–1 normalized offsets).

### Phase 1: Schema

#### Step 1.1 — Widen `BankSchema.samples` value type

**Files:** `packages/schema/src/index.ts`

`BankSchema` from PR 1 had `samples: Record<string, string[]>`. Widen the value type to support multi-sample and sprite formats:

```ts
type SpriteRegion = [number, number]; // [start, end], normalized 0–1

type BankSampleValue =
  | string[] // simple variations
  | Record<string, string | string[]> // multi-sample: note name → file(s)
  | Record<string, SpriteRegion>; // sprites: note name → [start, end]

interface BankSchema {
  samples: Record<string, BankSampleValue>; // widened from string[]
}
```

**Acceptance criteria:**

- [ ] `SpriteRegion` and `BankSampleValue` are exported from `@web-audio/schema`
- [ ] `BankSchema.samples` now accepts all three value shapes
- [ ] Existing PR 1 usages (`string[]`) still type-check
- [ ] Package type-checks cleanly

---

### Phase 2: Fluid

#### Step 2.1 — Update `loadSamples()` to accept multi-sample format

**Files:** `packages/fluid/src/index.ts`

The `loadSamples` input shape already accepts `Record<string, BankSampleValue>` — no fluid logic changes needed beyond ensuring the type signatures are widened to match.

**Acceptance criteria:**

- [ ] `d.loadSamples({ piano: { A3: "a3.wav", C4: "c4.wav" } })` type-checks and round-trips in schema
- [ ] `d.loadSamples({ piano: { A3: ["a3-soft.wav", "a3-hard.wav"], C4: "c4.wav" } })` also works
- [ ] Multi-sample bank appears correctly in `banks` in the schema

---

#### Step 2.2 — Update `loadSamples()` to accept sprite format

**Files:** `packages/fluid/src/index.ts`

Same as Step 2.1 — the type widening covers sprites automatically. Verify that sprite values `[number, number]` pass through correctly.

**Acceptance criteria:**

- [ ] `d.loadSamples({ piano: { A3: [0.0, 0.25], C4: [0.25, 0.5] } })` type-checks and round-trips
- [ ] Sprite values are stored as `[number, number]` tuples in the schema (not converted)

---

### Phase 3: Engine

#### Step 3.1 — Multi-sample region selection

**Files:** `packages/audio-engine/src/sampler.ts`

When a bank sample value is `Record<string, string | string[]>`, the engine determines which region to use based on the note's playback rate:

1. Convert the playback rate back to a MIDI note offset relative to root: `midiOffset = root + 12 * log2(rate)`
2. Find the nearest defined pitch in the multi-sample map
3. Compute the adjusted playback rate relative to the nearest pitch: `rate / nearestPitchRate`
4. Load and play the file for that pitch region

**Acceptance criteria:**

- [ ] A note at A3 with an A3 multi-sample region plays at rate 1.0
- [ ] A note between A3 and C4 uses the nearest region and adjusts the rate accordingly
- [ ] Missing regions fall back to the nearest available pitch

**Testing:**

- [ ] Unit: note at A4 with regions at A3 and C4 selects A3 region, rate ~2.0

---

#### Step 3.2 — Sprite offset handling

**Files:** `packages/audio-engine/src/sampler.ts`

When a bank sample value is `Record<string, SpriteRegion>`, the sprite file is loaded once (shared buffer). Per note:

```ts
const [start, end] = spriteRegion;
node.buffer = this._spriteBuffer;
node.playbackRate.value = noteRate;
node.offset = start * buffer.duration; // AudioBufferSourceNode takes seconds
const regionDuration = (end - start) * buffer.duration;
node.start(startTime);
node.stop(startTime + regionDuration);
```

**Acceptance criteria:**

- [ ] Sprite file is fetched once and reused across all region playbacks
- [ ] `node.offset` is correctly set in seconds from the 0–1 normalized value
- [ ] Node is stopped at `startTime + regionDuration`
- [ ] Multiple sprite regions from the same file play the correct section

**Testing:**

- [ ] Unit: sprite `[0.0, 0.25]` on a 4-second buffer → `offset = 0s`, stop at `+1s`
- [ ] Unit: sprite `[0.5, 0.75]` on a 4-second buffer → `offset = 2s`, stop at `+3s`

---

### Phase 4: Integration

#### Step 4.1 — Schema round-trip tests

- [ ] Multi-sample bank schema round-trip with and without per-region variations
- [ ] Sprite bank schema round-trip

#### Step 4.2 — Manual verification

- [ ] Multi-sample piano keyboard plays chromatically with correct pitch
- [ ] Sprite drum kit plays correct regions for each sample name
- [ ] Sprite file loads once (network tab shows single request)

---

## PR 4: Start/End + Sample Chopping

Adds per-note playback region control (`.start()`, `.end()`) and slice-based chopping (`.chop()`).

### Phase 1: Schema

#### Step 1.1 — Add region types to `SamplerSchema`

**Files:** `packages/schema/src/index.ts`

```ts
interface StaticRegionSchema {
  type: "static";
  start: ParameterSchema;
  end: ParameterSchema;
}

interface ChopSlice {
  start: number; // normalized 0–1
  end: number; // normalized 0–1
}

interface ChopRegionSchema {
  type: "chop";
  slices: ChopSlice[]; // pre-computed by fluid, in playback order
  sequence: ParameterSchema; // index into slices[], resolved per step
}

type RegionSchema = StaticRegionSchema | ChopRegionSchema;
```

Update `SamplerSchema`:

```ts
interface SamplerSchema {
  // ... existing fields
  region: RegionSchema | null;
}
```

**Acceptance criteria:**

- [ ] `RegionSchema`, `StaticRegionSchema`, `ChopRegionSchema`, `ChopSlice` are exported
- [ ] `SamplerSchema.region` defaults to `null`
- [ ] Package type-checks cleanly

---

### Phase 2: Fluid

#### Step 2.1 — Add `.start()` and `.end()` to `Sampler`

**Files:** `packages/fluid/src/instruments/sampler.ts`

```ts
private _start: Parameter | null = null;
private _end: Parameter | null = null;

start(...input: CycleInput) {
  this._start = new Parameter(...input);
  return this;
}

end(...input: CycleInput) {
  this._end = new Parameter(...input);
  return this;
}
```

In `getSchema()`, if either `_start` or `_end` is set (and `_chop` is null):

```ts
region: (this._start || this._end) && !this._chop
  ? {
      type: "static",
      start: (this._start ?? new Parameter(0)).getSchema(),
      end: (this._end ?? new Parameter(1)).getSchema(),
    }
  : this._chopRegion ?? null,
```

**Acceptance criteria:**

- [ ] `d.sample("bd").start(0.5).getSchema().region` → `{ type: "static", start: ..., end: { value: 1.0 } }`
- [ ] `d.sample("bd").end(0.75).getSchema().region` → `{ type: "static", start: { value: 0.0 }, end: ... }`
- [ ] `start` and `end` accept `ParameterSchema` (static, cycling, random)
- [ ] `.start(0).end(1)` on a sample with no chop produces `type: "static"` region

**Testing:**

- [ ] Unit: `start(0.25)` → region start value is `0.25`
- [ ] Unit: `end(0.75)` with no explicit start → start defaults to `0.0`
- [ ] Unit: automating start with a cycle: `start([0, 0.25, 0.5])` → StaticSchema cycling values

---

#### Step 2.2 — Add `.chop()` to `Sampler`

**Files:** `packages/fluid/src/instruments/sampler.ts`

`chop(slices, sequence)` resolves slice boundaries at fluid time, composing with `_start` / `_end` if set:

```ts
chop(sliceCount: number, ...sequence: CycleInput | [RandomCycle]) {
  const regionStart = this._start ? /* resolve static value */ : 0;
  const regionEnd = this._end ? /* resolve static value */ : 1;
  const sliceSize = (regionEnd - regionStart) / sliceCount;

  const slices: ChopSlice[] = Array.from({ length: sliceCount }, (_, i) => ({
    start: regionStart + i * sliceSize,
    end: regionStart + (i + 1) * sliceSize,
  }));

  this._chopRegion = {
    type: "chop",
    slices,
    sequence: new Parameter(...sequence).getSchema(),
  };
  return this;
}
```

Note: `start()` / `end()` values must be static (non-cycling) when used with `chop` — fluid throws if they are not. The slice boundaries are computed once from the static values.

**Acceptance criteria:**

- [ ] `d.sample("loop").chop(4, [0, 2, 1, 3]).getSchema().region` → `{ type: "chop", slices: [{start:0, end:0.25}, {start:0.5, end:0.75}, {start:0.25, end:0.5}, {start:0.75, end:1.0}], sequence: StaticSchema }`
- [ ] `d.sample("loop").start(0.25).end(0.75).chop(4, [0,1,2,3]).getSchema().region` → slices bounded within `[0.25, 0.75]`
- [ ] `d.sample("loop").chop(4, d.rand().int().range(0, 3)).getSchema().region.sequence` → RandomSchema
- [ ] Calling `chop` overrides any standalone `start`/`end` region in the schema
- [ ] Fluid throws if `start` or `end` is a cycling/random value when used with `chop`

**Testing:**

- [ ] Unit: `chop(4, [0,1,2,3])` → 4 equal slices from 0 to 1
- [ ] Unit: `start(0.5).chop(2, [0,1])` → 2 slices within `[0.5, 1.0]`: `[0.5, 0.75]` and `[0.75, 1.0]`
- [ ] Unit: `chop(4, d.rand().int().range(0, 3))` → `sequence` is a `RandomSchema`
- [ ] Unit: slice order matches the provided sequence `[0, 2, 1, 3]`

---

### Phase 3: Engine

#### Step 3.1 — `StaticRegionSchema` playback

**Files:** `packages/audio-engine/src/sampler.ts`

When `region.type === "static"`, resolve `start` and `end` per step and apply to the node:

```ts
const start = this._resolve(region.start, barIndex, stepIndex); // 0–1
const end = this._resolve(region.end, barIndex, stepIndex); // 0–1

node.offset = start * buffer.duration;
const regionDuration = (end - start) * buffer.duration;
node.start(startTime);
node.stop(startTime + regionDuration);
```

Note duration from the step is ignored when a region is present — the region boundaries determine playback length.

**Acceptance criteria:**

- [ ] `start(0.25).end(0.75)` plays the middle 50% of the buffer
- [ ] Automating `start` with a cycle changes the start point per step
- [ ] Region duration is correctly calculated from buffer length

**Testing:**

- [ ] Unit: `start(0.5).end(1.0)` on a 2s buffer → `node.offset = 1.0s`, stop at `+1.0s`

---

#### Step 3.2 — `ChopRegionSchema` playback

**Files:** `packages/audio-engine/src/sampler.ts`

When `region.type === "chop"`, resolve the `sequence` ParameterSchema per step to get a slice index, then look up the pre-computed `ChopSlice`:

```ts
const sliceIndex = Math.floor(
  this._resolve(region.sequence, barIndex, stepIndex),
);
const slice = region.slices[Math.min(sliceIndex, region.slices.length - 1)];

node.offset = slice.start * buffer.duration;
const regionDuration = (slice.end - slice.start) * buffer.duration;
node.start(startTime);
node.stop(startTime + regionDuration);
```

**Acceptance criteria:**

- [ ] Slice index is clamped to `[0, slices.length - 1]`
- [ ] Each step plays the correct slice in the pre-computed order
- [ ] Random sequence plays a different slice per step according to the resolved RandomSchema
- [ ] `chop` and `notes` (playback rate) compose correctly — pitch and slice are independent

**Testing:**

- [ ] Unit: sequence `[0, 2, 1, 3]` on a 4-slice chop plays in correct order
- [ ] Unit: out-of-range slice index is clamped
- [ ] Unit: random sequence resolves different slice indices per step

---

### Phase 4: Integration

#### Step 4.1 — Schema round-trip tests

- [ ] `start(0.25).end(0.75)` schema round-trip
- [ ] `chop(4, [0,2,1,3])` schema round-trip — slices pre-computed correctly
- [ ] `start(0.25).end(0.75).chop(4, [0,1,2,3])` — slices bounded within the window
- [ ] `chop(4, d.rand().int().range(0, 3))` — sequence is a RandomSchema

#### Step 4.2 — Manual verification

- [ ] `d.sample("loop").start(0.5).push()` — plays second half of loop
- [ ] `d.sample("loop").chop(4, [0,2,1,3]).push()` — audibly rearranged slices
- [ ] `d.sample("loop").chop(4, d.rand().int().range(0,3)).push()` — random slice each step
- [ ] `d.sample("loop").chop(4, [0,1,2,3]).notes([0, 12]).root("A4").push()` — chopped loop, alternating octaves

---

## File Change Summary

| File                                           | Change                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/schema/src/index.ts`                 | PR1: Add `FitSchema`, `SamplerSchema`, `BankDefinition`, `BankSchema`, `InstrumentSchema` base; update `DromeSchema`. PR3: Add `BankSampleValue`, `SpriteRegion`; widen `BankSchema`. PR4: Add `RegionSchema`, `StaticRegionSchema`, `ChopRegionSchema`, `ChopSlice` |
| `packages/fluid/src/banks/tr808.ts`            | New — TR-808 `BankDefinition`                                                                                                                                                                                                                                        |
| `packages/fluid/src/banks/tr909.ts`            | New — TR-909 `BankDefinition`                                                                                                                                                                                                                                        |
| `packages/fluid/src/banks/index.ts`            | New — `BUILT_IN_BANKS` map and `DEFAULT_BANK` export                                                                                                                                                                                                                 |
| `packages/fluid/src/patterns/midi-notes.ts`    | Renamed from `notes.ts` — `MidiNotes` class                                                                                                                                                                                                                          |
| `packages/fluid/src/patterns/sample-notes.ts`  | New — `SampleNotes extends MidiNotes`, outputs playback rates                                                                                                                                                                                                        |
| `packages/fluid/src/instruments/instrument.ts` | Made abstract; `_host`/`push()` moved here from subclasses                                                                                                                                                                                                           |
| `packages/fluid/src/instruments/sampler.ts`    | New — `Sampler` builder class; extended across PRs for variation, loadSamples, region, chop                                                                                                                                                                          |
| `packages/fluid/src/index.ts`                  | Add `d.sample()`, `d.loadSamples()`; update `getSchema()` to inline bank manifests                                                                                                                                                                                   |
| `packages/audio-engine/src/instrument.ts`      | `_initLfos` widened to `InstrumentSchema`; `_resolveDetune` moved here from `Synthesizer`                                                                                                                                                                            |
| `packages/audio-engine/src/synthesizer.ts`     | `_schema` made `protected`; `_resolveDetune` removed (now in base)                                                                                                                                                                                                   |
| `packages/audio-engine/src/sampler.ts`         | New — engine `Sampler` class with JIT loading, `AudioBufferSourceNode` scheduling, fit resolution                                                                                                                                                                    |
| `packages/audio-engine/src/index.ts`           | `prepare()` method for pre-loading; `_cache` for buffer deduplication; `_pendingPlayers` removed                                                                                                                                                                     |
| `apps/web/src/lib/client/audio.svelte.ts`      | Added `await engine.prepare()` before `clock.start()`                                                                                                                                                                                                                |
| `apps/sequencer/src/App.tsx`                   | Added `await engine.prepare()` before `clock.start()`                                                                                                                                                                                                                |

## Verification (all PRs)

After each PR:

1. `pnpm --filter @web-audio/schema exec tsc --noEmit` — schema types clean
2. `pnpm --filter @web-audio/fluid exec vitest run` — fluid tests pass
3. `pnpm --filter @web-audio/audio-engine exec vitest run` — engine tests pass
4. Manual demo in the sequencer app
