# Fluid Package Reorganization

## Intent and status

Complete and merged as [#56](https://github.com/andy-stewart-design/web-audio/pull/56): Steps 1–5 and final verification are complete. This behavior-preserving cleanup sits between shorthand PR 4 (native state/compiler) and PR 5 (atomic production cutover), analogous to the completed patterns package reorganization. PR 5's reorganization prerequisite is satisfied; the atomic production cutover is ready to begin.

PR 4 merged as [#55](https://github.com/andy-stewart-design/web-audio/pull/55). This reorganization started from its merged result; PR 5 starts from the completed reorganized layout. No production native-state wiring or legacy deletion occurred in this cleanup.

The aim is to make ownership obvious from paths, not introduce more architectural layers. Keep the existing single package entry point, default `Drome` export, authoring API, musical behavior, validation, limits, and test assertions unchanged.

## Findings (pre-reorganization)

- `instruments/` has 25 immediate files: public facades and sampler helpers, native event machinery, unit/integration tests, and three test-only support modules.
- Fluid has 27 test files. Test support such as `event-schema-fixtures.ts` is indistinguishable from implementation by location or suffix.
- `patterns/` mixes native input decoding, soon-to-be-deleted authored wrappers, and `Parameter`, which remains useful for processing after cutover.
- Root `midi.ts` contains a cohesive 160-line implementation of three related builders. It warrants a home, not necessarily three new implementation modules.
- Root `types.ts` combines unrelated authoring domains and schema re-exports; `utils/` mixes pitch, waveform interpretation, input guards, and sample-bank normalization.
- Root `index.ts` implements the entire `Drome` facade rather than simply identifying the package entry point.

## Implemented layout

Representative tree; existing test assertions and built-in bank data are retained. Every domain's unit tests go in its own `__tests__/` directory, including directories abbreviated below.

```text
src/
├── index.ts                          # Default export from ./drome; no new API
├── drome.ts                          # Host/factory API and graph assembly
├── __tests__/                        # Package-level integration/API tests
│   ├── drome.test.ts                 # Existing index.test.ts
│   ├── midi-integration.test.ts
│   └── event-schemas/
│       ├── compatibility.test.ts
│       ├── native-replay.test.ts
│       ├── legacy-comparison.test.ts # Temporary; removed in PR 5
│       └── support/
│           ├── schema-fixtures.ts
│           ├── native-regression-fixtures.ts
│           └── scenario-replay.ts
├── instruments/                      # Facades and instrument-specific helpers
│   ├── instrument.ts
│   ├── synthesizer.ts
│   ├── sampler.ts
│   ├── sampler-utils.ts
│   ├── sampler-event-timing.ts        # Fit/chop configuration and event bridge
│   ├── event-compiler.ts             # Existing legacy compiler; PR 5 deletes
│   └── __tests__/
├── events/                           # Native authored event state and emission
│   ├── state.ts
│   ├── geometry.ts
│   ├── snapshot.ts
│   ├── transitions.ts
│   ├── compiler.ts
│   └── __tests__/
├── inputs/                           # Authoring input decoding and interpretation
│   ├── decode-structured-input.ts
│   ├── decode-random-input.ts
│   ├── decode-xox-input.ts
│   ├── guards.ts
│   ├── types.ts                      # Cycle/nullable input definitions
│   ├── waveform.ts                   # Shared synth/LFO alias interpretation
│   └── __tests__/
├── parameters/                       # Processing value patterns, not event lanes
│   ├── parameter.ts                  # Also owns AudioParamInput/AudioParamSource
│   └── __tests__/
├── automations/                      # Existing envelope/LFO implementations
│   └── __tests__/
├── effects/                          # Existing filter/gain implementations
│   └── __tests__/
├── buses/                            # Existing bus implementation
│   └── __tests__/
├── midi/
│   ├── builders.ts                   # Existing midi.ts, kept intact
│   └── __tests__/
├── pitch/
│   ├── get-scale.ts                  # Also owns ScaleAlias
│   ├── note-string-to-midi.ts
│   └── types.ts                      # Note-name/value definitions
├── samples/
│   ├── normalize-bank.ts             # Existing sample-utils.ts, kept intact
│   ├── types.ts                      # Manifest/loadSamples input definitions
│   ├── built-in-banks.ts             # Existing registry, not a re-export barrel
│   ├── banks/                        # Existing loops/rm50/tr808/tr909 data files
│   └── __tests__/
└── patterns/                         # Existing authored wrappers until PR 5
    └── __tests__/
```

### 1. Instruments versus events

Move the shared native pipeline out of `instruments/`. Its responsibility is authoring state, materialization, transitions, and schema emission—not the fluent instrument facades. It still legitimately distinguishes synth and sampler state; moving it does not make it a generic patterns implementation.

| Original module under `instruments/` | Final owner                           |
| ------------------------------------ | ------------------------------------- |
| `event-state.ts`                     | `events/state.ts`                     |
| `event-state-geometry.ts`            | `events/geometry.ts`                  |
| `event-state-snapshot.ts`            | `events/snapshot.ts`                  |
| `event-state-transitions.ts`         | `events/transitions.ts`               |
| `event-state-compiler.ts`            | `events/compiler.ts`                  |
| `event-state-sampler-timing.ts`      | `instruments/sampler-event-timing.ts` |

Keep sampler configuration with the sampler. It knows about fit/chop, region ownership, processing `Parameter` sequences, and sampler helpers. Placing that adapter in `events/` would create an unnecessary dependency back into `instruments/`.

The intended division is:

```text
instrument facades → input decoding → shared pattern evaluation
instrument facades → native event transitions/compiler
sampler-specific configuration → event state + processing parameters
native event core → shared patterns + pitch support + existing schema
```

The event core should not import instrument classes or test helpers. Generated sampler timing remains an external compiler/transform input; no state-model change is part of this PR.

After these moves, `instruments/` has six implementation files plus its test directory; PR 5 removes the old compiler, leaving five.

### 2. Explicit, locally owned test directories

Use domain-local `__tests__/`, not one large package-wide directory mirroring every source path. This clears implementation listings without losing the proximity between a module and its unit tests.

- Unit tests live under the domain they test: `events/__tests__/compiler.test.ts`, `midi/__tests__/builders.test.ts`, etc.
- Cross-domain/public API scenarios live under `src/__tests__/`.
- Shared complete-schema scenarios belong under `src/__tests__/event-schemas/`, because they exercise decoding, instruments, sampler configuration, and compilation together—not just one event helper.
- Fixture factories and replay drivers live under that suite's `support/`. Preserve meaningful `*-fixtures.ts` filenames as an additional signal; do not suffix support modules `.test.ts`, since they are not test suites.
- Move the existing `patterns/notes.test.ts` to `patterns/__tests__/authored-pitches.test.ts` to match its actual subject.
- Tests may import implementation modules or other test support. Production modules must never import from `__tests__/`.

Keep tests inside `src` so the current TypeScript project continues to check them. Vitest already discovers `*.test.ts` recursively; verify all 27 files and the same 896 Fluid tests remain discovered after the moves. Verify that the library build includes no test-support code or public test exports. Do not exclude tests from type checking just to simplify configuration.

Adopt this as the preferred repository convention. Move tests in the separate `packages/patterns` package—not just `packages/fluid/src/patterns/`—into domain-local `__tests__/` folders in this reorganization too, such as `packages/patterns/src/events/__tests__/` and `packages/patterns/src/cycles/operations/__tests__/`. Other packages adopt the convention as their relevant areas are worked on; no repository-wide migration is required.

### 3. MIDI gets a folder, not speculative fragmentation

Move `midi.ts` intact to `midi/builders.ts`, with its unit tests in `midi/__tests__/builders.test.ts`. Keep cross-domain serialization tests at package level.

Do not split `MidiCc`, `MidiOut`, contexts, and validators merely to populate the new directory. They are small and cohesive today. Split by responsibility later if the implementation actually grows. This folder contains Fluid authoring/schema builders, not the Web MIDI runtime owned by other packages.

### 4. Stop using patterns, types, and utils as mixed buckets

These additional moves make the first three changes coherent rather than just redistributing clutter:

- Move the three native decoders from `patterns/` to `inputs/`; future Fluid shorthand atom interpretation can share that owner. Generic expression evaluation and parsing remain in `@web-audio/patterns`.
- Move `patterns/parameter.ts` to `parameters/parameter.ts`. Processing patterns must remain distinct from event lanes; do not replace its `ValueCycle`/`RandomCycle` implementation.
- Move `utils/validate.ts` intact to `inputs/guards.ts`. Its implementation is mostly authoring-shape guards, not a central validation service. Do not tighten or repair any guard in this PR.
- Move pitch helpers to `pitch/`, waveform aliases to `inputs/`, and bank normalization/data to `samples/`. Keep the existing sample normalizer intact rather than splitting its branches into more files.
- Replace root `types.ts` with definitions at their owners: cycle input unions in `inputs/types.ts`, audio parameter input/source types in `parameters/parameter.ts`, `ADSR` in `automations/envelope.ts`, note types in `pitch/types.ts`, `ScaleAlias` in `pitch/get-scale.ts`, manifest types in `samples/types.ts`, and `TimingChanceCondition` in `events/state.ts`.
- Import schema-owned types directly from `@web-audio/schema`; do not introduce replacement type barrels or new package exports.
- Move the `Drome` class unchanged to `drome.ts`; make root `index.ts` a direct default re-export. Internal host type imports point to `drome.ts`, not back through the public entry point. Public API tests continue exercising that entry point.

Avoid new folder `index.ts` barrels. `built-in-banks.ts` is a real registry module with its own constants, not an intermediary export router.

### 5. Leave doomed legacy implementations alone

Do not spend this cleanup moving old authored wrappers into a new `legacy/` architecture or splitting/reworking the old compiler. Leave their implementation files in their current directories until PR 5, apart from required import updates. Move their tests into `__tests__/` consistently, retaining every assertion.

`patterns/` and the old `instruments/event-compiler.ts` are explicit temporary exceptions in the source map. PR 5 removes or narrows those implementations after its coverage-transfer inventory. They must not constrain the long-term native layout or be deleted as part of this reorganization.

## Execution outline

Use reviewable mechanical commits within one reorganization PR:

1. [x] Move native event machinery, input decoders, processing parameters, and MIDI to their owners; update imports and native sampler configuration paths.
2. [x] Move all Fluid tests and test support to explicit test directories, keeping fixtures, scenario names, expected schemas, and assertions unchanged.
3. [x] Move tests in `packages/patterns` into domain-local `__tests__/` folders under `packages/patterns/src/` and update their implementation imports, preserving all assertions without consolidation or dropped coverage. Document the preferred test layout in repository `AGENTS.md`: domain-local unit tests, package-level integration tests, and test-only helpers/fixtures in the relevant suite's `support/`. Other packages adopt it incrementally as their relevant areas are worked on, not through a repository-wide migration.
4. [x] Relocate pitch/sample/input support and type definitions; extract `Drome` unchanged and reduce root `index.ts` to its existing public contract.
5. [x] Update Fluid's README with the source map and pnpm commands, and refresh `packages/patterns/README.md` to reflect its new test layout. Refresh the active shorthand spec/direct-cutover plan's file references and PR 5 deletion/coverage-inventory targets. Historical alternative plans remain historical.

No compatibility re-export shims, package subpaths, new dependencies, export expansion, runtime behavior changes, legacy deletion, or production native-state wiring.

### Step 1 outcome

Moved 11 implementation modules: the five native event modules to `events/`, three decoders to `inputs/`, `Parameter` to `parameters/parameter.ts`, MIDI to `midi/builders.ts`, and sampler configuration to `instruments/sampler-event-timing.ts`. All consumers now import their owning modules directly; no compatibility shims were added. Tests and fixture/support files remain at their existing paths until Step 2, with import updates only. Production facades still use legacy event authoring and compilation.

Fluid retains all 27 test files and 896 passing tests. A disposable TypeScript-token/import-target audit verified all 68 source/test/support files are unchanged except for module paths, with the same resolved dependencies after the moves. Built declaration tokens are unchanged. Fluid build, workspace check/lint/tests/format, and `git diff --check` pass.

### Step 2 outcome

Moved all 27 Fluid test files into domain-local `__tests__/` or package-level integration suites. Complete-schema suites now live under `src/__tests__/event-schemas/`, with the three fixture/replay support modules in its `support/` directory. Renamed test files to match their subjects, including `drome.test.ts`, `midi/__tests__/builders.test.ts`, and `patterns/__tests__/authored-pitches.test.ts`. The sample-normalization tests already live under their final `samples/__tests__/` owner; its implementation remains in `utils/sample-utils.ts` until Step 4.

Fluid retains 27 passing files and 896 tests. A disposable TypeScript-token/import-target audit verified all 68 files retain identical non-import tokens and resolved dependencies after the moves, preserving fixture factories, scenario names, expected schemas, and assertions. All 38 production/type/data files and both built JavaScript and declarations are byte-identical to the Step 2 baseline. No production module imports test support; tests remain included in TypeScript checking without configuration changes. Fluid build/check/lint/tests/format, workspace check/lint/tests/format, and `git diff --check` pass. The separate patterns package test migration remains Step 3.

### Step 3 outcome

Moved all 22 tests in the separate `packages/patterns` package into domain-local `__tests__/` directories under `cycles/`, `cycles/operations/`, `events/`, `expressions/`, `math/`, and `rhythm/`. Only implementation import paths and their formatting changed; no suites were consolidated or coverage dropped. Root `AGENTS.md` now documents domain-local unit tests, package-level integration/public API tests, suite-local `support/`, the production/test boundary, continued TypeScript checking, and incremental adoption elsewhere. README/source-map updates remain Step 5.

Before and after the moves, patterns has 22 passing test files and 372 tests. A disposable TypeScript-token/module-target audit verified all 51 source/test files retain identical non-import tokens, byte-identical bodies, and resolved dependencies, including imports and re-exports. All 29 production/type files and both built JavaScript and declarations are byte-identical to the Step 3 baseline. Before/after Vitest JSON reports confirm the same 22 suites and all 372 passing test names. No production module imports or exports test-only modules; no configuration changes were needed. Patterns build/check/lint/tests/format, Fluid build, workspace check/lint/tests/format, planning-document formatting, and `git diff --check` pass. Fluid retains its 27 files and 896 passing tests.

### Step 4 outcome

Moved pitch helpers to `pitch/`, guards and waveform interpretation to `inputs/`, sample normalization and the built-in registry to `samples/`, and unchanged bank data to `samples/banks/`. Relocated all 25 authoring type definitions from root `types.ts` to their owners: input unions, processing parameter types, envelope ADSR, pitch types/scale aliases, sample manifest types, and native timing chance. Schema-owned types are imported directly from `@web-audio/schema`; root `types.ts` and the emptied `utils/` and `banks/` directories are gone. Extracted the unchanged `Drome` implementation into `drome.ts`; `index.ts` now directly re-exports its default. Internal host type imports point to `drome.ts`, while public API suites continue exercising `index.ts`. Legacy implementation bodies and production wiring remain unchanged.

A disposable type-/binding-aware audit verified all 68 original Fluid source/test/support files across the final 71-file layout: unchanged implementation/test tokens, relocated type definitions, resolved import bindings, test paths, and native-core/production-test boundaries. Built JavaScript differs only in source-path region comments; built declaration statements are identical apart from ordering and source-path comments. Bank data is byte-identical. Before/after Vitest reports preserve all 27 suites and 896 passing test names. A disposable built-entry smoke test under Vitest confirms the sole default `Drome` export and synth/sampler/bank behavior. Fluid build/check/lint/tests/format, patterns build, workspace check/lint/tests/format, planning-document formatting, and `git diff --check` pass. Patterns retains 22 files and 372 passing tests. README/source-map and active shorthand reference updates remain Step 5.

### Step 5 outcome and final verification

Refreshed both package READMEs with the implemented source/test layout, ownership boundaries, and pnpm commands. Updated the active shorthand specification and direct-cutover plan to current paths, including future decoder/interpreter/parser test locations and `drome.ts` factory ownership. Historical alternative plans remain unchanged. Fixed links to the completed patterns reorganization record.

PR 5's inventory now explicitly names legacy implementations and unit suites, the temporary complete-schema comparison suite, and the temporary transition oracle portions. It separately identifies retained public goldens, native replay/materialization/transition/compiler coverage, and shared fixture/replay support. Useful assertions must still map to passing retained tests or an explicit retirement rationale before deletion; counts or passing goldens alone do not authorize deletion. No production wiring or legacy deletion occurred in this cleanup.

Final verification passes: both package builds, workspace check/lint/tests/format, planning-document formatting, and `git diff --check`. Fluid retains 27 files / 896 tests and patterns retains 22 files / 372 tests, with identical before/after test names. A composed move/type/import-binding audit against the merged PR 4 baseline verifies all 68 original Fluid files across the final 71-file layout, unchanged implementation/test tokens and all 25 relocated type definitions, byte-identical bank data, and intact native-core/production-test boundaries. Final Fluid declaration statements match the pre-reorganization baseline apart from ordering/comments; emitted JavaScript changes are source-path comments only. Patterns' 51 files retain their code and resolved dependencies, with byte-identical production files and built JavaScript/declarations. A disposable documentation audit verifies current source references, explicitly planned future paths, local links, both README trees/commands, and the documentation-only Step 5 diff.

All implementation steps are complete, and the standalone reorganization is merged. PR 5 can begin its atomic production integration and verified coverage transfer using this layout.

## Verification gate

- Compare the moved implementations/tests apart from import paths, ownership-only type relocation, and the unchanged `Drome` extraction.
- Retain all 27 Fluid test files, 896 tests, 54 corrected shared goldens, 88 native replay cases, and 149 temporary comparison tests. Investigate any count or expectation change rather than treating a green runner as proof of unchanged coverage.
- Record and preserve `packages/patterns` test-file and test counts before and after the moves; retain its implementation/API unchanged apart from necessary test-path references.
- Preserve native helper import boundaries and confirm no production module imports test support.
- Verify generated declarations and the default package import still expose the same authoring contract; test-only fixtures must not become entry points or exports.
- Build Fluid and patterns and run workspace checks, lint, tests, format, planning-document formatting, and `git diff --check`.
- The merge prerequisite for PR 5 is satisfied by #56; use the refreshed paths and unchanged coverage-transfer requirement.
