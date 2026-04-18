# Gain & Envelope Design Plan

## Core Principle

Fluid is the smart layer that resolves all user input (or lack thereof) into fully specified schemas. The engine is a dumb executor that never applies defaults.

## User API

### Simple gain

```js
// static value
d.synth("triangle").gain(0.75).push();
// cycling values
d.synth("triangle").gain([0.75, 1.25], [0.25, 0.5]).push();
```

### Envelope builder

```js
const env = d
  .env(0, 0.75)                    // min and max (defaults: 0, 1). Max accepts cycle syntax.
  .adsr(0.5, 0.25, 0.1, 0.1)      // set all four. Each arg: number or single-bar cycle.
  .mode("bleed");                  // "bleed" (default) or "clip"

d.synth("triangle").gain(env).push();
```

Individual ADSR setters (full cycle + RandomCycle support, last write wins):

```js
const env = d
  .env(0, 0.75)
  .a([0.25, 0.5], [0.5, 0.25])    // multi-bar cycle on attack
  .d(0.1)
  .s(0.8)
  .r(0.05);
```

Envelope on other params:

```js
const env = d.env(0, 400).adsr(0.5, 0.25, 0.1, 0.1);
d.synth("triangle").detune(env).push();
```

### Input signatures

Both `.gain()` and `.detune()` accept: `(number | number[])[] | [RandomCycle] | [Envelope]`

`d.env(min?, ...max?)` — min is a number, max accepts the same cycle/RandomCycle syntax as other params.

## Schema Types

```ts
type ParameterSchema = StaticSchema | RandomSchema;

type EnvelopeSchema = {
  type: "envelope";
  min: number;
  max: ParameterSchema;
  a: ParameterSchema;
  d: ParameterSchema;
  s: ParameterSchema;
  r: ParameterSchema;
  mode: "bleed" | "clip";
};

type SynthesizerSchema = {
  type: "synthesizer";
  waveform: Waveform;
  notes: StaticSchema | RandomSchema;
  detune: ParameterSchema | EnvelopeSchema;
  gain: EnvelopeSchema;
};
```

- `gain` is always an `EnvelopeSchema` (always present).
- `detune` is always present. Defaults to `StaticSchema` with value 0. Can be `ParameterSchema | EnvelopeSchema`.
- `notes` is always present (already has a default).

## Gain Semantics

- Schema values are on a 0+ scale ("voice volume"). Not clamped — values above 1 are valid for boosting.
- The engine multiplies by a base value (currently 0.25) to prevent clipping. This is an engine-level concern, not a schema concern.
- The base-value multiplier is applied uniformly to all gain values (simple and envelope).
- This multiplier only applies to gain, not other audio params like detune.

## Envelope / ADSR Semantics

### Defaults

- `d.env()` defaults: min = 0, max = 1
- Default ADSR: A = 0.01, D = 0, S = 1, R = 0.01
- Default mode: "bleed"
- `.gain(0.75)` expands to an `EnvelopeSchema` with max = 0.75 and default ADSR

### Duration model

- A, D, R are proportional to note duration (0–1 range before normalization).
- S is a level (0–1), not a duration. Sustain hold time is whatever remains after A + D.

### Normalization (done in the fluid layer)

- **Bleed mode:** A + D normalized to sum ≤ 1 (fit within note). R is a separate proportion of note duration, applied after the note ends.
- **Clip mode:** A + D + R all normalized to sum ≤ 1 (fit within note).
- Normalization uses straight proportional scaling (divide each by their sum).

### Engine safety

- Engine clamps computed A and R to a minimum of 5ms absolute, regardless of schema values, to prevent popping.

## Prerequisite

[Engine Random Resolution & Detune Cleanup](./engine-random-and-detune-cleanup.md) must be completed first. That plan establishes:
- `_resolve` method in the engine (handles both `StaticSchema` and `RandomSchema`)
- `RandomResolver` class with `Map<RandomSchema, RandomResolver>` for lazy creation
- Detune as a required, non-optional field on `SynthesizerSchema`

This plan builds on that foundation — `_resolve` is a trusted, complete primitive.

## Engine Resolution

Uses the `_resolve` method established in the prerequisite plan:

```ts
private _getEnvelopeValues(barIndex: number, noteIndex: number) {
  const gain = this._schema.gain;
  return {
    min: gain.min,
    max: this._resolve(gain.max, barIndex, noteIndex),
    a: this._resolve(gain.a, barIndex, noteIndex),
    d: this._resolve(gain.d, barIndex, noteIndex),
    s: this._resolve(gain.s, barIndex, noteIndex),
    r: this._resolve(gain.r, barIndex, noteIndex),
    mode: gain.mode,
  };
}
```

## Implementation Phases

### Phase 1: Simple gain
- Add `ParameterSchema` and `EnvelopeSchema` types
- Add `Envelope` builder class with `.adsr()`, `.a()`, `.d()`, `.s()`, `.r()`, `.mode()`, `.getSchema()`
- Add `d.env()` to Drome
- Add `.gain()` to Instrument (accepts numbers/cycles/RandomCycle/Envelope)
- Fluid resolves `.gain(0.75)` into full `EnvelopeSchema` with defaults
- Update `SynthesizerSchema` — gain required
- Update engine `_scheduleNote` to read gain envelope from schema

### Phase 2: Envelope on detune
- Update `.detune()` to also accept `Envelope`
- Update engine to handle `EnvelopeSchema` on detune param
- Engine applies detune envelope over note lifetime
