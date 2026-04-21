# Gain & Envelope Implementation Plan

## Context

The audio engine currently hardcodes gain behavior in `SynthesizerPlayer._scheduleNote` (a fixed ramp to 0.25). There's no user-facing gain control and no ADSR envelope system. This plan implements the design in `plans/gain-and-envelope.md` — giving users `.gain()` and `.env()` APIs in fluid, adding `EnvelopeSchema` to the schema package, and teaching the engine to execute envelope-driven gain and detune scheduling.

**Key design decision:** ADSR normalization happens in the engine, not fluid. `Envelope.getSchema()` outputs raw proportions — the actual numbers aren't known until the engine resolves cycles and random values at scheduling time. The `mode` field on the schema tells the engine which normalization strategy to apply. `normalizeADSR` lives in `@web-audio/audio-engine` to keep packages isolated.

---

## Phase 1: EnvelopeSchema in `@web-audio/schema` ✓

### Step 1.1 — Add `EnvelopeSchema` type ✓

**Files:** `packages/schema/src/index.ts`

Add the `EnvelopeSchema` interface:

```ts
interface EnvelopeSchema {
  type: "envelope";
  min: number;
  max: ParameterSchema;
  a: ParameterSchema;
  d: ParameterSchema;
  s: ParameterSchema;
  r: ParameterSchema;
  mode: "bleed" | "clip";
}
```

Export it from the package index.

**Acceptance criteria:**

- `EnvelopeSchema` is exported from `@web-audio/schema`
- The type compiles with no errors (`tsc --noEmit`)

**Testing:** Type-level only — verify the package type-checks cleanly.

---

### Step 1.2 — Update `SynthesizerSchema` to include `gain` and widen `detune` ✓

**Files:** `packages/schema/src/index.ts`

```ts
interface SynthesizerSchema {
  type: "synthesizer";
  waveform: Waveform;
  notes: ParameterSchema;
  detune: ParameterSchema | EnvelopeSchema;
  gain: EnvelopeSchema;
}
```

**Acceptance criteria:**

- `SynthesizerSchema.gain` is `EnvelopeSchema`
- `SynthesizerSchema.detune` is `ParameterSchema | EnvelopeSchema`
- Package type-checks cleanly
- Downstream packages (`fluid`, `audio-engine`) will now show type errors — expected, resolved in subsequent steps

**Testing:** `pnpm --filter @web-audio/schema exec tsc --noEmit` passes.

---

## Phase 2: Envelope builder in `@web-audio/fluid` ✓

### Step 2.1 — Implement `Envelope` class ✓

**Files:** `packages/fluid/src/automations/envelope.ts`

Replace the existing stub. The `Envelope` class:

- Constructor: `(min?: number, ...max: CycleInput)` — defaults min=0, max=1
- Stores `_min: number` and `_max: Parameter` (reuses existing `Parameter` class)
- ADSR fields: `_a`, `_d`, `_s`, `_r` — each a `Parameter` instance, defaults: A=0.01, D=0, S=1, R=0.01
- `_mode`: `"bleed" | "clip"`, default `"bleed"`
- Chainable setters:
  - `.adsr(a, d, s, r)` — each arg is `number | number[]`. Creates new `Parameter` for each.
  - `.a(...input)`, `.d(...)`, `.s(...)`, `.r(...)` — individual setters, same input signature as `Parameter` constructor
  - `.mode(m: "bleed" | "clip")`
- `.getSchema(): EnvelopeSchema` — calls `.getSchema()` on each internal `Parameter` to produce the full `EnvelopeSchema`

**Acceptance criteria:**

- `new Envelope().getSchema()` returns a valid `EnvelopeSchema` with all defaults
- `new Envelope(0, 0.75).adsr(0.5, 0.25, 0.1, 0.1).getSchema()` returns correct schema
- Individual setters override `.adsr()` (last write wins)
- `.mode("clip")` is reflected in schema

**Testing:** Unit tests in `packages/fluid/src/automations/envelope.test.ts`:

- Default schema output
- Custom min/max
- `.adsr()` sets all four
- Individual `.a()`, `.d()`, `.s()`, `.r()` override
- `.mode("clip")`
- Cycle/array inputs on max and ADSR params
- RandomCycle input on max

---

### Step 2.2 — Add `d.env()` to Drome ✓

**Files:** `packages/fluid/src/index.ts`

```ts
env(min?: number, ...max: CycleInput) {
  return new Envelope(min, ...max);
}
```

**Acceptance criteria:**

- `d.env()` returns an `Envelope` instance
- `d.env(0, 0.75)` passes min=0, max=0.75 to `Envelope`
- `d.env(0, [0.75, 1.25], [0.25, 0.5])` works with cycle syntax

**Testing:**

- `d.env()` returns a valid default envelope schema
- `d.env(0, 0.75).getSchema().min === 0` and max resolves to 0.75

---

### Step 2.3 — Add `.gain()` to `Instrument` ✓

**Files:** `packages/fluid/src/instruments/instrument.ts`

Add a `_gain: Envelope` field (default: `new Envelope()`) and a `.gain()` method:

```ts
gain(...input: CycleInput | [Envelope]) {
  if (isEnvelopeTuple(input)) {
    this._gain = input[0];
  } else {
    this._gain = new Envelope(0, ...input);
  }
  return this;
}
```

This means:

- `.gain(0.75)` creates `Envelope(0, 0.75)` — min=0, max=0.75, default ADSR
- `.gain([0.75, 1.25], [0.25, 0.5])` creates `Envelope(0, [0.75, 1.25], [0.25, 0.5])` — cycling max
- `.gain(env)` uses the provided `Envelope` directly

**Acceptance criteria:**

- `.gain(0.75)` produces an `EnvelopeSchema` with max resolving to 0.75
- `.gain(envInstance)` uses the envelope as-is
- Default gain (no `.gain()` call) produces default `EnvelopeSchema` (min=0, max=1, default ADSR)

**Testing:**

- Synthesizer schema includes `gain: EnvelopeSchema` when `.gain()` is not called (default)
- `.gain(0.75)` schema output
- `.gain(d.env(0, 0.5).adsr(0.5, 0.25, 0.1, 0.1))` schema output

---

### Step 2.4 — Update `Synthesizer.getSchema()` to include gain ✓

**Files:** `packages/fluid/src/instruments/synthesizer.ts`

```ts
getSchema(): SynthesizerSchema {
  return {
    type: "synthesizer" as const,
    waveform: this._type,
    notes: this._cycle.getSchema(),
    detune: this._detune.getSchema(),
    gain: this._gain.getSchema(),
  };
}
```

**Acceptance criteria:**

- `synth.getSchema()` returns an object with a `gain` property of type `EnvelopeSchema`
- The fluid package builds and all tests pass

**Testing:** `pnpm --filter @web-audio/fluid exec vitest run` and `tsc --noEmit` pass.

---

### Supporting changes (Phase 2) ✓

- **`packages/fluid/src/types.ts`** — `CycleInput` type (`(number | number[])[] | [RandomCycle]`) added and exported; replaces all inline repetitions of this type across the package
- **`packages/fluid/src/utils/validate.ts`** — `isEnvelopeTuple` added alongside `isRandomCycleTuple`, eliminating casts in `.gain()` and `d.env()`
- **`packages/fluid/src/patterns/parameter.ts`** — constructor typed as `...input: CycleInput`
- **`packages/fluid/vitest.config.ts`** — new file, wires `@/` path alias for Vitest (was only in tsconfig)

---

## Phase 3: Engine gain envelope execution

### Step 3.1 — Add `normalizeADSR` utility to engine

**Files:** New file `packages/audio-engine/src/utils/normalize.ts`

Pure function that normalizes raw ADSR proportions to fit within a note:

```ts
interface NormalizedADSR {
  a: number;
  d: number;
  s: number;
  r: number;
}
function normalizeADSR(
  a: number,
  d: number,
  s: number,
  r: number,
  mode: "bleed" | "clip",
): NormalizedADSR;
```

Rules:

- **Bleed mode:** A + D normalized to sum ≤ 1 (proportional scaling). R is a separate proportion, capped at ≤ 1.
- **Clip mode:** A + D + R normalized to sum ≤ 1 (proportional scaling).
- S is a sustain level (0–1), not a duration — passed through unchanged.

**Acceptance criteria:**

- Bleed: `normalizeADSR(0.6, 0.6, 0.8, 0.5, "bleed")` → A=0.5, D=0.5, S=0.8, R=0.5
- Bleed: `normalizeADSR(0.3, 0.2, 0.8, 0.5, "bleed")` → unchanged (A+D already ≤ 1)
- Clip: `normalizeADSR(0.5, 0.3, 0.8, 0.4, "clip")` → A+D+R scaled to sum to 1
- S passed through unchanged in all cases

**Testing:** `packages/audio-engine/src/utils/normalize.test.ts`:

- Bleed: A+D already ≤ 1 (no change)
- Bleed: A+D > 1 (proportional scaling)
- Bleed: R > 1 (capped to 1)
- Clip: A+D+R already ≤ 1 (no change)
- Clip: A+D+R > 1 (proportional scaling)
- Edge cases: all zeros, single value dominates

---

### Step 3.2 — Thread `barIndex` through to `_scheduleNote`

**Files:** `packages/audio-engine/src/synthesizer-player.ts`

`_scheduleNote` currently has no `barIndex` parameter. Add it so envelope resolution can use the correct bar when cycling parameter values.

**Acceptance criteria:**

- `_scheduleNote(note, barStartTime, detuneValue, barIndex)` receives `barIndex`
- All call sites in `scheduleBar` pass `barIndex` through
- Existing note/detune resolution unchanged

---

### Step 3.3 — Add `_resolveEnvelope` helper to `SynthesizerPlayer`

**Files:** `packages/audio-engine/src/synthesizer-player.ts`

```ts
private _resolveEnvelope(envelope: EnvelopeSchema, barIndex: number, stepIndex: number) {
  return {
    min: envelope.min,
    max: this._resolve(envelope.max, barIndex, stepIndex),
    a: this._resolve(envelope.a, barIndex, stepIndex),
    d: this._resolve(envelope.d, barIndex, stepIndex),
    s: this._resolve(envelope.s, barIndex, stepIndex),
    r: this._resolve(envelope.r, barIndex, stepIndex),
    mode: envelope.mode,
  };
}
```

**Acceptance criteria:**

- Resolves all `ParameterSchema` fields on an `EnvelopeSchema` to concrete numbers
- Works with both static and random parameter schemas

**Testing:** Private method — verified through Step 3.4 integration.

---

### Step 3.4 — Rewrite `_scheduleNote` to use gain envelope

**Files:** `packages/audio-engine/src/synthesizer-player.ts`

Replace the hardcoded gain ramp with envelope-driven scheduling:

1. Resolve gain envelope via `_resolveEnvelope`
2. Normalize via `normalizeADSR`
3. Apply `BASE_GAIN = 0.25` multiplier to all gain values (engine-level concern, prevents clipping)
4. Compute absolute durations: `Math.max(a * noteDuration, 0.005)` for attack, decay, release — 5ms minimum prevents popping
5. Schedule `GainNode` automation: min → max (attack) → sustain level (decay) → hold → min (release)
6. Bleed mode: oscillator stop time extends past note end to cover release tail; clip mode: stop time is at note end

**Acceptance criteria:**

- Default synth sounds the same volume as before (base 0.25 × max 1.0 = 0.25)
- `.gain(0.5)` is noticeably quieter; `.gain(1.5)` is louder
- Audible attack/decay shape with a custom envelope
- Minimum 5ms ramp on attack and release — no popping
- Bleed mode: release tail is audible after note end
- No hardcoded gain values remain in `_scheduleNote`

**Testing:** Manual/audible in the sequencer app:

1. `d.synth("triangle").push()` — same volume as before
2. `d.synth("triangle").gain(0.5).push()` — noticeably quieter
3. `d.synth("triangle").gain(1.5).push()` — louder than default
4. `d.synth("triangle").gain(d.env(0, 0.75).adsr(0.5, 0.25, 0.8, 0.1)).push()` — audible attack/decay shape

---

## Phase 4: Envelope on detune

### Step 4.1 — Update `.detune()` to accept `Envelope`

**Files:** `packages/fluid/src/instruments/instrument.ts`

Change `_detune` field from `Parameter` to `Parameter | Envelope`. Widen `.detune()` to accept `CycleInput | [Envelope]`, using `isEnvelopeTuple`:

```ts
detune(...input: CycleInput | [Envelope]) {
  if (isEnvelopeTuple(input)) {
    this._detune = input[0];
  } else {
    this._detune = new Parameter(...input);
  }
  return this;
}
```

`Synthesizer.getSchema()` requires no change — `this._detune.getSchema()` already returns `ParameterSchema | EnvelopeSchema` since both `Parameter` and `Envelope` expose a `getSchema()` method.

**Acceptance criteria:**

- `.detune(100)` still produces `ParameterSchema`
- `.detune(d.env(0, 400).adsr(0.5, 0.25, 0.1, 0.1))` produces `EnvelopeSchema`
- Schema type is `ParameterSchema | EnvelopeSchema` as declared

**Testing:**

- `.detune(100)` schema has `type: "static"`
- `.detune(envInstance)` schema has `type: "envelope"`

---

### Step 4.2 — Engine handles `EnvelopeSchema` on detune

**Files:** `packages/audio-engine/src/synthesizer-player.ts`

In `scheduleBar`, resolve detune before calling `_scheduleNote`. Check schema type to decide handling:

- `detune.type === "envelope"`: pass the full `EnvelopeSchema` to `_scheduleNote`
- Otherwise: resolve to a scalar as before

In `_scheduleNote`, schedule ADSR automation on `osc.detune` AudioParam when detune is an envelope. No `BASE_GAIN` multiplier on detune.

**Acceptance criteria:**

- Static detune unchanged
- Envelope detune produces an audible pitch sweep over the note's lifetime
- No gain multiplier applied to detune values
- 5ms minimum ramp applies to prevent artifacts

**Testing:** Manual/audible:

1. `d.synth("triangle").detune(100).push()` — constant detune, same as before
2. `d.synth("triangle").detune(d.env(0, 400).adsr(0.3, 0.2, 0.5, 0.1)).push()` — pitch sweep

---

## Phase 5: Integration tests & cleanup

### Step 5.1 — End-to-end schema tests

**Files:** `packages/fluid/src/index.test.ts` (replace placeholder)

Write tests that verify complete schema output from Drome for various configurations:

- Default synth (no `.gain()` call) → `gain` field is a valid default `EnvelopeSchema`
- `.gain(0.75)` → correct envelope schema
- `.gain(d.env(0, 0.75).adsr(0.5, 0.25, 0.1, 0.1))` → full custom envelope
- `.detune(d.env(0, 400).adsr(0.5, 0.25, 0.1, 0.1))` → envelope on detune

**Acceptance criteria:**

- All schema outputs match expected shape
- `pnpm --filter @web-audio/fluid exec vitest run` passes

---

### Step 5.2 — Export cleanup

**Files:** `packages/fluid/src/index.ts`, `packages/fluid/src/types.ts`

- Export `Envelope` from the fluid package for external use
- Ensure `EnvelopeSchema` is re-exported from fluid types consistent with existing patterns

**Acceptance criteria:**

- All public types and classes are accessible to consumers
- No unused exports

---

## File Change Summary

| File                                                | Change                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/schema/src/index.ts`                      | Add `EnvelopeSchema`, update `SynthesizerSchema` ✓                        |
| `packages/fluid/src/types.ts`                       | Add `CycleInput` ✓                                                        |
| `packages/fluid/src/utils/validate.ts`              | Add `isEnvelopeTuple` ✓                                                   |
| `packages/fluid/src/patterns/parameter.ts`          | Constructor typed as `CycleInput` ✓                                       |
| `packages/fluid/src/automations/envelope.ts`        | Full `Envelope` builder ✓                                                 |
| `packages/fluid/src/automations/envelope.test.ts`   | New — Envelope unit tests ✓                                               |
| `packages/fluid/src/instruments/instrument.ts`      | `_gain`, `.gain()`, update `.detune()` ✓ (gain done; detune Phase 4)      |
| `packages/fluid/src/instruments/synthesizer.ts`     | Add `gain` to `getSchema()` ✓                                             |
| `packages/fluid/src/index.ts`                       | Add `d.env()` ✓                                                           |
| `packages/fluid/vitest.config.ts`                   | New — path alias for tests ✓                                              |
| `packages/fluid/src/index.test.ts`                  | Replace placeholder (Phase 5)                                             |
| `packages/audio-engine/src/utils/normalize.ts`      | New — `normalizeADSR` pure function (Phase 3)                             |
| `packages/audio-engine/src/utils/normalize.test.ts` | New — normalization unit tests (Phase 3)                                  |
| `packages/audio-engine/src/synthesizer-player.ts`   | `_resolveEnvelope`, rewrite `_scheduleNote`, detune envelope (Phases 3–4) |

## Verification

After all phases:

1. `pnpm --filter @web-audio/schema exec tsc --noEmit` — schema types clean
2. `pnpm --filter @web-audio/fluid exec vitest run` — fluid tests pass
3. `pnpm --filter @web-audio/audio-engine exec vitest run` — engine tests pass
4. Manual demo in the sequencer app — verify audible gain and detune envelope behavior
