# Effects & Filter: Implementation Plan

## Overview

Implements the filter effect system described in `plans/effects-filter-prd.md`. This plan is ordered for incremental delivery: each phase builds on the previous, and tests are written alongside the code they cover.

---

## Phase 1: Schema

**File:** `packages/schema/src/index.ts`

### Changes

1. Add `FilterType` union type:
   ```ts
   type FilterType = "lp" | "hp" | "bp" | "notch" | "ap" | "pk" | "ls" | "hs";
   ```

2. Add `FilterSchema` interface:
   ```ts
   interface FilterSchema {
     type: "filter";
     filterType: FilterType;
     frequency: ParameterSchema | EnvelopeSchema;
     q: ParameterSchema | EnvelopeSchema;
     detune: ParameterSchema | EnvelopeSchema;
     gain: ParameterSchema | EnvelopeSchema;
   }
   ```

   `ParameterSchema` is already a union of `StaticSchema | RandomSchema`, so `ParameterSchema | EnvelopeSchema` covers all four accepted input types from the PRD: static number, cycle, RandomCycle (via `RandomSchema`), and Envelope. No new schema types are needed to support randomness.

3. Add `EffectSchema` alias (union — will widen for future effect types):
   ```ts
   type EffectSchema = FilterSchema;
   ```

4. Add `effects: EffectSchema[]` to `SynthesizerSchema`:
   ```ts
   interface SynthesizerSchema {
     // ...existing fields...
     effects: EffectSchema[];
   }
   ```
   The field is always present; empty array means no effects.

### Success Criteria
- `FilterType`, `FilterSchema`, `EffectSchema` are exported from the package root
- `SynthesizerSchema` includes `effects: EffectSchema[]`

**Expected breakage:** After this phase, `Synthesizer.getSchema()` in the fluid package will fail to type-check because `effects` is now required but not yet produced. This is resolved in Phase 2c. Tests touching `getSchema()` may also fail until then.

---

## Phase 2: Fluid — Filter Builder

### 2a. Filter builder class + unit tests

**File:** `packages/fluid/src/effects/filter.ts` (new)
**Test file:** `packages/fluid/src/effects/filter.test.ts` (new)

Create the `Filter` builder class. All params — `frequency`, `q`, `detune`, `gain` — accept: **static number, cycle, RandomCycle, or Envelope**. Use the same variadic input handling as `Instrument.detune()`: check if the single argument is an `Envelope` instance; otherwise spread into a `Parameter` (which wraps `ValueCycle` or `RandomCycle` transparently, preserving the `StaticSchema | RandomSchema` union in the output).

```ts
class Filter {
  private _filterType: FilterType;
  private _frequency: Parameter | Envelope;
  private _q: Parameter | Envelope;
  private _detune: Parameter | Envelope;
  private _gain: Parameter | Envelope;

  constructor(type: FilterType, ...frequency: CycleInput | [Envelope]) { ... }

  q(...input: CycleInput | [Envelope]): this { ... }
  detune(...input: CycleInput | [Envelope]): this { ... }
  gain(...input: CycleInput | [Envelope]): this { ... }

  getSchema(): FilterSchema { ... }
}
```

Defaults applied in `getSchema()` if the setter was never called:
- `q` → `Parameter` wrapping `1`
- `detune` → `Parameter` wrapping `0`
- `gain` → `Parameter` wrapping `0`

`getSchema()` returns a fully specified `FilterSchema` — no optional fields, no fallback logic in the engine.

**Tests to write alongside (`filter.test.ts`):**

| Test | Input | Expected |
|------|-------|----------|
| basic lowpass | `new Filter("lp", 800)` | `filterType: "lp"`, frequency static 800, q default 1, detune default 0, gain default 0 |
| q chaining | `.q(2)` | `q` resolves to 2 |
| detune chaining | `.detune(100)` | `detune` resolves to 100 |
| gain chaining | `.gain(6)` | `gain` resolves to 6 |
| cycle on frequency | `new Filter("lp", 400, 800, 1200)` | `frequency` is `StaticSchema` with those cycle values |
| RandomCycle on frequency | `new Filter("lp", d.rand().between(200, 2000))` | `frequency.type === "random"` |
| envelope on frequency | `new Filter("lp", d.env(200, 4000).adsr(...))` | `frequency.type === "envelope"`, correct min/max/adsr |
| envelope on q | `.q(d.env(0.5, 4))` | `q.type === "envelope"` |
| RandomCycle on q | `.q(d.rand().between(0.5, 8))` | `q.type === "random"` |
| all filter types | iterate all 8 `FilterType` values | `filterType` matches input |
| schema type field | any filter | `type === "filter"` |
| chaining returns this | `.q(2).detune(0).gain(0)` | all mutations applied, returns same instance |

Use `toEqual` for schema comparisons; `toBeCloseTo` for floats.

### 2b. fx() on Instrument + unit tests

**File:** `packages/fluid/src/instruments/instrument.ts`
**Test file:** Extend existing instrument test if present, or add cases to fluid integration tests

Add `_effects: Filter[] = []` (private) to `Instrument`.

Add `.fx(...effects: Filter[]): this` — variadic, appends to `_effects`:
```ts
fx(...effects: Filter[]): this {
  this._effects.push(...effects);
  return this;
}
```

**Tests to write alongside:**

| Test | Input | Expected |
|------|-------|----------|
| fx() returns this | `const s = d.synth(); s.fx(d.lpf(800)) === s` | true |
| variadic | `.fx(d.lpf(800), d.hpf(200))` | `_effects` length 2 |
| chained calls accumulate | `.fx(d.lpf(800)).fx(d.hpf(200))` | `_effects` length 2 |

### 2c. Synthesizer.getSchema() update

**File:** `packages/fluid/src/instruments/synthesizer.ts`

Update `getSchema()` to include the `effects` array — this resolves the TypeScript breakage from Phase 1:
```ts
effects: this._effects.map((e) => e.getSchema()),
```

### 2d. Drome methods + integration tests

**File:** `packages/fluid/src/index.ts`
**Test file:** `packages/fluid/src/index.test.ts` (extend)

Add to `Drome`:
```ts
filter(type: FilterType, ...frequency: CycleInput | [Envelope]): Filter
lpf(...frequency: CycleInput | [Envelope]): Filter   // sugar for filter("lp", ...)
hpf(...frequency: CycleInput | [Envelope]): Filter   // sugar for filter("hp", ...)
bpf(...frequency: CycleInput | [Envelope]): Filter   // sugar for filter("bp", ...)
```

These return a new `Filter` instance. They do not register it anywhere — the caller passes them to `.fx()`.

**Integration tests to write alongside (`index.test.ts`):**

| Test | Input | Expected |
|------|-------|----------|
| alias lpf | `d.lpf(800).getSchema()` | identical to `d.filter("lp", 800).getSchema()` |
| alias hpf | `d.hpf(2400)` | `filterType: "hp"`, frequency 2400 |
| alias bpf | `d.bpf(1000)` | `filterType: "bp"`, frequency 1000 |
| no effects | `d.synth().getSchema()` | `effects: []` |
| single effect | `d.synth().fx(d.lpf(800)).getSchema()` | `effects` length 1, correct schema |
| variadic fx() | `d.synth().fx(d.lpf(800), d.hpf(200)).getSchema()` | `effects` length 2, order preserved |
| chained fx() | `d.synth().fx(d.lpf(800)).fx(d.hpf(200)).getSchema()` | `effects` length 2, same order |
| three effects | `.fx(d.lpf(800)).fx(d.hpf(200)).fx(d.bpf(1000)).getSchema()` | `effects` length 3 |

---

## Phase 3: Engine — Effects Chain Wiring

### 3a. Simplify ScheduledNote and node cleanup

**File:** `packages/audio-engine/src/instrument.ts`

Replace the current `ScheduledNote` interface:
```ts
interface ScheduledNote {
  sourceNode: AudioScheduledSourceNode;
  audioNodes: AudioNode[];
  startTime: number;
}
```

This flattens gain, filter, and any future intermediate nodes into a single `audioNodes` array. Both `onended` and `cancelFutureNotes` iterate the array to disconnect:

```ts
node.onended = () => {
  scheduled.sourceNode.disconnect();
  for (const n of scheduled.audioNodes) n.disconnect();
  // ...existing cleanup...
};
```

```ts
// cancelFutureNotes
note.sourceNode.stop(0);
note.sourceNode.disconnect();
for (const n of note.audioNodes) n.disconnect();
```

Update `_track` signature to match:
```ts
protected _track(
  sourceNode: AudioScheduledSourceNode,
  audioNodes: AudioNode[],
  startTime: number,
): void
```

Phase 3b passes `[gainNode, ...filterNodes]` as `audioNodes`.

### 3b. Per-instrument output GainNode

**File:** `packages/audio-engine/src/instrument.ts`

Add `protected readonly _outputNode: GainNode` to the `Instrument` base class. This replaces the per-note `BASE_GAIN` scale currently passed to `_scheduleParamEnvelope` in `Synthesizer`.

```ts
protected readonly _outputNode: GainNode;
```

Initialize in the constructor:
```ts
this._outputNode = ctx.createGain();
this._outputNode.gain.value = BASE_GAIN;
this._outputNode.connect(ctx.destination);
```

Move the `BASE_GAIN = 0.25` constant from `synthesizer.ts` into `instrument.ts`.

**Why this matters:** Currently `BASE_GAIN` is applied as the `scale` param inside `_scheduleParamEnvelope`, scaling per-note gain automation to `[0, 0.25]`. Moving it to a dedicated output GainNode keeps per-note ADSR values in `[0, 1]`, which is cleaner and required for the correct filter signal path architecture.

### 3c. Synthesizer._scheduleNote update

**File:** `packages/audio-engine/src/synthesizer.ts`

Add a static filter type lookup table:
```ts
const FILTER_TYPE_MAP: Record<FilterType, BiquadFilterType> = {
  lp: "lowpass",
  hp: "highpass",
  bp: "bandpass",
  notch: "notch",
  ap: "allpass",
  pk: "peaking",
  ls: "lowshelf",
  hs: "highshelf",
};
```

Update `_scheduleNote`:

1. Remove the `scale = BASE_GAIN` from the gain `_scheduleParamEnvelope` call — BASE_GAIN is now handled by `_outputNode`.

2. For each effect in `schema.effects` (in order), create and configure a `BiquadFilterNode`:
   ```ts
   const filterNode = this._ctx.createBiquadFilter();
   filterNode.type = FILTER_TYPE_MAP[effect.filterType];
   ```

3. For each param on the filter effect (`frequency`, `q`, `detune`, `gain`) — all accept static/cycle/random/envelope:
   - If `param.type === "envelope"`: call `_scheduleParamEnvelope(filterNode.frequency, param, barIndex, stepIndex, noteDuration, endTime)` (no `scale` — filter params are not attenuated by BASE_GAIN)
   - Otherwise: resolve via `_resolve(param, barIndex, stepIndex)`, set via `filterNode.frequency.setValueAtTime(value, startTime)`

4. Connect the chain:
   - No effects: `osc → perNoteGain → _outputNode`
   - With effects: `osc → perNoteGain → filter[0] → filter[1] → ... → _outputNode`

**Node lifetime:** Filter nodes are passed in the `audioNodes` array to `_track()` (Phase 3a), so they are disconnected on `onended` and `cancelFutureNotes` alongside the gain node.

**Note on `detune` name collision:** `FilterSchema.detune` targets `filterNode.detune`; `SynthesizerSchema.detune` targets `oscillatorNode.detune`. Engine code must route each to its correct `AudioParam`.

### Success Criteria (manual audio verification)

These are run after the engine phase is complete.

**Baseline regression:**
1. A synth with no effects plays identically to pre-change. Confirm no amplitude difference after the BASE_GAIN migration.

**Filter behavior:**
2. `d.synth("sawtooth").fx(d.lpf(400)).push()` — audibly darker/muffled vs. unfiltered saw.
3. `d.synth("sawtooth").fx(d.lpf(8000)).push()` — nearly identical to unfiltered.
4. `d.synth("sawtooth").fx(d.hpf(2000)).push()` — thin/bright, bass removed.
5. `d.synth("sawtooth").fx(d.lpf(800).q(8)).push()` — noticeable resonant peak at cutoff.

**Multiple filters:**
6. `d.synth("sawtooth").fx(d.lpf(1000), d.hpf(500)).push()` — bandpass effect; audible midrange.

**Envelope sweep:**
7. `d.synth("sawtooth").fx(d.filter("lp", d.env(200, 4000).adsr(0.3, 0.2, 0.5, 0.1))).push()` — audible filter sweep: 200Hz → 4000Hz on attack, decays to sustain.

**Shelf/peaking:**
8. `d.synth("sawtooth").fx(d.filter("ls", 200).gain(12)).push()` — low-shelf boost; more bass.
9. `d.synth("sawtooth").fx(d.filter("pk", 800).gain(12).q(4)).push()` — peaking boost at 800Hz.

---

## Deviations from Plan

- **`FILTER_TYPE_MAP` location:** The plan placed this constant in `synthesizer.ts`. It was moved to `src/constants.ts` alongside `MIN_RAMP` and `BASE_GAIN`, which were also extracted there during implementation.
- **`_buildEffectNode` location:** The plan placed this method on `Synthesizer`. It was moved to the `Instrument` base class, since it only uses base class members (`_ctx`, `_scheduleParamEnvelope`, `_resolve`) and any future instrument type would need the same effects chain.
- **`scheduleParamEnvelope` / `getEnvTimes`:** During Phase 3 implementation, the original `_scheduleParamEnvelope` body was temporarily split into a `scheduleParamEnvelope` free function and a `getEnvTimes` free function at the bottom of `instrument.ts`. `getEnvTimes` was then extracted to `src/utils/compute-envelope.ts` as `computeEnvelope` with a proper `EnvelopeParams` return type (defined in `src/types.ts`). `scheduleParamEnvelope` was inlined back into `_scheduleParamEnvelope` as it had no testability benefit.
- **`ResolvedEnvelopeSchema` / `NormalizedADSR`:** These interfaces were extracted to `src/types.ts` during implementation. `normalizeADSR` was updated to accept `ResolvedEnvelopeSchema` directly rather than positional arguments.

---

## Implementation Order

```
Phase 1          Phase 2a           Phase 2b          Phase 2c         Phase 2d
Schema    →   Filter builder   →   fx() method   →   getSchema()   →   Drome API
              + unit tests         + tests           update            + integration tests
                                                         ↓
                                                    Phase 3a
                                                  ScheduledNote
                                                    simplify
                                                         ↓
                                                    Phase 3b
                                                  Output GainNode
                                                         ↓
                                                    Phase 3c
                                                  Engine wiring
                                                         ↓
                                                    Manual audio
                                                    verification
```

All unit and integration tests should pass before beginning Phase 3.
