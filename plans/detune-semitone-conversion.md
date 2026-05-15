# Detune Semitone Conversion — Implementation Plan

## Background

The Web Audio API's `OscillatorNode.detune` and `BiquadFilterNode.detune` operate in cents
(1/100th of a semitone). The fluid DSL currently passes numeric detune values through unchanged,
which means users must think in cents. The goal is for `detune()` to accept semitones across all
input types: static numbers, cyclic patterns, `RandomCycle`, `Lfo`, and `Envelope`.

Conversion factor: **1 semitone = 100 cents**.

The approach: add a `scale()` method to `Parameter`, then have `Lfo` and `Envelope` delegate to
it. The `detune()` method in the fluid layer calls `.scale(100)` on whatever it receives.
Schema and engine are untouched.

---

## Phase 1 — Add `scale()` to `Parameter`

**File:** `packages/fluid/src/patterns/parameter.ts`

### Changes

1. Add `private _multiplier = 1` instance field.
2. Add `scale(n: number): this` method that sets `_multiplier` and returns `this`.
3. Update `getSchema()`:
   - **RandomCycle branch:** spread the original schema, then override `range` (scale `min`/`max`)
     and `quantValue` (scale if defined). Do **not** touch the inner `cycle` field — it is a
     mask used for timing, not output values.
   - **ValueCycle branch:** map over `cycle`, scaling only the `value` field of each
     `StaticSchemaValue`. Leave `offset`, `duration`, and `stepIndex` unchanged.

### Tests (unit — `parameter.test.ts`)

- `scale()` returns `this` (chain-ability).
- Static single value: `new Parameter(4).scale(100)` → `value: 400`.
- Static cycle: `new Parameter(4, 2).scale(100)` → values `400`, `200`.
- Polyphonic group: `new Parameter([4, 2]).scale(100)` → values `400`, `200` in the same step.
- Without calling `scale()`, output is unchanged (multiplier defaults to 1).
- RandomCycle with range: `.range(-2, 2)` → `scale(100)` → `range: { min: -200, max: 200 }`.
- RandomCycle with quantValue: `.quant(0.5)` → `scale(100)` → `quantValue: 50`.
- RandomCycle inner `cycle` (mask) values are **not** modified by scale.
- `offset`, `duration`, `stepIndex` fields are **not** modified by scale.

### Verification

Run `pnpm test --filter @web-audio/fluid` — all existing tests pass, new tests pass.

---

## Phase 2 — Add `scale()` to `Lfo`

**File:** `packages/fluid/src/automations/lfo.ts`

### Changes

Add `scale(n: number): this` that calls `this._outputA.scale(n)` and `this._outputB.scale(n)`
and returns `this`.

Only `_outputA` and `_outputB` are amplitude-like values. `_speed`, `_phase`, and `_norm` are
rate, phase offset, and a boolean flag — none represent detune magnitude and must not be scaled.

### Tests (unit — `lfo.test.ts` or inline in fluid test suite)

- `scale()` returns `this`.
- `new Lfo(2, -2).scale(100).getSchema()` → `outputA` value `200`, `outputB` value `-200`.
- `_speed`, `_phase`, `_norm` are unaffected by `scale()`.
- LFO backed by a RandomCycle output: scaling propagates through to `range`.

### Verification

Run fluid test suite — all existing LFO tests pass, new tests pass.

---

## Phase 3 — Add `scale()` to `Envelope`

**File:** `packages/fluid/src/automations/envelope.ts`

### Changes

Add `scale(n: number): this` that:
1. Multiplies `this._min` (a raw `number`) directly: `this._min *= n`.
2. Calls `this._max.scale(n)` (a `Parameter`).
3. Returns `this`.

Do **not** scale `_a`, `_d`, `_r` — these are time values in seconds.
Do **not** scale `_s` — sustain is a ratio (0–1 fraction of max), not an absolute amplitude.

### Tests (unit)

- `scale()` returns `this`.
- `new Envelope(0, 1).scale(100).getSchema()` → `min: 0`, `max` value `100`.
- `new Envelope(1, 2).scale(100).getSchema()` → `min: 100`, `max` value `200`.
- `_a`, `_d`, `_s`, `_r` values are **not** affected by `scale()`.
- Cyclic max: `new Envelope(0, 1, 2).scale(100)` → `max` values `100`, `200`.

### Verification

Run fluid test suite — all existing envelope tests pass, new tests pass.

---

## Phase 4 — Update `detune()` in `Instrument` and `Filter`

**Files:**
- `packages/fluid/src/instruments/instrument.ts`
- `packages/fluid/src/effects/filter.ts`

### Changes

Replace the current three-branch `detune()` with four branches, adding an explicit `RandomCycle`
check before the numeric fallthrough:

```typescript
detune(...input: CycleInput | [Envelope] | [Lfo]) {
  if (isLfoTuple(input)) {
    this._detune = input[0].scale(100);
  } else if (isEnvelopeTuple(input)) {
    this._detune = input[0].scale(100);
  } else if (isRandomCycleTuple(input)) {
    this._detune = new Parameter(...(input as CycleInput)).scale(100);
  } else {
    const cents = (input as (number | number[])[]).map(p =>
      Array.isArray(p) ? p.map(v => v * 100) : p * 100
    );
    this._detune = new Parameter(...(cents as CycleInput));
  }
  return this;
}
```

`isRandomCycleTuple` is already imported via `@/utils/validate` in both files.

Apply the identical change to `Filter.detune()`.

### Update existing detune tests

Existing tests that assert specific detune schema values were written with cents in mind and will
now fail. Update them to use semitone inputs that produce the same cent values, or rewrite
assertions to reflect the new semitone semantics.

Known locations:
- `packages/fluid/src/index.test.ts` — lines ~98–123
- `packages/fluid/src/effects/filter.test.ts` — lines ~86–93, ~134–149

### New tests

For `Instrument.detune()`:
- `detune(4)` → schema value `400`
- `detune(4, 2, -1)` → values `400`, `200`, `-100` (cycling)
- `detune([4, 2])` → polyphonic group values `400`, `200`
- `detune(d.random().range(-2, 2))` → `range: { min: -200, max: 200 }`
- `detune(new Lfo(2, -2))` → LFO `outputA` value `200`, `outputB` value `-200`
- `detune(new Envelope(0, 1))` → `min: 0`, `max` value `100`
- Default (no call) → value `0` (unchanged — zero times any multiplier is zero)

Repeat the same set for `Filter.detune()`.

### Verification

Run full fluid test suite. All tests pass.

---

## Phase 5 — Cross-package verification

No schema or engine changes were made, but confirm end-to-end correctness.

### Checks

1. **Build all packages:** `pnpm build` — no TypeScript errors across the monorepo.
2. **Full test suite:** `pnpm test` — all packages pass.
3. **Manual smoke test:** construct a pattern using `d.synth().notes(60).detune(4)` and verify
   the emitted schema has `detune.cycle[0][0].value === 400`. Confirm audibly that the note
   sounds a major third above C4 (i.e., E4).
4. **LFO smoke test:** wire up an LFO to detune and confirm the modulation depth matches the
   expected semitone range in the emitted schema.

---

## Constraints and non-goals

- `scale()` is not intended to be part of the public end-user API. It is an internal mechanism
  called only inside `detune()`. It can be left public (TypeScript has no package-private), but
  should not be documented or encouraged for direct use — calling it outside `detune()` on a
  shared object would mutate it for all consumers.
- `@web-audio/schema`, `@web-audio/patterns`, and `@web-audio/audio-engine` require **zero
  changes**.
- Filter's `detune()` represents filter frequency detune, also in cents in the Web Audio API.
  The same semitone semantics apply and the same change is made.
- The `Envelope` sustain parameter (`_s`) intentionally remains unscaled. It is a ratio, not an
  absolute amplitude level. Scaling it would break sustain behavior.
