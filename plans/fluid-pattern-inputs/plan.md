# Fluid Pattern Inputs Implementation Plan

## Status and governing source

- Governing spec: [spec.md](spec.md), ready for planning; requirements R1–R11 and acceptance criteria AC1–AC18 govern this plan, subject to approved amendments for [envelope defaults/documentation ownership](evidence/step-1.1-envelope-defaults.md), [shared static structured values](evidence/step-1.2-patterns-ownership.md), and [required noise/filter inputs](evidence/step-3.1.md#required-input-amendment).
- Delivery state: Step 3.3 and Phase 3 verified. See [fixed envelope/chop and Phase 3 integration evidence](evidence/step-3.3.md).
- Acceptance or release still pending: Steps 4.1–4.2, the Phase 4 gate, remaining feature acceptance, and any subsequent release decision.
- Blockers: None identified for Step 4.1. Native rendering remains unverified; the previously recorded bare-Node artifact-runner limitation remains a Step 4.1 execution constraint.

Step statuses below are the authoritative execution record. A phase is complete only when its step completion gates and phase exit gate are satisfied. Task checkboxes do not prove that completion gates passed. `Verified` means the scoped gate and required implementation review passed; it does not imply manual approval, publication, or deployment. In supervised execution, manual approvals belong in extension state rather than task checkboxes.

## Execution constraints

- All paths and commands are relative to the `web-audio` repository root unless stated otherwise. Use the configured pnpm version (`10.33.2`) and record the actual Node version during baseline work.
- This document authorizes no execution by itself. Do not begin Phase 0 merely because the plan has been written.
- Preserve unrelated work, including the user's existing move of `plans/parameter-shorthand/` into `plans/completed/parameter-shorthand/`. Do not rewrite historical completed specs, restore those deleted paths, or clean untracked files indiscriminately.
- Preserve the governing spec. Its inferred defaults are the execution contract unless a newly discovered material conflict is escalated; do not reopen settled product decisions or silently weaken requirements.
- Keep step IDs stable and evidence concise. Use supporting notes only when final evidence or unresolved failures justify them; do not create empty reports or append transcripts to this plan.
- Every step includes focused proof. Do not defer first behavioral tests until the integration phase, and do not mark an entire acceptance criterion satisfied when only one consumer has been covered.
- Keep tracked code buildable at review boundaries. Migrate affected first-party callers and tests with each breaking API change rather than leaving them for the documentation phase.
- Do not add dependencies. Never hand-edit lockfiles. If an unforeseen dependency becomes necessary, surface it before installation and use the package manager for any approved change.
- Follow `AGENTS.md`: infer TypeScript return types where practical, avoid `as any`, keep tests type-checked, use domain-local `__tests__/` and suite-local `support/`, and never import test support into production code.
- When migrating fixed positional APIs, use named parameters and keep arity/default handling at the public boundary; do not hide fixed slots behind rest parameters or argument-array normalization layers. Keep deliberate variadic convenience APIs; see the [Step 3.1 simplification correction](evidence/step-3.1.md#simplification-correction-after-user-review).
- Do not start a development server, deploy, publish, modify a database, or change approved audio references. Browser installation or other machine-changing prerequisites require separate approval if missing.

### Inspection findings and verification tooling

These are static findings, not evidence that a command has passed:

- Fluid and audio-engine have Vitest configurations with `@` mapped to their own `src`. Workspace dependencies such as patterns/worklets still use their package exports; build prerequisites before assuming source tests can run from a clean checkout.
- `@web-audio/schema` exports source and has no build script. Fluid and audio-engine export `dist/index.mjs` and build declarations with tsdown. A source-only test does not prove their built entry points work.
- Numeric decoding and audio-source dispatch already share `decode-numeric-input.ts`, `parameter.ts`, and `resolve-audio-param.ts`. Event and XOX decoders separately auto-detect shorthand strings; explicit structured values must bypass that auto-detection.
- `d.lpf/hpf/bpf` currently forward variadic inputs to `new Filter(type, ...frequency)`. They need a preserved convenience adapter when the public filter constructor becomes single-slot.
- `EnvelopeSchema.min` is scalar, but `ResolvedEnvelopeSchema.min` is also scalar for a different reason: it contains an already evaluated event value. Only the former becomes a pattern. Audio-engine external envelope detune initialization also reads schema minimum directly and must not be missed.
- Audio-regression imports built packages and renders through real Chromium `OfflineAudioContext`/AudioWorklet. Its existing harness owns the loopback server; no app `dev` command is needed. Native runs require the installed Playwright Chromium headless shell and committed sample/reference assets.
- Phase 0 baseline results are recorded in [Step 0.1 evidence](evidence/step-0.1.md); the other inspection findings above remain static observations unless that evidence states otherwise.

Existing command families used below:

| Purpose                       | Root command                                                                                                                         | What it establishes                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency and artifact build | `pnpm exec turbo run build --filter=@web-audio/fluid --filter=@web-audio/audio-engine`                                               | Builds the two packages and upstream build dependencies; schema remains source-exported.                                                                             |
| Fluid focused test            | `pnpm --filter @web-audio/fluid exec vitest run <explicit suite paths>`                                                              | Source behavior for the named existing or explicitly proposed suites. The concrete paths are given in each step.                                                     |
| Engine focused test           | `pnpm --filter @web-audio/audio-engine exec vitest run <explicit suite paths>`                                                       | Resolver/scheduling behavior, generally using existing fake audio/clock seams rather than native rendering.                                                          |
| Full core source suites       | `pnpm --filter @web-audio/fluid test:ci`; `pnpm --filter @web-audio/schema test:ci`; `pnpm --filter @web-audio/audio-engine test:ci` | Each package's non-watch suite; run the three commands individually.                                                                                                 |
| Package static checks         | `pnpm --filter @web-audio/fluid check`; `pnpm --filter @web-audio/schema check`; `pnpm --filter @web-audio/audio-engine check`       | Type-checks the relevant packages, including included tests.                                                                                                         |
| Package lint                  | `pnpm --filter @web-audio/fluid lint`; `pnpm --filter @web-audio/schema lint`; `pnpm --filter @web-audio/audio-engine lint`          | Existing ESLint contracts; use only the packages changed by a step.                                                                                                  |
| Built web consumer            | `pnpm --filter web check`                                                                                                            | Svelte/TypeScript compatibility after dependencies have been rebuilt; not a browser session or production deployment.                                                |
| Native regression tooling     | `pnpm --filter @web-audio/audio-regression test:ci`                                                                                  | Builds dependencies, runs the existing tooling/native suites, then freshly verifies approved audio cases without updating references.                                |
| Broad regression              | `pnpm check`; `pnpm lint`; `pnpm test`                                                                                               | Workspace-level checks. Root test uses Turbo `test:ci`, including native audio regression; it is not equivalent to running every app's separately named test script. |

For formatting, run Prettier only on the exact touched paths, then check those same paths. Do not use a repository-wide write-format command as cleanup. New test files named below are proposed additions, not existing runnable suites before their owning step.

## Phase overview and delivery boundary

| Phase | Outcome                                                                         | Dependencies                         | Exit gate                                                                                          |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 0     | Recorded baseline and migration inventory                                       | Governing spec and existing worktree | Tools, baseline results, and source/artifact distinctions recorded                                 |
| 1     | Correct envelope argument meanings and reusable numeric/event structured values | Phase 0                              | Public builder and dedicated-setter parity, source permissions, and prework tests pass             |
| 2     | Patterned envelope minimum from canonical graph to scheduled audio values       | Phase 1                              | Atomic producer/schema/consumer migration passes core integration checks                           |
| 3     | One argument per positional pattern slot across all six API families            | Phase 2                              | All families reject legacy positional structures while dedicated setters retain convenience syntax |
| 4     | Public/evaluated/built contract, documentation, and native regression proof     | Phase 3                              | AC1–AC18 mapped and demonstrated; broad/static/native gates assessed                               |

Delivery boundary: one feature-complete PR containing the reviewable steps below, not one PR per phase. Step 1.1 is the agreed prework and must pass its own gate before builder changes; intermediate commits are not instructions to publish a partially migrated API.

Atomic groups:

- **AG1 — Envelope graph migration, Step 2.1:** schema type/validation, Fluid serialization, engine resolution, and all first-party graph fixtures move and revert together. Do not merge or revert one member independently.
- **AG2 — Positional signature changes:** each Step 3.x includes its factories/constructors/forwarders, aliases, affected first-party callers, and tests. They are separate review units, but none may leave callers compiling against removed signatures.

## Phase 0 — Baseline and migration inventory

Outcome: identify the actual baseline and the first-party callsites that must move, without changing tracked application code.
Depends on: the governing spec and current worktree.
Review boundary: source inspection, tool availability, build prerequisites, and baseline results; no implementation or unrelated repair.

### Step 0.1 — Record baseline and freeze the migration inventory

Status: Verified
Requirements / acceptance: R1–R11 verification prerequisites; no acceptance criterion is claimed satisfied by baseline work.
Depends on: None.
Review boundary: establish execution facts and distinguish existing failures from future regressions.

Expected files:

- This plan's evidence entry — baseline summary and blockers.
- Optional `evidence/baseline.md` — only if material failures or reproduction detail warrant a supporting note.
- No tracked application-source changes. Dependency builds may create normal generated output.

Tasks:

- [x] Record Node/pnpm versions and the worktree state, preserving the existing historical-plan move and untracked feature documents.
- [x] Confirm the spec's inferred defaults against the relevant tests; retain them unless a material contradiction requires escalation.
- [x] Inventory executable/documented old `env(single number)`, noise, filter, LFO-array, and chop callsites. Distinguish preserving old author intent from updating tests that intentionally characterize the new contract.
- [x] Inventory schema-level envelope-minimum producers and readers, separately from resolved scalar minimum and unrelated `min` properties.
- [x] Build the core packages and run the existing core source suites/static checks; record any failure with its reproduction and affected gates, not as an automatic waiver.
- [x] Check native prerequisites without installing or launching them: Chromium availability and case/sample/reference files. Record missing prerequisites for Step 4.2.

Verification:

- Automated: record `node --version`, `pnpm --version`, `git status --short`; run the dependency/artifact build, the three full core source suites, and the three package static checks from the command table. Expected outcome is a reproducible baseline, whether green or explicitly failing.
- Inspection: use `rg` across `packages`, `apps`, and active `docs` to classify envelope/schema and positional callers. Read complete files when examining them. Historical plans are evidence, not migration targets.
- Manual: not needed; no live audio or external service is involved in this gate.

Completion gate: required commands have recorded outcomes, affected callers/fixtures are identified, and any failure that prevents interpreting subsequent proof is resolved or recorded as a blocking issue. A missing optional diagnostic note is not a blocker.
Evidence: Verified; see [Step 0.1 results and inventory](evidence/step-0.1.md).

Phase exit gate: assess Step 0.1 after its checks. Confirm subsequent steps have runnable source gates and a known native prerequisite path; do not claim a green baseline from static inspection. Missing Chromium may remain a visible Step 4.2 prerequisite, but source-test/toolchain blockers must be resolved before dependent implementation.
Evidence: Satisfied; see [Phase 0 gate assessment](evidence/step-0.1.md#gate-assessment-and-next-boundary).

## Phase 1 — Envelope prework and explicit structured values

Outcome: one-argument envelope meaning is corrected, and structured values work in existing numeric and event consumers without yet removing legacy positional pattern signatures.
Depends on: Phase 0 exit gate.
Review boundary: public input values and normalization, not canonical minimum representation or removal of all variadic multi-input forms.

### Step 1.1 — Correct envelope argument meanings as prework

Status: Verified
Requirements / acceptance: R1, R9, R11; AC1 and AC2 core behavior, rechecked with patterned bounds in Step 2.1 and the final signatures in Step 3.3.
Depends on: Step 0.1.
Review boundary: factory/constructor parity, defaults, and the deliberate numeric-single change while schema minimum is still scalar.

Expected files:

- `packages/fluid/src/drome.ts` and `src/automations/envelope.ts` — argument selection and defaults.
- `packages/fluid/src/automations/__tests__/envelope.test.ts`.
- `packages/fluid/src/__tests__/parameter-compatibility.test.ts`, `parameter-shorthand.test.ts`, and `drome.test.ts` as affected.
- `docs/concepts/syntax.md` and any Phase 0 identified first-party caller that relied on old one-number minimum semantics.

Tasks:

- [x] Select maximum for a sole numeric, shorthand, or already-supported maximum-pattern source; retain `env()` defaults and two-field minimum/maximum meaning.
- [x] Keep omission/sole `undefined` defaults, require explicit bounds in multi-field calls, and reject `null`; retain factory/constructor parity and useful argument context.
- [x] Update assertions that intentionally exercise the changed single-number contract. Convert callers that need the old range to `env(oldMinimum, 1)` rather than changing their sound accidentally.
- [x] Add focused factory/constructor and TypeScript/default tests, including numeric/shorthand equivalence and invalid null input.
- [x] Record envelope migration guidance in evidence; user-facing docs are user-owned. Keep any temporary legacy variadic-maximum overload only until Step 3.3; do not tighten it before its replacement exists.

Verification:

- Automated: `pnpm --filter @web-audio/fluid exec vitest run src/automations/__tests__/envelope.test.ts src/__tests__/parameter-compatibility.test.ts src/__tests__/parameter-shorthand.test.ts src/__tests__/drome.test.ts`. Assert the AC1/AC2 table while retaining supported two-field behavior.
- Automated: run Fluid `check`, `lint`, and a formatting check on the touched paths. Type-negative tests must be included in TypeScript checking, not merely Vitest transpilation.
- Manual: inspect migrated callsites to distinguish preserved old ranges from deliberately changed default semantics.

Completion gate: factory and constructor agree for all documented defaults, existing minimum-intent callers are explicit, focused tests and static gates pass, and no graph/schema change is required by this step.
Evidence: Verified; see [original Step 1.1 verification](evidence/step-1.1.md) and the [approved refinement and current verification](evidence/step-1.1-envelope-defaults.md).

### Step 1.2 — Add reusable structured values and numeric normalization

Status: Verified
Requirements / acceptance: R2–R4, R6, R8–R10; AC3 and AC6; AC5 numeric portion, AC9 numeric portion, AC14 numeric permission portion, and AC16 wrapper/numeric portions. Event and positional portions belong to Steps 1.3 and 3.x.
Depends on: Step 1.1.
Review boundary: a usable public numeric builder, static ownership, and shared whole-pattern normalization; no event decoding change or positional-signature removal.

Expected files:

- **New** `packages/patterns/src/structured/create.ts` — shared static value, factory, guard, and snapshot ownership.
- `packages/patterns/src/index.ts` — public structured-value exports.
- **New** `packages/patterns/src/structured/__tests__/create.test.ts` — shared value/factory tests.
- **New** `packages/fluid/src/inputs/normalize-structured-input.ts` — shared whole-pattern normalization; exact helper naming may adapt without changing its boundary.
- `packages/fluid/src/drome.ts`, `src/inputs/types.ts`, `src/inputs/guards.ts`, `src/inputs/decode-numeric-input.ts`.
- `packages/fluid/src/parameters/parameter.ts` and `resolve-audio-param.ts` as required for type/source integration.
- **New** `packages/fluid/src/inputs/__tests__/structured-input.test.ts`.
- Existing numeric decoder, parameter, and audio-source-dispatch suites; **new** `packages/fluid/src/__tests__/structured-inputs.test.ts` for cross-domain/public numeric cases.

Tasks:

- [x] Add equivalent static-only `d.structured()` / `d.str()` construction with consumer-constrainable typing, immutable snapshots, and no playback cursor. The shared value/factory/guard belongs to patterns; calling conventions and consumer validation remain in Fluid. No grammar change is needed.
- [x] Normalize one wrapper as an entire argument list while retaining whether the caller explicitly chose structured semantics. Reject empty/nested/mixed wrappers and reusable shorthand objects inside builders.
- [x] Integrate numeric decoding without treating wrapped string atoms as shorthand. Preserve the old ownership behavior of unwrapped variadic arrays.
- [x] Reject random and modulation sources as builder contents; preserve existing direct source permissions, identities, and live configuration.
- [x] Prove wrapper acceptance through every numeric single-input family listed in the spec, including aliases and gain-envelope preservation, using the common decoder path rather than new per-method parsers.
- [x] Add ownership, reuse, invalid composition, raw-string, source-permission, and type-negative tests. Use runtime JavaScript probes such as `Reflect.apply` instead of weakening production types with `as any`.

Verification:

- Automated: `pnpm --filter @web-audio/fluid exec vitest run src/inputs/__tests__/structured-input.test.ts src/inputs/__tests__/decode-numeric-input.test.ts src/parameters/__tests__/parameter.test.ts src/parameters/__tests__/resolve-audio-param.test.ts src/__tests__/structured-inputs.test.ts` after adding the two proposed suites.
- Automated shared-package gate: `pnpm --filter @web-audio/patterns build`, then `pnpm --filter @web-audio/fluid build`; run Patterns `test:ci`, `check`, and `lint` with the same package filter. The build order supplies shared public exports/declarations to Fluid checks.
- Expected proof: two bars versus two values in one bar, equivalence to appropriate shorthand, caller-array mutation isolation, unchanged raw-array identity behavior, preserved envelope gain state, and no source-permission widening.
- Automated: Fluid `check`, `lint`, and touched-path formatting check. Include compile-time rejection of incompatible structured atom types and mixed whole-pattern values.
- Manual: not needed; static graph assertions and mutation tests cover this step.

Completion gate: the public builder works for numeric dedicated setters, aliases and random/source cases obey their existing permissions, and all scoped ownership and negative tests pass. Event-builder acceptance is not claimed yet.
Evidence: Verified; see [shared ownership/static-only refinement and current checks](evidence/step-1.2-patterns-ownership.md) and [original verification/artifact-runner limitation](evidence/step-1.2.md).

### Step 1.3 — Integrate structured event values without shorthand reinterpretation

Status: Verified
Requirements / acceptance: R2–R4, R6, R8–R10; AC4; AC5 event portion, AC6 event reuse portion, AC9 event portion, AC14 event permission portion, and AC16 event portions. Multi-input runtime rejection remains with Phase 3.
Depends on: Step 1.2.
Review boundary: notes, names, variations, and XOX retain their existing structured geometry and atom semantics when inputs arrive in a wrapper.

Expected files:

- `packages/fluid/src/inputs/decode-structured-input.ts`, `decode-xox-input.ts`, and shared input types.
- `packages/fluid/src/instruments/instrument.ts` and `sampler.ts` where event signatures need wrapper alternatives.
- Existing `decode-structured-input.test.ts`, `decode-xox-input.test.ts`, and `shorthand-equivalence.test.ts` suites.
- `packages/fluid/src/instruments/__tests__/event-setters.test.ts` and `src/__tests__/structured-inputs.test.ts`.

Tasks:

- [x] Feed wrappers through the shared normalization boundary before event shorthand detection; explicitly bypass generic shorthand parsing for wrapped string atoms.
- [x] Preserve bar/step/chord/rest geometry, note and name validation, variation rules, and XOX-specific native structured behavior. Do not implement XOX by treating every string as generic shorthand.
- [x] Add builder alternatives to public event signatures and aliases without removing variadic structured convenience or changing existing direct shorthand behavior.
- [x] Extend equivalence/reuse tests to notes, names, variation/var, and XOX, including cases where a raw string atom differs from a shorthand expression.
- [x] Test incompatible atoms, polyphony/rest restrictions, random-source permissions, and nested/mixed wrappers through the public event APIs.

Verification:

- Automated: `pnpm --filter @web-audio/fluid exec vitest run src/inputs/__tests__/decode-structured-input.test.ts src/inputs/__tests__/decode-xox-input.test.ts src/inputs/__tests__/shorthand-equivalence.test.ts src/instruments/__tests__/event-setters.test.ts src/__tests__/structured-inputs.test.ts`.
- Expected proof: wrapper and legacy structured calls yield equivalent event schemas; wrapped strings are not reinterpreted as general shorthand; consumer-specific negative cases remain invalid.
- Automated: Fluid `check`, `lint`, and touched-path formatting check.
- Manual: not needed; event graph and decoder assertions are the acceptance seam.

Completion gate: every event consumer named in AC4 accepts the builder with its existing semantics, all event aliases retain parity, and numeric gates from Step 1.2 remain green.
Evidence: Verified; see [Step 1.3 behavior, bounds, review, and verification](evidence/step-1.3.md).

Phase exit gate: after Step 1.3 checks, run the full Patterns and Fluid source suites, `check`, and `lint` for each package, then build Fluid and upstream dependencies with `pnpm exec turbo run build --filter=@web-audio/fluid`. Confirm envelope prework, numeric/event builder parity, source guards, and mutation regressions compose. Legacy multi-input rest forms may still exist until Phase 3; their final rejection is not claimed here.
Evidence: Satisfied; see [Phase 1 checks and completion boundary](evidence/step-1.3.md#verification).

## Phase 2 — Atomic pattern-valued envelope minimum

Outcome: canonical graphs and all first-party readers agree that minimum is a numeric pattern resolved per envelope event.
Depends on: Phase 1 exit gate.
Review boundary: AG1 only; positional arity cleanup remains Phase 3 and resolved envelope arithmetic remains scalar.

### Step 2.1 — Migrate minimum through Fluid, schema, engine, and fixtures together

Status: Verified
Requirements / acceptance: R1, R7–R11; AC1/AC2 patterned-bound recheck, AC10–AC13 deterministic portions, AC14 minimum permissions, AC15 envelope atomicity portion. Native confirmation belongs to Step 4.2; final strict envelope arity belongs to Step 3.3.
Depends on: Step 1.3 and Phase 1 exit gate.
Review boundary: one indivisible graph producer/validator/consumer migration, including every directly affected fixture and assertion.

Expected files:

- `packages/schema/src/index.ts`, `validate-graph.ts`, and `validate-graph.test.ts`.
- `packages/fluid/src/automations/envelope.ts`, `src/drome.ts`, applicable input types, and affected envelope/gain/default-schema tests.
- `packages/audio-engine/src/instruments/instrument.ts`; existing resolver/envelope/scheduling tests.
- `packages/audio-engine/src/__tests__/support/schema-fixtures.ts` and envelope graph literals in instrument, synthesizer, pre-envelope-effects, noise, and sampler suites.
- Fluid canonical expectations in `parameter-compatibility.test.ts`, `parameter-shorthand.test.ts`, `drome.test.ts`, and affected instrument/effect suites identified in Phase 0.
- **New if needed** domain-local or package integration tests for patterned minimum; helpers stay in the corresponding suite's `support/`.

Tasks:

- [x] Change canonical `EnvelopeSchema.min` to `NumberPattern`, validate it like other numeric-pattern fields, and migrate all scalar-minimum graph literals/producers together. Do not blanket-replace unrelated or already resolved scalar `min` fields.
- [x] Store/serialize Fluid minimum through the same numeric parameter model as maximum, default it to a constant zero pattern, and accept the same permitted numeric/random forms. Retain the prework's one-/two-field meanings.
- [x] Resolve minimum by the current event's bar/hit indices in the main envelope path and the external envelope detune initialization path. Keep `ResolvedEnvelopeSchema.min` and `computeEnvelope()` inputs numeric.
- [x] Test independent minimum/maximum wrapping, one sampled minimum per event including release, inversion/crossing, unrestricted finite bounds, existing sustain math, and both gain-envelope and external audio-source use.
- [x] Test invalid minimum patterns and nested sources, default canonical serialization, factory/constructor parity, and unchanged state on invalid replacements. Keep positional ADSR source restrictions intact.
- [x] Search for remaining scalar-schema readers/producers, classify legitimate resolved scalar uses, and update affected active documentation and fixtures in this same atomic change.

Verification:

- Automated: `pnpm --filter @web-audio/schema test:ci` for canonical pattern validation and invalid minimum shapes/values.
- Automated: `pnpm --filter @web-audio/fluid exec vitest run src/automations/__tests__/envelope.test.ts src/__tests__/parameter-compatibility.test.ts src/__tests__/parameter-shorthand.test.ts src/__tests__/structured-inputs.test.ts` plus affected gain/default-schema suites.
- Automated: `pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/__tests__/instrument.test.ts src/patterns/__tests__/value-pattern-resolver.test.ts src/parameters/__tests__/compute-envelope.test.ts`. Add deterministic fake-audio scheduling assertions within these existing seams or a clearly named new integration suite.
- Expected proof: the graph validator rejects scalar canonical minimum; resolved runtime envelopes still contain numbers; the same event indices reach both bounds; detune and scheduled external envelopes no longer read unresolved schema minimum as a number.
- Automated: run all three core package `check`/`lint` commands and touched-path formatting checks. Inspect remaining schema-minimum uses before considering AG1 complete.
- Manual: code review of the complete reader/writer inventory is required; fake audio proves scheduling calls, not native sound.

Completion gate: all AG1 members compile and pass their focused tests together, every known first-party scalar-schema use is migrated or explicitly classified as resolved runtime data, and no half-migrated graph can be emitted by the current first-party source tree.
Evidence: Verified; see [AG1 contract, migration inventory, review, and checks](evidence/step-2.1.md).

Phase exit gate: after Step 2.1 checks, run all three full core source suites and static checks, then the dependency/artifact build. No canonical producer may emit scalar minimum; no runtime consumer may use an unresolved minimum pattern as a scalar. Record native rendering as pending Step 4.2 rather than treating mock scheduling as native proof.
Evidence: Satisfied; see [Phase 2 verification and completion boundary](evidence/step-2.1.md#verification).

## Phase 3 — Explicit positional pattern slots

Outcome: the six multi-input API families accept scalar/shorthand/wrapper values in fixed slots and reject raw structured arrays or continuation arguments.
Depends on: Phase 2 exit gate.
Review boundary: strict public signatures and runtime boundaries, consumer-specific permissions, and migrations of affected callers; no new grammar or source kinds.

### Step 3.1 — Tighten noise and filter slots while preserving dedicated filter sugar

Status: Verified
Requirements / acceptance: R5, R6, R8–R11; AC7 noise/filter portions, AC8, AC9 filter-alias/source recheck, AC14 audio-source permissions, AC15 noise portion, AC16 positional composition portion. Remaining families belong to Steps 3.2/3.3.
Depends on: Step 2.1 and Phase 2 exit gate.
Review boundary: color/type dispatch and one gain/frequency value, including direct sources, defaults, and old callers.

Expected files:

- `packages/fluid/src/instruments/instrument.ts`, `src/effects/filter.ts`, and `src/drome.ts`.
- Shared single-slot input types/guards or normalization helpers introduced in Phase 1.
- `src/instruments/__tests__/noise.test.ts`, `src/effects/__tests__/filter.test.ts`, and public shorthand/structured suites.
- Active noise/filter examples and first-party callsites found in Phase 0.

Tasks:

- [x] Introduce/reuse explicit single-slot numeric/audio input types, distinct from variadic convenience tuples, without broadening a consumer's direct source permissions.
- [x] Require noise gain: accept only `noise(gain)` and `noise(color, gain)`, rejecting no-argument/color-only calls, extra gain bars, and raw gain arrays. Preserve white for gain-only calls and atomic layer replacement; see the approved required-input amendment.
- [x] Require one named frequency slot in the filter factory/constructor, with one signature each and no omission overload. Preserve `lpf/hpf/bpf` through their dedicated internal variadic path, including alias omission/ownership behavior, not by forwarding removed public constructor arity.
- [x] Enforce runtime argument counts at each public boundary before forwarding; a factory must not silently drop extra JavaScript arguments before a constructor could reject them.
- [x] Add type/runtime permission, default, source-only, raw-array, extra-argument, and failure-atomicity tests; migrate all affected first-party callers/examples with the change.

Verification:

- Automated: `pnpm --filter @web-audio/fluid exec vitest run src/instruments/__tests__/noise.test.ts src/effects/__tests__/filter.test.ts src/__tests__/parameter-shorthand.test.ts src/__tests__/structured-inputs.test.ts`.
- Expected proof: valid scalar/shorthand/structured and allowed source forms agree; no-color noise has no hidden variadic exception; filter aliases retain variadic bars; rejected replacement calls preserve the old layer/parameter.
- Automated: Fluid `check`, `lint`, and touched-path formatting check; compile-time negatives cover both factories and applicable constructors.
- Manual: inspect alias forwarding and migrated callers for preserved bar geometry and dedicated-alias omission behavior; strict filter frequency and noise gain are required.

Completion gate: strict noise/filter public boundaries and retained dedicated filter sugar compose in the same buildable change; no first-party caller depends on their removed signatures.
Evidence: Verified; see [strict boundaries, omission baseline, alias ownership/lifecycle, caller review, and checks](evidence/step-3.1.md).

### Step 3.2 — Tighten LFO endpoints and extend positional ADSR to static wrappers

Status: Verified
Requirements / acceptance: R3, R5, R8–R11; AC7 LFO/ADSR portions, AC14 ADSR/LFO permission portions, AC15 ADSR portion, AC17. Full multi-family acceptance closes after Step 3.3 and the phase exit gate.
Depends on: Step 3.1.
Review boundary: endpoint bar semantics, static structured ADSR, and runtime argument/permission checks.

Expected files:

- `packages/fluid/src/automations/lfo.ts`, `envelope.ts`, `src/instruments/instrument.ts`, `src/drome.ts`, and relevant shared input types.
- `src/automations/__tests__/lfo.test.ts`, `envelope.test.ts`, and public shorthand/structured suites.
- Active LFO/ADSR callsites, including `docs/concepts/patterns.md` and `syntax.md` as affected.

Tasks:

- [x] Replace raw-array LFO endpoint types/dispatch with the shared explicit slot path, retaining direct numeric/shorthand/random endpoint permissions and per-bar first-value behavior.
- [x] Migrate old endpoint arrays to `d.str(...oldEndpointArray)`, not `d.str(oldEndpointArray)`, so their previous separate-bar meaning survives.
- [x] Allow permitted static structured wrappers in each positional ADSR field, while continuing to reject raw arrays, direct random cycles, and audio modulation sources. Random sources are not valid builder data.
- [x] Validate all replacement ADSR fields before assignment and enforce runtime arity at both instrument/envelope ADSR and LFO factory/constructor boundaries.
- [x] Add endpoint-warning, type-negative, extra-argument, permission, and late-field atomicity tests; update all affected first-party callsites in the same change.

Verification:

- Automated: `pnpm --filter @web-audio/fluid exec vitest run src/automations/__tests__/lfo.test.ts src/automations/__tests__/envelope.test.ts src/__tests__/parameter-shorthand.test.ts src/__tests__/structured-inputs.test.ts`.
- Expected proof: old endpoint arrays migrated to wrappers still yield two one-value bars; intentionally multivalue bars retain existing warning behavior; direct ADSR random inputs fail without changing any field, and builders reject random inputs independently.
- Automated: Fluid `check`, `lint`, and touched-path formatting check. Use runtime invalid-call probes as well as TypeScript negative assertions.
- Manual: inspect LFO migrations for the extra-array-level trap and verify that warning state is not reset or emitted merely by normalization.

Completion gate: LFO no longer needs its special raw-array endpoint interpretation, ADSR supports static structured values consistently, and existing permission/warning/atomicity behavior is proven rather than relaxed.
Evidence: Verified; see [fixed named slots, permissions, atomicity, warnings, active migrations, and checks](evidence/step-3.2.md).

### Step 3.3 — Finish fixed envelope and chop slots without changing authored timing

Status: Verified
Requirements / acceptance: R1, R3, R5, R7–R11; AC1/AC2 final arity/default recheck, AC7 envelope/chop portions, AC9 region-setter recheck, AC15 sampler portion, AC16 remaining positional composition cases.
Depends on: Step 3.2.
Review boundary: remove remaining legacy variadic maxima/sequences after their explicit replacements exist; preserve timing and defaults.

Expected files:

- `packages/fluid/src/drome.ts`, `src/automations/envelope.ts`, `src/instruments/sampler.ts`, and `sampler-event-timing.ts`.
- `src/automations/__tests__/envelope.test.ts`, `src/instruments/__tests__/sampler-event-timing.test.ts`, and `sampler-utils.test.ts`.
- Public shorthand/structured and compatibility suites; affected active docs/examples and callers.

Tasks:

- [x] Remove the transitional variadic envelope maximum forms. Constructor and factory each use one named optional-parameter signature, without overload declarations. A sole value means maximum, `env(undefined)` remains equivalent to omission, and multi-field `undefined` is rejected at runtime.
- [x] Give chop one named optional-sequence signature, without overload declarations. Reject raw arrays and continuation arguments without changing slice validation or range warnings.
- [x] Normalize explicit structured chop input once while preserving authored bar/step shape, omitted/generated distinction, and interaction with `fit()`; do not infer timing from flattened parameter values.
- [x] Keep sampler region setters' variadic convenience/aliases unchanged and validate replacements before changing sampler timing state.
- [x] Add final factory/constructor arity, malformed-slot, generated-versus-authored timing, fit, and rollback tests; migrate remaining old calls together.

Verification:

- Automated: `pnpm --filter @web-audio/fluid exec vitest run src/automations/__tests__/envelope.test.ts src/instruments/__tests__/sampler-event-timing.test.ts src/instruments/__tests__/sampler-utils.test.ts src/__tests__/parameter-compatibility.test.ts src/__tests__/parameter-shorthand.test.ts src/__tests__/structured-inputs.test.ts`.
- Expected proof: no bound changes meaning by type; old variadic envelope/chop forms fail explicitly; wrapper and equivalent authored structured sequences have the same events/timing; invalid chop leaves prior sampler state intact.
- Automated: Fluid `check`, `lint`, and touched-path formatting check.
- Manual: inspect actual signatures and forwarding code, not only green tests. Envelope construction, `env`, and `chop` must each have one named optional-parameter signature, without overloads or replacement tuple/normalization machinery. Distinguish legitimate dedicated-setter sugar from prohibited positional continuation; optional-field presence rules remain runtime checks.

Completion gate: the final envelope/chop contracts work with canonical patterned minimum, all six API families have their final signatures, and no unrelated timing generator or configuration input has been expanded.
Evidence: Verified; see [fixed named slots, defaults, timing, source lifecycle, rollback, and migrations](evidence/step-3.3.md).

Phase exit gate: after Step 3.3 checks, run full Fluid tests, Fluid `check`/`lint`, and schema/engine source regression suites. Assess the complete public family matrix, including raw-array and excess-argument runtime rejection. Search all first-party consumers for the removed forms and review hits rather than blanket rewriting. Dedicated setters and excluded APIs must retain their previous supported behavior. Do not advance on only per-family happy-path tests.
Evidence: Satisfied; see [complete six-family matrix and Phase 3 verification](evidence/step-3.3.md#verification).

## Phase 4 — Public contract, documentation, and native proof

Outcome: public source evaluation, built exports, active documentation, and native audio verification all agree with the completed contract.
Depends on: Phase 3 exit gate.
Review boundary: integration/cleanup after consumer parity, documentation, and proof; no new product scope or approved audio-reference changes.

### Step 4.1 — Close the public matrix and document deliberate migrations

Status: Pending
Requirements / acceptance: R1–R11 integration; AC1–AC10 and AC14–AC18 public/composition recheck, particularly AC18. Native AC11–AC13 confirmation remains Step 4.2.
Depends on: Step 3.3 and Phase 3 exit gate.
Review boundary: the complete public/evaluation/distribution contract and active documentation, not a new normalization architecture.

Expected files:

- `packages/fluid/src/__tests__/structured-inputs.test.ts`, `evaluate-source.test.ts`, and existing public compatibility suites.
- Test-only compile-time probes in the relevant suite or its `support/` if needed; keep them included in TypeScript checking.
- `packages/fluid/src/index.ts` only if declaration accessibility requires a change; no additional named wrapper/constructor export is required by the spec.
- `docs/concepts/syntax.md`, `docs/concepts/patterns.md`, `docs/reference/instruments/noise.md`, and affected active README/reference examples.
- Shared normalization/old dispatch code only where all replacement consumers have already been proven.

Tasks:

- [ ] Complete the cross-consumer matrix for direct shorthand, reusable shorthand, explicit structured values, legacy dedicated-setter sugar, aliases, and source permissions; retain compile-time negative cases alongside runtime JavaScript cases.
- [ ] Exercise `evaluateSource()` with both `d` and `drome` aliases, reusable numeric/event values, patterned bounds, noise/filter/chop/LFO/ADSR, and malformed calls. Validate emitted graphs and assert no wrapper objects leak into them.
- [ ] Remove superseded per-method dispatch only after replacement tests pass and a search identifies every remaining consumer. Do not remove shared event geometry, source guards, or resolved scalar envelope math.
- [ ] Update active documentation with the exact migration table, same-bar versus successive-bar examples, the old numeric `env(x)` warning, random/source restrictions, and unchanged/deferred APIs. Leave completed historical plans intact.
- [ ] Build declarations/artifacts and smoke-test the real package export rather than treating source imports as artifact proof. Preserve inferred wrapper types without exposing private unresolved declarations.

Verification:

- Automated: `pnpm --filter @web-audio/fluid exec vitest run src/__tests__/structured-inputs.test.ts src/__tests__/evaluate-source.test.ts src/__tests__/parameter-compatibility.test.ts src/__tests__/parameter-shorthand.test.ts`, then Fluid `check`/`lint` and touched-path formatting checks.
- Automated: run the dependency/artifact build, then `pnpm --filter web check`. The build must emit valid runtime and declaration artifacts; source type probes prove public source typing, not an installed/packed-package contract.
- Built runtime smoke, from the repository root after building. Execution constraint: the bare-Node form below encounters the source-exported schema's extensionless import; see [Step 1.2 runner evidence](evidence/step-1.2.md#supplementary-built-entry-smoke-runner-distinction) before choosing the final runner:

```sh
pnpm --filter @web-audio/fluid exec node --input-type=module -e '
import assert from "node:assert/strict";
import Drome, { evaluateSource } from "@web-audio/fluid";
const d = new Drome();
d.synth().gain(d.str(0.2, 0.1)).push();
assert.equal(d.getSchema().instruments.length, 1);
const graph = evaluateSource(`
  const levels = drome.structured(0.2, 0.1);
  d.synth().gain(d.env(d.str(0, 0.1), levels))
    .notes(d.str([60, 64], [62, 65])).push();
`);
assert.equal(graph.instruments.length, 1);
'
```

- Manual: review the documented migrations against the corresponding executable cases and search for surviving removed-signature callers and duplicate normalization. No browser interaction, publication, or packed/installed claim is part of this smoke test.

Completion gate: every spec API is represented in the public matrix, evaluated source yields canonical wrapper-free graphs, package build/self-import and web type consumption work, documentation matches the executable contract, and cleanup follows rather than precedes parity proof.
Evidence: Not run.

### Step 4.2 — Prove native envelope behavior and complete regression gates

Status: Pending
Requirements / acceptance: R3, R4, R7–R11; AC11–AC13 native confirmation; regression support for AC6, AC9, AC17, and AC18. Full acceptance depends on all earlier owning gates as mapped below.
Depends on: Step 4.1.
Review boundary: a small native diagnostic for the new behavior and existing approved-case regression, without adding/updating approved musical references.

Expected files:

- **New** `packages/audio-regression/src/__tests__/patterned-envelope.test.ts`.
- Relevant `packages/audio-regression/src/__tests__/support/` helper only if existing diagnostics/render seams need a small test-only adapter.
- Active audio-regression source sketches/tests only if Phase 3 found a removed API call; preserve intended sound when migrating it.
- No changes to `packages/audio-regression/references/` or reference comparison thresholds.

Tasks:

- [ ] Reuse the existing native harness and temporary synthetic sketches for patterned minimum; do not add a parallel browser/audio harness or depend on external sample fetching.
- [ ] Render equivalent shorthand/builder envelopes across multiple bars/hits, including independent bounds, and assert equivalent finite output using established comparison tolerances.
- [ ] Compare a patterned-minimum render with a deliberately different constant-minimum control to establish that minimum affects native output; include allowed inverted bounds and an envelope applied to an external parameter.
- [ ] Build current dependencies and run the proposed diagnostic, existing native tooling/approved-reference verification, and final workspace static/regression gates. Record exactly which gates ran and any baseline failures.
- [ ] Confirm references and thresholds remain unchanged; if native rendering differs unexpectedly, preserve diagnostic output and investigate rather than refreshing references or widening tolerances.

Verification:

- Prerequisites: the required Playwright Chromium shell, normal loopback browser execution, and committed cases/assets/references must be available. If missing, mark the native gate `Blocked`; request approval before using the existing `pnpm --filter @web-audio/audio-regression browser:install` command. Do not silently substitute mocks or install during a gate.
- Focused automated native check after the dependency/artifact build: `pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/patterned-envelope.test.ts` once the proposed suite exists. Assertions must establish real rendered parity, sensitivity to minimum, and finite inverted-bound output rather than merely successful rendering.
- Final static gates: `pnpm check` and `pnpm lint`, plus `pnpm exec prettier --check plans/fluid-pattern-inputs/spec.md plans/fluid-pattern-inputs/plan.md`. Fix only feature-caused failures; identify inherited failures without calling them passing checks.
- Final broad regression: `pnpm test`, which includes audio-regression `test:ci` and fresh read-only approved-case verification. For native-only diagnosis, the existing `pnpm --filter @web-audio/audio-regression test:ci` runs that package's gate directly; do not claim it covers the rest of the workspace.
- Manual: listening is optional supplementary evidence, not an assumed approval. Native numerical/scheduling success does not establish listening approval, musical quality, cross-platform audio equivalence, or real-time CPU guarantees.

Completion gate: the focused native assertions and final required regression/static gates pass, with all earlier acceptance gates available and no modified references. Missing native prerequisites or unresolved required failures keep this step blocked/pending; a specifically accepted waiver is an `Accepted deviation`, never `Verified`.
Evidence: Not run.

Phase exit gate: after Step 4.2 checks, review the complete final acceptance mapping, all preceding phase exit evidence, reference-tree preservation, and any skipped checks. Implementation can be described as verified only for the gates actually satisfied. Report residual native/platform/manual limitations explicitly; release remains a separate decision.
Evidence: Not run.

## Final acceptance

This is an ownership map, not a second execution checklist. Evidence is recorded once at the owning step/phase gate. Full acceptance remains pending; partial step coverage does not satisfy all mapped gates.

| Spec acceptance ID | Owning step / gate                                | Verification and expected result                                                                        | Evidence / status                               |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| AC1                | Steps 1.1, 2.1, 3.3; Phase 4 exit                 | Correct one-/two-bound selection persists through patterned minimum and final arity.                    | [3.3](evidence/step-3.3.md); Phase 4 pending    |
| AC2                | Steps 1.1, 2.1, 3.3                               | Defaults/undefined parity and runtime/type rejection of null survive migrations.                        | [Verified](evidence/step-3.3.md)                |
| AC3                | Step 1.2; Phase 1 exit                            | Both aliases preserve two bars versus two values in a bar and shorthand equivalence.                    | [Verified](evidence/step-1.3.md#verification)   |
| AC4                | Step 1.3; Phase 1 exit                            | Notes, names, variations/alias, and XOX match their structured counterparts.                            | [Verified](evidence/step-1.3.md#verification)   |
| AC5                | Steps 1.2 and 1.3                                 | Wrapped atoms never become general shorthand; invalid consumer atoms/geometry still fail.               | [Verified](evidence/step-1.3.md#verification)   |
| AC6                | Steps 1.2/1.3; Step 4.1 integration               | Static snapshots resist caller mutation and cross-consumer decoding/playback state sharing.             | Builder/event/public gate evidence; Not run     |
| AC7                | Steps 3.1–3.3; Phase 3 exit                       | All six families accept explicit slots and reject raw/extra inputs in types and JavaScript.             | [Verified](evidence/step-3.3.md)                |
| AC8                | Step 3.1                                          | Noise arity is uniform with/without color; dedicated gain/filter sugar remains valid.                   | [Verified](evidence/step-3.1.md)                |
| AC9                | Steps 1.2/1.3 and affected Step 3.x; Phase 3 exit | Every listed single-input setter/alias and its source/default state behavior remains supported.         | [Verified](evidence/step-3.3.md)                |
| AC10               | Step 2.1; Phase 2 exit                            | Canonical minimum/maximum patterns validate and all first-party schema consumers agree.                 | [Verified](evidence/step-2.1.md)                |
| AC11               | Step 2.1 deterministic; Step 4.2 native           | Independent per-bar/hit lookup and event-specific release minimum reach scheduling and actual output.   | [AG1](evidence/step-2.1.md); native pending     |
| AC12               | Step 2.1 deterministic; Step 4.2 native           | Inverted/crossing bounds retain existing math and finite native output without clamping.                | [AG1](evidence/step-2.1.md); native pending     |
| AC13               | Step 2.1 deterministic; Step 4.2 native           | Patterned minimum works for gain and supported external envelope sources without nesting new sources.   | [AG1](evidence/step-2.1.md); native pending     |
| AC14               | Steps 1.2/1.3, 2.1, 3.1/3.2                       | Random/direct audio permissions survive wrapping and ADSR remains restricted.                           | [Verified](evidence/step-3.2.md)                |
| AC15               | Steps 2.1 and 3.1–3.3                             | Failed envelope/ADSR/noise/chop replacements leave existing affected state intact.                      | [Verified](evidence/step-3.3.md)                |
| AC16               | Steps 1.2/1.3 and 3.x; Step 4.1                   | Invalid wrapper construction/composition is rejected consistently across positional and dedicated APIs. | [3.3](evidence/step-3.3.md); 4.1 pending        |
| AC17               | Step 3.2; Step 4.1 migration review               | LFO migration preserves old separate bars and intentional multivalue warnings.                          | [3.2](evidence/step-3.2.md); 4.1 pending        |
| AC18               | Step 4.1; Phase 4 exit                            | Wrapper-free graph output, built public evaluation, signatures, examples, and migrations agree.         | Public/artifact/documentation evidence; Not run |

No publication, packed installation, hosted-service, or cross-platform certification gate is required by this SOW. Builds/self-imports are artifact checks, not claims about a published package. Native Chromium proof and human listening remain distinct evidence classes.

## Rollback and recovery

- All planned source changes are reversible before release; this plan includes no persistent-data rewrite or destructive migration.
- Revert Step 1.1 together with its intent-preserving callsite/docs changes. Reverting only its factory semantics would reintroduce silent range changes.
- Revert **all of AG1** together: schema/validation, Fluid writer/defaults, engine readers, and migrated fixtures. Never restore scalar graph writers while leaving pattern-only consumers, or the reverse. Rebuild dependent artifacts after any revert so stale `dist` cannot disguise a mixed contract.
- Each Step 3.x reverts with its forwarders/aliases, callers, and negative tests. Once later steps depend on new signatures or types, either revert the dependent steps first in reverse order or revert the feature as a whole.
- If a source gate fails, stop the affected dependent work, retain the useful reproduction, and repair or explicitly escalate the conflict; do not suppress assertions or widen source permissions to obtain a pass.
- If native prerequisites are unavailable, retain completed deterministic evidence but leave native acceptance blocked. If approved-case audio differs, inspect ignored diagnostic A/B/difference artifacts and the responsible schema/evaluation changes; do not use `audio:update` as recovery.
- Build output and temporary diagnostic files are not recovery authority. Clean only artifacts owned by the attempted gate; preserve unrelated source changes, recordings, and untracked user work.

## Deferred checks and accepted deviations

- No deviations or waivers have been accepted. Steps 0.1–3.3 and the Phase 0–3 exit gates are verified with linked evidence; Steps 4.1/4.2 and the Phase 4 exit gate are unrun.
- Chromium/native acceptance is an execution prerequisite, not an automatically deferred check. Missing browser/platform access must remain visible in Step 4.2 and the status heading until resolved or explicitly waived.
- Human listening, live REPL/browser sessions, real-time performance certification, packed/published-package testing, and deployment are not required gates for this scoped API/normalization change. Do not describe them as performed.
- Timing-generator patternability, LFO speed/waveform expansion, new source kinds, new setters, automatic saved-sketch rewrites, and a legacy scalar-minimum graph adapter remain outside the governing spec.
