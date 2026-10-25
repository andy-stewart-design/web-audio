# Review follow-up — Simplifications 1–4

## Scope and authority

The user approved simplifications 1–4, explicitly skipped contextual-error consolidation (#5), and deferred builder cycle/depth safety to separate work.

Starting revision: `ae4d8d6e7b4ae2ef27d313acd8fa90fe56212ebd`.

- [x] Simplify `NumericPatternInput` to `CycleInput<number> | [NumericPatternValue]`; use one static-value acceptance check and construction path.
- [x] Type snapshot input as `StructuredValue<T>` and remove primitive assertions. Use property-presence narrowing in the opaque wrapper guard.
- [x] Return frozen values directly from normalization; remove its result object, unused origin, and exported result type. Update all numeric/event/XOX consumers.
- [x] Remove `getValues()`, its recursive clone implementation, and its guard requirement. Keep readonly, deeply frozen `.values`.
- [ ] Builder construction cycle/depth/traversal safety: intentionally not implemented here.
- Error-handling consolidation: explicitly excluded.

Removal of `getValues()` is now directly user-approved. Earlier records describing mutable-copy access are superseded on that point. The previous assertion that this specific accessor had already been user-approved was unsupported; it was an implementation choice. Historical evidence is retained, not rewritten.

## Preserved behavior and focused coverage

Direct random parameter sources still take the early path without schema serialization and remain live. The named `isSupportedValue` boolean makes static-kind acceptance readable; contents are validated afterward. Explicit arrays still reject in fixed numeric slots. Contextual error policies and public Envelope/env/chop signatures are unchanged.

Normalization returns `readonly unknown[] | undefined`, preserving wrapper presence, literal strings, empty bars, mixed/nested wrapper rejection, source permissions, and bounded discovery scans.

Tests retain original-array mutation isolation, deep freezing, consumer-output isolation, geometry, and inferred atom types. They now also assert nested chord freezing, absence of the accessor, readonly typing, invalid JavaScript atoms, and wrapped sample-name literals not being reinterpreted as shorthand.

During review the user clarified that trailing plain values after a leading event random source may be ignored. The single-argument checks were removed from the notes, variation, and XOX random branches. XOX's replacement/composition dispatch also selects the leading random source, preserving chance metadata when trailing values are ignored. Decoder and public/built tests now assert equivalence to the direct random-only call. Embedded random values, random sample names, and mixed structured wrappers remain rejected. This does not change fixed positional APIs or broadly rewrite unrelated arity guards.

## Verification

Passed:

- Patterns: **434 tests / 25 files**.
- Fluid: **1,332 tests / 39 files**, including the updated permissive random-branch tests.
- Schema: **134 tests**; audio-engine: **410 tests**.
- Patterns/Fluid TypeScript checks and lint.
- Touched-file formatting and `git diff --check`.
- Dependency/artifact build and web checking (**0 errors, 0 warnings**).
- Built public evaluation matrix: six representation/alias combinations, two source-permission programs, 42 rejected programs.
- Built values-only/frozen snapshot, cross-package consumption, and lazy-random smoke.
- Generated declaration type probe, including rejection of `getValues()` access and mutation of readonly values.

No production/test accessor invocation or obsolete normalization result type remains; the accessor name appears only in its intentional absence assertion. Generated artifacts were rebuilt. Native verification was not rerun for this cleanup; Step 4.2 remains the historical native proof, not a fresh result for this patch.

## Stop boundary

Construction still recursively snapshots arrays without cycle/depth limits. That known finding remains open for the next separately authorized task. No error-handling framework, builder safety implementation, user documentation edits, reference/threshold updates, dependency changes, installs, native workflow, or commit was included.
