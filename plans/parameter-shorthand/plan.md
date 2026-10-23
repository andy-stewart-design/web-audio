# Parameter Pattern Shorthand Implementation Plan

## Status and governing source

- Governing spec: [spec.md](./spec.md), ready for planning. Its requirements and acceptance criteria remain authoritative.
- Plain-language context: [overview.md](./overview.md).
- Adopted refinements: shorthand-only envelope construction; structured equivalence only where expressible; precise per-result expansion budgets; all-or-nothing shorthand ADSR updates; schema-time warnings once per affected static endpoint per LFO instance. These are settled spec requirements, not pending implementation assumptions.
- Delivery state: Steps 0.1–2.2 and G0–G2 Verified: compatibility characterized, normalization/source dispatch centralized, and bounded numeric shorthand connected internally to Parameter. Steps 3.1–4.1 remain Pending; public numeric consumer signatures are still structured-only.
- Acceptance or release still pending: Feature implementation and final acceptance. No publication or deployment is included.
- Blockers: None found at G0. Dependency build and affected-package checks pass; browser prerequisite files are present, with runtime verification reserved for G4.

Step statuses below are the authoritative execution record. A phase is complete only when its step completion gates and phase exit gate are satisfied. Task checkboxes do not prove that gates passed. Verified means the scoped checks and implementation review passed; it does not imply user approval or release. In supervised execution, record manual approval in extension state, not task checkboxes.

## Execution constraints

- All paths and commands are relative to the repository root, `/Users/andy/Documents/Development/web-audio`, unless a command explicitly selects a package.
- Preserve unrelated work. At authoring time the worktree already contains modified/untracked documentation, snippets, and planning moves, including `docs/concepts/patterns.md`, `docs/concepts/syntax.md`, and `docs/reference/`. Read complete files before editing; do not overwrite or broadly reformat that work.
- Keep step IDs stable. Escalate material spec conflicts rather than silently weakening a gate or expanding the PR.
- Keep recorded evidence brief: result, command/check and material limitations, with a relative supporting-note link only when useful. Do not create empty evidence files or append transcripts/debugging histories.
- No dependency additions are anticipated. Do not manually edit lockfiles, introduce `as any`, exclude tests from checking, or migrate unrelated tests. Follow the root `AGENTS.md` conventions for domain-local suites and test-only `support/` helpers.
- Preserve `CycleInput<T>` for existing non-parameter consumers. Introduce specific numeric/positional input types rather than globally widening every array-shaped API.
- Keep static, random, and modulation-source paths separate. No event-cycle state, new schema, audio-engine behavior change, cycle-class redesign, or diagnostics framework is authorized.
- Buildable review boundaries are mandatory. A public union must not admit shorthand before every consumer of that union can handle it. Keep the atomic groups identified below together.
- Do not run `dev`, publish, deploy, update audio goldens, or install browsers automatically. Missing verification prerequisites are blockers to the affected gate, not permission to waive it.

### Existing tooling and verification levels

The package scripts are `check` (`tsc --noEmit`), `lint` (`eslint . --max-warnings 0`), and `test:ci` (`vitest run`). Tests live under `src` and are included in TypeScript checking. Bare package `test` starts Vitest's watch-oriented mode; use `test:ci` or `exec vitest run` below.

Fluid tests alias `@` to their own source but resolve `@web-audio/patterns` through its built package export. Refresh dependency artifacts before checking/testing a downstream consumer; passing against stale `dist` is not parity proof.

**B — dependency/artifact build**, from root:

```sh
pnpm exec turbo run build --filter=@web-audio/fluid --filter=@web-audio/audio-engine
```

Turbo builds these packages and their build dependencies, including patterns. Re-run B after upstream production/export changes before downstream tests. When only patterns changes and no downstream test is being run, `pnpm --filter @web-audio/patterns build` is sufficient for that step's own artifact.

**Affected-package composition checks**, after B:

```sh
pnpm --filter @web-audio/patterns test:ci
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/schema test:ci
```

Focused commands below select package-relative files. Paths marked **new** are suites/modules this plan will add, not existing commands that already prove the feature. Package type/lint checks accompany production changes; broad workspace checks are reserved for final acceptance.

Format only feature-owned changed files with `pnpm exec prettier --write <changed-files>`, then use `--check` on those same paths and `git diff --check`. Do not run the repository-wide mutating formatter over unrelated work.

Vitest schema/unit tests prove normalization and deterministic lookup using existing test doubles, not live audio output. B proves bundling/export/declaration compatibility, not a packed installation. Root `pnpm test` also invokes the existing browser audio-regression verifier; its Chromium prerequisite must be available or the final gate remains blocked. No baseline result is inferred from source inspection.

## Phase overview and delivery boundary

| Phase | Outcome                                                                | Dependencies              | Exit gate                                                                  |
| ----- | ---------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| 0     | Recorded baseline and structured compatibility fixtures                | Existing checkout/tooling | G0: baseline classified; characterization and affected suites pass         |
| 1     | Shared structured numeric normalization and modulation-source dispatch | G0                        | G1: cleanup preserves characterized behavior and imports/builds compose    |
| 2     | Bounded value evaluator and internal Parameter shorthand path          | G1                        | G2: numeric semantics/negative cases proven without public API widening    |
| 3     | Complete public consumer integration, including special adapters       | G2                        | G3: consumer matrix, rollback-on-input-error, chop and LFO behavior proven |
| 4     | Cross-domain, documentation, and final regression acceptance           | G3                        | G4: every AC accounted for; workspace checks and artifact build reviewed   |

**Delivery boundary:** one feature-complete PR. Phases are review/verification increments, not separate PRs. If normalization requires incompatible behavior changes, stop and reassess scope before continuing.

**Atomic groups:**

- **A1, Step 1.2:** shared source resolver, its imports, and all dispatch replacements are one change/revert unit; do not delete guards or old paths before the replacement is tested.
- **A2, Step 3.1:** widening `AudioParamInput`, ordinary consumer signatures, noise string dispatch, envelope/ADSR signatures, the shorthand-only envelope constructor/factory overload, and factory forwarding is one buildable change. In particular, do not widen the shared union while noise still rejects every non-color string.
- **A3, Step 3.2:** sampler public/alias signatures and downstream chop configuration signatures change together.
- **A4, Step 3.3:** LFO endpoint input typing, normalization, warning, and factory compatibility change together.

## Phase 0 — Characterize the compatibility boundary

Outcome: A reproducible baseline and explicit fixtures for the behavior the cleanup must preserve.
Depends on: Existing dependencies and local tooling; no implementation prerequisites.
Review boundary: Characterization/test changes only, with no new syntax or production cleanup.

### Step 0.1 — Capture structured behavior and establish the baseline

Status: Verified
Requirements / acceptance: R1, R10, R11; AC1 (baseline), AC9/AC13 (existing runtime portions), AC10/AC15 (structured baseline). Feature-specific acceptance remains with Phases 2–4.
Depends on: None.
Review boundary: Existing input semantics, actual failure stages, and existing runtime lookup—not proposed shorthand behavior.

Expected files:

- `packages/fluid/src/parameters/__tests__/parameter.test.ts` — extend existing structured/static/random cases.
- `packages/fluid/src/__tests__/parameter-compatibility.test.ts` — **new**, cross-domain consumer/default/source fixtures; optional helpers in its `support/` directory.
- Existing `packages/fluid/src/automations/__tests__/lfo.test.ts`, envelope/effect/instrument suites — extend only where fixtures are best kept domain-local.
- `packages/audio-engine/src/instruments/__tests__/instrument.test.ts` and existing `src/patterns/__tests__/value-pattern-resolver.test.ts` — add missing direct LFO index-zero/lookup assertions using existing mocks, if not already explicit.

Tasks:

- [x] Run B, the four affected-package composition suites, and affected-package `check`/`lint`; record actual pre-existing failures separately from regressions. Inspect browser-regression prerequisites without installing or rendering anything for this baseline step.
- [x] Add explicit fixtures for scalar arguments versus intra-bar arrays, empty/no-argument differences, serialization-time versus graph-time rejection, and caller-array/random-source reference behavior. Do not correct those behaviors in characterization.
- [x] Capture supported modulation identities/contextual MIDI fields, instrument gain-envelope replacement versus maximum updates, factory forwarding including numeric/omitted/undefined envelope minimum defaults, noise selectors/defaults, and aliases.
- [x] Capture positional ADSR fields, LFO endpoint arrays-as-bars, and authored/generated chop timing with and without fit. Use self-contained banks/fixtures and warning spies rather than network sample loading.
- [x] Prove the currently untested LFO multi-value static-bar lookup uses index zero at initialization and subsequent bar updates. Retain existing tests for final-hit numbering after chance misses.

Verification:

- Automated, root: after B, `pnpm --filter @web-audio/fluid exec vitest run src/parameters/__tests__/parameter.test.ts src/__tests__/parameter-compatibility.test.ts src/automations/__tests__/lfo.test.ts`; run the modified audio-engine suites with `pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/__tests__/instrument.test.ts src/patterns/__tests__/value-pattern-resolver.test.ts src/events/__tests__/resolve-timing.test.ts`. The new fixtures must pass against unchanged production code.
- Automated: package `check` includes the new tests; compare failures to the recorded baseline rather than declaring unexecuted checks green.
- Manual: review fixture outputs/defaults and failure timing against current code. No live listening or browser dev session is required.

Completion gate: Characterization passes against unchanged production code; affected baseline failures/prerequisites are explicitly classified. An unresolved failure in the paths being changed blocks dependent cleanup unless separately resolved or explicitly accepted.
Evidence: B passed (6 tasks, cached). Both prescribed focused commands passed (Fluid 29 tests; Audio Engine 55 tests); all four affected packages' `check`/`lint`, targeted Prettier write/check, and `git diff --check` passed. Review confirmed test-only changes preserve current defaults, references, failure stages (including sparse/null/non-finite inputs), chop timing, and LFO index-zero behavior. No baseline failures or regressions found; Vite emits its existing `configLoader: native`/`__dirname` advisory.

**Phase exit gate G0:** after Step 0.1's checks, run the affected-package composition suites against the characterization additions and confirm their expected results. Record available browser prerequisites and any unresolved baseline limitations before Phase 1 or supervised approval to advance.
Evidence: Verified against unchanged production: all four `test:ci` suites passed after characterization (Patterns 412, Fluid 1,158, Audio Engine 403, Schema 121). Playwright 1.59.1, Chromium headless shell revision 1217 executable/installation marker, FFmpeg 1011, and workspace tooling links are present. Browser launch/render and root regression execution were not performed; G4 owns runtime verification. No unresolved G0 blockers.

## Phase 1 — Standardize existing parameter inputs without changing behavior

Outcome: Shared structured normalization and shared audio-source dispatch, with no shorthand accepted publicly yet.
Depends on: G0.
Review boundary: Existing numeric/source interpretation only; no cycle hierarchy or validation-policy overhaul.

### Step 1.1 — Extract the structured numeric normalization boundary

Status: Verified
Requirements / acceptance: R1, R2, R11; AC1 (numeric cleanup portion), AC17 (numeric dependency boundary portion). Source-dispatch parity is Step 1.2; full public/event acceptance is G4.
Depends on: Step 0.1 and G0.
Review boundary: Replace inline `Parameter` normalization with one equivalent, testable boundary.

Expected files:

- `packages/fluid/src/inputs/decode-numeric-input.ts` — **new**, initially structured/static/random dispatch only.
- `packages/fluid/src/parameters/parameter.ts` — delegate normalization while retaining `ValueCycle`/`RandomCycle` state and schemas.
- `packages/fluid/src/parameters/__tests__/parameter.test.ts`; `packages/fluid/src/inputs/__tests__/decode-numeric-input.test.ts` — latter **new**.
- `packages/fluid/src/inputs/guards.ts` — reuse the existing random-cycle tuple guard directly; preserve its existing consumers without splitting or adding re-export layers.

Tasks:

- [x] Extract the existing scalar-to-bar/array-as-bar interpretation and sole-random-source path; retain existing `CycleInput<number>` contracts at this stage.
- [x] Preserve no-argument behavior, deferred legacy numeric validation, sparse/nullable invalid-input failure stages, caller-array references, and retained random objects according to characterization.
- [x] Keep the decoder independent of event evaluation and the audio-source resolver; reuse the pre-existing random-cycle tuple guard directly. Do not add a runtime dependency from `Parameter` to a resolver that imports `Envelope`/`Lfo` back into `Parameter`.
- [x] Add focused decoder equivalence cases and retain existing `ValueCycle` construction/serialization. Remove only the replaced inline normalization after those cases pass.

Verification:

- Automated, root: `pnpm --filter @web-audio/fluid exec vitest run src/inputs/__tests__/decode-numeric-input.test.ts src/parameters/__tests__/parameter.test.ts src/__tests__/parameter-compatibility.test.ts`; `pnpm --filter @web-audio/fluid check`; `pnpm --filter @web-audio/fluid lint`.
- Manual: inspect import dependencies and compare characterized schemas, object ownership, and failure stages. No new shorthand form may become accepted by this extraction.

Completion gate: Numeric compatibility fixtures remain unchanged and green; normalization has one production owner without a new resolver or event-evaluation path.
Evidence: Verified. Prescribed focused suites passed (25 tests); after B, full Fluid `test:ci` passed (1,164 tests), as did Fluid `check`/`lint`, targeted Prettier write/check, and `git diff --check`. Review confirmed unchanged characterization fixtures/public unions and retained array/random references and failure stages. The decoder reuses the pre-existing `guards.ts` random-cycle tuple predicate; it does not split guards or add re-export layers. Parameter discriminates the decoder's returned `RandomCycle` directly. No shorthand or event-evaluator path was added. Only the existing Vite advisory remains.

### Step 1.2 — Consolidate modulation-source dispatch

Status: Verified
Requirements / acceptance: R1, R2, R11; AC1 (source cleanup portion), AC15 (existing source portion), AC17 (dispatch boundary portion). New shorthand source restrictions remain with Phase 3/G4.
Depends on: Step 1.1.
Review boundary: Atomic group A1; replacing repeated source selection without changing which slots accept which sources.

Expected files:

- `packages/fluid/src/parameters/resolve-audio-param.ts` — **new**, shared source-or-Parameter selection.
- `packages/fluid/src/parameters/parameter.ts`, `packages/fluid/src/inputs/guards.ts` — type-only organization/guard adjustments only as necessary.
- `packages/fluid/src/instruments/instrument.ts`, `effects/filter.ts`, `effects/gain.ts`, and any direct dispatch consumers found by search.
- `packages/fluid/src/parameters/__tests__/resolve-audio-param.test.ts` — **new**; existing source/noise/effect/compatibility suites.

Tasks:

- [x] Implement a shared resolver that unwraps only supported sole envelope/LFO/MIDI tuples and otherwise constructs a numeric `Parameter`.
- [x] Replace equivalent instrument/effect/filter branches together, preserving contextual schema serialization and supported source identities.
- [x] Retain narrower paths such as instrument gain's numeric-or-envelope contract; consolidation must not add LFO/MIDI inputs to it or modulation inputs to numeric-only fields.
- [x] Keep `Parameter`/the decoder below the resolver in the dependency flow. Avoid new runtime import cycles; preserve direct existing guard imports if any guard organization is needed, without splitting modules or adding re-export layers.
- [x] Search for remaining equivalent dispatch branches; remove only proven duplicates and test every moved branch, including defaults and MIDI contexts.

Verification:

- Automated, root: run `pnpm --filter @web-audio/fluid exec vitest run src/parameters/__tests__/resolve-audio-param.test.ts src/effects/__tests__/filter.test.ts src/effects/__tests__/gain.test.ts src/instruments/__tests__/noise.test.ts src/__tests__/parameter-compatibility.test.ts src/__tests__/midi-integration.test.ts`; run Fluid `check` and `lint`.
- Manual: inspect remaining `isEnvelopeTuple` / `isLfoTuple` / `isMidiCcTuple` call sites and all `new Parameter` branches. Classify legitimate narrower adapters instead of removing every match.

Completion gate: All replaced source branches preserve characterization, narrower slots remain narrow, and direct class/module imports initialize successfully in the focused tests. A1 is reviewed as one change/revert unit.
Evidence: Verified. Prescribed focused suites passed (40 tests), including resolver identity/random/deferred-validation cases and existing MIDI/context/default coverage. Fluid `check`/`lint`, targeted Prettier write/check, and `git diff --check` passed. A1 review confirmed equivalent branches now use the shared resolver in filter, gain effect, instrument detune/noise, and unison spread/width. Instrument gain remains numeric-or-envelope; remaining Parameter adapters/defaults and random event-timing guards are intentionally narrower. Existing guards are imported directly; no re-exports, public widening, or new resolver dependency from Parameter/decoder.

**Phase exit gate G1:** after Step 1.2's checks, run B, the full Fluid suite, Fluid `check`/`lint`, and the existing event equivalence/public event-schema suites within that full run. Compare against Phase 0 outputs: the cleanup alone must not change user-visible structured/source behavior or expose shorthand. Review the centralized dependency flow before Phase 2.
Evidence: Verified. B passed; full Fluid `test:ci` passed (1,170 tests), including unchanged structured compatibility and event equivalence/public-schema suites; Fluid `check`/`lint` passed. Dependency review found no event-evaluator path, shorthand exposure, or Parameter-to-resolver import. Existing Vite advisory only; no unresolved G1 blockers. Browser/root regression acceptance remains with G4.

## Phase 2 — Add bounded numeric expression evaluation behind the input boundary

Outcome: A separate value evaluator and an internal `Parameter` shorthand path, with existing public signatures still unchanged until their consumers can be updated atomically.
Depends on: G1.
Review boundary: Numeric interpretation of the existing grammar; no event geometry or public partial rollout.

### Step 2.1 — Implement the value-sequence evaluator

Status: Verified
Requirements / acceptance: R5–R9, R15; AC5, AC6, AC8 (evaluated expansion portion), AC16 (expression immutability portion), AC17 (evaluator boundary portion). String atom/parser and public reuse portions follow in Steps 2.2/4.1.
Depends on: G1.
Review boundary: One pure bounded AST-to-numeric-bars evaluator with its own tests and export.

Expected files:

- `packages/patterns/src/expressions/evaluate-value.ts` — **new**, proposed `evaluateValuePatternExpression` entry point with numeric atom interpretation supplied by the caller.
- `packages/patterns/src/expressions/__tests__/evaluate-value.test.ts` — **new**.
- `packages/patterns/src/index.ts`, `packages/patterns/src/limits.ts` — expose only the evaluator/necessary value budgets.
- Existing syntax-independent amount/LCM helpers — optional reuse/extraction; any event helper touched retains full regression coverage in this same step.

Tasks:

- [x] Evaluate atoms, sequential groups/sequences, and structural repetition into nonempty numeric bars without constructing spans, rests, continuations, or `EventCycle`.
- [x] Implement bar alternation with selection-local child progression and bounded LCM composition. Preserve the distinction between `<1!3 2>` and `<[1!3] 2>` and the repeated-alternation examples in the spec.
- [x] Validate every branch and reject rest/parallel/time modifiers. Use existing positive-whole-number repeat interpretation; do not change shared grammar or globally restrict reusable shorthand.
- [x] Enforce the adopted budgets before allocation: at most 1,024 choice-schedule entries, `scheduleLength * childCycleRounds <= 1,024` expanded bars, and 16,384 values per intermediate/output numeric cycle. Bound schedule rounds through the spec's LCM/GCD rule, cap structurally expanded sequence lists at 16,384 entries, and preflight logical repeated/wrapped values. Do not use a cumulative evaluator-lifetime value counter or impose event grid/voice budgets.
- [x] Add every normative numeric-bar and expansion-budget fixture, including `<1!1024>`/`<1!1025>`, `<<1 2> 3!511>`/`<<1 2> 3!512>`, and `[1!16384]`/`[1!16384]!2`. Cover deterministic repeated evaluation, input immutability, and unsupported nested branches. If helpers are extracted, prove unchanged event schedules/diagnostics rather than sharing geometry code.

Verification:

- Automated, root: `pnpm --filter @web-audio/patterns exec vitest run src/expressions/__tests__/evaluate-value.test.ts`; then Patterns `test:ci`, `check`, `lint`, and `build`.
- Manual: review expansion arithmetic and dependencies; no Fluid import, event-evaluator call, or timing-grid representation is permitted in the value evaluator.

Completion gate: All spec schedule/group/repeat and expansion-budget fixtures pass, including per-result rather than cumulative accounting and preallocation schedule/round limits; existing parser/event tests and export/declaration build remain valid.
Evidence: Verified. Focused evaluator suite passed (17 tests); full Patterns `test:ci` passed (429 tests), with `check`, `lint`, and `build` passing. B and downstream full Fluid `test:ci` also passed (1,170 tests); targeted Prettier write/check and `git diff --check` passed. Review confirmed every normative example/boundary, selection-local progression, bounded LCM/GCD arithmetic, early same-result lower bounds, logical repetition/wrapping counts, immutable results/input, and no event/Fluid dependencies. Atom callbacks are pure/deterministic with unspecified invocation count; strict decimal spelling remains the Step 2.2 caller's responsibility. No shared event helpers or grammar were changed; G2 remains pending.

### Step 2.2 — Connect shorthand decoding to Parameter internally

Status: Verified
Requirements / acceptance: R2–R4, R8, R9, R13, R15; AC3 (input-boundary runtime portion), AC4, AC7 (decoder/internal setter portion), AC8 (source/tree portion), AC16 (internal reuse portion). Public typing/consumer rollback remains Phase 3/G4.
Depends on: Step 2.1.
Review boundary: The shared numeric decoder accepts shorthand internally; public shared unions are not widened ahead of their adapters.

Expected files:

- `packages/fluid/src/inputs/types.ts` — add a numeric-specific whole-pattern tuple union, leaving generic/event inputs unchanged.
- `packages/fluid/src/inputs/decode-numeric-input.ts`, `packages/fluid/src/inputs/decode-shorthand-input.ts`, `packages/fluid/src/inputs/atom-interpreters.ts` — integrate/reuse only necessary syntax and finite-number helpers.
- `packages/fluid/src/parameters/parameter.ts` — accept evaluated shorthand through the numeric boundary.
- `packages/fluid/src/inputs/__tests__/decode-numeric-input.test.ts`, `packages/fluid/src/parameters/__tests__/parameter.test.ts` — new-form and failure coverage.

Tasks:

- [x] Define numeric rest-input alternatives for existing structured forms, sole `RandomCycle`, or sole `ShorthandInput`; keep `AudioParamInput` and ordinary public method signatures structured-only until A2.
- [x] Reuse direct-string/reusable shorthand decoding and the existing strict finite-decimal rule. Pass receiving-slot context/source ranges through the shared boundary without changing event atom acceptance or introducing an error framework.
- [x] Evaluate shorthand eagerly into numeric bars; preserve structured/reference/random behavior from Phase 1. Do not retain the expression as a second authoritative parameter state.
- [x] Reject mixed arguments and nested shorthand in numeric arrays at runtime, including JavaScript bypasses. Fully validate alternate branches and limits before installing a replacement.
- [x] Add equivalent string/reusable/internal `Parameter` cases, malformed/unsupported/non-finite inputs, no-mutation failures, and immutable cross-target shorthand construction cases. Reuse the shared parser/expression boundary fixtures for 65,536 UTF-16 source units, 16,384 tokens, 16,384 nodes, and depth 128; add only missing target-path coverage and retain the full Patterns regression gate.

Verification:

- Automated, root: run B before Fluid imports the new Patterns export. Run `pnpm --filter @web-audio/fluid exec vitest run src/inputs/__tests__/decode-numeric-input.test.ts src/parameters/__tests__/parameter.test.ts src/inputs/__tests__/shorthand-equivalence.test.ts src/__tests__/parameter-compatibility.test.ts`; run Fluid `check` and `lint`.
- Manual: review for accidental public widening and compare error stages. New shorthand syntax/atom/operator/expansion errors are eager; existing domain checks stay at their characterized stages.

Completion gate: The internal numeric path produces the exact existing `NumberPattern` shapes, rejects invalid new forms eagerly, and leaves event/public structured contracts intact.
Evidence: Verified. After B, prescribed focused Fluid suites passed (54 tests); Fluid `check`/`lint`, targeted Prettier write/check, and `git diff --check` passed. Direct/reusable shorthand uses the shared parser, strict finite-number interpreter, and value evaluator; mixed/nested inputs reject eagerly while structured/random references and legacy validation stages remain characterized. Tests cover internal setter rollback, independent reusable-input schemas, source/tree limits, default/supplied decoder context with ranges/causes, and checked negative public signatures. Public receiving-slot adapters/context forwarding and transactional ADSR remain with Phase 3; no expression is retained as Parameter state.

**Phase exit gate G2:** after Step 2.2's checks, run B and full Patterns/Fluid suites plus both packages' `check`/`lint`. Review value-evaluator imports, parser reuse, compatibility fixtures, and the immutable `d.sh()` boundary. No publicly admitted-but-unhandled shorthand signature may exist before Phase 3.
Evidence: Verified. B passed; full Patterns `test:ci` passed (429 tests) and full Fluid `test:ci` passed (1,185 tests), plus both packages' `check`/`lint`. Review confirmed parser/finite-atom reuse, no event-evaluation path, unchanged structured/source fixtures, immutable target-neutral shorthand, and no widening of AudioParamInput or public consumer signatures. Only the existing Vite advisory remains; no unresolved G2 blockers.

## Phase 3 — Integrate the complete public consumer matrix

Outcome: All included slots accept the new whole-pattern alternative, with explicit adaptations and scoped tests shipped with each implementation change.
Depends on: G2.
Review boundary: Public typing/dispatch and small consumer adapters, not a broader API or runtime redesign.

### Step 3.1 — Enable ordinary parameter surfaces, noise, and envelope fields together

Status: Pending
Requirements / acceptance: R1–R4, R11, R13, R14; AC2/AC3/AC7/AC15 (ordinary/noise/envelope portion), AC11, AC12, AC18 (ordinary public-type portion). Sampler/LFO completion is Steps 3.2/3.3; full matrix audit is Step 4.1.
Depends on: G2.
Review boundary: Atomic group A2; all consumers of the widened shared audio-input union and their positional/factory forwarding.

Expected files:

- `packages/fluid/src/parameters/parameter.ts`, `packages/fluid/src/parameters/resolve-audio-param.ts`, `packages/fluid/src/inputs/types.ts` — widen only intended numeric/source unions.
- `packages/fluid/src/automations/envelope.ts`, `packages/fluid/src/instruments/instrument.ts`, `packages/fluid/src/instruments/unison-synthesizer.ts`, `packages/fluid/src/effects/filter.ts`, `packages/fluid/src/effects/gain.ts`, `packages/fluid/src/drome.ts`.
- Existing envelope, filter/gain effect, noise, unison, and instrument tests; `packages/fluid/src/__tests__/parameter-shorthand.test.ts` — **new**, start the public matrix with covered surfaces.

Tasks:

- [ ] Enable numeric shorthand for ordinary instrument/effect/filter/unison slots and envelope maximum/individual ADSR setters, preserving each slot's existing source permissions and defaults.
- [ ] Change envelope constructor and factory overloads/forwarding together: `d.env("0.2 0.8")` and `d.env(d.sh("0.2 0.8"))` mean minimum `0` and patterned maximum; `d.env(0.1, "0.2 0.8")` uses explicit minimum. Preserve `d.env(0.1)` as minimum `0.1`/maximum `1`, plus omitted/undefined minimum forms. Minimum stays numeric-only; a leading shorthand forbids trailing arguments. Preserve numeric gain versus explicit-envelope replacement.
- [ ] Introduce a narrow positional ADSR field type: existing scalar/array or shorthand, not arbitrary source/random/rest arguments. Construct all four replacement parameters before assigning any field; update instrument forwarding in the same change.
- [ ] Update noise dispatch to recognize only exact leading color selectors, then resolve the remaining gain slot normally. Direct numeric strings without a selector mean white noise; omitted gain still means `1`.
- [ ] Add string/reusable/structured equivalence and negative type/runtime coverage alongside these changes, including factory/constructor acceptance of both envelope overloads, rejection of trailing arguments after leading shorthand, and synchronous rejection of invalid shorthand. Prove a bad final ADSR field leaves all four old fields intact and failed ordinary/noise setters preserve prior state.
- [ ] Search all shared-union consumers and update signatures/forwarding together. Public type examples must not execute invalid calls: use `expectTypeOf` and uncalled, checked functions containing `@ts-expect-error` cases.

Verification:

- Automated, root: after refreshing upstream artifacts as needed, `pnpm --filter @web-audio/fluid exec vitest run src/__tests__/parameter-shorthand.test.ts src/automations/__tests__/envelope.test.ts src/effects/__tests__/filter.test.ts src/effects/__tests__/gain.test.ts src/instruments/__tests__/noise.test.ts src/instruments/__tests__/unison.test.ts src/__tests__/parameter-compatibility.test.ts`; run Fluid `check`, `lint`, and `build`.
- Manual: trace every `AudioParamInput` consumer and verify narrower slots/excluded scalars were not widened. Review A2 as one coherent public contract change.

Completion gate: All newly exposed ordinary signatures work at runtime, envelope constructor/factory overloads agree while preserving numeric minimum semantics, ADSR dispatch is failure-isolated, noise strings are unambiguous, and structured/source compatibility remains green.
Evidence: Not run.

### Step 3.2 — Enable sampler regions and authored chop sequences

Status: Pending
Requirements / acceptance: R1, R3, R10, R13, R14; AC2/AC3/AC7 (sampler portion), AC10, AC18 (sampler aliases/type portion).
Depends on: Step 3.1.
Review boundary: Atomic group A3; numeric region/sequence inputs without event migration or altered timing precedence.

Expected files:

- `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/instruments/sampler-event-timing.ts`; `packages/fluid/src/instruments/sampler-utils.ts` only if its signature/forwarding needs adjustment.
- Existing `packages/fluid/src/instruments/__tests__/sampler-utils.test.ts`, `sampler-event-timing.test.ts`, `event-setters.test.ts` and public shorthand suite.

Tasks:

- [ ] Enable start/end/duration inputs and update `.dur` typing with `.duration`; preserve domain validation, region modes, and existing chop restrictions.
- [ ] Enable the chop sequence after scalar slice count through every internal configuration signature. Keep omitted/generated sequence behavior and `ChopState` ownership unchanged.
- [ ] Prove one-bar and multi-bar authored sequences match structured timing/schema, including `.fit(...).chop(...)`: fit must not redistribute the authored sequence. Do not give other parameters timing authority.
- [ ] Add alias/type parity, invalid mixed/unsupported shorthand, and failure-without-replacement cases. Keep region domain failures at their existing validation stage.

Verification:

- Automated, root: `pnpm --filter @web-audio/fluid exec vitest run src/instruments/__tests__/sampler-utils.test.ts src/instruments/__tests__/sampler-event-timing.test.ts src/instruments/__tests__/event-setters.test.ts src/__tests__/parameter-shorthand.test.ts src/__tests__/parameter-compatibility.test.ts`; run Fluid `check` and `lint`.
- Manual: trace chop sequence schema into existing generated timing and inspect `.dur` declaration. No changes to the event compiler or ordinary parameter resolver are expected.

Completion gate: Sampler shorthand and aliases match structured region/sequence outputs and timing, including fit interaction, while all prior restrictions remain effective.
Evidence: Not run.

### Step 3.3 — Enable LFO endpoints and warn about ignored static values

Status: Pending
Requirements / acceptance: R1, R3, R11–R14; AC2/AC3/AC7/AC15 (LFO portion), AC13, AC14, AC18 (LFO public-type portion).
Depends on: Step 3.2.
Review boundary: Atomic group A4; keep bar-based endpoint sampling and leave random diagnostics/runtime untouched.

Expected files:

- `packages/fluid/src/automations/lfo.ts`; `packages/fluid/src/drome.ts` if explicit factory signatures/forwarding require adjustment.
- `packages/fluid/src/automations/__tests__/lfo.test.ts`, public shorthand and compatibility suites.
- Existing audio-engine instrument tests from Step 0.1 — extend only if needed to bind accepted schemas to the already-characterized index-zero behavior; production audio-engine changes are not expected.

Tasks:

- [ ] Extend `LfoInput` with string/reusable shorthand, not the ordinary variadic tuple type. Preserve numeric arrays as separate bars and random endpoints as existing random objects.
- [ ] Accept evaluated static bars intact, including multiple values; do not truncate their schema or add per-hit updates.
- [ ] During schema serialization, issue a local `console.warn` for each affected static endpoint, once per endpoint per LFO instance. Identify the endpoint/first-value behavior without a new diagnostics abstraction or random-metadata warnings.
- [ ] Add endpoint independence and direct/reusable input parity. Compare with structured endpoints only where the same shape is expressible; for multivalue static bars assert the explicit expected schema, warning, and first-value playback instead. Cover static warning/no-warning, shared-instance/repeated-serialization deduplication, and invalid endpoints. Retain LFO speed/wave/phase exclusions.

Verification:

- Automated, root: `pnpm --filter @web-audio/fluid exec vitest run src/automations/__tests__/lfo.test.ts src/__tests__/parameter-shorthand.test.ts src/__tests__/parameter-compatibility.test.ts`; run the characterized audio-engine index-zero test via `pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/__tests__/instrument.test.ts`; run Fluid `check` and `lint`.
- Manual: review warning lifecycle, untouched static schemas, unchanged random path, and the absence of playback-time diagnostics or engine changes.

Completion gate: Both endpoint input forms work, existing arrays keep their bar meaning, static ignored values warn without rejection/truncation, and the unchanged engine demonstrably uses the first value per bar.
Evidence: Not run.

**Phase exit gate G3:** after Step 3.3's checks, run B, all four affected-package composition suites, and Patterns/Fluid/Audio Engine/Schema `check`/`lint`. Audit every row of the spec's consumer matrix and the excluded slots against actual signatures and runtime dispatch. No row may be left as an undocumented partial rollout before Phase 4.
Evidence: Not run.

## Phase 4 — Close public acceptance and document the value-only model

Outcome: Complete cross-domain proof, readable documentation, and an honest feature acceptance record.
Depends on: G3.
Review boundary: Integration gaps, docs, and final regression—not deferred product work.

### Step 4.1 — Complete the public matrix, isolation proof, and documentation

Status: Pending
Requirements / acceptance: R1–R16; AC2/AC3/AC7/AC9/AC15/AC16/AC17/AC18 (final integration portions), with all other ACs linked through their owning steps below.
Depends on: G3.
Review boundary: Close acceptance across completed consumer adapters and run the final gate without claiming unperformed live/installed-artifact proof.

Expected files:

- `packages/fluid/src/__tests__/parameter-shorthand.test.ts`, optional suite-local `support/parameter-consumers.ts`, and existing event compatibility tests only where assertions need extending.
- Existing `packages/audio-engine/src/events/__tests__/resolve-timing.test.ts`, instrument/synthesizer/sampler processing tests, or resolver tests — extend only to close a demonstrated integration gap with the current mocks.
- `docs/concepts/syntax.md`, `docs/concepts/patterns.md`, `docs/reference/instruments/noise.md` — targeted additive edits after preserving the existing worktree content; no documentation reorganization.
- This plan and `overview.md` — concise status/context links only; keep the governing spec intact unless a separately surfaced correction is necessary.

Tasks:

- [ ] Complete the consumer matrix with direct/reusable parity everywhere and structured equivalents where expressible; otherwise assert explicit expected schema, warning, and playback behavior. Include aliases, factories/envelope overloads, positional fields, unsupported mixtures, excluded slots, and source-permission negative type cases. Assert receiving-slot context and source ranges for representative public shorthand errors.
- [ ] Reuse one immutable shorthand across several numeric consumers and an event consumer; prove no mutation/shared progression state and that event-only syntax can still be constructed/used for events while failing for parameters.
- [ ] Connect emitted numeric bars to existing resolver/final-hit tests: independent wrapping, multiple bars, event transforms, and chance misses must preserve processing independence. Retain existing event golden fixtures, not regenerated expectations that could hide regressions.
- [ ] Document the supported subset, group flattening versus event subdivisions, per-bar alternation versus hit progression, whole-pattern alternatives, shorthand-only envelope construction, numeric minimum compatibility, noise dispatch, LFO warning, and chop exception. Cross-link overview/spec/plan without turning the overview into another contract.
- [ ] Run final acceptance, review the diff/remaining consumers/imports, and record only actual results or explicit blocked/deferred checks. Do not mark the PR feature-complete on focused tests alone.

Verification:

- Automated, root: B; the four affected-package composition suites; `pnpm check`; `pnpm lint`; `pnpm test`. Root `pnpm test` must include the existing audio-regression verification rather than silently excluding it. If Chromium or another prerequisite is missing, stop that gate and record the limitation; do not install it or update goldens without approval.
- Automated: targeted Prettier write/check for feature-owned changed files and `git diff --check`; ensure TypeScript checks include all public contract tests. Inspect generated package declarations/exports from B for the new evaluator and supported consumer types.
- Manual: review every AC-to-gate mapping, the dependency boundary, docs/examples, and preservation of unrelated work. Browser dev-server listening and packed/installed artifact tests are not required for this schema-compatible feature; do not claim they were performed.

Completion gate: Each AC has a passing owning gate or an explicitly identified blocker/deviation; public docs and types match behavior, builds compose, and the final workspace regression result has been reviewed. A waived check is an Accepted deviation, not a Verified result.
Evidence: Not run.

**Phase exit gate G4:** after Step 4.1's checks, assess the final acceptance table, artifact/declaration build, root check/lint/test results, and diff review together. Only mark implementation verified when every required gate passes and no material limitation is hidden. Assess this gate before any supervised approval to advance; no publish/deploy action follows automatically.
Evidence: Not run.

## Final acceptance

This table assigns coverage; execution status/evidence lives only in the owning steps/gates. A partial mention earlier in the plan is not completion of the whole AC.

| Spec acceptance ID | Owning step / gate          | Verification and expected result                                                                                                                              | Evidence / status                  |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| AC1                | Steps 0.1, 1.1, 1.2; G1/G4  | Characterized structured/source/default/ownership/validation behavior survives cleanup and integration.                                                       | See owning steps/gates; Not run.   |
| AC2                | Steps 3.1–3.3, 4.1; G3/G4   | All included slots/aliases accept both shorthand forms; match structured schemas where expressible, otherwise explicit schema/warning/playback expectations.  | See owning steps/gates; Not run.   |
| AC3                | Steps 2.2, 3.1–3.3, 4.1; G4 | Mixed/nested whole-pattern misuse fails in checked public types and bypassed runtime calls; independent slots remain valid.                                   | See owning steps/gates; Not run.   |
| AC4                | Step 2.2; G2                | Finite decimal/scientific atoms retain values; invalid/non-finite atoms fail with location context.                                                           | See Step 2.2/G2; Not run.          |
| AC5                | Step 2.1; G2                | All normative sequence/group/repeat outputs match exactly, without temporal cells.                                                                            | See Step 2.1/G2; Not run.          |
| AC6                | Step 2.1; G2                | Normative nested/adjacent/repeated alternation schedules are deterministic.                                                                                   | See Step 2.1/G2; Not run.          |
| AC7                | Steps 2.2, 3.1–3.3, 4.1; G4 | New syntax/atom/unsupported/expansion failures are eager and preserve affected prior configuration.                                                           | See owning steps/gates; Not run.   |
| AC8                | Steps 2.1, 2.2; G2          | Source/tree, choice-schedule/round, and per-result value limits pass the normative boundary fixtures without cumulative accounting; reject unsafe allocation. | See Steps 2.1/2.2 and G2; Not run. |
| AC9                | Steps 0.1, 4.1; G4          | Emitted numeric bars retain bar/hit wrapping and consume final surviving hits without affecting events.                                                       | See Steps 0.1/4.1 and G4; Not run. |
| AC10               | Step 3.2; G3/G4             | Regions/chop/defaults/restrictions and authored versus generated fit timing match structured behavior.                                                        | See Step 3.2/G3; Not run.          |
| AC11               | Step 3.1; G3/G4             | Noise color/source/default and direct numeric string dispatch are unambiguous and compatible.                                                                 | See Step 3.1/G3; Not run.          |
| AC12               | Step 3.1; G3/G4             | Independent ADSR fields work; a bad final shorthand field leaves all four prior values intact.                                                                | See Step 3.1/G3; Not run.          |
| AC13               | Steps 0.1, 3.3; G3/G4       | LFO arrays retain bar semantics; multivalue shorthand schemas stay intact and resolve at index zero.                                                          | See Steps 0.1/3.3 and G3; Not run. |
| AC14               | Step 3.3; G3/G4             | Only affected static endpoints warn, once per endpoint per instance; no random/playback warning expansion.                                                    | See Step 3.3/G3; Not run.          |
| AC15               | Steps 1.2, 3.1–3.3, 4.1; G4 | Supported source contexts persist and narrower/excluded slots do not acquire new source permissions.                                                          | See owning steps/gates; Not run.   |
| AC16               | Steps 2.1, 2.2, 4.1; G4     | Shared immutable shorthand remains target-neutral and has no shared mutable progression state.                                                                | See owning steps/gates; Not run.   |
| AC17               | G1/G2, Step 4.1; G4         | Centralized dispatch/evaluation has no event-state/compiler path; existing event schemas and semantics are unchanged.                                         | See owning steps/gates; Not run.   |
| AC18               | Steps 3.1–3.3, 4.1; G4      | Public slots/aliases/docs match the spec, including both envelope construction overloads, numeric minimum compatibility, and synchronous misuse rejection.    | See owning steps/gates; Not run.   |

## Rollback and recovery

- No persisted-data migration, schema-version cutover, publication, or other irreversible operation is included.
- The PR can be reverted as a whole. During development, revert consumer groups A2–A4 with their dependent signatures/tests rather than leaving accepted-but-unhandled inputs. Revert A1's resolver and dispatch callers together.
- Earlier cleanup can remain only if its own compatibility gates still pass without later feature changes. Remove the numeric evaluator/export only after searching for and reverting its parameter consumers; do not remove the shared event parser.
- If stale artifacts cause inconsistent tests, rebuild dependencies with B and rerun the affected gate. Never repair a failing gate by changing event goldens, audio goldens, or legacy validation policy without an explicit reviewed reason.
- A new material incompatibility or missing environment prerequisite stops the affected gate. Record the failure and smallest recovery action; a separate approved prerequisite fix or explicit deviation is needed before dependent completion is claimed.

## Deferred checks and accepted deviations

- Accepted deviations: None. Steps 0.1–2.2 and G0–G2 verification are complete; public integration and final acceptance remain pending.
- Baseline and browser prerequisites: Affected-package build/tests/check/lint pass against unchanged production. Browser prerequisite files are present, not runtime-verified; G4 owns browser execution and full workspace acceptance.
- Live listening/dev-server sessions, packed installation, publication, and deployment: Not required by this spec and not claimed by build/mock/schema checks.
- Product work deferred by the spec remains deferred: diagnostics overhaul; time-addressed/continuous patterns and unsupported operators; raw LFO speed/wave/timing-generator shorthand; cycle hierarchy, ownership, and legacy validation/default unification.
