# Step 1.2 refinement — Shared static structured values

## Approved decision

The user approved two changes to the initial Step 1.2 implementation:

1. Put the reusable structured value, factory, guard, and types in `@web-audio/patterns`, alongside reusable shorthand.
2. Make `d.structured()` / `d.str()` static-data-only. Random cycles remain direct sources and are not wrapped.

This amendment supersedes the original spec/plan assumptions that structured values are Fluid-owned and may wrap a sole random cycle. The earlier [Step 1.2 evidence](step-1.2.md) remains historical; its random-wrapper API and Fluid-local factory location are not the current contract.

The [envelope-defaults and documentation-ownership amendment](step-1.1-envelope-defaults.md) remains in force. User-facing docs are untouched and user-owned. This is an approved refinement, not a waived check or an expansion into Step 1.3.

## Result

**Step 1.2 is verified under the amended contract.** Both full package suites, focused Fluid integration, both type-check/lint gates, fresh runtime/declaration builds, formatting, and built cross-package interoperability checks passed.

- Patterns: **25 files, 434 tests passed**.
- Fluid: **38 files, 1,246 tests passed**.
- Focused Fluid numeric suites: **5 files, 54 tests passed**; these overlap the full Fluid result.
- No blocker identified for Step 1.3. The previously recorded bare-Node schema-import limitation remains unchanged and is not claimed resolved here.

## Ownership and public API

### Patterns owns reusable static data

`packages/patterns/src/structured/create.ts` now owns:

- Generic static atom/value/input types.
- `createStructuredInput()`.
- `isStructuredInput()` and its private brand.
- Recursive snapshot/freeze and fresh copies returned by `getValues()`.
- Package-neutral validation errors for unsupported structured data.

These APIs are exported from `packages/patterns/src/index.ts`. The shared implementation has no Fluid import, Drome-specific error, modulation-source dependency, or random-wrapper branch.

The newly public factory is variadic, matching the Fluid convenience methods:

```ts
import { createStructuredInput } from "@web-audio/patterns";

createStructuredInput(0.2, 0.1); // two successive bars
createStructuredInput([0.2, 0.1]); // two values within one bar
```

This does not expose the old Fluid-private factory's argument-container convention. It keeps direct factory use consistent with `d.str(...)`.

### Fluid owns calling conventions and consumer validation

Fluid imports the shared APIs rather than maintaining a second wrapper implementation. It retains:

- `d.structured()` and its bound `d.str()` alias as convenience delegates.
- Whole-pattern argument normalization and rejection of mixed/nested wrapper arguments.
- Numeric atom/geometry validation, method context, and unchanged direct-source dispatch.
- The temporary positional ADSR wrapper rejection until static structured ADSR support is deliberately added in Step 3.2.

`packages/fluid/src/inputs/structured-input.ts` was removed after migrating its consumers. No compatibility barrel or duplicate implementation remains. The removal is physical rather than a tracked-file deletion because the original module was still an uncommitted new file.

Event consumers, positional-signature cleanup, and patterned minimum remain later work.

## Static-only builder contract

Valid builder contents remain numbers, strings, nulls, and recursive arrays of those atoms. Static numeric values must be finite; consumer-specific geometry and atom restrictions still apply after construction.

All of these source-object forms are rejected by public types and/or the applicable runtime validation:

```ts
d.str(d.rand());
d.structured(d.rand());
d.str([d.rand()]);
d.str(d.rand(), 0.2);
```

The shared factory likewise rejects a random cycle, reusable shorthand object, another structured wrapper, or arbitrary source object. There is no broad unknown-object overload in its public signature. Empty builder calls remain invalid.

No random-wrapper class, type, kind, property, overload, or normalization branch remains. `NumericPatternInput` now has the existing cycle/direct-random alternative, shorthand, and a static structured-value alternative.

### Direct random sources are unchanged

Random sources already occupy one argument and are reusable without wrapping:

```ts
const levels = d.rand().steps(1).range(0.1, 0.8);

instrument.gain(levels);
instrument.detune(levels);
instrument.noise("pink", levels);
d.env(levels);
```

These forms retain their existing permissions and live configuration behavior. Updating `levels.steps(...)` is still reflected in later serialization. Dedicated numeric ADSR setters also retain their direct random inputs; positional ADSR continues to reject them.

`d.sh()` remains string-only. Its signature and shorthand grammar were not changed.

## Implementation and test changes

Shared package:

- New `packages/patterns/src/structured/create.ts`.
- New `packages/patterns/src/structured/__tests__/create.test.ts` for static geometry, snapshots, copies, branded recognition, generic typing, and invalid data.
- Updated `packages/patterns/src/index.ts` public exports.

Fluid:

- Updated `src/drome.ts`, `src/inputs/types.ts`, `src/inputs/normalize-structured-input.ts`, and `src/inputs/decode-numeric-input.ts` to use the shared static value and remove random wrapping.
- Updated the existing positional guard in `src/automations/envelope.ts` to import `isStructuredInput` from the shared package.
- Updated `src/inputs/__tests__/structured-input.test.ts` to focus on Fluid calling conventions, numeric semantics, typed/runtime random-builder rejection, and preserved raw-array aliasing.
- Updated `src/__tests__/structured-inputs.test.ts` to consume a directly imported shared factory value, verify cross-consumer schema isolation, retain the complete numeric setter matrix, and prove direct random configuration remains live.

Generic constructor/snapshot tests moved to the package that now owns the value. Random-wrapper-specific tests were removed or replaced with rejection/direct-source tests. The lower Fluid count versus the initial 1,249-test result reflects those deliberate coverage moves and capability removal, not skipped tests.

The recursive generic type still permits event array geometry; numeric consumers reject unsupported nesting at runtime. This previously recorded typing boundary is unchanged.

## Review and preservation

Independent read-only review found no concrete blocker or regression. It verified the shared-package boundary, exports, static ownership, direct random permissions, retained ADSR restriction, and absence of event-consumer integration.

Searches found no production/test references to the removed Fluid-local module, `RandomStructuredInput`, `isRandomStructuredInput`, `LiveRandomStructuredInput`, or `normalized.random`.

The refinement was applied over the existing uncommitted Step 1.2 work at starting revision `3e856e179bcbf675c87a4081e194048eba1245ad`. Prior feature work was preserved except for the approved move/removal. Unrelated untracked `plans/method-arithmetic/` appeared during this work and was not inspected or changed.

No dependencies, package manifests, lockfiles, schema, audio-engine implementation, user-facing docs, or approved references changed.

## Verification

The pre-change Patterns baseline recorded by the implementation worker was **24 files, 429 tests passed**. The final checks below were independently run by the parent session after the final source/test edits. Commands ran from the repository root.

Fresh builds ran in dependency order before Fluid tests/checks, so new root exports and declarations were available to downstream imports:

```sh
pnpm --filter @web-audio/patterns build
pnpm --filter @web-audio/fluid build
```

Both exited `0` and freshly emitted `dist/index.mjs` and `dist/index.d.mts`; this was not a Turbo cache replay.

| Check                | Command                                                                                                                                                                                                                                                                                  | Result                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Patterns full suite  | `pnpm --filter @web-audio/patterns test:ci`                                                                                                                                                                                                                                              | 25 files, **434 passed**                                                    |
| Fluid focused suites | `pnpm --filter @web-audio/fluid exec vitest run src/inputs/__tests__/structured-input.test.ts src/inputs/__tests__/decode-numeric-input.test.ts src/parameters/__tests__/parameter.test.ts src/parameters/__tests__/resolve-audio-param.test.ts src/__tests__/structured-inputs.test.ts` | 5 files, **54 passed**                                                      |
| Fluid full suite     | `pnpm --filter @web-audio/fluid test:ci`                                                                                                                                                                                                                                                 | 38 files, **1,246 passed**                                                  |
| Patterns TypeScript  | `pnpm --filter @web-audio/patterns check`                                                                                                                                                                                                                                                | Passed                                                                      |
| Fluid TypeScript     | `pnpm --filter @web-audio/fluid check`                                                                                                                                                                                                                                                   | Passed, including shared public exports and negative source-wrapping probes |
| Patterns lint        | `pnpm --filter @web-audio/patterns lint`                                                                                                                                                                                                                                                 | Passed                                                                      |
| Fluid lint           | `pnpm --filter @web-audio/fluid lint`                                                                                                                                                                                                                                                    | Passed                                                                      |

Prettier formatting/checks covered only the exact touched source/test and planning-evidence paths. `git diff --check` passed. Existing experimental `tsgo` and Fluid Vite/Vitest `__dirname` warnings remain non-failing.

### Built cross-package smoke

The following passed using the repository's existing TS-capable runner, importing both freshly built package exports:

```sh
pnpm --filter @web-audio/audio-regression exec tsx --eval '
import assert from "node:assert/strict";
import { createStructuredInput, isStructuredInput } from "@web-audio/patterns";
import Drome from "@web-audio/fluid";
const d = new Drome();
const shared = createStructuredInput(0.2, 0.1);
assert.equal(isStructuredInput(shared), true);
assert.equal(isStructuredInput(d.str(0.3)), true);
d.synth().gain(shared).push();
assert.deepEqual(d.getSchema().instruments[0].gain.max.cycle, [[0.2], [0.1]]);
const random = d.rand().steps(1).range(0, 1);
assert.throws(() => createStructuredInput(random));
assert.throws(() => d.str(random));
assert.throws(() => d.structured(random));
const envelope = d.env(random);
const instrument = d.synth().gain(random).detune(random).noise("pink", random);
random.steps(2, 0);
const expected = random.getRandomSchema();
assert.deepEqual(envelope.getSchema().max, expected);
assert.deepEqual(instrument.getSchema().gain.max, expected);
assert.deepEqual(instrument.getSchema().detune, expected);
assert.deepEqual(instrument.getSchema().noise.gain, expected);
console.log("Shared static factory and direct random-source smoke passed.");
'
```

This proves shared factory/guard identity across built packages, Fluid consumption, static-only builder rejection, and preserved direct random behavior under that runner. It does not claim bare-Node, packed installation, browser, native audio, or listening verification. No browser was launched, and no native test or development server was run.

## Completion boundary

**Step 1.2 is complete under the approved refinement.** Step 1.3 remains pending, Phase 1 exit has not run, and no later implementation was started. Documentation remains user-owned. No waiver or unresolved blocker is needed for the delivered scope.
