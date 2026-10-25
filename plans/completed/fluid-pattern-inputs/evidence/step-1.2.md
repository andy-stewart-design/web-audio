# Step 1.2 — Structured values and numeric normalization

> Historical implementation: the user subsequently moved reusable structured values into `patterns` and removed random wrapping. See the [approved ownership/static-only refinement and current verification](step-1.2-patterns-ownership.md). The Fluid-local factory and random-wrapper behavior below describe the earlier implementation, not the current contract.

## Result

**Verified.** `d.structured()` and its bound alias `d.str()` now create reusable structured values, and existing numeric dedicated setters accept them through shared normalization. The prescribed focused suites, full Fluid suite, type-check, lint, formatting, and a fresh Fluid runtime/declaration build passed.

This covers AC3 and the numeric/static-ownership portions of AC5, AC6, AC9, AC14, and AC16. Generic event data can be constructed, but event consumers remain Step 1.3. Positional API cleanup and patterned minimum remain later work. Phase 1's exit gate is not yet due.

## Revision and scope

- Starting revision: `3e856e179bcbf675c87a4081e194048eba1245ad`.
- Initial worktree: clean before the parent plan-status edit.
- Verification applies to the Step 1.2 working-tree patch relative to that revision.
- The approved [envelope-defaults/documentation amendment](step-1.1-envelope-defaults.md) remains authoritative: no multi-field `undefined` defaults, and user-facing documentation is user-owned.
- No dependencies, lockfiles, patterns grammar, schema, audio-engine code, user-facing docs, or approved audio references changed.
- No development server, browser, native renderer, publishing, or deployment was started.

## Delivered behavior

```ts
const bars = d.str(0.2, 0.1); // two successive bars
const steps = d.structured([0.2, 0.1]); // two values within one bar

firstInstrument.gain(bars);
secondInstrument.detune(bars);

instrument.gain(0.2, 0.1); // existing variadic syntax still works
```

The builder packages structured data, not shorthand text:

- `d.str("0.2")` and `d.str("0.2 0.1")` can be constructed as string data but fail when consumed numerically; neither is parsed as shorthand.
- Both aliases reject empty builder calls, nested wrappers, reusable shorthand values, unsupported object sources, nested random inputs, and random/static mixtures.
- Static numbers must be finite. Static numeric consumers also reject rests, nested event geometry, and empty numeric bars.
- The builder can already represent strings, nullable values, and nested numeric event data. Bare nullable string arguments and deep chord/rest snapshots are covered without invoking an event consumer.
- A structured value must be the sole whole-pattern argument. Mixing it with other bars or nesting it inside a raw array fails with consumer context.

### Ownership and random inputs

Static and random wrappers have distinct discriminated types; a random wrapper is not assignable to a static numeric wrapper.

Static input arrays are copied and recursively frozen in wrapper-owned storage. Every normalization gets fresh data. Mutating the original array, a returned copy, or one consumer's serialized static cycle does not affect another consumer or the reusable value. The wrapper has no playback cursor.

A sole permitted `RandomCycle` is retained by identity inside a frozen random wrapper. The random builder itself is not frozen or cloned: subsequent configuration changes remain observable by consumers, matching existing random-input behavior.

Unwrapped legacy numeric arrays retain their old caller-reference behavior. This was explicitly regression-tested rather than changed to match the new wrapper snapshots.

### Numeric consumer coverage

Public assertions cover the emitted pattern for:

- Instrument `.gain()` / `.detune()`, including sampler instruments.
- Envelope `.max()`, `.a()`, `.d()`, `.s()`, and `.r()`.
- Filter frequency, `.q()`, `.detune()`, and `.gain()` through existing numeric paths.
- Unison `.voices()`, `.spread()`, and `.width()`.
- Sampler `.start()`, `.end()`, `.duration()`, and `.dur()`, with independent region assertions.
- `d.gain()`, `new GainEffect(...)`, and `d.lpf()` / `d.hpf()` / `d.bpf()`.

Additional assertions preserve gain-envelope minimum/ADSR/mode during numeric gain updates, direct envelope/LFO/MIDI dispatch, shared random configuration, setter chaining/default reset, existing sampler region validation, and unchanged state after invalid wrapped numeric replacement.

Shared numeric paths can accept a wrapper in their existing variadic input position; this does not establish the final one-argument-per-slot API. No positional arity was tightened here, and no single-maximum envelope-constructor adapter or LFO-endpoint adapter was added.

### Positional ADSR boundary

Positional ADSR still accepts only numbers or shorthand in this step. Both static and random wrappers are rejected at runtime and by its public types. Dedicated `.a()` / `.d()` / `.s()` / `.r()` setters accept wrappers through their full numeric-input path.

The runtime guard is necessary even though the ADSR type was not widened: otherwise JavaScript could send a wrapped random cycle through `createParameter()` and bypass the existing positional-random restriction. Tests exercise a late invalid field on both envelope and instrument ADSR and verify that all prior fields remain unchanged.

Step 3.2 will deliberately replace the temporary blanket positional-wrapper rejection with static-wrapper support while retaining random rejection. This step does not claim that later contract is implemented.

## Implementation boundary

- `packages/fluid/src/inputs/structured-input.ts`: Fluid-owned static/random wrapper types, construction, snapshots, copying, and recognition. It does not import instrument/automation constructors to decide whether data is allowed.
- `packages/fluid/src/inputs/normalize-structured-input.ts`: shared whole-pattern extraction, explicit-structured origin, and nested/mixed wrapper rejection. Legacy input remains on its existing path.
- `packages/fluid/src/inputs/decode-numeric-input.ts`: recognizes normalized wrappers before shorthand/random dispatch and builds validated `number[][]`, with a compile-time regression against accidental `any[][]` inference.
- `packages/fluid/src/inputs/types.ts`: adds distinct static/random wrapper alternatives to `NumericPatternInput`; does not change `ADSRInput` or event input types.
- `packages/fluid/src/drome.ts`: public overloaded builder and bound alias, preserving static/event-atom inference and distinct random results.
- `packages/fluid/src/automations/envelope.ts`: narrowly rejects positional wrappers to preserve the existing ADSR permission boundary; constructor/default/schema behavior remains unchanged.
- New domain suite: `packages/fluid/src/inputs/__tests__/structured-input.test.ts`.
- New public integration suite: `packages/fluid/src/__tests__/structured-inputs.test.ts`.

No universal numeric/event decoder or new per-method pattern parser was introduced. Existing parameter/source dispatch continues to own its source permissions.

## Review and typing limits

Independent review identified and closed the following material issues before final verification:

- Removed premature positional ADSR/envelope-constructor adapter support from the initial patch.
- Replaced the unsound `StructuredInput<never>` random alias with distinct static/random types.
- Removed redundant numeric input unions and made decoded static output genuinely `number[][]`.
- Preserved the runtime ADSR boundary against wrapper-based random-source laundering.

The final read-only review found no remaining material blocker.

The generic builder's atom types distinguish numeric, string, nullable, and random data. Its recursive array type intentionally supports event geometry, so TypeScript does not distinguish every numeric-bar shape from a nested event chord. Numeric consumers enforce that distinction at runtime. This is a documented consumer-validation boundary, not permission to accept event-only numeric geometry.

## Final verification

All commands were run from the repository root. The source gates below ran against the final application/test patch and exited `0`.

| Check                     | Command                                                                                                                                                                                                                                                                                                                                                                                                            | Result                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Prescribed focused suites | `pnpm --filter @web-audio/fluid exec vitest run src/inputs/__tests__/structured-input.test.ts src/inputs/__tests__/decode-numeric-input.test.ts src/parameters/__tests__/parameter.test.ts src/parameters/__tests__/resolve-audio-param.test.ts src/__tests__/structured-inputs.test.ts`                                                                                                                           | 5 files, **57 tests passed**                                                                              |
| Full Fluid regression     | `pnpm --filter @web-audio/fluid test:ci`                                                                                                                                                                                                                                                                                                                                                                           | 38 files, **1,249 tests passed**                                                                          |
| Type checking             | `pnpm --filter @web-audio/fluid check`                                                                                                                                                                                                                                                                                                                                                                             | Passed, including positive calls, negative probes, and numeric decoder return-type assertion              |
| Lint                      | `pnpm --filter @web-audio/fluid lint`                                                                                                                                                                                                                                                                                                                                                                              | Passed with zero-warning requirement                                                                      |
| Touched-source formatting | `pnpm exec prettier --check packages/fluid/src/drome.ts packages/fluid/src/automations/envelope.ts packages/fluid/src/inputs/types.ts packages/fluid/src/inputs/decode-numeric-input.ts packages/fluid/src/inputs/structured-input.ts packages/fluid/src/inputs/normalize-structured-input.ts packages/fluid/src/inputs/__tests__/structured-input.test.ts packages/fluid/src/__tests__/structured-inputs.test.ts` | Passed                                                                                                    |
| Fresh package build       | `pnpm --filter @web-audio/fluid build`                                                                                                                                                                                                                                                                                                                                                                             | Passed; tsdown emitted `dist/index.mjs` and `dist/index.d.mts` in a fresh build, not a Turbo cache replay |

The two new suites add 17 tests over the amended Step 1.1 baseline of 1,232. Existing `__dirname` native-config and experimental `tsgo` warnings remain non-failing and unchanged.

### Supplementary built-entry smoke: runner distinction

An additional bare-Node self-import attempt, executing the JavaScript body below with `pnpm --filter @web-audio/fluid exec node --input-type=module -e`, failed **before feature assertions**. Node could not resolve the extensionless `./validate-graph` import from the source-exported `@web-audio/schema` entry. The schema files/package configuration were not changed by this step. This bare-Node smoke is not a passed gate and is not part of the required Step 1.2 source gate.

The same numeric assertions passed using the repository's existing TS-capable runner:

```sh
pnpm --filter @web-audio/audio-regression exec tsx --eval '
import assert from "node:assert/strict";
import Drome from "@web-audio/fluid";
const d = new Drome();
const bar = [0.2, 0.1];
const levels = d.str(bar);
bar[0] = 0.9;
const detached = d.str;
assert.equal(detached(0.5).kind, "static");
d.synth().gain(levels).push();
assert.deepEqual(d.getSchema().instruments[0].gain.max.cycle, [[0.2, 0.1]]);
assert.throws(() => d.synth().gain(d.str("0.2")), /finite number/);
assert.throws(() => d.synth().adsr(d.str(d.rand()), 0.1, 0.8, 0.2), /positional structured inputs/);
console.log("Built numeric builder smoke passed with the existing tsx runner.");
'
```

That probe imported the freshly built `@web-audio/fluid` package export and asserted detached alias use, input snapshot isolation, canonical numeric graph output, numeric-string rejection, and positional wrapped-random ADSR rejection. It did not load the audio-regression harness or launch a browser.

This establishes built Fluid behavior under that existing runner, not plain-Node compatibility, packed installation, or native audio. The later Step 4.1 bare-Node smoke command needs a TS/bundler-aware execution path or an explicit decision about schema packaging; do not copy its original command and assume it was already proved here. No out-of-scope package-export fix or waiver was applied in Step 1.2.

## Completion boundary

- Step 1.2 numeric behavior, ownership, source restrictions, typing, and fresh package build are verified.
- The Step 1.1 envelope-defaults amendment remains covered by the full regression suite.
- Event data construction is available; event consumer integration is still pending Step 1.3.
- Phase 1 exit and later positional/schema/native gates remain unrun.
- User-facing documentation remains untouched and user-owned.

**Stop after Step 1.2.** No blocker was found for Step 1.3. The supplementary bare-Node resolution limitation is recorded for its later artifact-verification gate.
