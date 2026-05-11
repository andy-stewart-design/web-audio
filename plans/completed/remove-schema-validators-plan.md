# Plan: Remove Schema Type Guard Functions

## Context

The `@web-audio/schema` package exports three type guard functions — `isEnvelope`, `isStatic`, and `isRandom`. These are thin wrappers around `v.type === "x"` checks on a discriminated union. TypeScript narrows the type automatically with inline checks, making these functions unnecessary indirection. Removing them before the LFO work avoids adding more (`isLfo`, `isFilterEffect`, `isGainEffect`) and keeps the schema package as pure type definitions.

**Note:** The fluid-package validators (`isEnvelopeTuple`, `isRandomCycleTuple`, `isRandomCycle` in `packages/fluid/src/utils/validate.ts`) are `instanceof` checks on class instances — a different pattern that is genuinely useful. Those are not affected by this plan.

---

## Step 1 — Replace `isEnvelope` usage in audio-engine

**Files:**

- `packages/audio-engine/src/instrument.ts`
- `packages/audio-engine/src/synthesizer.ts`

Replace all `isEnvelope(x)` calls with `x.type === "envelope"`. Remove the `isEnvelope` import from both files.

**Current usage:**

`instrument.ts:142` — in `_buildEffectNode`:

```ts
if (isEnvelope(schema)) {
```

becomes:

```ts
if (schema.type === "envelope") {
```

`synthesizer.ts:105` — in `_resolveDetune`:

```ts
if (isEnvelope(detune))
```

becomes:

```ts
if (detune.type === "envelope")
```

**Acceptance criteria:**

- [ ] No imports of `isEnvelope`, `isStatic`, or `isRandom` remain in the audio-engine package
- [ ] TypeScript still narrows types correctly in all branches
- [ ] `pnpm --filter @web-audio/audio-engine exec tsc --noEmit` passes

**Testing:**

- [ ] Existing audio-engine tests pass: `pnpm --filter @web-audio/audio-engine exec vitest run`

---

## Step 2 — Remove type guards and tests from schema package

**Files:**

- `packages/schema/src/index.ts`
- `packages/schema/src/index.test.ts`

Remove the three functions (`isEnvelope`, `isStatic`, `isRandom`) and their exports. Remove the corresponding test cases in `index.test.ts`.

**Acceptance criteria:**

- [ ] `isEnvelope`, `isStatic`, and `isRandom` are no longer exported from `@web-audio/schema`
- [ ] Tests for these functions are removed
- [ ] `pnpm --filter @web-audio/schema exec tsc --noEmit` passes

**Testing:**

- [ ] Remaining schema tests pass: `pnpm --filter @web-audio/schema exec vitest run`

---

## Step 3 — Verify no other consumers

- [ ] `pnpm --filter @web-audio/fluid exec tsc --noEmit` passes (fluid doesn't import schema validators)
- [ ] Full build passes: `pnpm run build` or equivalent

---

## File Change Summary

| File                                       | Change                                                              |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `packages/schema/src/index.ts`             | Remove `isEnvelope`, `isStatic`, `isRandom` functions and exports   |
| `packages/schema/src/index.test.ts`        | Remove type guard test cases                                        |
| `packages/audio-engine/src/instrument.ts`  | Replace `isEnvelope(x)` with `x.type === "envelope"`, remove import |
| `packages/audio-engine/src/synthesizer.ts` | Replace `isEnvelope(x)` with `x.type === "envelope"`, remove import |
