# Patterns Package Reorganization

## Intent

A standalone, behavior-preserving cleanup of `packages/patterns` between shorthand PR 3 (foundations) and PR 4 (native state/compiler). This is a working outline, not a detailed execution checklist.

Two goals:

- Make the root `index.ts` a clear, curated expression of the package API, not a catalogue of its implementation.
- Make the source layout understandable at a glance.

Keep one package entry point. No `/internal` subpath, wildcard exports, or new packages are needed.

## Phase 1 — Curate the package API

Status: complete. Root exports reduced from 48 to 23 (15 runtime values and 8 types), based on current Fluid source and test consumers. Implementations, local type definitions, and behavioral assertions are retained.

- Audit root exports against actual cross-package imports, including Fluid's isolated native decoders and tests.
- Keep exports with demonstrated consumers. Remove unused package exports, not their implementations or local tests. Future work can add an export when it actually needs it.
- Remove redundant schema-type re-exports; consumers should import schema-owned types directly from `@web-audio/schema`.
- Do not export every expression node or event-cycle type just because the model contains it. Inspectable, inferred data does not require a named export for every constituent type.
- Keep genuinely needed types explicit rather than forcing consumers into awkward aliases or indexed-access workarounds.
- Review export removals as API changes, even though runtime behavior remains unchanged; workspace usage is not proof that published consumers do not exist.

### Outcome and API-change record

Removed from the root:

- Runtime helpers without cross-package consumers: `getChordStaticSchema`, `reverseEventCycle`, `fastEventCycle`, `slowEventCycle`, `stretchEventCycle`.
- Schema re-exports: `ChanceCondition`, `RandomNumberPattern`, `StaticNotePattern`, `StaticPattern`, `TimingPattern`, `TimingStep`. Fluid's random decoder now imports `RandomNumberPattern` directly from schema.
- Unused expression/evaluator types: `PatternRange`, `PatternAtom`, `PatternRest`, `PatternSequence`, `PatternGroup`, `PatternParallel`, `PatternAlternate`, `PatternModifier`, `AtomInterpreter`.
- Unused cycle types: `NonEmptyGroup`, `EventCycle`, `EventPattern`, `EventStep`, `SourceHitReference`.

Retained exports all have demonstrated Fluid consumers. `getEventPatternGeometry` is retained for the native decoder integration tests; that test-only use is deliberate. Local patterns tests import implementation-only types from their owning modules, not the package root. The built declarations were checked for the matching 23 named exports.

These removals intentionally narrow the import API. Unknown published consumers importing removed names will need to migrate; workspace verification does not establish compatibility for them. Schema types should be imported from schema. Other removed exports have no supported root replacement in this phase; reintroduce a name only for an actual consumer, not through a deep-import escape hatch. Musical behavior and corrected schema expectations are unchanged. The spec wording update remains part of Phase 4.

## Phase 2 — Organize by responsibility

Status: complete. Moved 47 files, including all 21 colocated test files, into the responsibility-based layout. The 23 root exports and their direct re-export style are unchanged. A one-off comparison verified unchanged implementation/test tokens apart from imports, plus identical extracted speed math.

Implemented layout:

```text
src/
├── index.ts
├── limits.ts
├── expressions/     # Expression model, validation, evaluation
├── events/          # Canonical cycles, invariants, transforms, grid/geometry
├── cycles/          # Existing fluent cycle classes and their local types
│   └── operations/  # Array-cycle construction, masking, and transforms
├── rhythm/          # Euclid, hex, sequence, XOX generators
└── math/            # Exact rationals and numeric support
```

Expression files are `expressions/model.ts` and `expressions/evaluate.ts`; event mechanics are `events/cycle.ts`, `events/transforms.ts`, and `events/grid.ts`. Cycle classes retain their descriptive filenames. Schema serialization helpers live in `cycles/`, and shared bounds live in root `limits.ts`.

Extracted the existing speed-ratio constants, resolver, and shared numeric GCD unchanged into `math/speed-ratio.ts`. Fluent speed and native event transforms now share that numeric boundary without native code importing the fluent `Speed` module. Exact rational geometry remains separate.

No new folder barrels or package entry points were introduced. Fluid imports require no changes because the root API is preserved. Phase 3 removes the intermediary barrels rather than retaining compatibility re-exports.

- Keep tests beside their implementations.
- Move event-grid mechanics out of the miscellaneous utilities bucket.
- Keep schema serialization helpers with the cycle implementations they serve.
- Do not label all existing classes “legacy”: `RandomCycle` and `ValueCycle` remain useful after the event cutover, and their current dependencies still matter.
- Prefer mechanical moves over splitting working modules merely to fill folders. A later shorthand parser can have its own `shorthand/` directory.
- Note the existing native-transform dependency on `getSpeedRatio` in the fluent `Speed` module. If separating it, extract the unchanged numeric boundary into math; do not merge its compatibility rules with the distinct exact-rational rules.

## Phase 3 — Remove indirect import routing

Status: complete. Deleted `src/utils/index.ts` and the root `src/types.ts`. Shared array-cycle definitions now live in `cycles/types.ts`, which defines its own types rather than forwarding exports. Internal consumers import utilities directly from their owning modules and schema types directly from schema. Only the curated root `index.ts` re-exports other modules; all 23 package exports are preserved. Fluid imports and test mocks require no changes.

- Eliminate the umbrella `types.ts` and `utils/index.ts` barrels. Move actual type definitions to their owning area rather than deleting them.
- Inside the package, import directly from the owning module. Import schema types directly from schema.
- At the package root, use explicit named re-exports directly from owners. No `export *` or new folder barrels.
- Update Fluid imports and test mocks as necessary, preserving the single root entry point.
- Check the build output and generated declarations still expose exactly the intended contract.

The desired route is `owning module → curated root → consumer`, not a chain of intermediary barrels.

## Phase 4 — Document and verify

- Replace the starter README with a short package map, ownership notes, and export policy.
- Update shorthand spec/planning language so it does not require gratuitous named type exports. Preserve inspectable expression data and the existing architecture.
- Run affected package builds and tests, plus repository verification:

```sh
pnpm check
pnpm lint
pnpm test
pnpm format
git diff --check
```

- Inspect generated declarations and confirm no package internals became accessible accidentally.
- Confirm corrected schema goldens and production instrument behavior remain unchanged.

## Scope guardrails

No native-state implementation, compatibility fixes, legacy deletion, production cutover, or new authoring features. Export/import changes are intentional; musical semantics, validation behavior, limits, and test coverage stay intact.

Done when the folders explain the package's responsibilities, the root exports have concrete consumers, intermediary barrels are gone, and verification passes.
