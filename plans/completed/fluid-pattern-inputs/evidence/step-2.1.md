# Step 2.1 — Atomic pattern-valued envelope minimum

## Result

**Step 2.1 / AG1 verified. Phase 2 exit gate satisfied.** Fluid, canonical graph validation, engine resolution, and first-party fixtures now agree that envelope minimum is a numeric pattern. Resolved envelopes and envelope arithmetic remain scalar.

Final verification against the working-tree patch:

- Schema: **134 tests / 1 file**.
- Fluid: **1,270 tests / 38 files**.
- Audio engine: **410 tests / 28 files**.
- All three packages' `check` and `lint` commands passed.
- Touched-file formatting and `git diff --check` passed.
- Dependency build: **6 successful tasks**, with fresh Patterns, Fluid, and audio-engine runtime/declaration builds; clock, MIDI, and worklets restored from cache.
- Supplemental built Fluid/Patterns/schema integration passed through the existing TS-capable runner.

Native rendering remains pending Step 4.2. Phase 3 has not started.

## Revision and authority

- Starting revision: `2a33c55860ca574f3e80ccb9235d5605a4945d9c`.
- Initial worktree: clean before the Step 2.1 status update.
- This record applies to the uncommitted Step 2.1 patch relative to that revision.
- The approved [single-undefined/defaults amendment](step-1.1-envelope-defaults.md), [Patterns-owned static-only structured values](step-1.2-patterns-ownership.md), and [Phase 1 integration](step-1.3.md) remain authoritative.
- User-facing documentation, READMEs, overview, and spec were not edited. The documentation clause in the original step task is superseded by the earlier user-ownership instruction; completion here covers code, tests, fixtures, and internal evidence, not documentation delivery.

## Delivered contract

```ts
const minimum = d.str([0, 0.1], -0.2);
const maximum = d.str(0.5, [0.8, 1], 0.25);
const envelope = d.env(minimum, maximum);

instrument.gain(envelope);
instrument.detune(d.env("-20 10", "80 40"));
```

- Both canonical bounds are `NumberPattern`, never a scalar/pattern union. Defaults serialize as static `[[0]]` minimum and `[[1]]` maximum.
- Minimum is stored through the same Fluid `Parameter` model as maximum and accepts scalars, direct/reusable shorthand, shared static structured values, and direct random cycles. No `.min()` setter was added.
- `env()` and `env(undefined)` still use both defaults. A sole supplied bound always means maximum. With multiple fields, the first is minimum and the remainder describes maximum during this transitional phase.
- Multi-field `undefined`, `null` bounds, unsupported modulation sources, numeric rest/string/chord nesting, and invalid wrapper composition remain invalid. Factory and constructor signatures/dispatch agree.
- Raw minimum arrays and a sole raw-array maximum remain invalid. Existing explicit-minimum-plus-variadic/raw maximum forms remain supported until Step 3.3; final strict two-slot arity is not claimed here.
- Static wrapper strings remain structured atoms, not shorthand. Direct random inputs remain direct; the builder remains static-only.
- Numeric gain / `.max()` updates preserve patterned minimum, ADSR, and mode. Complete-envelope gain replacement retains its existing behavior.

### Graph and playback

At each existing envelope event, the engine resolves minimum and maximum using the same event `barIndex` and `hitIndex`. Each pattern wraps its own bar count and within-bar width independently. No new event rhythm, clock, cursor, or audio-rate modulation was introduced.

The resolved minimum is retained for that event's complete envelope, including release. External detune resolves the envelope before native source initialization and carries that same resolved envelope into scheduling, avoiding a second minimum lookup. Main gain and the existing generic external parameter path use the same scalar resolution boundary.

`ResolvedEnvelopeSchema.min`, `EnvelopeParams.min`, and `computeEnvelope()` remain numeric. Sustain remains `min + (max - min) * s`; finite negative/out-of-unit bounds, inversion, and patterned crossings are not sorted or range-normalized.

## Static validation and atomicity correction

Review found that simply storing minimum as a `Parameter` inherited legacy deferred static serialization failures: a non-finite bound could survive construction, and `.max(NaN)` / numeric instrument gain could replace valid state before throwing later. This did not satisfy the envelope-bound validation/rollback contract.

Envelope construction and `.max()` now validate **static candidate parameters before publication/assignment**. Tests call invalid constructors/factories without `.getSchema()` and verify rejection of `NaN`, infinities, invalid legacy maximum bars, empty static patterns, and unsupported maximum sources. Failed `.max()` / numeric gain leaves prior patterned minimum, maximum, ADSR, and mode unchanged.

This correction is intentionally envelope-bound-local:

- Generic `Parameter` legacy deferred validation was not changed.
- Legacy positional ADSR scalar validation and its existing tests were not changed. Current positional ADSR source/wrapper restrictions and late-invalid-shorthand atomicity remain intact; Step 3.2 owns that positional boundary.
- Direct `RandomCycle` candidates are **not eagerly serialized, sampled, frozen, or cloned**. Eager serialization would materialize pending source configuration and alter its existing lifecycle. Random configuration remains live and is validated by its established source/serialization path, just as for maximum.
- Valid legacy raw maximum arrays keep their existing caller-owned aliasing. Static candidate validation does not convert them into reusable snapshots.
- Envelope serialization retains minimum/maximum error context for later raw-array mutation or live-source configuration failures.

These are scoped implementation choices satisfying AG1; no new source permissions, separate minimum setter, legacy graph adapter, or accepted gate waiver was introduced.

## Reader/writer inventory and migration

Independent repository inventory and final source review found the following complete active boundary:

| Area                   | Canonical producer/reader                                     | Disposition                                                                                                           |
| ---------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Schema                 | `packages/schema/src/index.ts`, `validate-graph.ts`           | Minimum is `NumberPattern`; uses the same validator as maximum. Scalar canonical minimum is rejected.                 |
| Fluid                  | `packages/fluid/src/automations/envelope.ts`                  | Owns patterned minimum/default serialization and static-bound validation.                                             |
| Fluid input typing     | `packages/fluid/src/inputs/types.ts`                          | Numeric whole-value union for envelope fields; no nested modulation-source alternative.                               |
| Factory                | `packages/fluid/src/drome.ts`                                 | Existing constructor-derived forwarding already picks up the updated signature; no duplicate dispatch or edit needed. |
| Indirect Fluid writers | Instrument defaults, synth-base, sampler, gain/filter effects | Serialize through `Envelope` / existing audio-source dispatch, rather than emitting their own scalar minimum.         |
| Engine event lookup    | `packages/audio-engine/src/instruments/instrument.ts`         | Resolves both bounds per current event; external detune initialization and scheduling share the resolved envelope.    |
| Engine resolved types  | `packages/audio-engine/src/parameters/types.ts`               | Resolved minimum remains scalar; resolved detune carries the already-resolved envelope.                               |

Migrated canonical fixtures and assertions:

- `packages/schema/src/validate-graph.test.ts`.
- Engine `src/__tests__/support/schema-fixtures.ts` and instrument, synthesizer, pre-envelope-effects, noise, and sampler suites.
- Fluid envelope, `drome`, parameter compatibility/shorthand, and gain/filter effect suites.
- Existing public structured-input tests already compare minimum schemas structurally and continue to pass; no edit was needed there.

Remaining scalar minima are intentionally **not** canonical envelope data:

- Engine `ResolvedEnvelopeSchema` / `EnvelopeParams`, `compute-envelope.ts`, and resolved-envelope computation/normalization/voice-source/main-envelope test doubles.
- Random/MIDI/event range endpoints, sampler regions, and unrelated numeric minima.
- Historical plan/evidence/spec snippets and user-owned documentation/snippets.

No additional direct canonical envelope graph producer was found in apps or audio-regression fixtures. Their active sketches create envelopes through Fluid, so numeric two-bound source calls need no Step 2.1 migration. No persisted-graph compatibility layer was added.

## Deterministic proof and review

### Schema

Validation tests accept static/random minimums and unrestricted/inverted bounds. The min/max parity matrix rejects scalar minima, missing/empty/malformed static patterns, non-finite values, null/nested source shapes, and invalid random metadata according to the existing numeric-pattern policy.

### Fluid

Public and constructor tests cover defaults, sole-wrapper maximum, two shorthand/reusable/shared structured bounds, direct random bounds and later configuration, snapshot reuse, field-context failures, null/undefined/source restrictions, type-negative probes, preservation of patterned minimum during numeric gain/max changes, and failed max/late-invalid ADSR rollback. Generated graphs validate with canonical pattern-valued bounds.

### Engine

Actual fake-audio scheduling tests prove:

- **Six events over bars 2 and 3**, with a two-bar minimum and three-bar maximum and differing within-bar widths; every event's minimum, attack maximum, sustain, and release are asserted.
- Constant inverted bounds `2..-1` and scalar sustain `1.25` are preserved without unit-range or order normalization.
- Patterned bounds cross in both directions over multiple bars/hits; scheduled values remain in authored order.
- Random minimum is looked up exactly once per scheduled event for both main gain and external detune.
- Native detune source initialization, first scheduled value, and release destination agree on the same resolved scalar.
- Main gain release retains its event's random minimum when later events use subsequent values.

Existing resolver and scalar envelope-computation tests remain green. Independent final read-only review found no remaining genuine AG1 blocker or material coverage gap. Fake audio proves calls/values, not native sound.

## Verification

Parent verification ran against the final source/test patch after review corrections. No worker-count override or warning suppression was used.

| Gate                                      | Command                                                                                                                                                                                                                                                                                                                         | Result                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Schema focused/full                       | `pnpm --filter @web-audio/schema test:ci`                                                                                                                                                                                                                                                                                       | **134 tests / 1 file**                 |
| Fluid focused + affected defaults/effects | `pnpm --filter @web-audio/fluid exec vitest run src/automations/__tests__/envelope.test.ts src/__tests__/parameter-compatibility.test.ts src/__tests__/parameter-shorthand.test.ts src/__tests__/structured-inputs.test.ts src/__tests__/drome.test.ts src/effects/__tests__/gain.test.ts src/effects/__tests__/filter.test.ts` | **253 tests / 7 files**                |
| Prescribed engine focused                 | `pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/__tests__/instrument.test.ts src/patterns/__tests__/value-pattern-resolver.test.ts src/parameters/__tests__/compute-envelope.test.ts`                                                                                                                    | **64 tests / 3 files**                 |
| Added scheduling integration              | `pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/__tests__/synthesizer.test.ts`                                                                                                                                                                                                                           | **19 tests / 1 file**                  |
| Fluid full                                | `pnpm --filter @web-audio/fluid test:ci`                                                                                                                                                                                                                                                                                        | **1,270 tests / 38 files**             |
| Engine full                               | `pnpm --filter @web-audio/audio-engine test:ci`                                                                                                                                                                                                                                                                                 | **410 tests / 28 files**               |
| All core static gates                     | `check` and `lint` separately for `@web-audio/schema`, `@web-audio/fluid`, `@web-audio/audio-engine`                                                                                                                                                                                                                            | All six passed                         |
| Phase 2 dependency build                  | `pnpm exec turbo run build --filter=@web-audio/fluid --filter=@web-audio/audio-engine`                                                                                                                                                                                                                                          | 6 successful tasks; 3 fresh / 3 cached |

Prettier checked all 20 changed TypeScript paths, plus the plan and this evidence file after status updates; `git diff --check` passed. Existing Vite `__dirname` and experimental `tsgo` notices remain non-failing.

### Supplemental built integration

After the dependency build, this passed using existing package exports and the installed TS-capable runner:

```sh
pnpm --filter @web-audio/audio-regression exec tsx --eval '
import assert from "node:assert/strict";
import Drome from "@web-audio/fluid";
import { createStructuredInput } from "@web-audio/patterns";
import { validateDromeGraph } from "@web-audio/schema";
const d = new Drome();
const minimum = createStructuredInput([0.1, 0.2], -0.1);
const envelope = d.env(minimum, d.str(0.8, 1.2, -0.2)).adsr(0.1, 0.2, 0.5, 0.2);
d.synth().notes(d.str([60, 64, 67])).gain(envelope)
  .detune(d.env("-20 10", "80 40")).push();
const graph = d.getSchema();
assert.deepEqual(graph.instruments[0].gain.min,
  { type: "static", cycle: [[0.1, 0.2], [-0.1]] });
assert.doesNotThrow(() => validateDromeGraph(graph));
const before = envelope.getSchema();
assert.throws(() => envelope.max(Number.NaN), /maximum/);
assert.deepEqual(envelope.getSchema(), before);
assert.throws(() => d.env(Number.POSITIVE_INFINITY, 1), /minimum/);
const broken = structuredClone(graph);
broken.instruments[0].gain.min = 0;
assert.throws(() => validateDromeGraph(broken), /gain.min must be an object/);
const random = d.rand().steps(2).range(-1, 0).ribbon(7);
const control = d.rand().steps(2).range(-1, 0).ribbon(7);
const live = d.env(random, 1);
random.steps(3).range(-2, 0).ribbon(11);
control.steps(3).range(-2, 0).ribbon(11);
assert.deepEqual(live.getSchema().min, control.getRandomSchema());
console.log("Built patterned bounds, canonical validation, static rollback, and live random lifecycle passed.");
'
```

This is graph/API artifact proof under that runner, not bare-Node compatibility, native engine rendering, or listening acceptance. The prior source-exported schema/bare-Node runner limitation is unchanged.

## Completion boundary

**AG1 is complete as one producer/validator/consumer patch.** No first-party canonical scalar-minimum producer or unresolved scalar-minimum reader remains. Source tests, validation, declarations, artifacts, independent inventory, and deterministic scheduling agree.

No separate minimum setter, positional ADSR expansion, strict envelope/noise/filter/chop/LFO arity cleanup, timing-generator patternability, documentation edit, install, browser/native workflow, reference update, commit, publication, or deployment was performed. Step 3.1 and later work remain pending; native confirmation remains Step 4.2.
