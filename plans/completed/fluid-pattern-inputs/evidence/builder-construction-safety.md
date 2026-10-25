# Builder construction safety

## Result

**Verified.** Cyclic, excessively deep, and excessively large/expanded array input now fails during construction with contextual `TypeError`, rather than stack overflow or uncontrolled snapshot expansion.

Starting revision: `3bc13dd03e58102a9c8da700445f49d32358f81d`; initial worktree clean.

Changed implementation: `packages/patterns/src/structured/create.ts`. Tests remain domain-local in `src/structured/__tests__/create.test.ts`. No Fluid production or public signature changes were needed.

## Implementation and bounds

The existing recursive snapshot walker now has construction-local state:

- An active-path `WeakSet`: arrays enter before descent and leave in `finally`. Self/mutual cycles reject; shared subarrays remain valid and are copied independently.
- Maximum **128 nested array levels**, using existing `MAX_EXPRESSION_DEPTH`. The synthetic argument/output array is not a nesting level.
- Maximum **131,072 raw array/atom occurrences**, counted across all arguments and repeated branches. Null and empty arrays count; shared references are charged on each occurrence.

The private raw-item budget is twice the existing 65,536-voice limit, leaving room for structural arrays. It is deliberately not the 16,384 expression-node limit, which would prematurely restrict large chord data. Individual consumers retain their own geometry and size limits.

Argument and array lengths are checked against remaining capacity before copying/reading entries. Each visited occurrence is then charged exactly once. This bounds wide sparse arrays and shallow shared-DAG expansion, not just depth.

Errors retain the existing structured-input path convention, e.g. `cycle at [0][0]`. Invalid atoms and non-finite numbers retain their previous validation/messages. There is no global traversal cache, public limit option, generic visitor framework, error-wrapping refactor, or revived `getValues()`. Readonly deep-frozen snapshots and inferred atom types remain intact.

This bounds ordinary array traversal; it does not claim to sandbox arbitrary JavaScript executed by hostile getters/proxies/custom iterators.

## Tests

The builder suite now has **14 tests** (nine new safety cases):

- Direct and mutual cycles: contextual TypeError and repeated path.
- Shared branches: accepted, independently copied/frozen, original mutation isolated.
- Exactly 128 nested arrays accepted; 129 rejected.
- A 10,000-level acyclic input, constructed iteratively, rejects deliberately without RangeError.
- Exact raw-item boundary accepted; one extra item rejected.
- Null/empty-array occurrences and aggregate argument budgets.
- Repeated/shared arguments and exponential DAG expansion.
- Huge sparse array rejected before its index getter executes.
- 65,536 voice atoms plus chord/bar structure remain constructible.

Existing geometry, static atom, readonly typing, absent accessor, and deep-freeze tests remain.

## Verification

Passed:

- Patterns: **443 tests / 25 files**.
- Fluid: **1,332 tests / 39 files**.
- Schema: **134 tests**.
- Audio-engine: **410 tests**.
- Patterns/Fluid `check` and `lint`.
- Touched-file formatting and `git diff --check`.
- Dependency/artifact build: **6 successful tasks**, Patterns/Fluid fresh, four tasks cached.
- Built public `d.str/d.structured` smoke: cycle/depth TypeErrors, shared-array copying/freezing, absent accessor, and normal Fluid envelope consumption.

Core suites/checks ran using each package's existing commands. Build/smoke used the established TS-capable built-package runner, not a bare-Node or installed-package claim. Existing Vite/tsgo warnings remain non-failing and unsuppressed.

## Completion boundary

The construction finding deferred in [the simplification follow-up](review-simplifications.md) is now resolved. Prior evidence describing it as pending is historical.

User-owned documentation/overall closure remains pending. No documentation, schema/engine/Fluid runtime, references, thresholds, dependencies, lockfiles, installs, native workflows, commits, or error-handling consolidation were included. Prior Step 4.2 native results were not rerun or recharacterized as fresh here.
