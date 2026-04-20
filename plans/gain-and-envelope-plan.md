# Gain & Envelope Implementation Plan

## Context

The audio engine currently hardcodes gain behavior in `SynthesizerPlayer._scheduleNote` (a fixed ramp to 0.25). There's no user-facing gain control and no ADSR envelope system. This plan implements the design in `plans/gain-and-envelope.md` — giving users `.gain()` and `.env()` APIs in fluid, adding `EnvelopeSchema` to the schema package, and teaching the engine to execute envelope-driven gain and detune scheduling.

---

## Phase 1: EnvelopeSchema in `@web-audio/schema`

### Step 1.1 — Add `EnvelopeSchema` type

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
- The type compiles with no errors (`pnpm --filter @web-audio/schema build` or `tsc --noEmit`)

**Testing:** Type-level only — verify the package builds cleanly.

---

### Step 1.2 — Update `SynthesizerSchema` to include `gain` and widen `detune`

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
- Package builds cleanly
- Downstream packages (`fluid`, `audio-engine`) will now show type errors — that's expected and resolved in subsequent steps

**Testing:** `pnpm --filter @web-audio/schema build` passes. Expect type errors in dependent packages until they're updated.

---

## Phase 2: Envelope builder in `@web-audio/fluid`

### Step 2.1 — Implement `Envelope` class

**Files:** `packages/fluid/src/automations/envelope.ts`

Replace the existing stub. The `Envelope` class:

- Constructor: `(min?: number, ...max: (number | number[])[] | [RandomCycle])` — defaults min=0, max=1
- Stores `_min: number` and `_max: Parameter` (reuses existing `Parameter` class)
- ADSR fields: `_a`, `_d`, `_s`, `_r` — each a `Parameter` instance, defaults: A=0.01, D=0, S=1, R=0.01
- `_mode`: `"bleed" | "clip"`, default `"bleed"`
- Chainable setters:
  - `.adsr(a, d, s, r)` — each arg is `number | number[]` or a single-bar cycle. Creates new `Parameter` for each.
  - `.a(...input)`, `.d(...)`, `.s(...)`, `.r(...)` — individual setters, same input signature as `Parameter` constructor
  - `.mode(m: "bleed" | "clip")`
- `.getSchema(): EnvelopeSchema` — calls `.getSchema()` on each internal `Parameter` to produce the full `EnvelopeSchema`

**Acceptance criteria:**

- `new Envelope().getSchema()` returns a valid `EnvelopeSchema` with all defaults
- `new Envelope(0, 0.75).adsr(0.5, 0.25, 0.1, 0.1).getSchema()` returns correct schema
- Individual setters override `.adsr()` (last write wins)
- `.mode("clip")` is reflected in schema

**Testing:** Unit tests in a new file `packages/fluid/src/automations/envelope.test.ts`:

- Test default schema output
- Test custom min/max
- Test `.adsr()` sets all four
- Test individual `.a()`, `.d()`, `.s()`, `.r()` override
- Test `.mode("clip")`
- Test cycle/array inputs on max and ADSR params
- Test RandomCycle input on max

---

### Step 2.2 — Add `d.env()` to Drome

**Files:** `packages/fluid/src/index.ts`

Add method to `Drome`:

```ts
env(min?: number, ...max: (number | number[])[] | [RandomCycle]) {
  return new Envelope(min, ...max);
}
```

Import `Envelope` class.

**Acceptance criteria:**

- `d.env()` returns an `Envelope` instance
- `d.env(0, 0.75)` passes min=0, max=0.75 to `Envelope`
- `d.env(0, [0.75, 1.25], [0.25, 0.5])` works with cycle syntax

**Testing:** Unit test in `packages/fluid/src/index.test.ts` (or envelope test file):

- `d.env()` returns valid default envelope schema
- `d.env(0, 0.75).getSchema().min === 0` and max resolves to 0.75

---

### Step 2.3 — Add `.gain()` to `Instrument`

**Files:** `packages/fluid/src/instruments/instrument.ts`

Add a `_gain: Envelope` field (default: `new Envelope()`) and a `.gain()` method:

```ts
gain(...input: (number | number[])[] | [RandomCycle] | [Envelope]) {
  if (input[0] instanceof Envelope) {
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

**Testing:** Unit tests:

- Synthesizer schema includes `gain: EnvelopeSchema` when `.gain()` is not called (default)
- `.gain(0.75)` schema output
- `.gain(d.env(0, 0.5).adsr(0.5, 0.25, 0.1, 0.1))` schema output

---

### Step 2.4 — Update `Synthesizer.getSchema()` to include gain

**Files:** `packages/fluid/src/instruments/synthesizer.ts`

Update `getSchema()` to include the gain field:

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

**Testing:** Run `pnpm --filter @web-audio/fluid test` and `pnpm --filter @web-audio/fluid build`.

---

## Phase 3: Envelope normalization in fluid

### Step 3.1 — Implement ADSR normalization logic

**Files:** New file `packages/fluid/src/automations/normalize.ts`

Pure function(s) that normalize ADSR proportions according to the mode rules:

- **Bleed mode:** A + D normalized to sum <= 1 (proportional scaling). R is separate, capped at <= 1.
- **Clip mode:** A + D + R normalized to sum <= 1 (proportional scaling).
- S is a level (0-1), not a duration — not normalized.

Signature:

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

**Acceptance criteria:**

- Bleed mode: `normalizeADSR(0.6, 0.6, 0.8, 0.5, "bleed")` → A=0.5, D=0.5, S=0.8, R=0.5
- Bleed mode: `normalizeADSR(0.3, 0.2, 0.8, 0.5, "bleed")` → A=0.3, D=0.2, S=0.8, R=0.5 (no scaling needed)
- Clip mode: `normalizeADSR(0.5, 0.3, 0.8, 0.4, "clip")` → A+D+R scaled to sum to 1
- S value is passed through unchanged

**Testing:** Thorough unit tests in `packages/fluid/src/automations/normalize.test.ts`:

- Bleed mode: A+D already <= 1 (no change)
- Bleed mode: A+D > 1 (proportional scaling)
- Bleed mode: R > 1 (capped)
- Clip mode: A+D+R already <= 1 (no change)
- Clip mode: A+D+R > 1 (proportional scaling)
- Edge cases: all zeros, one value dominates

---

### Step 3.2 — Wire normalization into `Envelope.getSchema()`

**Files:** `packages/fluid/src/automations/envelope.ts`

**Decision point:** The plan doc says normalization happens in the fluid layer. However, `Envelope.getSchema()` produces `ParameterSchema` values for A/D/S/R — these can be cycles or random values, so the actual numbers aren't known until the engine resolves them at scheduling time.

**Approach:** Normalization must happen at resolution time (in the engine), NOT in `getSchema()`. The schema carries the raw proportions; the engine normalizes after resolving. The `mode` field on the schema tells the engine which normalization strategy to use.

This step is therefore a **no-op for fluid** — the schema already carries the mode field. Move normalization to Phase 4 (engine side).

**Acceptance criteria:** `Envelope.getSchema()` outputs raw (un-normalized) ADSR values and the `mode` field. Engine handles normalization.

**Testing:** Verify `getSchema()` passes through raw values (already covered by Step 2.1 tests).

---

## Phase 4: Engine gain envelope execution

### Step 4.1 — Add `_resolveEnvelope` helper to `SynthesizerPlayer`

**Files:** `packages/audio-engine/src/synthesizer-player.ts`

Add a method that resolves all envelope fields for a given bar/step:

```ts
private _resolveEnvelope(
  envelope: EnvelopeSchema,
  barIndex: number,
  stepIndex: number,
): { min: number; max: number; a: number; d: number; s: number; r: number; mode: "bleed" | "clip" } {
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

Import `EnvelopeSchema` from `@web-audio/schema`. Import or inline the `normalizeADSR` function (since it's a pure function, it can live in the engine or be shared — keeping it in the engine avoids a cross-package dependency for a simple function).

**Acceptance criteria:**

- Method resolves all `ParameterSchema` fields on an `EnvelopeSchema` to concrete numbers
- Works with both static and random parameter schemas

**Testing:** Not directly testable in isolation (private method) — verified through Step 4.2 integration.

---

### Step 4.2 — Rewrite `_scheduleNote` to use gain envelope

**Files:** `packages/audio-engine/src/synthesizer-player.ts`

Replace the hardcoded gain ramp logic with envelope-driven scheduling:

```ts
private _scheduleNote(note: StaticSchemaValue, barStartTime: number, detuneValue: number): void {
  const barDuration = this._clock.barDuration;
  const startTime = barStartTime + note.offset * barDuration;
  const noteDuration = note.duration * barDuration;

  // Resolve gain envelope
  const env = this._resolveEnvelope(this._schema.gain, /* barIndex */, note.stepIndex);
  const { a, d, s, r, mode } = normalizeADSR(env.a, env.d, env.s, env.r, env.mode);

  // Base gain multiplier (engine-level concern, prevents clipping)
  const BASE_GAIN = 0.25;
  const gainMin = env.min * BASE_GAIN;
  const gainMax = env.max * BASE_GAIN;
  const gainSustain = gainMin + (gainMax - gainMin) * s;

  // Convert proportional durations to absolute times
  const MIN_RAMP = 0.005; // 5ms minimum to prevent popping

  // Bleed: A+D fit within note, R extends past note end
  // Clip: A+D+R all fit within note
  const attackDur = Math.max(a * noteDuration, MIN_RAMP);
  const decayDur = Math.max(d * noteDuration, MIN_RAMP);
  const releaseDur = Math.max(r * noteDuration, MIN_RAMP);

  const endTime = startTime + noteDuration;
  const sustainStart = startTime + attackDur + decayDur;

  // Schedule gain automation
  const gain = new GainNode(this._ctx);
  gain.gain.setValueAtTime(gainMin, startTime);
  gain.gain.linearRampToValueAtTime(gainMax, startTime + attackDur);
  gain.gain.linearRampToValueAtTime(gainSustain, sustainStart);
  gain.gain.setValueAtTime(gainSustain, endTime);
  gain.gain.linearRampToValueAtTime(gainMin, endTime + releaseDur);

  // Oscillator lifecycle
  const osc = new OscillatorNode(this._ctx, { ... });
  osc.connect(gain);
  gain.connect(this._ctx.destination);
  osc.start(startTime);
  osc.stop(endTime + releaseDur + 0.05); // small buffer after release
}
```

Note: `barIndex` needs to be threaded through from `scheduleBar` to `_scheduleNote`.

**Acceptance criteria:**

- Gain ramp follows the ADSR envelope shape: min → max (attack) → sustain level (decay) → hold → min (release)
- `BASE_GAIN` (0.25) multiplier applied to all gain values
- Minimum 5ms ramp on A and R to prevent popping
- Bleed mode: release extends past note end
- Clip mode: release fits within note duration
- No more hardcoded 0.25 gain — envelope-driven

**Testing:** Manual/audible verification:

1. `d.synth("triangle").push()` — default gain (max=1) should sound identical volume to current behavior (0.25 base \* 1.0 max = 0.25)
2. `d.synth("triangle").gain(0.5).push()` — noticeably quieter
3. `d.synth("triangle").gain(1.5).push()` — louder than default (boost)
4. `d.synth("triangle").gain(d.env(0, 0.75).adsr(0.5, 0.25, 0.8, 0.1)).push()` — audible attack/decay shape

---

### Step 4.3 — Thread `barIndex` through to `_scheduleNote`

**Files:** `packages/audio-engine/src/synthesizer-player.ts`

Currently `_scheduleNote` doesn't receive `barIndex`. Update its signature and all call sites in `scheduleBar` to pass it through.

**Acceptance criteria:**

- `_scheduleNote` receives `barIndex` as a parameter
- `_resolveEnvelope` uses the correct `barIndex` for cycling parameter resolution
- Existing note/detune resolution still works correctly

**Testing:** Verified via Phase 4.2 manual testing — cycling gain values change per bar.

---

## Phase 5: Envelope on detune

### Step 5.1 — Update `.detune()` to accept `Envelope`

**Files:** `packages/fluid/src/instruments/instrument.ts`

Widen the `.detune()` method signature to also accept an `Envelope`:

```ts
detune(...input: (number | number[])[] | [RandomCycle] | [Envelope]) {
  if (input[0] instanceof Envelope) {
    this._detuneEnvelope = input[0];
    this._detune = null; // or similar flag
  } else {
    this._detune = new Parameter(...input);
    this._detuneEnvelope = null;
  }
  return this;
}
```

Update `Synthesizer.getSchema()` so `detune` returns either `ParameterSchema` or `EnvelopeSchema` based on which was set.

**Acceptance criteria:**

- `.detune(100)` still works as before (produces `ParameterSchema`)
- `.detune(d.env(0, 400).adsr(0.5, 0.25, 0.1, 0.1))` produces `EnvelopeSchema`
- Schema type is `ParameterSchema | EnvelopeSchema` as declared

**Testing:** Unit tests:

- `.detune(100)` schema is `StaticSchema` (type: "static")
- `.detune(envInstance)` schema is `EnvelopeSchema` (type: "envelope")

---

### Step 5.2 — Engine handles `EnvelopeSchema` on detune

**Files:** `packages/audio-engine/src/synthesizer-player.ts`

Update `scheduleBar` and `_scheduleNote` to check if `detune` is an `EnvelopeSchema`. If so, schedule detune automation similar to gain (ADSR ramp on `osc.detune` AudioParam).

```ts
if (this._schema.detune.type === "envelope") {
  const env = this._resolveEnvelope(this._schema.detune, barIndex, stepIndex);
  // Schedule detune ADSR automation on osc.detune AudioParam
  // No BASE_GAIN multiplier for detune
} else {
  // Existing behavior: static detune value
  osc.detune.value = detuneValue;
}
```

**Acceptance criteria:**

- Static detune still works as before
- Envelope detune applies ADSR shape to `osc.detune` AudioParam
- No base gain multiplier on detune (only on gain)
- 5ms minimum ramp still applies to prevent audio artifacts

**Testing:** Manual/audible:

1. `d.synth("triangle").detune(100).push()` — constant detune, same as before
2. `d.synth("triangle").detune(d.env(0, 400).adsr(0.3, 0.2, 0.5, 0.1)).push()` — pitch sweep effect

---

## Phase 6: Integration tests & cleanup

### Step 6.1 — End-to-end schema snapshot tests

**Files:** `packages/fluid/src/index.test.ts` (replace placeholder)

Write tests that verify complete schema output from Drome for various configurations:

- Default synth (no gain call) → schema includes default `EnvelopeSchema` on gain
- Synth with `.gain(0.75)` → correct envelope schema
- Synth with `.gain(d.env(0, 0.75).adsr(0.5, 0.25, 0.1, 0.1))` → full custom envelope
- Synth with `.detune(d.env(0, 400).adsr(0.5, 0.25, 0.1, 0.1))` → envelope on detune
- Multiple instruments with different gain/detune configs

**Acceptance criteria:**

- All schema snapshots match expected output
- `pnpm test` passes across all packages

**Testing:** `pnpm --filter @web-audio/fluid test`

---

### Step 6.2 — Export cleanup

**Files:** `packages/fluid/src/index.ts`, `packages/fluid/src/types.ts`

- Export `Envelope` from fluid package if needed for external use
- Ensure `EnvelopeSchema` is re-exported from fluid types if consistent with existing pattern

**Acceptance criteria:**

- All public types are accessible to consumers
- No unused exports

---

## File Change Summary

| File                                               | Change                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `packages/schema/src/index.ts`                     | Add `EnvelopeSchema`, update `SynthesizerSchema`                     |
| `packages/fluid/src/automations/envelope.ts`       | Full `Envelope` builder implementation                               |
| `packages/fluid/src/automations/envelope.test.ts`  | New — Envelope unit tests                                            |
| `packages/fluid/src/automations/normalize.ts`      | New — ADSR normalization pure function                               |
| `packages/fluid/src/automations/normalize.test.ts` | New — normalization unit tests                                       |
| `packages/fluid/src/instruments/instrument.ts`     | Add `_gain` field, `.gain()` method, update `.detune()`              |
| `packages/fluid/src/instruments/synthesizer.ts`    | Add `gain` to `getSchema()` output                                   |
| `packages/fluid/src/index.ts`                      | Add `d.env()` method, import `Envelope`                              |
| `packages/fluid/src/index.test.ts`                 | Replace placeholder with real integration tests                      |
| `packages/audio-engine/src/synthesizer-player.ts`  | `_resolveEnvelope`, rewrite `_scheduleNote`, detune envelope support |

## Verification

After all phases:

1. `pnpm build` — all packages compile
2. `pnpm test` — all tests pass
3. Manual demo in the UI app — play synths with various gain/envelope configs and verify audible differences
