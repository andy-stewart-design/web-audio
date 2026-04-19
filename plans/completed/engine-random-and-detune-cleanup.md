# Engine Random Resolution & Detune Cleanup

Prerequisite for the [gain & envelope plan](./gain-and-envelope.md). Establishes the foundational `_resolve` method and random generation logic that the envelope implementation depends on.

## Scope

### 1. Move random utilities from patterns to engine

The random utilities in `packages/patterns/src/utils/random.ts` are execution concerns, not description concerns. `RandomCycle` in the patterns package is purely descriptive — it produces a `RandomSchema` and does not import these utilities.

**Move to `packages/audio-engine`:**
- `xorwise`, `mulberry32` (PRNG algorithms)
- `getSeed`, `seedToRand` (seed management)
- `floatMapper`, `intMapper`, `binaryMapper`, `quantizeMapper` (value mappers)
- Associated types: `RandMapper`, `RandAlgo`
- Move tests as well

**Remove from `packages/patterns`:**
- `packages/patterns/src/utils/random.ts`
- `packages/patterns/src/utils/random.test.ts`

### 2. Implement `RandomResolver` in engine

A class that takes a `RandomSchema` and produces concrete values.

**Interface:**
```ts
class RandomResolver {
  constructor(schema: RandomSchema) {}
  resolve(barIndex: number, stepIndex: number): number
}
```

**Behavior:**
- Generates all values for a bar on first access, caches the result (last bar only)
- Segment resolution: if all segments have `len`, compute total period and loop. If a segment lacks `len` (single segment, no loop), use `segments[0].seed + barIndex` as seed input
- Seed walking: for each step in the bar, advance the seed (xor: `seed = xorwise(seed)`, mulberry: `seed = (seed + 1) | 0`)
- Uses the `cycle` (StaticSchema) from RandomSchema as a mask — step value `1` = generate, `0` = output 0
- Value mapping: select mapper based on `dataType` (float/integer/binary) and `quantValue`
- Range: apply `range.min` / `range.max` if present, otherwise default to 0–1

**Reference implementation** (from old codebase at `/Users/andystewart/Documents/Development/drome/packages/patterns/src/random-cycle.ts`):
- `getSegmentInfo(barIndex)` — resolves seed + offset from ribbon segments
- `generate(barIndex)` — walks mask, advances seed per step, maps to range, caches result

### 3. Make detune required on schema

**In `@web-audio/fluid`:**
- `Instrument` always emits a detune value in `getSchema()` — defaults to `StaticSchema` with value 0 when user doesn't call `.detune()`
- Update `SynthesizerSchema` type to make detune non-optional

**Principle:** Fluid resolves all defaults. Engine never checks for undefined or applies fallback values.

### 4. Implement `_resolve` in `SynthesizerPlayer`

**Method:**
```ts
private _resolve(schema: ParameterSchema, barIndex: number, noteIndex: number): number {
  if (schema.type === "random") {
    return this._getResolver(schema).resolve(barIndex, noteIndex);
  }
  const bar = schema.cycle[barIndex % schema.cycle.length];
  return bar[noteIndex % bar.length].value;
}
```

**Resolver management:**
- `Map<RandomSchema, RandomResolver>` for lazy creation and reuse
- Scales automatically as new params are added — no per-param properties

```ts
private _resolvers = new Map<RandomSchema, RandomResolver>();

private _getResolver(schema: RandomSchema): RandomResolver {
  let resolver = this._resolvers.get(schema);
  if (!resolver) {
    resolver = new RandomResolver(schema);
    this._resolvers.set(schema, resolver);
  }
  return resolver;
}
```

### 5. Refactor detune lookup

Replace `_getDetuneBar` with `_resolve`:

**Before:**
```ts
private _getDetuneBar(barIndex: number) {
  const detune = this._schema.detune;
  if (!detune || detune.type === "random") return null;
  return detune.cycle[barIndex % detune.cycle.length];
}

// in scheduleBar:
const detuneValue = detuneBar
  ? detuneBar[note.stepIndex % detuneBar.length].value
  : 0;
```

**After:**
```ts
// in scheduleBar:
const detuneValue = this._resolve(this._schema.detune, barIndex, note.stepIndex);
```

## Out of Scope

- Envelope types, envelope builder, gain parameter (see [gain & envelope plan](./gain-and-envelope.md))
- `transform` support on RandomSchema — not needed; instrument-specific transforms are engine-level concerns
- RandomSchema on notes — notes already have their own scheduling path

## Files Touched

| Package | File | Change |
|---------|------|--------|
| `@web-audio/patterns` | `src/utils/random.ts` | Remove |
| `@web-audio/patterns` | `src/utils/random.test.ts` | Remove |
| `@web-audio/audio-engine` | `src/utils/random.ts` | Add (moved from patterns) |
| `@web-audio/audio-engine` | `src/random-resolver.ts` | Add |
| `@web-audio/audio-engine` | `src/synthesizer-player.ts` | Refactor: add `_resolve`, `_getResolver`, remove `_getDetuneBar` |
| `@web-audio/fluid` | `src/instruments/instrument.ts` | Default detune to static 0 |
| `@web-audio/fluid` | `src/instruments/synthesizer.ts` | Ensure detune always emitted in `getSchema()` |
| `@web-audio/fluid` | `src/types.ts` | Update `SynthesizerSchema` — detune non-optional |
