# Step 3.1 — Strict noise and filter slots

## Result and scope

**Step 3.1 verified under the user-approved simplification amendments below. Phase 3 remains in progress.** Strict filter frequency and noise gain are required, named, single-value inputs. Dedicated filter aliases retain their variadic convenience.

Final parent verification:

- Prescribed focused suites: **80 tests / 4 files**.
- Resolver, numeric-decoder, and bus regressions: **42 tests / 3 files**.
- Full Fluid suite: **1,293 tests / 38 files**.
- Fluid `check`, `lint`, exact-path formatting, and `git diff --check` passed.
- Dependency build: **2 successful tasks**; Patterns cached, Fluid runtime/declarations compiled fresh.
- Built-package smoke passed for required inputs, atomic failures, source-only noise gains, and dedicated aliases.
- Independent source and caller-migration review found no remaining production blocker.

Starting revision: `547a95fc10f700029ec9c8b25675939063267c16`. Verification covers the current uncommitted Step 3.1 patch relative to that revision. No commit or ref update was made.

## Simplification correction after user review

The user clarified that simplification must be visible in implementations, not merely enforced by overloads around variadic bodies.

- Filter constructor and factory use named `type` and `frequency` parameters, not rest arguments.
- Noise uses named `colorOrGain` and `gain` parameters, with no rest input, slicing, or argument-array forwarding.
- Public methods own arity checks using `arguments.length`; shared resolution handles one actual value.
- `normalizeSingleAudioParamInput`, its module/test suite, and the redundant numeric-slot alias were removed, not renamed.
- One focused value resolver lives in the existing audio-parameter resolver module. Direct sources return early; static candidates use existing numeric decoding and Parameter creation. No normalization pipeline, validation flag, or repeated source-to-tuple adapters remain.

Tests check fixed formal arity as well as accepted/rejected calls. The removed normalizer suite's relevant value cases were consolidated into the existing resolver suite; no test was skipped to obtain a pass.

This principle also governs later positional API migrations, without authorizing those steps now. Envelope constructor cleanup remains Step 3.3.

## Required-input amendment

The user separately approved:

1. **Require frequency** in the strict filter constructor and factory, removing omission overloads.
2. **Require noise gain**, removing no-argument and color-only default-gain calls.

These decisions supersede the original spec/plan's optional noise/default-gain forms, the filter omission-preservation clause for strict construction, and earlier Step 3.1 evidence that preserved those cases. They are approved contract amendments, not test waivers. User-owned spec/documentation files remain untouched.

Final strict forms:

```ts
filter(type: FilterType, frequency: SingleSlotAudioParamInput)
constructor(type: FilterType, frequency: SingleSlotAudioParamInput)

noise(gain: SingleSlotAudioParamInput)
noise(color: NoiseColor, gain: SingleSlotAudioParamInput)
```

There is one filter factory signature and one constructor signature. The two noise overloads describe the two genuinely distinct valid call shapes; the implementation still has two named parameters.

### Noise

- `noise(gain)` uses white noise; `noise(color, gain)` uses the supplied existing color (`white` or `pink`).
- `noise()`, `noise("white")`, and `noise("pink")` reject before changing the layer. There is no default gain.
- Gain accepts a scalar, direct/reusable shorthand, static structured numeric value, direct random cycle, or the already-permitted Envelope/LFO/MIDI source.
- A sole non-color string remains numeric shorthand. Since shorthand is typed as `string`, a color-only string can still fit that broad TypeScript category; runtime checks reject it. No complicated literal-exclusion type was introduced.
- Raw gain arrays, extra arguments, explicit undefined/null, non-finite numbers, malformed numeric wrappers, unsupported objects, and direct internal `Parameter` instances are rejected atomically.
- Successful calls replace the complete layer. Failed calls retain the exact prior `_noise` object and schema across synthesizer, unison, and sampler instruments.

Intent-preserving source migrations:

```ts
instrument.noise(1); // replaces old noise()
instrument.noise("pink", 1); // replaces old noise("pink")
instrument.noise("pink", d.str(0.2, 0.1)); // two gain bars
instrument.noise(d.str([0.2, 0.1])); // one bar, white noise
```

Calls already supplying Envelope/LFO/MIDI/random gain remain one-value calls, not `noise(source, 1)`.

### Filter

Both `new Filter(type, frequency)` and `d.filter(type, frequency)` require exactly two arguments. Missing frequency, explicit undefined/null, raw arrays, extra arguments, invalid numeric wrapper data, and unsupported direct sources reject in types where representable and at runtime. The factory checks arity before forwarding, so extra JavaScript arguments cannot be silently discarded.

Previously, omitted strict frequency serialized as an empty cycle, not a useful default. That omission case is now deliberately removed; callers must supply their intended frequency. No default frequency was invented. Unsupported runtime filter-type values remain schema-validator territory rather than a new scalar-selector policy.

## Resolution and preserved behavior

- `src/inputs/types.ts` separates a single audio value from legacy variadic tuples. `Parameter` is an internal normalized result, not an added public direct source.
- `src/parameters/resolve-audio-param.ts` retains legacy `resolveAudioParam(tuple)` and provides direct `resolveAudioParamValue(value, method)` in the same module.
- Structured values use the shared wrapper guard and existing structured numeric decoder; `decode-numeric-input.ts` only exports that decoder for reuse. No numeric grammar or decoding semantics changed.
- Static numeric candidates are validated before publication/assignment, retaining API context and cause on failure. Raw array values are rejected without entry reads, including a sparse billion-slot accessor regression.
- Direct Envelope/LFO/MIDI sources retain identity. Random cycles are retained without eager schema generation, sampling, cloning, or freezing; pending/live configuration stays intact.

`lpf/hpf/bpf` remain dedicated variadic convenience methods. Their internal `Filter.fromVariadicFrequency()` constructs a valid filter with a temporary zero frequency, then assigns resolution of the original legacy tuple. This avoids reopening the public constructor or exposing internal `Parameter` inputs.

All three aliases retain bars/steps geometry, caller-owned raw-array aliasing, source identity, live random configuration, MIDI frequency defaults, and their existing no-argument empty-cycle behavior. The temporary internal zero is not a public/default frequency. Alias omission is unchanged by the strict-constructor amendment; graph validation can still reject its empty frequency cycle as before.

Filter `q/detune/gain`, instrument numeric `gain`, and other dedicated setters remain variadic. Their existing failure atomicity/source permissions are unchanged.

## Tests and caller review

Updated suites:

- `instruments/__tests__/noise.test.ts`: all three families, mandatory gain, sole-color/no-argument rejection, source forms, fixed formal arity, exact state rollback, and dedicated gain compatibility.
- `effects/__tests__/filter.test.ts`: required constructor/factory frequency, one signature/fixed arity, both runtime rejection boundaries, all three alias compatibility matrices, and setter rollback.
- `__tests__/parameter-shorthand.test.ts` and `parameter-compatibility.test.ts`: explicit gain migrations, required-input type negatives, source permissions, and strict wrapper alternatives alongside retained dedicated syntax.
- `parameters/__tests__/resolve-audio-param.test.ts`: scalar/shorthand/shared wrapper resolution, real numeric validation, unsupported inputs, raw-array non-reading, static error context, direct-source identity, and no eager serialization.

The public structured-input and bus suites pass unchanged. Type-negative cases are not invoked to test runtime errors; JavaScript-invalid calls use reflection without `as any`/`as never`.

Caller review distinguished actual omission calls from already-valid source-only gain calls. Old noise default calls in Fluid tests now supply `1` explicitly. No active application caller remains dependent on removed forms. Native evaluated Envelope/LFO gain strings remain valid and unchanged; `packages/audio-regression` has no final diff. Documentation/README/history snippets are user-owned and were not migrated or claimed as delivered documentation.

## Verification

Parent ran these against the final source/test patch, with default workers and no warning suppression:

```sh
pnpm --filter @web-audio/fluid exec vitest run src/instruments/__tests__/noise.test.ts src/effects/__tests__/filter.test.ts src/__tests__/parameter-shorthand.test.ts src/__tests__/structured-inputs.test.ts
# 80 tests / 4 files

pnpm --filter @web-audio/fluid exec vitest run src/parameters/__tests__/resolve-audio-param.test.ts src/inputs/__tests__/decode-numeric-input.test.ts src/buses/__tests__/bus.test.ts
# 42 tests / 3 files

pnpm --filter @web-audio/fluid test:ci
# 1,293 tests / 38 files

pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm exec turbo run build --filter=@web-audio/fluid
# 2 successful tasks; Patterns cached, Fluid fresh
```

All 11 changed TypeScript paths plus plan/evidence passed exact-path Prettier checks; `git diff --check` passed. Generated Fluid declarations contain one required-frequency constructor/factory signature and exactly two noise overloads, without the removed omission declarations. Existing Vite `__dirname` and experimental `tsgo` notices remain non-failing.

### Supplemental built-package smoke

This passed after the final build using the existing installed TS-capable runner:

```sh
pnpm --filter @web-audio/audio-regression exec tsx --eval '
import assert from "node:assert/strict";
import Drome from "@web-audio/fluid";
const d = new Drome();
const instrument = d.synth().notes(60).noise("pink", d.str(0.2, 0.1))
  .fx(d.filter("lp", d.str([400, 800]))).push();
assert.equal(d.getSchema().instruments.length, 1);
const before = instrument.getSchema().noise;
for (const args of [[], ["pink"], ["white"], [[0.2, 0.1]], [0.2, 0.1], ["pink", 0.2, 0.1], [undefined]]) {
  assert.throws(() => Reflect.apply(instrument.noise, instrument, args));
  assert.deepEqual(instrument.getSchema().noise, before);
}
const Filter = d.filter("lp", 400).constructor;
for (const args of [[], ["lp"], ["lp", [400, 800]], ["lp", 400, 800], ["lp", undefined]]) {
  assert.throws(() => Reflect.apply(d.filter, d, args));
  assert.throws(() => Reflect.construct(Filter, args));
}
assert.equal(d.synth().noise(d.env(0, 1)).getSchema().noise.gain.type, "envelope");
assert.equal(d.synth().noise(d.lfo(0, 1)).getSchema().noise.gain.type, "lfo");
for (const name of ["lpf", "hpf", "bpf"]) {
  assert.deepEqual(d[name]().getSchema().frequency, {type: "static", cycle: []});
  const values = [400, 800];
  const alias = d[name](values, 1200);
  values[0] = 900;
  assert.deepEqual(alias.getSchema().frequency,
    { type: "static", cycle: [[900, 800], [1200]] });
}
console.log("Built required filter/noise inputs, source-only gains, and legacy aliases passed.");
'
```

This establishes built API/graph behavior under that runner, not bare-Node compatibility or native rendering. The previously recorded source-exported schema/bare-Node limitation is unchanged.

## Completion boundary

The amended required-input contracts, named implementations, direct value resolution, caller migrations, source restrictions, and preserved dedicated aliases compose in one verified change. No waiver is required.

Envelope, positional ADSR, LFO endpoints, sampler chop, Patterns production code, schema, and engine code were not changed. User-owned docs/READMEs/overview/spec, dependencies/lockfiles, and audio references remain untouched. No installs, dev servers, browser/native runs, commits, publication, or deployment occurred. Steps 3.2/3.3, the full Phase 3 exit gate, and native Step 4.2 remain pending.
