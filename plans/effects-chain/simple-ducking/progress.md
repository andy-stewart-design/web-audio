# Phase 0 progress

## Baseline

Run from the repository root on 2026-10-13 (working tree was clean before the run):

- `pnpm --filter @web-audio/schema exec vitest run src/validate-graph.test.ts` — passed: 1 file, 102 tests.
- `pnpm --filter @web-audio/fluid exec vitest run src/__tests__/drome.test.ts` — passed: 1 file, 148 tests. Vitest emitted the existing Vite `configLoader: 'native'` / `__dirname` warning.
- `pnpm --filter @web-audio/audio-engine exec vitest run src/buses/runtime-bus.test.ts src/engine.test.ts` — passed: 2 files, 67 tests. The same existing Vite warning was emitted.

No pre-existing failures were found in the focused baseline. No product files were changed in Phase 0.

## Schema-writer inventory

The required `InstrumentSchema.ducks` migration will affect these typed/direct producers and fixtures:

- `packages/schema/src/validate-graph.test.ts`: local `instrument()` and `sampler()` direct-schema helpers, plus their typed object variants/spreads.
- `packages/audio-engine/src/test-utils/schema-fixtures.ts`: `defaultSynthSchema()`, `defaultSamplerSchema()`, and `defaultSamplerGraph()`; these feed engine, instrument, preload, and sampler tests.
- `packages/fluid/src/instruments/synthesizer.ts` and `packages/fluid/src/instruments/sampler.ts`: canonical Fluid serializers.
- `packages/fluid/src/__tests__/drome.test.ts`: expected complete/partial Fluid schema shapes involving route/send fields.
- `packages/fluid/src/__tests__/evaluate-source.test.ts`: expected schema projections of Fluid output; the direct sampler projection is intentionally partial but should be reviewed during migration.
- `apps/web/src/lib/globals/__tests__/eval.worker.test.ts`: partial schema projections only; it does not construct a direct instrument schema. Review expectations after the required field is emitted, but it is not a direct-schema writer.
- `packages/audio-engine/README.md` and `packages/fluid/README.md`: canonical direct-schema/output examples documenting route/send fields; documentation updates belong to Phase 3.

Runtime routing structures in `packages/audio-engine/src/instruments/instrument.ts` and its tests use `InstrumentRouting`, not `InstrumentSchema`, and do not require a `ducks` field. The `sends` references in `packages/midi` are unrelated MIDI output state. No other tracked direct instrument-schema producers were found by repository-wide `git grep` searches.

## Reusable test seams

- `packages/audio-engine/src/buses/runtime-bus.ts` owns the current `input -> effects -> output -> destination` chain, persistent effect bindings, `stop()`, and idempotent `destroy()`. The duck gain can be tested as a bus-owned node inserted between the final effect (or input) and the existing output gain.
- `packages/audio-engine/src/buses/runtime-bus.test.ts` has reusable fake gain/filter nodes and a fake AudioParam with call spies for `setValueAtTime`, `linearRampToValueAtTime`, and `cancelAndHoldAtTime`. These tests prove scheduled calls and connection ownership, not native rendered curves.
- `packages/audio-engine/src/__tests__/support/manual-clock.ts` exposes deterministic `prebar`, `bar`, and `stop` emission with a mutable `currentTime` context and resolved `barDuration`. `packages/audio-engine/src/engine.test.ts` has a second controllable clock and graph/retirement fixtures.
- `packages/audio-engine/src/instruments/resolve-timing.ts` resolves chance-filtered events and assigns consecutive hit indices. `resolve-synth-events.ts` returns one resolved event with shared duration for all notes; `resolve-sampler-events.ts` returns one event with all sampler voices before source lookup.
- The current synth scheduler expands one resolved event into voices in `Synthesizer._scheduleResolvedBar()`. The current sampler scheduler enters source lookup in `_scheduleResolvedSampleNote()`, so a future duck trigger seam must be emitted before that source-availability early-exit path and before per-voice expansion.
- `AudioEngine` currently schedules active instruments and buses independently on each `bar` callback, while `update()` clones/validates before replacing `_pending`; that last-valid-write behavior is covered by existing engine tests and must remain intact.

## Phase 0 assumption review

No material contradiction with the governing simple-ducking spec was found.

- The proposed API/defaults remain the active assumptions: `.duck(target | targets, depth?, onset?, recovery?)`, defaults `1`, `0`, `1`, one normalized configuration per target, and later calls replacing earlier target entries.
- The active contract requires Fluid-side normalization/clamping of finite out-of-range values while direct canonical schemas reject out-of-domain values. Existing Fluid builders more commonly reject invalid static ranges (`send()`, bus transition, static sampler regions), although MIDI defaults and some random sampler-region values are clamped. This is an explicit duck-specific spec assumption, not an existing general builder convention; Phase 1 must implement the stated split rather than silently broaden it.
- The proposed depth mapping is `clamp(1 - sqrt(depth), 0.01, 1)`, with depth `0` a true no-op. The positive floor and exact minimum ramp remain implementation assumptions requiring deterministic call tests and the Phase 3 browser gate.
- Existing bus automation uses `MIN_RAMP = 0.0025` and a 10 ms effective minimum (`MIN_RAMP * 4`) for bus effect transitions, with linear ramps. No existing fake AudioParam supports exponential-ramp methods. The duck implementation must keep its curve/floor choice explicit and add a focused fake only for the calls it actually schedules; fake-call tests cannot establish native browser interpolation.
- The deprecated signal-processing reference describes exponential duck ramps and the same defaults/depth mapping, but it is not authority for this SOW. Browser behavior, including repeated `cancelAndHoldAtTime()` and the audible curve, remains unobserved and must not be claimed from mocks.

## Phase 0 gate result

Inventory, seam inspection, assumption review, and focused baselines are complete. There is no unaddressed blocker or spec contradiction for Phase 1. The required `ducks: {}` migration must be kept atomic across schema types, Fluid serializers, direct fixtures, and affected expectations.

## Phase 1.1 implementation

- Added exported `DuckSchema` and required `ducks: Record<string, DuckSchema>` to `InstrumentSchema`.
- Shared validation now rejects missing/malformed duck records, `main`, unresolved or noncanonical targets, non-finite values, depth outside `[0, 1]`, and negative onset/recovery values with target-indexed paths.
- Fluid instruments now expose `.duck()` for scalar or array targets, use defaults `1`, `0`, `1`, trim target names, clamp finite values to the canonical ranges, and replace duplicate target entries. Serializers emit `{}` when no ducks are configured.
- Migrated schema helpers, engine fixtures, Fluid expectations, and direct-schema documentation examples to the required field. Runtime `InstrumentRouting.sends` references were confirmed unrelated to the schema migration.
- Added schema and Fluid coverage for canonical/invalid records, forward references, target arrays, replacement semantics, defaults, clamping, and unchanged routing/send behavior.

## Phase 1.1 verification

All checks below passed after the final changes:

- `pnpm --filter @web-audio/schema check`
- `pnpm --filter @web-audio/fluid check`
- `pnpm --filter @web-audio/audio-engine check`
- `pnpm check` — 14 workspace checks successful.
- `pnpm --filter @web-audio/schema test:ci` — 112 tests passed.
- `pnpm --filter @web-audio/fluid test:ci` — 30 files, 1128 tests passed.
- `pnpm --filter @web-audio/audio-engine test:ci` — 22 files, 325 tests passed.
- `pnpm --filter @web-audio/schema lint`
- `pnpm --filter @web-audio/fluid lint`
- Targeted schema/Fluid/audio-engine suites passed; Prettier checks and `git diff --check` passed.

The existing Vite `configLoader: 'native'` / `__dirname` warning remains in Fluid and audio-engine test runs. No new failure or runtime ducking claim is recorded here; engine last-valid-write and runtime behavior remain Phase 2/Step 2.3 work.
