# PRD: Low Frequency Oscillators (LFOs)

## Problem Statement

Users currently have envelopes as their only automation tool for modulating audio parameters over time. Envelopes are note-scoped — they define a shape (ADSR) that plays out over the lifetime of a single note. There is no way to create continuous, rhythmic modulation that persists across notes — effects like filter sweeps, tremolo, and vibrato that are fundamental to electronic music production. Users need a BPM-synced, free-running oscillator that can be applied to any automatable parameter.

## Solution

Introduce a Low Frequency Oscillator (LFO) class as a new automation type alongside envelopes. An LFO produces a continuous waveform synced to the current BPM, modulating any parameter that currently accepts an envelope. The LFO is free-running — its phase is determined by absolute position in the timeline, not by individual note triggers.

### User-Facing API

```ts
// Basic: sine LFO, 1 period per bar, oscillates between 400 and 1200
d.lfo(800, 400);

// Full API
d.lfo(400, 800)
  .speed(0.5) // 1 period every 2 bars
  .wave("sawtooth") // sine, triangle, square, sawtooth
  .norm() // interpret args as min/max instead of baseline/offset
  .offset(0.5); // phase offset (0–1)

// Cycling speed and waveform per period (independent cycling)
d.lfo(800, 400)
  .speed(2, 1) // alternates: 2 periods/bar, then 1 period/bar
  .wave("sine", "sawtooth", "triangle"); // cycles through waveforms each period

// Applied to a filter
d.synth("sine")
  .notes("C4", "E4")
  .fx(d.lpf(d.lfo(400, 1200).norm().wave("triangle")));

// Tremolo via gain effect
d.synth("sine")
  .notes("C4")
  .fx(d.gain(d.lfo(0, 1).norm().speed(4)));

// Cycling values per bar
d.lfo([600, 800, 1000], 400);

// Random baseline per bar
d.lfo(d.rand(600, 1000), 400);
```

### Output Formula

```
output = outputA + outputB * oscillator_value
```

Where `oscillator_value` is `-1 to 1` (default) or `0 to 1` (when `.norm()` is applied).

| Mode       | Args                     | Output Range                       |
| ---------- | ------------------------ | ---------------------------------- |
| Default    | `d.lfo(800, 400)`        | 800 + 400 \* [-1, 1] = [400, 1200] |
| Normalized | `d.lfo(400, 800).norm()` | 400 + 800 \* [0, 1] = [400, 1200]  |

---

## Implementation Decisions

### Modules

Three packages are affected:

1. **`@web-audio/schema`** — Add `LfoSchema` type, update parameter union types
2. **`@web-audio/fluid`** — Add `Lfo` builder class at `src/automations/lfo.ts`, update parameter acceptance on `Instrument` and `Filter`
3. **`@web-audio/audio-engine`** — Handle LFO node creation, lifecycle, and connection to per-note parameters
4. **`@web-audio/worklets`** (new package) — AudioWorklet processor for LFO waveform generation

### Schema Changes

New `LfoSchema` interface added to `@web-audio/schema`:

```ts
interface LfoSchema {
  type: "lfo";
  id: string;
  outputA: ParameterSchema;
  outputB: ParameterSchema;
  speed: number[];
  waveform: ("sine" | "triangle" | "square" | "sawtooth")[];
  phase: number;
  norm: boolean;
}
```

Updated union types:

```ts
// FilterSchema parameters become:
frequency: ParameterSchema | EnvelopeSchema | LfoSchema;
q: ParameterSchema | EnvelopeSchema | LfoSchema;
detune: ParameterSchema | EnvelopeSchema | LfoSchema;
gain: ParameterSchema | EnvelopeSchema | LfoSchema;

// SynthesizerSchema parameters become:
detune: ParameterSchema | EnvelopeSchema | LfoSchema;
gain: EnvelopeSchema;  // stays envelope-only for note lifecycle (attack/release)

// New GainEffectSchema:
interface GainEffectSchema {
  type: "gain";
  gain: ParameterSchema | EnvelopeSchema | LfoSchema;
}

// EffectSchema becomes:
type EffectSchema = FilterSchema | GainEffectSchema;
```

### Fluid API (`Lfo` class)

Location: `packages/fluid/src/automations/lfo.ts`

- Constructor: `new Lfo(outputA: CycleInput, outputB: CycleInput)`
- Chainable methods: `.speed(...n)`, `.wave(...type)`, `.offset(n)`, `.norm()`
- Serialization: `.getSchema(): LfoSchema`
- Each instance generates a unique `id` (e.g., `crypto.randomUUID()`)
- Exposed on the `Drome` class as `d.lfo()`

Default values (resolved in fluid, never in engine — per the fluid-smart/engine-dumb principle):

| Field      | Default  |
| ---------- | -------- |
| `speed`    | `[1]`      |
| `waveform` | `["sine"]` |
| `phase`    | `0`      |
| `norm`     | `false`  |

`outputA` and `outputB` are `ParameterSchema` (supporting static values, cycles, and random cycles), matching the flexibility of envelope ADSR parameters.

`speed` and `waveform` are arrays of static values that cycle at **period boundaries** (not bar boundaries). The worklet's phase accumulator detects when the phase wraps past 1.0 and advances each array's index independently. This means `.speed(2, 1).wave("sine", "sawtooth", "triangle")` produces 6 unique period combinations before repeating — each array cycles at its own rate.

`phase` remains a single static value (initial offset only).

### Gain Effect

A new effect type alongside filters. In fluid: `d.gain(value)` where `value` is a `CycleInput`, `Envelope`, or `Lfo`. In the engine: a `GainNode` inserted in the effects chain.

This exists because instrument-level gain must remain an envelope for clean note attack/release. A Gain effect in the chain allows LFO modulation (tremolo) without sacrificing note lifecycle control.

Location: `packages/fluid/src/effects/gain.ts`

### Worklet Package (`@web-audio/worklets`)

New package in the monorepo. Houses AudioWorklet processor source files.

**Build & export strategy:** Each processor is authored as a `.ts` file, compiled, and exported as a **string constant** containing the processor's JavaScript source. The audio-engine creates a Blob URL from the string at runtime and registers it via `audioContext.audioWorklet.addModule()`. This avoids consumer-side build configuration for resolving worklet file URLs.

```ts
// @web-audio/worklets exports
export const lfoProcessorSource: string;

// audio-engine consumes
const blob = new Blob([lfoProcessorSource], { type: "application/javascript" });
const url = URL.createObjectURL(blob);
await ctx.audioWorklet.addModule(url);
```

**`LfoProcessor` design:**

- Extends `AudioWorkletProcessor`
- Registered as `"lfo-processor"`
- `AudioParam`s: `outputA`, `outputB` — sample-accurate, schedulable by the engine for per-bar cycling values
- Constructor options: `waveform` (array), `speed` (array), `phase`, `norm`, `barDuration`
- Generates waveform sample-by-sample using an internal phase accumulator
- Phase offset is absolute — applied once at initialization, then free-runs
- On phase wrap (period completion), independently advances `speed` and `waveform` array indices

### Engine Behavior

**LFO lifecycle:** LFO nodes are long-lived, analogous to instruments rather than notes. They are created when the instrument is instantiated and destroyed when the instrument is torn down on the next `_commit()`.

**Node management:** The instrument stores LFO worklet nodes in a `Map<string, AudioWorkletNode>` keyed by the LFO's `id` from the schema.

**Connection flow:**

1. At instrument construction: scan schema for `type: "lfo"` parameters, create an `AudioWorkletNode` for each, store by `id`
2. At note schedule time: when creating per-note nodes (filters, oscillators), look up the LFO node by `id` from the parameter's schema and call `lfoNode.connect(targetParam)`
3. The LFO fans out to every note's parameter via multiple `.connect()` calls
4. When a note ends and its nodes are garbage collected, the connections are automatically cleaned up

**Bar duration** is passed to the worklet processor as a constructor option (static, set once at creation time).

**Per-bar cycling of `outputA`/`outputB`:** The engine uses `setValueAtTime` on the worklet node's `AudioParam`s at bar boundaries, using the same `_resolve()` infrastructure already used for envelope values.

### LFO and Envelope: Mutually Exclusive

A parameter accepts either an Envelope or an LFO, never both simultaneously. The type union enforces this: `ParameterSchema | EnvelopeSchema | LfoSchema`.

### Shared LFO Instances

When a user reuses an LFO variable across multiple parameters:

```ts
const lfo = d.lfo(400, 800);
d.synth().fx(d.lpf(lfo), d.hpf(lfo));
```

Each call to `lfo.getSchema()` produces a separate schema object with the same configuration but a **distinct `id`**. This results in two independent AudioWorkletNodes in the engine. They will oscillate in sync (same config), but are not shared.

---

## Testing Decisions

- **Schema:** `GainEffectSchema` validation
- **Fluid:** `Lfo` class serialization tests — default values, all chainable methods, `CycleInput` handling for `outputA`/`outputB`, unique `id` generation
- **Worklet:** Unit tests for the processor's waveform generation (sine, triangle, square, sawtooth), norm mode output range, phase offset behavior
- **Engine integration:** Verify LFO node creation from schema, connection to per-note filter params, cleanup on `_commit()`, Gain effect node in chain

---

## Out of Scope

- **LFO + Envelope composition** (e.g., `d.env(400, d.lfo(400, 1200).norm())`) — future enhancement
- **Shared/named LFOs** — a single worklet node modulating multiple parameters across instruments
- **Live BPM changes** affecting running LFOs — bar duration is static at construction time
- **Musical subdivision syntax for speed** (e.g., `speed("1/4")`) — plain number multiplier only

---

## Future Enhancements

- **LFO + Envelope composition:** Allow an LFO as the `max` value of an envelope, enabling patterns like `d.env(400, d.lfo(400, 1200).norm()).adsr(0.1, 0.2, 0.5, 0.1)`. The type system should not preclude this.
- **Cycling resolution:** Currently `outputA`/`outputB` cycling values resolve per bar. If `speed` < 1 (period spans multiple bars), the baseline shifts mid-period. This may or may not sound right — reevaluate once there is a working implementation.
- **Live tempo sync:** Promote `barDuration` from a constructor option to a `MessagePort` message or `AudioParam` to support runtime BPM changes.
- **Shared LFO nodes:** A top-level LFO definition that multiple parameters reference by ID, so a single worklet node drives multiple targets.

---

## Further Notes

- This is the first AudioWorklet in the project. The `@web-audio/worklets` package is designed to house future processors beyond LFOs.
- The Blob URL loading strategy was chosen specifically to avoid consumer build-config dependencies. As more worklets are added, this pattern scales — each processor is an additional string export.
- The `id` field on `LfoSchema` is generated by fluid (not the engine) and serves as the stable key for the engine's worklet node map. This decouples schema identity from structural position (e.g., effect array index), making the relationship between schema and runtime nodes explicit and durable.
