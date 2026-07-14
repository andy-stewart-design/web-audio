# Codebase Handoff

A practical guide for anyone picking up this project. Covers architecture, established patterns, non-obvious decisions, and current work in progress.

---

## Project Overview

A live-coding audio sequencer built on the Web Audio API. Users write JavaScript in a REPL to compose music; the system evaluates, builds a schema, and drives audio playback in real time.

**Key constraint:** this is a live-coding environment. The user can re-evaluate code at any point during playback. The system must handle this gracefully without stopping the clock or causing glitches.

---

## Monorepo Structure

```
packages/
  schema          — TypeScript types only. No logic. Source of truth for all data shapes.
  patterns        — ChordCycle, RandomCycle, ValueCycle etc. Pattern generation.
  fluid           — The authoring API. Builder pattern / fluent interface.
  audio-engine    — Web Audio playback. Consumes schemas, schedules nodes.
  worklets        — AudioWorkletProcessor implementations (currently: LFO).
  clock           — BPM-synced AudioClock.
  context         — AudioContext creation helpers.

apps/
  web             — Main Svelte app. The thing users actually use.
  sequencer       — Simpler React app for development/testing.
  atproto         — Social/sharing integration.
  audio-trimmer   — Standalone utility app.
```

---

## The Most Important Principle: Fluid-Smart, Engine-Dumb

**Fluid resolves all values. The engine never applies defaults.**

The `@web-audio/fluid` package produces a fully-specified `DromeSchema`. Every value in that schema is resolved to a concrete type — no optional fields, no engine-side fallback logic. The engine is a dumb executor: it reads the schema and schedules audio nodes.

**The one exception:** `FitSchema` (`{ type: "fit", bars: number }`) in `SamplerSchema.notes`. Fit requires knowing the sample's buffer duration, which only exists after the audio file loads. The engine computes the playback rate post-load: `buffer.duration / (bars * barDuration)`. This is the only case where the engine does any computation beyond reading schema values.

If you find yourself adding engine-side default logic, stop and put it in fluid instead.

---

## Data Flow: API Call to Audio

```
User code (REPL)
  ↓  d.synth().notes([0,4,7]).push()
Fluid builder classes
  ↓  d.getSchema() → DromeSchema
AudioEngine.update(schema)
  ↓  stored as _pending
prebar event → _commit()
  ↓  creates Synthesizer/Sampler player instances
bar event → scheduleBar(barIndex, barStartTime)
  ↓  creates AudioNodes, schedules start/stop
Web Audio API
```

---

## Schema Package

The types are organised into sections (see `packages/schema/src/index.ts`):

- **PRIMITIVES** — `Waveform`, `EnvelopeMode`, `FilterType`
- **SEQUENCING** — `StaticSchema`, `RandomSchema`, `ParameterSchema`, `FitSchema`
- **SAMPLING** — `BankDefinition`, `BankSchema`
- **AUTOMATIONS** — `EnvelopeSchema`, `LfoSchema`
- **EFFECTS** — `FilterSchema`, `GainEffectSchema`, `EffectSchema`
- **INSTRUMENTS** — `InstrumentSchema` (base), `SynthesizerSchema`, `SamplerSchema`
- **DROME** — `DromeSchema`

**`InstrumentSchema` is a base interface, not a union.** `SynthesizerSchema` and `SamplerSchema` both extend it. The union used in `DromeSchema.instruments` is inline: `(SynthesizerSchema | SamplerSchema)[]`. Don't add a named union type — it creates confusion with the base interface.

**`BankDefinition` vs `BankSchema`:** Two distinct types for sample bank data.
- `BankDefinition` — authoring format: `{ basePath: string, samples: Record<string, string[]> }`. Used in bank files and by `d.loadSamples()`.
- `BankSchema` — schema format: `{ samples: Record<string, string[]> }` with full URLs. What lives in `DromeSchema.banks`.

Fluid converts `BankDefinition → BankSchema` by prepending `basePath` to each relative path in `Drome.getSchema()`.

---

## Fluid Package

### Entry Point

`Drome` is the user-facing class. `d.synth()`, `d.sample()`, `d.lfo()`, etc. all live here.

### Instruments

Both instruments share a common abstract base:

```
Instrument (abstract)           — _host, push(), notes(), root(), scale(),
│                                 detune(), gain(), fx(), euclid(), hex(), etc.
├── Synthesizer                 — adds type() (waveform), getSchema()
└── Sampler                     — adds bank(), variation(), fit(), loop(), getSchema()
```

`_host` (reference to `Drome`) and `push()` live in `Instrument`. Subclasses pass `host` to `super()`.

### Notes Resolution

**MidiNotes** (`packages/fluid/src/patterns/midi-notes.ts`) — the core note pattern class. Handles scale degree resolution, euclid, hex, xox, etc. Outputs MIDI integer values.

**SampleNotes** (`packages/fluid/src/patterns/sample-notes.ts`) — extends `MidiNotes`. Overrides `getSchema()` to remap MIDI values to playback rate floats: `2^((midi - root) / 12)`. Default root is A4 (MIDI 69).

Critical detail: `SampleNotes` uses `[0]` as the default pattern (not `[69]`) and sets the parent's root to A4 in its constructor. This means `notes([0])` with no explicit root gives playback rate `1.0` (natural pitch). `notes([12])` gives rate `2.0` (one octave up).

### Built-in Banks

```
packages/fluid/src/banks/
  index.ts    — exports BUILT_IN_BANKS and DEFAULT_BANK ("tr909")
  tr808.ts    — TR-808 BankDefinition (GitHub raw CDN)
  tr909.ts    — TR-909 BankDefinition (ritchse/tidal-drum-machines)
```

Each file uses `satisfies BankDefinition` for type-checking. The `DEFAULT_BANK` is `"tr909"`.

`Drome.getSchema()` only includes banks that are actually referenced by instruments in the current schema. Unreferenced banks are not emitted.

---

## Audio Engine Package

### Player Lifecycle

```
AudioEngine._commit(upcomingBar, barStartTime)
  → Retires current players (they finish their scheduled audio, then clean up)
  → Creates new Synthesizer/Sampler players with correct startingBar + barStartTime
  → Sampler players call load() immediately (hits resolved cache if prepare() ran)

AudioEngine.prepare()
  → Pre-loads all sampler buffers into _cache
  → MUST be awaited before clock.start() on first play
  → MUST be awaited on re-evaluation (even if clock is already running)
```

### The `prepare()` Method — Critical

```ts
engine.update(schema);
await engine.prepare();   // ← do not skip this
await clock.start();      // or, if already running, _commit() fires at next prebar
```

`prepare()` pre-loads sampler buffers into a two-level cache. `_commit()` then creates players — their `load()` calls hit the `resolved` map synchronously, so `_buffer` is set before `scheduleBar` fires.

**Why two levels?** The `promises` map deduplicates concurrent fetches (two instruments using the same URL make one network request). The `resolved` map allows synchronous buffer access in `_commit()` — awaiting a resolved Promise still yields to the microtask queue, which is too late.

**Why not `_pendingPlayers`?** An earlier approach pre-created players in `prepare()` and reused them in `_commit()`. This was simpler-looking but broke LFO sync: players created without the correct `startingBar`/`barStartTime` get wrong LFO seed phases. The two-level cache + synchronous access is the correct solution.

`prepare()` is wired up in:
- `apps/web/src/lib/client/audio.svelte.ts`
- `apps/sequencer/src/App.tsx`

If you add another app entry point, you MUST add `await engine.prepare()` there too.

### LFO Sync and Seed Phase

LFO nodes are created in `_initLfos()` during `_commit()` (triggered by `prebar`). The seed phase calculation compensates for the lead time between node creation and barStartTime:

```ts
const preAdvance = (barStartTime - ctx.currentTime) * speed / barDuration;
const seedPhase = ((basePhase - preAdvance) % 1.0 + 1.0) % 1.0;
```

This is why `_commit()` MUST receive the correct `startingBar` and `barStartTime`. Do not create players in `prepare()` — it only pre-loads buffers.

### Shared Engine Base Class

`packages/audio-engine/src/instrument.ts` contains all shared playback logic:
- `_resolve(schema, barIndex, stepIndex)` — universal value resolution
- `_resolveDetune(detune, barIndex, stepIndex)` — moved here from Synthesizer; both Synth and Sampler use it
- `_connectLfoOrSchedule()` — handles LFO/envelope/static on any AudioParam
- `_scheduleParamEnvelope()` — ADSR scheduling
- `_buildEffectNode()` — filter + gain effect construction
- `_track()` / `cancelFutureNotes()` — node lifecycle management
- `_initLfos()` — accepts `InstrumentSchema` (widened from `SynthesizerSchema` to support Sampler)

---

## Sampler Implementation (Branch: sampler/core)

### What's Done (PR 1)

- Schema types: `FitSchema`, `SamplerSchema`, `BankDefinition`, `BankSchema`
- Fluid: `SampleNotes`, `Sampler`, `d.sample()`, `Drome.getSchema()` bank resolution
- Engine: `Sampler` class with JIT loading, per-note playback, fit resolution
- Both apps wired with `prepare()`

### What's Not Done Yet

- PR 2: Custom sample loading (`d.loadSamples()`), variation selection
- PR 3: Multi-sampling, audio sprites
- PR 4: `.start()`, `.end()`, `.chop()`
- Unit tests for the engine Sampler (Phase 4, Step 4.1)
- Some manual verification items in Phase 4, Step 4.2

Full plan: `plans/sampler-plan.md`

### Sampler-Specific Patterns

**URL resolution:** `banks[bank].samples[sample][variationIndex]`. The engine reads URLs from `DromeSchema.banks` — no CDN logic in the engine.

**Fit triggering:** `if (barIndex % notes.bars !== 0) return` — fit fires once at the start of each N-bar window.

**Playback rate:** `SampleNotes` outputs floats, not MIDI integers. `note.value = 1.0` is natural pitch, `2.0` is one octave up. The engine sets `node.playbackRate.value = note.value` directly.

---

## Known Issues / Gotchas

### LFO on Detune vs Filter

There is a pre-existing (before this branch) perceptual difference: an LFO on `detune` can sound slightly "glitchy" at bar start compared to the same LFO on a filter frequency. This is not a regression. The cause is that pitch changes (detune in cents) are far more perceptible than filter frequency changes at the same LFO magnitude. The LFO slew limiter causes a brief (~5.8ms) transient at the sawtooth phase wrap, which is noticeable on detune but masked on filter. This is a known issue left for investigation in a future PR.

### `_prevOutput = 0` in LFO Processor

The LFO worklet initialises `_prevOutput` to `0`, not to the waveform value at the seed phase. This means there is a brief slew catch-up on the very first bar. For most waveforms this is inaudible; for large detune ranges it can be perceived as a slight pitch glitch on the first note only.

### Re-evaluation Mid-Bar

When the user re-evaluates code, `_commit()` fires at the next `prebar`. Samplers that were pre-loaded in `prepare()` will have their buffers in the cache and load synchronously. New samplers added mid-playback will load asynchronously and skip bars until ready (console warning emitted).

### `SynthesizerSchema.notes` vs `SamplerSchema.notes`

These have different types:
- `SynthesizerSchema.notes: ParameterSchema` — MIDI integer values (engine converts to frequency)
- `SamplerSchema.notes: ParameterSchema | FitSchema` — playback rate floats (engine uses directly) OR fit instruction

Don't confuse them. The engine handles them differently.

---

## Established Patterns

### Parameter Resolution

Every value in the system that can be automated follows this chain:

```
User: d.synth().notes([0, 3, 5]).root("C4")
  ↓
Fluid: ChordCycle → degreeToMidi → StaticSchema (MIDI integers)
  ↓ getSchema()
ParameterSchema (StaticSchema or RandomSchema)
  ↓
Engine: _resolve(schema, barIndex, stepIndex) → number
  ↓
AudioNode parameter
```

### Effect Chain Pattern

Effects are always an array of `EffectSchema` on the instrument. In the engine, each is built per-note via `_buildEffectNode()` and chained:

```ts
source.connect(gain);
const chain = [gain, ...effectNodes];
chain.reduce((src, dst) => { src.connect(dst); return dst; });
chain[chain.length - 1].connect(this._outputNode);
```

### Extending Instruments

To add a new instrument type:
1. Add its schema to `@web-audio/schema` (extending `InstrumentSchema`)
2. Add a fluid builder class extending `Instrument` (fluid package)
3. Add an engine class extending `Instrument` (audio-engine package)
4. Update `AudioEngine._commit()` to instantiate it
5. Update `AudioEngine.prepare()` if it needs pre-loading
6. Add `d.instrumentName()` to `Drome`

Follow the Sampler as the reference implementation.

### Random Values

`RandomCycle` in `@web-audio/patterns` generates seeded pseudo-random sequences. In the engine, each `RandomSchema` gets a `RandomResolver` instance keyed by the schema object reference. This ensures the same schema object always produces the same sequence, across multiple instruments or re-evaluations.

### Test Helpers

Protected engine methods are exposed for testing by creating a subclass in the test file:

```ts
class TestSynthesizer extends Synthesizer {
  resolveDetune(detune, barIndex, stepIndex) {
    return this._resolveDetune(detune, barIndex, stepIndex);
  }
}
```

---

## Running the Project

```bash
pnpm install

# Type-check all packages
pnpm --filter @web-audio/schema exec tsc --noEmit
pnpm --filter @web-audio/fluid exec tsc --noEmit
pnpm --filter @web-audio/audio-engine exec tsc --noEmit

# Run tests
pnpm --filter @web-audio/worklets exec vitest run
pnpm --filter @web-audio/fluid exec vitest run
pnpm --filter @web-audio/audio-engine exec vitest run

# Dev server (main app)
cd apps/web && pnpm dev
```
