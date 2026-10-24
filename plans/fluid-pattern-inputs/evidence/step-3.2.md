# Step 3.2 — Explicit LFO endpoints and static structured ADSR

## Result and scope

**Step 3.2 verified. Phase 3 remains in progress.** LFO endpoints and positional ADSR now accept explicit single values with their own source permissions, fixed named parameters, and runtime arity checks.

Final parent verification:

- Prescribed focused suites: **97 tests / 4 files**.
- Parameter/resolver/numeric/noise/filter/bus regressions: **93 tests / 6 files**.
- Full Fluid suite: **1,307 tests / 38 files**.
- Fluid and audio-regression `check` / `lint` passed.
- Existing engine instrument/LFO regressions: **42 tests / 1 file**.
- Exact touched-path formatting and `git diff --check` passed.
- Dependency build: **2 successful tasks**; Patterns cached, Fluid compiled fresh with runtime/declaration output.
- Built-package API checks and evaluation of both migrated regression sketches passed, without rendering or fetching sample assets.
- Independent final source/caller review found no production blocker.

Starting revision: `900d6852d303c3e34a9d84a63e53d9cb1a24074d`. The worktree was clean before the Step 3.2 status update. Verification applies to the uncommitted patch relative to this revision.

Step 3.3 and the Phase 3 exit gate have not started. Native confirmation remains Step 4.2.

## Delivered contract

### LFO

Constructor and factory each have one straightforward two-parameter signature:

```ts
new Lfo(outputA: NumericPatternValue, outputB: NumericPatternValue)
d.lfo(outputA: NumericPatternValue, outputB: NumericPatternValue)
```

Each endpoint accepts a scalar, direct/reusable shorthand, static structured numeric value, or direct random cycle. Raw arrays, missing/extra arguments, undefined/null, non-finite values, unsupported objects, and Envelope/LFO/MIDI/Parameter sources are rejected. Both public boundaries check arity before forwarding or creating endpoint parameters.

```ts
d.lfo(d.str(300, 900), d.str(2500, 4500)); // two bars at each endpoint
d.lfo(d.str([0.2, 0.8]), 1); // intentional multivalue bar
```

Full multivalue bars remain in the schema. Playback still uses the first value of each bar; warning state remains per LFO instance and per affected endpoint. Construction/validation does not warn. Serialization warns once for each affected static endpoint and does not reset warnings on repeated serialization. Direct random endpoints remain live and are not eagerly serialized, sampled, copied, or treated as static warning cases.

LFO speed, waveform, phase, normalization/inversion aliases, unique IDs, and scalar configuration behavior were not expanded or reinterpreted.

### Positional ADSR

Both Envelope and Instrument retain exactly four named required fields:

```ts
envelope.adsr(a, d, s, r);
instrument.adsr(a, d, s, r);
```

Each field now accepts a scalar, direct/reusable shorthand, or static structured numeric value. There are no new overload sets or rest-argument implementations.

```ts
instrument.adsr(d.str(0.01, 0.02), d.sh("0.2 0.3"), 0.7, d.str([0.1, 0.2]));
```

Raw arrays, direct random cycles, nested audio sources, numeric rests/string atoms, invalid wrapper geometry, missing/extra fields, and non-finite values are rejected synchronously. All four candidate parameters validate before any existing ADSR field is assigned. Failed replacements preserve parameter identities, serialized ADSR, patterned minimum/maximum, mode, and the instrument's existing gain-envelope object.

This deliberately replaces the old tests that characterized deferred invalid positional ADSR scalars. Positional ADSR now has the synchronous validation/atomicity required by this step; generic Parameter and dedicated setter deferred behavior were not globally tightened.

Dedicated `.a()/.d()/.s()/.r()` remain variadic and retain direct random inputs and live configuration. Random objects remain invalid builder contents independently of ADSR permission checks.

## Implementation and simplification

- `parameters/parameter.ts` adds focused `createParameterValue()` in the existing numeric parameter module. It reuses the ordinary numeric decoder and Parameter constructor, validates static candidates, and returns direct-random Parameters without eager serialization.
- `parameters/resolve-audio-param.ts` now delegates numeric values to that helper after its existing audio-source checks. This removes duplicated numeric resolution rather than adding a normalization pipeline or permission-options framework.
- `automations/lfo.ts` calls the numeric value helper directly. Its special raw-array interpretation, redundant `LfoInput` alias, and trivial `_toParameter` wrapper were removed.
- `automations/envelope.ts` adds exact ADSR arity and allows static wrappers through numeric value resolution. Its existing random/array positional restrictions and all-candidates-before-assignment sequence remain.
- `instruments/instrument.ts` checks ADSR arity before forwarding, preventing extra JavaScript arguments from being silently dropped.
- `drome.ts` checks LFO arity before forwarding; `inputs/types.ts` adds the permitted static wrapper alternative to `ADSRInput`.
- The previously exported internal structured numeric decoder is no longer needed outside its module, so that extra export was removed. Decoder behavior itself is unchanged.

No argument-array normalizer, new module, arbitrary generic brand assertion, new source category, or broad constructor cleanup was introduced. Envelope construction and its transitional maximum rest arguments remain unchanged for Step 3.3, as do sampler chop and timing generators.

## Migration and ownership review

Old LFO raw arrays meant separate bars. Their replacement is `d.str(...oldArray)`, not `d.str(oldArray)`:

- `packages/audio-regression/cases/bends/sketch.js`: output B `[0, b, 0, -b]` → `d.str(0, b, 0, -b)`.
- `packages/audio-regression/cases/lfo-filter/sketch.js`: `[300, 900]` / `[2500, 4500]` → two corresponding `d.str(...)` values.
- Fluid constructor/public tests migrate the same geometry and retain intentional raw-array negative probes.

Both complete migrated sketches were inspected and evaluated through the built Fluid entry. Their expected endpoint bar cycles were asserted; non-LFO chains and approved audio references were not changed.

No active raw-array LFO caller remains under apps/packages outside intentional negative tests. `notes/snippets/snippets.js` is unimported scratch/history, not an active case: the regression loader reads only `packages/audio-regression/cases/`. Its three old calls are explicitly classified as historical and left untouched. User-owned docs, READMEs, overview, and spec remain untouched despite original plan examples mentioning docs; the earlier documentation-ownership amendment governs.

## Tests and review

Extended LFO tests prove constructor/factory parity, bars versus multivalue steps, immutable shared inputs, raw-array/source/value rejection at both endpoints and boundaries, type-negative signatures, fixed formal arity, lazy random configuration compared with controls, unique IDs, and warnings only on serialization, once per affected endpoint.

ADSR tests prove exact numeric schemas in all four fields on Envelope and Instrument, mixed scalar/shorthand/wrapper calls, shared input snapshots, all-field source/atom failure matrices, short/extra argument rejection, exact prior Parameter identities and schemas after failures, no eager serialization of existing random maximum, and preserved dedicated setter random/variadic behavior.

The public structured test now asserts exact ADSR cycles and preservation of unrelated bounds/mode rather than merely checking that schemas changed. Invalid type probes remain uninvoked; runtime invalid cases use reflection without `as any` or `as never`.

The existing audio-engine instrument suite, including first-value-per-bar LFO behavior, passed without engine source changes. Independent review confirmed the active source migrations and that warning state/permissions were not relaxed.

## Verification

Parent ran these against the final source/test patch with default workers and no warning suppression:

```sh
pnpm --filter @web-audio/fluid exec vitest run src/automations/__tests__/lfo.test.ts src/automations/__tests__/envelope.test.ts src/__tests__/parameter-shorthand.test.ts src/__tests__/structured-inputs.test.ts
# 97 tests / 4 files

pnpm --filter @web-audio/fluid exec vitest run src/parameters/__tests__/parameter.test.ts src/parameters/__tests__/resolve-audio-param.test.ts src/inputs/__tests__/decode-numeric-input.test.ts src/instruments/__tests__/noise.test.ts src/effects/__tests__/filter.test.ts src/buses/__tests__/bus.test.ts
# 93 tests / 6 files

pnpm --filter @web-audio/fluid test:ci
# 1,307 tests / 38 files

pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint

pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/__tests__/instrument.test.ts
# 42 tests / 1 file, no native rendering

pnpm exec turbo run build --filter=@web-audio/fluid
# 2 successful tasks; Patterns cached, Fluid fresh
```

Prettier checked all 14 changed TypeScript/JavaScript paths plus plan/evidence; `git diff --check` passed. Existing Vite `__dirname` and experimental `tsgo` notices remain non-failing.

### Supplemental built-package and sketch evaluation

The following passed after the final dependency build, using the existing TS-capable runner:

```sh
pnpm --filter @web-audio/audio-regression exec tsx --eval '
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Drome, { evaluateSource } from "@web-audio/fluid";
const d = new Drome();
const lfo = d.lfo(d.str(300, 900), d.str(2500, 4500));
assert.deepEqual(lfo.getSchema().outputA, {type: "static", cycle: [[300], [900]]});
const Lfo = lfo.constructor;
for (const args of [[], [0], [0, 1, 2], [[300, 900], 1], [0, [2500, 4500]], [d.env(), 1]]) {
  assert.throws(() => Reflect.apply(d.lfo, d, args));
  assert.throws(() => Reflect.construct(Lfo, args));
}
const envelope = d.env(d.str(0, 0.1), d.str(1, 0.8))
  .adsr(d.str(0.1, 0.2), d.sh("0.2 0.3"), 0.7, d.str([0.1, 0.2]));
const before = envelope.getSchema();
assert.deepEqual(before.a, {type: "static", cycle: [[0.1], [0.2]]});
assert.throws(() => envelope.adsr(0.1, 0.2, 0.7, d.rand()));
assert.deepEqual(envelope.getSchema(), before);
const instrument = d.synth().gain(envelope).adsr(d.str(0.1), 0.2, 0.7, 0.1).push();
const gain = instrument.getSchema().gain;
assert.throws(() => Reflect.apply(instrument.adsr, instrument, [0.1, 0.2, 0.7, 0.1, 1]));
assert.deepEqual(instrument.getSchema().gain, gain);
assert.equal(d.getSchema().instruments.length, 1);
const random = d.rand().steps(2).range(0, 1).ribbon(7);
const control = d.rand().steps(2).range(0, 1).ribbon(7);
const live = d.lfo(random, 1);
random.steps(3).range(0.2, 0.8).ribbon(11);
control.steps(3).range(0.2, 0.8).ribbon(11);
assert.deepEqual(live.getSchema().outputA, control.getRandomSchema());
for (const name of ["bends", "lfo-filter"]) {
  const graph = evaluateSource(readFileSync(`cases/${name}/sketch.js`, "utf8"));
  const source = name === "bends" ? graph.instruments[0].detune : graph.instruments[0].effects[0].frequency;
  assert.equal(source.type, "lfo");
  assert.deepEqual(source.outputB, {type: "static", cycle: name === "bends" ? [[0], [400], [0], [-400]] : [[2500], [4500]]});
}
console.log("Built LFO/ADSR slots, rollback, random lifecycle, and both migrated case graphs passed.");
'
```

This is built graph/API proof under that runner. The sample URLs in the evaluated sketch remain metadata; this probe does not fetch them, create an audio context, launch Chromium, or render audio. It does not establish bare-Node compatibility or native waveform equivalence. The previously recorded schema/bare-Node runner limitation remains unchanged.

## Completion boundary

Fixed LFO/ADSR slots, static structured ADSR support, permissions, warning timing, atomicity, and active geometry-preserving migrations compose in one verified change. No waiver is required.

Schema, engine, Patterns, worklets, user-owned docs/READMEs/overview/spec, historical notes, dependencies/lockfiles, and approved audio reference files were not changed. No installs, dev servers, browser/native runs, commits, publication, or deployment were performed. Step 3.3 and the full Phase 3 exit gate remain pending.
