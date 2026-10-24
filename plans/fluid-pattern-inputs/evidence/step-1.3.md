# Step 1.3 — Structured event inputs

## Result

**Step 1.3 verified. Phase 1 exit gate satisfied.** Structured values now work in notes, sample names, variations/`var`, and XOX without being reinterpreted as shorthand.

- Focused event suites: **5 files, 185 tests passed**, using the prescribed command without worker-count overrides.
- Full Fluid suite: **38 files, 1,260 tests passed**.
- Full Patterns suite: **25 files, 434 tests passed**.
- Both packages' type-check and lint gates passed.
- The Phase 1 dependency/artifact build passed: Patterns was restored from cache; Fluid compiled fresh and emitted runtime/declaration output.
- Built-package numeric/event integration passed using the existing TS-capable runner.

No waiver or blocker remains for this scope. Phase 2 / Step 2.1 has not started.

## Revision and authority

- Starting revision: `69db3b073460a066ac872a2c275d7f90c32d50f7`.
- Initial worktree: clean before the Step 1.3 status edit.
- Verification applies to this step's working-tree patch relative to that revision.
- The approved [shared static-value ownership](step-1.2-patterns-ownership.md) and [envelope-defaults/documentation ownership](step-1.1-envelope-defaults.md) amendments remain in force.
- User-facing docs, Patterns production code, schema, audio-engine code, manifests, dependencies, lockfiles, and approved audio references were not changed.

## Delivered contract

These existing consumers now accept one reusable static structured value:

```ts
instrument.notes(d.str([60, null, 64], [62, 65]));
sampler.name(d.str("bd", "sd"));
sampler.variation(d.str([0, null, 1], [2]));
sampler.var(d.str([0, null, 1], [2]));
instrument.xox(d.str([1, 0, 1]));
```

Direct `createStructuredInput(...)` values from the shared Patterns package work too. Legacy variadic structured calls, direct strings, reusable shorthand, chaining, and existing direct random sources retain their supported behavior.

### Structured strings stay literal data

A wrapper explicitly selects structured semantics:

- `.name(d.str("bd", "sd"))` contains two literal aliases in separate bars.
- `.name(d.str("bd sd"))` fails sample-alias validation instead of parsing a shorthand expression.
- Wrapped numeric-looking strings fail notes/variation numeric validation.
- `.xox(d.str("xoxo"))` and `.xox(d.str("1 0"))` fail numeric structured-mask validation.
- Direct `.xox("xoxo")`, `.xox(d.sh("xoxo"))`, and direct general XOX shorthand continue to work.

Structured XOX retains its established nonzero-finite-number mask semantics, including negative/fractional nonzero values. It does not gain null rests or simultaneous voice groups from the generic builder.

### Geometry and state are preserved

Wrapped input uses the same structured decoder path as the equivalent raw argument list:

- Argument bars versus within-bar steps remain distinct.
- Chords/layering, ordered voices, permitted whole-hit rests, note-only nullable chord placeholders, and empty-bar/empty-note-chord behavior are preserved.
- Structured note nulls retain authored value-slot participation; shorthand rests remain timing-only. Tests distinguish these modes explicitly through `noteValueSlots` as well as compiled public parity.
- Names and variation/`var` retain their own atom and chord/rest restrictions.
- Invalid late atoms, mixed wrapper arguments, nested wrappers, and unsupported sources leave the exact prior event-state object and serialized schema unchanged across all five setters.
- Reusable deep snapshots survive original-array changes and attempts to mutate one consumer's output without changing another consumer or the shared value.

Direct random notes/variations and binary XOX retain their original metadata, chance handling, and event-time snapshot behavior. Event setters still snapshot their random sources when applied; this is intentionally different from the already-established live configuration behavior of numeric parameter sources. Numeric direct-source behavior was not changed.

## Implementation boundary

- `packages/fluid/src/inputs/decode-structured-input.ts`: normalize once, suppress shorthand only for explicit structured values, then reuse existing notes/name/variation structured fallbacks.
- `packages/fluid/src/inputs/decode-xox-input.ts`: apply the same boundary while leaving direct compact/general XOX and direct binary-random handling separate.
- `packages/fluid/src/inputs/types.ts`, `src/instruments/instrument.ts`, and `src/instruments/sampler.ts`: add sole-wrapper alternatives with consumer-specific atom types and alias parity; retain existing raw/shorthand/random permissions.
- `packages/fluid/src/inputs/normalize-structured-input.ts`: safely discover wrappers without introducing unbounded pre-validation traversal.

No duplicate event parser or universal numeric/event atom decoder was added. Numeric decoding, positional ADSR restrictions, and the static-only shared factory continue to compose with these event adapters.

## Bounds and ownership correction

Event integration exposed a flaw in the earlier recursive wrapper-discovery prepass: it could inspect huge sparse/accessor arrays before existing bounds, overflow on cyclic/deep invalid arrays, or traverse non-pattern metadata. An early focused run reported a worker-memory failure. This was a resolved implementation defect, not a reason to weaken concurrency or waive the gate.

The final discovery path:

- Uses an iterative worklist with a `WeakSet` instead of recursion.
- Looks only at canonical numeric array data properties, including non-enumerable data slots; ignores unrelated metadata.
- Skips accessor properties during discovery instead of invoking them before bounded consumer traversal.
- Uses the existing event raw-item budget to bound discovery work. On exhaustion it defers to the established consumer bounds/error path, rather than introducing a replacement validation policy.
- Leaves numeric legacy input policy unchanged; its discovery remains iterative/cycle-safe without the event-specific scan budget.

For a sole wrapper, normalization reads its already-frozen readonly snapshot instead of cloning the entire structure before size checks. Numeric decoding still creates owned numeric arrays; event decoding constructs owned/frozen expressions and native cycles. The public shared `getValues()` API still returns fresh copies. There is no shared mutable consumer state.

Regressions cover cyclic/deep input, sparse nullable chords up to a billion declared slots without reading oversized accessor-backed voices, repeated/aliased groups, non-index metadata, non-enumerable numeric data, exact raw budgets, and pattern/raw limits after wrapper extraction. The exact default focused command passed after the correction; no single-worker substitution is used as final evidence.

## Tests and review

Extended:

- `src/inputs/__tests__/decode-structured-input.test.ts`: wrapper note geometry/value-slot parity, post-unwrapping bounds, and traversal regressions alongside existing name/variation/random/bounds coverage.
- `src/inputs/__tests__/decode-xox-input.test.ts`: wrapped numeric-mask parity and literal compact-string rejection.
- `src/instruments/__tests__/event-setters.test.ts`: event wrapper parity, literal-string boundaries, and atomic failure across notes/name/variation/`var`/XOX.
- `src/__tests__/structured-inputs.test.ts`: typed public matrix, shared-factory integration, bars/steps/chords/rests, alias parity, snapshot/schema isolation, direct random metadata/chance, and negative signatures.

Type probes are included in TypeScript checking but are not invoked merely to test rejection. Runtime-invalid probes use reflection instead of `as any` or `as never`.

Independent final read-only review found no remaining actual regression or material coverage gap. Existing shorthand-equivalence and complete regression suites remained green.

## Verification

Commands below ran from the repository root against the final source/test patch. Focused step checks completed first; the full package/static gates and dependency build then established Phase 1 integration.

| Gate                      | Command                                                                                                                                                                                                                                                                                        | Result                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Prescribed focused suites | `pnpm --filter @web-audio/fluid exec vitest run src/inputs/__tests__/decode-structured-input.test.ts src/inputs/__tests__/decode-xox-input.test.ts src/inputs/__tests__/shorthand-equivalence.test.ts src/instruments/__tests__/event-setters.test.ts src/__tests__/structured-inputs.test.ts` | Exit 0; **185 tests / 5 files**, no concurrency override             |
| Fluid full suite          | `pnpm --filter @web-audio/fluid test:ci`                                                                                                                                                                                                                                                       | Exit 0; **1,260 tests / 38 files**                                   |
| Patterns full suite       | `pnpm --filter @web-audio/patterns test:ci`                                                                                                                                                                                                                                                    | Exit 0; **434 tests / 25 files**                                     |
| Fluid TypeScript          | `pnpm --filter @web-audio/fluid check`                                                                                                                                                                                                                                                         | Passed                                                               |
| Patterns TypeScript       | `pnpm --filter @web-audio/patterns check`                                                                                                                                                                                                                                                      | Passed                                                               |
| Fluid lint                | `pnpm --filter @web-audio/fluid lint`                                                                                                                                                                                                                                                          | Passed                                                               |
| Patterns lint             | `pnpm --filter @web-audio/patterns lint`                                                                                                                                                                                                                                                       | Passed                                                               |
| Phase 1 dependency build  | `pnpm exec turbo run build --filter=@web-audio/fluid`                                                                                                                                                                                                                                          | 2 successful tasks; Patterns cache hit, Fluid cache miss/fresh build |

Exact touched-source and planning/evidence paths passed Prettier checks; `git diff --check` passed. Existing Fluid Vite/Vitest `__dirname` and build `tsgo` warnings remain non-failing. No warning was suppressed to obtain a pass.

### Supplemental built-package integration

The following passed after the phase build, using existing package exports and the repository's TS-capable runner:

```sh
pnpm --filter @web-audio/audio-regression exec tsx --eval '
import assert from "node:assert/strict";
import { createStructuredInput } from "@web-audio/patterns";
import Drome from "@web-audio/fluid";
const d = new Drome();
d.loadSamples({ bank: "local", samples: { bd: ["/bd.wav"], sd: ["/sd.wav"] } });
d.synth().notes(createStructuredInput([60, null, 64], [62]))
  .xox(d.str([1, 0, 1])).gain(d.str(0.2, 0.1)).push();
const sampler = d.sample().bank("local").name(d.str(["bd", "sd"]))
  .var(d.str([0, 1])).xox(d.str([1, 0, 1])).push();
assert.equal(d.getSchema().instruments.length, 2);
const before = sampler.getSchema().eventPattern;
assert.throws(() => sampler.name(d.str("bd sd")), /sample names must match/);
assert.throws(() => sampler.xox(d.str("xoxo")), /finite numbers/);
assert.deepEqual(sampler.getSchema().eventPattern, before);
assert.deepEqual(d.synth().xox("xoxo").getSchema().eventPattern,
  d.synth().xox(d.sh("xoxo")).getSchema().eventPattern);
console.log("Built numeric/event structured inputs and literal-string boundaries passed.");
'
```

The sample entries are graph metadata only; this probe did not fetch sample assets, start the native harness, or render audio. It establishes built numeric/event API composition and rejection atomicity under that runner, not bare-Node compatibility or listening acceptance. The previously recorded source-exported schema/bare-Node limitation is unchanged.

## Completion boundary

**Phase 1 is complete.** Envelope prework, shared static structured values, numeric/event consumer parity, source restrictions, ownership, and build/type boundaries compose under the amended contract.

No patterned minimum, schema migration, positional signature cleanup, timing-generator expansion, native rendering, documentation update, or later implementation was started. Step 2.1 remains pending.
