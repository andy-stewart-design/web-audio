# Step 1.1 — Envelope argument prework

> Historical verification: the user subsequently removed multi-field `undefined` defaults and took ownership of user-facing docs. See the [approved follow-up contract and current verification](step-1.1-envelope-defaults.md). The original behavior table and checks below describe the pre-amendment implementation.

## Result

**Verified.** Factory and constructor now select maximum for a sole argument, preserve explicit two-field bounds, apply the documented `undefined` defaults, and reject `null` bounds. Focused tests, the complete Fluid suite, TypeScript checking, lint, and touched-file formatting all pass.

This delivers the core portions of AC1 and AC2 for R1/R9/R11. Patterned minimum and final positional-arity acceptance still belong to Steps 2.1 and 3.3. Phase 1's exit gate is not yet due; Step 1.2 remains pending.

## Revision and scope

- Starting revision: `480f286992d9951e86c7e907ce975c63d6d7d13f`.
- Initial worktree: clean before this step's plan-status edit.
- Verification applies to the uncommitted Step 1.1 working-tree changes relative to that revision.
- No dependencies, lockfiles, schema, audio-engine code, native tooling, or approved references changed.
- Plan updates are limited to step/overall status, task checkboxes, and evidence pointers. The spec and implementation direction are unchanged.

## Delivered behavior

The following calls have matching factory and constructor behavior:

| Call                          | Minimum | Maximum                          |
| ----------------------------- | ------- | -------------------------------- |
| `d.env()`                     | `0`     | `1`                              |
| `d.env(0.1)`                  | `0`     | `0.1`                            |
| `d.env("0.1")`                | `0`     | Numeric pattern containing `0.1` |
| `d.env(d.sh("0.1"))`          | `0`     | Same shorthand maximum           |
| `d.env(random)`               | `0`     | The permitted random maximum     |
| `d.env(0.1, 0.8)`             | `0.1`   | `0.8`                            |
| `d.env(undefined)`            | `0`     | `1`                              |
| `d.env(undefined, 0.8)`       | `0`     | `0.8`                            |
| `d.env(0.1, undefined)`       | `0.1`   | `1`                              |
| `d.env(undefined, undefined)` | `0`     | `1`                              |

A supplied second `undefined` is significant: `env(0.1)` and `env(0.1, undefined)` do not describe the same bounds. Factory forwarding retains that exact arity.

The new scalar maximum semantics cover negative values and zero, with matching numeric shorthand results. This step does not add new finite-number/range policy; existing serialization and graph-validation responsibilities remain separate.

### Validation and preserved permissions

- A sole null maximum, null minimum, and null explicit maximum fail synchronously through both entry points and are excluded from their TypeScript signatures.
- A shorthand or random maximum followed by another field cannot be reinterpreted as a scalar minimum.
- Existing unsupported audio sources remain excluded from envelope bounds.
- A raw array is not newly accepted as a sole maximum input.
- Explicit `undefined` defaults an entire field; it cannot be mixed into a legacy multi-argument maximum as an additional bar.
- Minimum remains scalar and canonical `EnvelopeSchema.min` is unchanged.

### Transitional forms intentionally retained

The old maximum-only structured forms after a scalar/undefined minimum remain available until Step 3.3, including:

```ts
d.env(0, [0.25, 0.5], [0.75]);
d.env(undefined, random);
```

This prework does not introduce `d.str()`, remove variadic maxima, or change the signatures of noise, filters, chop, LFO, or ADSR.

## Changes and migration decisions

- `packages/fluid/src/automations/envelope.ts`: authoritative argument selection and validation; one shared transitional tuple type describes accepted argument lists.
- `packages/fluid/src/drome.ts`: forwards that argument list directly to `Envelope`, removing duplicated shorthand dispatch and preserving factory/constructor parity.
- `packages/fluid/src/automations/__tests__/envelope.test.ts`: updates the old numeric-single contract assertion to maximum semantics.
- `packages/fluid/src/__tests__/parameter-compatibility.test.ts`: exercises the factory/constructor parity table, typed positive default/reusable-shorthand calls, scalar/negative/zero equivalence, null rejection, random trailing-field rejection, and retained structured/random maxima.
- `packages/fluid/src/__tests__/parameter-shorthand.test.ts`: updates old expected maxima and null behavior, covers explicit second-field defaults, and adds type-negative null probes.
- `docs/concepts/syntax.md`: documents the new bounds/defaults, scalar-only minimum, and explicit breaking migration warning.

One existing failure-path fixture deliberately tests invalid **minimum** graph validation. Its `new Envelope(Number.NaN)` call became `new Envelope(Number.NaN, 1)` to preserve that test's intent rather than accidentally moving the failure to maximum.

The migration guidance is explicit: older numeric `d.env(x)` calls used `x` as minimum. To preserve their previous range, use `d.env(x, 1)`. The baseline inventory found no production sketch requiring that rewrite; contract tests that intentionally characterize `env(x)` now assert its new meaning.

## Review

An independent read-only review found no blocking correctness or scope issue. Its three minor findings were addressed before final verification:

- Add the active-doc migration warning.
- Add direct type-checked factory/constructor calls for explicit defaults and reusable shorthand, rather than relying solely on reflection-based parity assertions.
- Add runtime and type rejection of a random maximum followed by another field.

Runtime-invalid probes use reflection; type-only rejection probes are checked by TypeScript but are not invoked. No `as any` was added. The transitional tuple narrowing remains local to constructor decoding; no new public package-level helper or constructor export was added.

## Final verification

All commands below ran from the repository root against the final application/test/doc patch and exited 0.

| Check                       | Command                                                                                                                                                                                                                                                                                                     | Final result                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Prescribed focused suites   | `pnpm --filter @web-audio/fluid exec vitest run src/automations/__tests__/envelope.test.ts src/__tests__/parameter-compatibility.test.ts src/__tests__/parameter-shorthand.test.ts src/__tests__/drome.test.ts`                                                                                             | 4 files, **217 tests passed**                                |
| Full Fluid regression       | `pnpm --filter @web-audio/fluid test:ci`                                                                                                                                                                                                                                                                    | 36 files, **1,231 tests passed**                             |
| TypeScript, including tests | `pnpm --filter @web-audio/fluid check`                                                                                                                                                                                                                                                                      | Passed; positive calls and `@ts-expect-error` probes checked |
| ESLint                      | `pnpm --filter @web-audio/fluid lint`                                                                                                                                                                                                                                                                       | Passed with the package's zero-warning gate                  |
| Application/doc formatting  | `pnpm exec prettier --check docs/concepts/syntax.md packages/fluid/src/drome.ts packages/fluid/src/automations/envelope.ts packages/fluid/src/automations/__tests__/envelope.test.ts packages/fluid/src/__tests__/parameter-compatibility.test.ts packages/fluid/src/__tests__/parameter-shorthand.test.ts` | Passed                                                       |

The full Fluid suite has four more tests than the Step 0.1 baseline (1,227). Existing Vite/Vitest config loading still emits the non-failing `__dirname` warning; it was neither suppressed nor treated as a feature regression.

The tests prove source-level dispatch, graph output, permissions, and current regression behavior. They do not prove fresh declaration/artifact compilation, a built package self-import, app integration, or native sound. Those are later gates; no browser or development server was launched here.

## Completion boundary

- Step 1.1's runtime/default/type/documentation contract is implemented and verified.
- Existing two-field and transitional structured/random maximum behavior remains usable.
- Minimum/schema/engine behavior remains at its prework representation.
- No direction change, accepted deviation, or outstanding blocker was identified.

**Stop after Step 1.1.** Step 1.2, Phase 1 exit, patterned minimum, and final multi-input cleanup remain unexecuted.
