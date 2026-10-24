# Step 1.1 follow-up — Explicit envelope bounds

## Decision and authority

The user approved a refinement after the original Step 1.1 verification:

> Omit everything for defaults, supply one maximum, or supply both bounds explicitly.

Keep `env(undefined)` as a harmless equivalent of `env()`. Remove support for `undefined` in multi-field calls. This is an approved contract amendment, not an implementation workaround or waiver.

This decision supersedes the original spec's per-field `undefined` defaults, its AC2 expectations for those forms, and the corresponding rows in [the original Step 1.1 evidence](step-1.1.md). That evidence remains a historical verification record; the contract below is current.

The user also took ownership of user-facing documentation. Do not update `docs/`, READMEs, or the feature overview during subsequent implementation steps. Record implementation decisions and proof in this evidence directory. Documentation portions of later acceptance are user-owned and must not be reported as implemented or verified by the agent merely because source checks pass.

## Current contract

The factory and constructor agree:

| Call                          | Result                                |
| ----------------------------- | ------------------------------------- |
| `d.env()`                     | Minimum `0`, maximum `1`              |
| `d.env(undefined)`            | Same defaults as no arguments         |
| `d.env(0.8)`                  | Minimum `0`, maximum `0.8`            |
| `d.env(0.1, 0.8)`             | Both bounds supplied explicitly       |
| `d.env(undefined, 0.8)`       | Rejected at runtime and in TypeScript |
| `d.env(0.1, undefined)`       | Rejected at runtime and in TypeScript |
| `d.env(undefined, undefined)` | Rejected at runtime and in TypeScript |

The rejection also applies to an undefined minimum with shorthand, reusable shorthand, random, or structured maximum input, and to undefined entries among transitional variadic maximum arguments. It is not restricted to the three numeric examples above.

Alternatives:

```ts
// Instead of env(undefined, 0.8):
d.env(0.8);

// Instead of env(0.1, undefined):
d.env(0.1, 1);

// Instead of env(undefined, undefined):
d.env();

// Transitional structured maxima still need an explicit numeric minimum:
d.env(0, [0.25, 0.5], [0.75]);
```

Single scalar/shorthand/reusable/random maxima, numeric zero, null rejection, and existing source restrictions remain unchanged. Minimum remains scalar. The builder, patterned minimum, and final removal of variadic maxima are not part of this follow-up.

## Simplification delivered

- `EnvelopeArguments` now has two alternatives: an optional single maximum, or an explicit numeric minimum followed by the existing maximum-pattern arguments.
- Removed the separate two-field undefined-default tuple and the constructor branch defaulting an explicitly undefined maximum to `1`.
- Removed the undefined-minimum fallback from multi-field calls. The minimum must be explicitly numeric and is assigned directly after validation.
- `Drome.env()` continues forwarding to the authoritative constructor without duplicate dispatch/default rules.
- Kept runtime rejection for invalid JavaScript callers; narrowing the public type alone would not satisfy the contract.

## Tests and caller changes

Updated:

- `packages/fluid/src/automations/envelope.ts` — argument types and runtime handling.
- `packages/fluid/src/__tests__/parameter-compatibility.test.ts` — current parity table, direct typed positive calls, runtime invalid-call matrix, and factory/constructor type-negative probes.
- `packages/fluid/src/__tests__/parameter-shorthand.test.ts` — replace previously accepted undefined-minimum/default cases with rejection assertions.
- `packages/fluid/src/automations/__tests__/envelope.test.ts` — preserve structured maximum behavior using explicit numeric minimum `0` instead of an undefined placeholder.

The existing uncommitted Step 1.1 changes remain in place. This follow-up is relative to that working tree at starting revision `480f286992d9951e86c7e907ce975c63d6d7d13f`, not a separate committed revision.

Searches across first-party packages/apps found no remaining supported caller depending on multi-field undefined defaults. Remaining source occurrences are single-undefined positive tests and intentional negative/type-probe cases. Reflection-built inputs also have negative coverage, including undefined before/after transitional maximum bars.

User-facing docs were not edited. The governing spec text is left intact, with this approved amendment linked from the plan so subsequent steps do not reinstate its superseded defaults.

## Verification

Final commands ran from the repository root against the amended source/tests and exited `0`:

| Check                   | Command                                                                                                                                                                                                                                                                             | Result                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Focused contract suites | `pnpm --filter @web-audio/fluid exec vitest run src/automations/__tests__/envelope.test.ts src/__tests__/parameter-compatibility.test.ts src/__tests__/parameter-shorthand.test.ts src/__tests__/drome.test.ts`                                                                     | 4 files, **218 tests passed**                             |
| Full Fluid regression   | `pnpm --filter @web-audio/fluid test:ci`                                                                                                                                                                                                                                            | 36 files, **1,232 tests passed**                          |
| Type checking           | `pnpm --filter @web-audio/fluid check`                                                                                                                                                                                                                                              | Passed, including positive and negative public signatures |
| Lint                    | `pnpm --filter @web-audio/fluid lint`                                                                                                                                                                                                                                               | Passed with zero-warning requirement                      |
| Source formatting       | `pnpm exec prettier --check packages/fluid/src/drome.ts packages/fluid/src/automations/envelope.ts packages/fluid/src/automations/__tests__/envelope.test.ts packages/fluid/src/__tests__/parameter-compatibility.test.ts packages/fluid/src/__tests__/parameter-shorthand.test.ts` | Passed                                                    |

The existing Vite/Vitest `__dirname` config warning remains non-failing and unchanged. No browser, native renderer, development server, dependency installation, or package build was run for this refinement. No schema, engine, lockfile, or approved audio reference changed.

## Status

**Step 1.1 remains verified under the amended contract.** No blocker or accepted deviation remains. Step 1.2 and later steps are still pending; user-facing documentation is deferred to the user.
