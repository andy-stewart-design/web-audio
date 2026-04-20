# Effects & Filter Design Plan

## Core Principle

Effects are added via the `fx()` method on instruments. The fluid layer builds fully specified effect schemas; the engine executes them. Per the existing principle: fluid is smart (resolves defaults), engine is dumb (never applies defaults).

## Effects API Design Summary:

- Entry point: fx() method on the instrument, accepts variadic effects, repeated calls accumulate
- Filter builder: d.filter(type, ...frequency) with chainable .q(), .detune(), .gain()
- Aliases on Drome: d.lpf(), d.hpf(), d.bpf() — sugar for d.filter("lp/hp/bp", ...)
- Filter types: lp, hp, bp, notch, ap, pk, ls, hs
- All params accept: static number, cycle, RandomCycle, or Envelope
- Frequency is required, Q defaults to 1, detune to 0, gain to 0
- Schema: FilterSchema with EffectSchema alias, effects: EffectSchema[] on SynthesizerSchema
- Architecture: per-note by default, engine can optimize static params to shared nodes later
- Signal path: Osc → Per-note GainNode (ADSR) → Per-note FX → Per-instrument Output GainNode (baseGain) → destination
- Output GainNode: per-instrument, set to internal baseGain constant (0.25)
- Envelope handling: reuse \_resolveEnvelope + normalizeADSR for any envelope target
- Sequencing: implement after envelope plan is complete
- File structure: packages/fluid/src/effects/filter.ts, schema in packages/schema/src/index.ts

## User API

### Filter builder

```js
d.synth().fx(d.filter("lp", 800).q(2)).push();
```

- First arg: filter type (required)
- Second arg: frequency (required) — accepts static number, cycle, RandomCycle, or Envelope
- `.q()` — Q factor (default: 1)
- `.detune()` — detune in cents (default: 0)
- `.gain()` — gain in dB for shelf/peaking types (default: 0)

All chainable methods accept: static number, cycle, RandomCycle, or Envelope.

### Aliases on Drome

```js
d.lpf(800).q(2); // same as d.filter("lp", 800).q(2)
d.hpf(2400); // same as d.filter("hp", 2400)
d.bpf(1000); // same as d.filter("bp", 1000)
```

Aliases only set the type and frequency. Q/detune/gain are always chained.

### Multiple effects

```js
// Variadic — order = signal chain order
d.synth().fx(d.lpf(800), d.hpf(200)).push();

// Repeated calls accumulate (append)
d.synth().fx(d.lpf(800)).fx(d.hpf(200)).push();
```

### Envelope on filter params

```js
const env = d.env(200, 4000).adsr(0.3, 0.2, 0.5, 0.1);
d.synth().fx(d.filter("lp", env).q(2)).push();
// Frequency sweeps from 200Hz to 4000Hz during attack, decays to sustain level, releases back to 200Hz
```

## Filter Types

| Abbreviation | Web Audio BiquadFilterType |
| ------------ | -------------------------- |
| `lp`         | lowpass                    |
| `hp`         | highpass                   |
| `bp`         | bandpass                   |
| `notch`      | notch                      |
| `ap`         | allpass                    |
| `pk`         | peaking                    |
| `ls`         | lowshelf                   |
| `hs`         | highshelf                  |

The schema stores the abbreviation. The engine maps to the full Web Audio string.

## Schema Types

Added to `@web-audio/schema`:

```ts
type FilterType = "lp" | "hp" | "bp" | "notch" | "ap" | "pk" | "ls" | "hs";

interface FilterSchema {
  type: "filter";
  filterType: FilterType;
  frequency: ParameterSchema | EnvelopeSchema;
  q: ParameterSchema | EnvelopeSchema;
  detune: ParameterSchema | EnvelopeSchema;
  gain: ParameterSchema | EnvelopeSchema;
}

type EffectSchema = FilterSchema;
```

Updated `SynthesizerSchema`:

```ts
interface SynthesizerSchema {
  type: "synthesizer";
  waveform: Waveform;
  notes: ParameterSchema;
  detune: ParameterSchema | EnvelopeSchema;
  gain: EnvelopeSchema;
  effects: EffectSchema[];
}
```

- `effects` is an ordered array — order represents signal chain order
- Empty array means no effects
- `EffectSchema` is an alias that will widen as more effect types are added (delay, reverb, etc.)

## Default Values

- **frequency:** required (no default)
- **Q:** 1 (Web Audio spec default, neutral resonance)
- **detune:** 0 (no detuning)
- **gain:** 0 (no boost/cut — only relevant for peaking/shelf types)

## Signal Path Architecture

```
Per-note:        Osc -> GainNode (ADSR envelope) -> BiquadFilter(s)
                                                         |
Per-instrument:                              Output GainNode (baseGain) -> ctx.destination
```

- **Per-note effects:** each note creates its own filter node(s). Params resolved per bar/step. Nodes are created and garbage collected with each note.
- **Per-instrument output node:** a GainNode set to the internal `baseGain` constant (0.25). Replaces the current approach of multiplying baseGain into per-note gain values.
- **Future optimization:** the engine may detect fully static effect params and route to a shared node instead of per-note. This is an engine-internal optimization — no API change needed.

## Envelope Handling

Filter envelopes use the same `_resolveEnvelope` helper built for gain envelopes. The engine checks `param.type === "envelope"`:

- If envelope: resolve all fields via `_resolveEnvelope`, apply `normalizeADSR`, schedule ADSR ramps on the target AudioParam
- If parameter: resolve to a static number via `_resolve`, set value once at note start

Normalization (bleed/clip modes) applies identically to filter envelopes — the ADSR shape is always relative to note duration regardless of target param.

Engine clamps computed A and R to a minimum of 5ms absolute to prevent artifacts.

## File Structure

```
packages/schema/src/index.ts              — FilterType, FilterSchema, EffectSchema, updated SynthesizerSchema
packages/fluid/src/effects/filter.ts      — Filter builder class
packages/fluid/src/index.ts               — d.filter(), d.lpf(), d.hpf(), d.bpf() methods
packages/audio-engine/src/synthesizer-player.ts — effect chain wiring, per-instrument output node
```

## Implementation Phases

### Phase 1: Schema

- Add `FilterType`, `FilterSchema`, `EffectSchema` to `@web-audio/schema`
- Add `effects: EffectSchema[]` to `SynthesizerSchema`

### Phase 2: Fluid — Filter builder

- Implement `Filter` class in `packages/fluid/src/effects/filter.ts`
  - Constructor: `(type: FilterType, ...frequency: CycleInput | [Envelope])`
  - Fields: `_filterType`, `_frequency`, `_q`, `_detune`, `_gain` (each `Parameter | Envelope`)
  - Chainable setters: `.q()`, `.detune()`, `.gain()`
  - `.getSchema(): FilterSchema`
- Add `d.filter()`, `d.lpf()`, `d.hpf()`, `d.bpf()` to Drome
- Add `.fx()` to Instrument — variadic, accumulates into `_effects: Filter[]`
- Update `Synthesizer.getSchema()` to include `effects` array

### Phase 3: Engine — effects chain wiring

- Add per-instrument output GainNode (set to baseGain)
- Update `_scheduleNote` to:
  1. Create oscillator + per-note gain node (envelope) as before
  2. For each effect in `schema.effects`, create BiquadFilterNode, resolve params
  3. Connect chain: gain -> effect1 -> effect2 -> ... -> output node
- Handle envelope params on filter via existing `_resolveEnvelope` + `normalizeADSR`
- Map filter type abbreviations to Web Audio BiquadFilterType strings

### Phase 4: Tests & cleanup

- Unit tests for Filter builder (schema output for various configs)
- Integration tests for full schema snapshots with effects
- Manual audio verification of filter behavior

## Prerequisites

- Gain & envelope plan (all phases) must be complete before engine work begins
- Schema and fluid phases can be built independently once envelope plan lands
