# Saturator Implementation Plan

## Status and governing source

- Governing spec: [spec.md](spec.md); plain-language scope: [overview.md](overview.md).
- Delivery state: Source build, Step 1.1, Step 1.2, the Phase 1 implementation exit, and the scoped Step 2.1 gate are **Verified**. Step 2.1 has one repeatable candidate, focused checks, and completed parent review; historical native evidence records an unresolved intermittent `bends` limitation. Step 2.2 is **In progress**: the explicitly approved candidate is registered, its named reference pair is generated, and final existing checks pass; saved-reference listening approval remains.
- Acceptance still pending: saved-reference listening approval, the Phase 2 exit gate, and final whole-feature acceptance remain outstanding. The recorded `bends` limitation remains unresolved. No extra infrastructure or supported-capacity claim is required.
- Blockers: No concrete supported-product-path blocker was identified. Missing local browser/dependencies or unavailable user listening block the affected execution gate, not permission to skip it. The spec's A1–A3 remain working assumptions, not individually approved product decisions.

Step statuses below are the authoritative execution record. A phase is complete
only when its step completion gates and phase exit gate are satisfied. Task
checkboxes do not prove that gates passed. `Verified` means the scoped gate and
required implementation review passed; it does not imply user listening approval
or release. In supervised execution, record manual approvals in extension state,
not task checkboxes; evidence may link to that record without duplicating it.

## Execution constraints

- Paths and commands are relative to the repository root, `/Users/andy/Documents/Development/web-audio`, unless explicitly stated otherwise.
- This plan is not permission to begin implementation, install software, run `dev`, commit, publish, or deploy. Do not run a `dev` command without asking. Implementation needs no new package or lockfile change.
- Preserve unrelated work. Expected files describe scope, not permission to change unrelated files. Read files completely and follow `AGENTS.md`.
- Keep step IDs stable. Escalate conflicts with the spec rather than weakening it. Stop for a decision if sound quality requires another DSP backend, timing compensation, or scope expansion.
- Reuse current parameter, scheduling, routing, and test seams. No generic effect host, compressor, main chain, new tails, or shared-bus modulation expansion.
- New domain tests belong in domain-local `__tests__/`; cross-domain native tests belong in `packages/audio-regression/src/__tests__/`. Test-only helpers live in the relevant `support/` directory. Production code must not import them; tests remain type-checked. Do not migrate unrelated existing tests.
- All new files/tests/diagnostic commands named below are **proposed additions**, not currently available tooling. Existing scripts come from the inspected package manifests. Chromium native tests use the existing loopback harness, not an application server.
- Generated `dist` output is not source evidence. Force a source rebuild before the baseline and each phase's native integration gate. Build in a separate completed command before dependent tests/checks: Turbo's `check` and `lint` tasks do not depend on `build`. Never copy generated output into source or treat it as completed work.
- Do not update references to obtain a pass. Keep candidate audio under ignored `artifacts/`; require explicit user approval before the named reference update. No normalization, alignment, clipping, resampling, or tolerance widening.
- Evidence entries stay brief: result, relevant command/revision, limitations, and a relative link when useful. Create supporting notes only for meaningful reproducibility or unresolved failures; no empty reports or transcripts in this plan.

## Phase overview and delivery boundary

| Phase | Outcome                                                                       | Dependencies                   | Exit gate                                                                                                                           |
| ----- | ----------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Current-source baseline and available verification environment                | Existing checkout/dependencies | Baseline results and any blockers recorded; no untrusted generated output                                                           |
| 1     | One-node saturator integrated through the public API, voices, and named buses | Phase 0                        | Atomic consumers build and pass focused unit/integration tests plus a fresh native smoke                                            |
| 2     | Focused native evidence and one listening-approved regression case            | Phase 1                        | Retained acceptance criteria are accounted for; the approved case/reference, listening approval, and final existing checks complete |

Delivery boundary: **one feature-complete PR**, containing reviewable increments;
these phases are execution gates within one feature-complete PR. Step 1.1
covers the tested processor and adapter, Step 1.2 covers the schema, authoring,
and runtime integration, and Step 2.2 adds the registry case and its approved
reference together. Never leave a registered case with a missing reference at a
review boundary.

## Phase 0 — Establish a trustworthy baseline

Outcome: Know which current-source checks work before attributing differences to
saturation; select the bounded verification environment.
Depends on: Existing checkout, installed workspace dependencies, and the
Playwright Chromium headless shell matching the installed Playwright version.
Review boundary: Source-read-only characterization; builds and renders may write
generated output and ignored diagnostics. No source changes, dependency changes,
or reference updates.

### Step 0.1 — Record the source-built baseline

Status: Verified
Requirements / acceptance: R8; AC10 (baseline portion only; final parity belongs to Step 2.2).
Depends on: None.
Review boundary: Establish tooling and existing behavior, not a preparatory refactor.

Expected files:

- No application-source edits. Update this step's evidence; use `evidence/baseline.md` only if environment details or failures need a supporting note.

Tasks:

- [x] Record revision, relevant working-tree changes, runtime/package-manager versions, and browser availability. Do not reset or clean another person's work.
- [x] Force rebuild Fluid/audio-engine and their dependencies from source, replacing stale generated output through the build, not manual edits.
- [x] Run the baseline below and record actual results; do not infer unverified success.
- [x] Use 44.1 and 48 kHz for the completed baseline's offline coverage.

Verification — existing commands, from repository root:

```sh
pnpm exec turbo run build --filter=@web-audio/audio-engine --filter=@web-audio/fluid --force
pnpm exec turbo run test:ci check lint --filter=@web-audio/worklets --filter=@web-audio/schema --filter=@web-audio/fluid --filter=@web-audio/audio-engine
pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/worklets.test.ts src/__tests__/pre-envelope-effects.test.ts
pnpm --filter @web-audio/audio-regression audio:verify
```

These establish current unit/type/lint behavior, worklet/native routing baseline,
and all existing saved-reference comparisons; they do not prove new saturation.
If dependencies or Chromium are missing, mark the affected gate `Blocked` and
request the necessary setup rather than installing silently. The existing
`browser:install` command installs only the headless shell.

Manual: Inspect baseline failures and local changes; no new listening approval
is needed for unchanged references at this step.

Completion gate: Passed. The forced source build, forced scoped unit/type/lint
checks, focused regression tests, and existing-reference verification all passed;
no unexplained baseline failure relevant to the feature was found. The cache
controlled rerun is documented as a command-argument deviation, not a waiver.
Evidence: [baseline](evidence/baseline.md).

Phase exit gate assessment: Passed. Step 0.1 provides usable current-source
unit/native gates and records the bounded environment and limitations. This is
an assessment of the gate only; no manual phase-advancement approval is claimed.
Evidence: [baseline](evidence/baseline.md).

## Phase 1 — Implement and integrate one-node saturation

Outcome: Users can author saturation through the real API with existing voice
and named-bus controls, ordering, ownership, and failure boundaries intact.
Depends on: Phase 0 exit gate.
Review boundary: One fixed-curve worklet and its narrow integration only; exclude
compressor/main routing and broad effect or engine transaction refactoring.

### Step 1.1 — Implement the processor and its disposable adapter

Status: Verified (implementation, checks, and parent review passed)
Requirements / acceptance: R3, R4, R6, R7; AC3 (DSP), AC4 (unit portion), AC5 (DSP portion), AC7 (sample-array portion), AC9 (registration/adapter portion). Native/channel composition, owner binding, and owner failure portions remain in Steps 1.2 and 2.1.
Depends on: Step 0.1 and Phase 0 exit gate.
Review boundary: A tested, registered but not yet publicly authored processor;
existing effect schemas and consumer behavior remain usable.

Expected files:

- `packages/worklets/src/processors/saturator-processor.ts` — new DSP and explicit disposal handling.
- `packages/worklets/src/processors/__tests__/saturator-processor.test.ts` and suite-local `support/` if needed — new independent expectations.
- `packages/worklets/src/index.ts` — processor bundle export through the existing `?worklet` mechanism.
- `packages/audio-engine/src/effects/saturator.ts` and `effects/__tests__/saturator.test.ts` — new narrow node/parameter/disposal adapter and tests; no generic host.
- `packages/audio-engine/src/audio-engine.ts` and `src/__tests__/engine.test.ts` — existing registration/readiness path and affected mocks/assertions.

Tasks:

- [x] Implement the spec's first-order ADAA equations with stable antiderivative evaluation, a justified near-equality threshold, zero initial state, and independent per-channel history. Keep state across blocks; do not dispose on silence.
- [x] Expose `drive` and `postgain` as a-rate AudioParams defaulting to `1`; support scalar and per-sample arrays, signed multipliers, output muting without frozen history, and the zero-drive transition. Avoid render-loop allocation where practical.
- [x] Define an explicit disposal message/processor stop path. A disposal request stops processing rather than merely muting or disconnecting output; test the processor's terminal return/state directly.
- [x] Add a small adapter exposing the node, required parameters, and idempotent disposal. Validate parameter presence; clean partial allocation; observe native processor errors using existing worklet conventions, remove listeners/close ports, and preserve a silent failed path without bypass or retry.
- [x] Export and register through existing bundling/readiness. Update registration mocks atomically; rejection of module loading must reject engine readiness.
- [x] Add independent DSP fixtures or explicit expected samples, channel/block partition checks, modulation-array checks, and adapter/error/disposal tests. Do not generate expected output by calling the production DSP under test.

Verification — tests below are added by this step; scripts already exist:

```sh
pnpm exec turbo run build --filter=@web-audio/worklets --filter=@web-audio/audio-engine --force
pnpm --filter @web-audio/worklets exec vitest run src/processors/__tests__/saturator-processor.test.ts
pnpm --filter @web-audio/audio-engine exec vitest run src/effects/__tests__/saturator.test.ts src/__tests__/engine.test.ts
pnpm exec turbo run check lint --filter=@web-audio/worklets --filter=@web-audio/audio-engine
```

Assert stable repeated/near-equal values, useful high drive, signed/zero controls,
no crossfeed, partition-independent output, and explicit DSP termination. Cover
both sample-rate environments. The adapter tests inject missing parameters,
construction/error notifications, repeated cleanup, and stale callbacks. These
are unit/bundle/readiness proofs, not native sound or voice-lifecycle acceptance.
Run Prettier on the changed files and `git diff --check` before review.

Manual: Review the numerical threshold and the owned-resource/disposal boundary;
no listening gate yet.

Completion gate: Focused processor/adapter tests, source build, bundle/type/lint
checks, readiness assertions, and independent-reference assertions passed. Parent
implementation review is complete. No fallback,
shared channel history, or silence-triggered shutdown was introduced.
Evidence: [step 1.1](evidence/step-1.1.md).

Phase 1 exit gate: **Verified** for the current implementation scope. Evidence:
[Step 1.2](evidence/step-1.2-minimal.md). Phase 2 remains **Pending**; no user
manual listening or approval is claimed.

### Step 1.2 — Wire the public effect, voices, and named buses atomically

Status: **Verified** — implementation and parent review passed
Requirements / acceptance: R1–R8; AC1, AC2, AC6, AC7 (binding/scheduling), AC8, AC9 (owner/failure portions); AC4/AC5/AC10/AC11 (native smoke or targeted portions only). Full native comparison/listening/parity remain Phase 2.
Depends on: Step 1.1.
Review boundary: Keep the typed discriminator, authoring, voice path, and
narrow named-bus worklet ownership needed for saturation. Reuse existing
lifecycle seams; do not add generic MIDI, constructor, or resource-host rollback.

Expected files:

- `packages/schema/src/{index.ts,validate-graph.ts,validate-graph.test.ts}` — variant, both parameter fields, and validation tests.
- `packages/fluid/src/effects/saturator.ts`, `effects/__tests__/saturator.test.ts`, `src/drome.ts`, and `src/__tests__/drome.test.ts` — builder/factory/defaults and public tests.
- `packages/fluid/src/instruments/instrument.ts`, `src/buses/bus.ts`, and their existing relevant tests — accepted builder unions and attachments.
- `packages/audio-engine/src/instruments/instrument.ts`, `instruments/__tests__/pre-envelope-effects.test.ts`, and relevant existing voice/source tests — node construction, modulation discovery, cleanup, ordering.
- `packages/audio-engine/src/buses/runtime-bus.ts` and `buses/__tests__/runtime-bus.test.ts` — explicit dispatch, bindings, partial-constructor cleanup.
- `packages/audio-engine/src/__tests__/engine.test.ts` and narrow adapter tests as needed — existing pending-update and registration boundaries only.
- `packages/audio-regression/src/__tests__/saturator.test.ts` — public-path native smoke; refined in Step 2.1.
- `plans/analog-engine/saturator/evidence/step-1.2-minimal.md` and `follow-ups.md` — concise implementation evidence and follow-up observations.

Tasks:

- [x] Retain the distinct `{ type: "saturator", drive, postgain }` variant, required validation, factory/setter defaults, signed values, replacement semantics, and supported public unions.
- [x] Wire voice integration through the existing completion cleanup list for each adapter and both parameter helpers; retain explicit LFO discovery without private binding rollback or global MIDI changes.
- [x] Wire named-bus integration through explicit dispatch, an optional dispose hook only for saturators, and cleanup of newly created saturators when later construction or initial scheduling fails. Preserve existing filter/gain scheduling and destruction behavior.
- [x] Run focused schema, builder, control/topology, ownership/cancel/end/dispose, unsupported bus modulation, new-node binding failure, and native smoke checks. Keep Phase 2 coverage and reference cases in Phase 2.

Verification:

```sh
pnpm exec turbo run build --filter=@web-audio/audio-engine --filter=@web-audio/fluid --force
pnpm exec turbo run test:ci check lint --filter=@web-audio/worklets --filter=@web-audio/schema --filter=@web-audio/fluid --filter=@web-audio/audio-engine
pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/saturator.test.ts
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
```

The focused suites cover AC1/AC2 authoring and validation, AC6 ordering and
ownership, AC7 discovery/scheduling/stop, and the narrow AC8/AC9 saturator
lifecycle boundaries. They do not claim rollback for existing MIDI, constructors,
or every native graph operation. Format changed files and run `git diff --check`.

Manual: Review the owner boundary, especially voice completion cleanup
and the named-bus cleanup of newly created worklets. Do not broaden failure
handling beyond the stated contract.

Completion gate: The API/schema/runtime integration, focused tests, and fresh
public-path native smoke pass together. Parent review is complete. No new
generic rollback, helper, cast, or alternate resource host is introduced.
Evidence: [Step 1.2](evidence/step-1.2-minimal.md).

Phase exit gate assessment: **Verified** for the current implementation scope;
parent review passed. Evidence: [Step 1.2](evidence/step-1.2-minimal.md). Phase
2 remains **Pending**; no manual listening or reference approval is claimed.

## Phase 2 — Verify the sound and finish acceptance

Outcome: Narrow the existing native checks to accepted coverage, prepare one
portable candidate, then obtain approval for one saved synth/sampler/named-bus
regression case and run the final existing checks.
Depends on: Phase 1 exit gate.
Review boundary: Existing code and tests only; no extra infrastructure or
reference update without explicit approval.

### Step 2.1 — Align native coverage and prepare a portable candidate

Status: **Verified** for scoped candidate preparation, repeatability checks,
focused verification, and parent review. The candidate remains unregistered;
historical native evidence in [native evidence](evidence/native.md) records an
unresolved intermittent `bends` limitation, while the current read-only
verification passed all 15 existing references.
Requirements / acceptance: R2–R8; retain focused native evidence only where it
adds distinct coverage to the accepted unit/integration checks and candidate.
Depends on: Step 1.2 and Phase 1 exit gate.
Review boundary: Narrow existing regression consumers and helpers to accepted
coverage, then prepare one unregistered candidate. Do not expand coverage or
update a saved reference.

- [x] Inspect existing native test/reference consumers and narrow them to the
      accepted candidate check; preserve the candidate and remove obsolete
      oracle, property-matrix, and failure-probe helpers.
- [x] Reuse the existing renderer and local fixture to prepare one unregistered
      candidate containing representative synth, sampler, and named-bus behavior.
- [x] Run the focused build, test, check, lint, format, and read-only reference
      checks needed for the candidate.

Expected files:

- `packages/audio-regression/src/__tests__/saturator.test.ts` — retain only the
  focused native coverage needed by the accepted contract.
- `packages/audio-regression/README.md` — keep native command and proof limits
  accurate if the focused coverage changes.
- `plans/analog-engine/saturator/evidence/candidate.md` — record the scoped
  candidate metadata and check results.
- Ignored `packages/audio-regression/artifacts/saturator/` — candidate WAV/JSON,
  not committed approval evidence.

Verification — existing commands, narrowed to the accepted coverage:

```sh
pnpm exec turbo run build --filter=@web-audio/audio-engine --filter=@web-audio/fluid --force
pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/saturator.test.ts src/__tests__/worklets.test.ts src/__tests__/pre-envelope-effects.test.ts
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression format:check
pnpm --filter @web-audio/audio-regression audio:verify
```

A candidate is rendered under ignored artifacts and remains unregistered.
Existing saved references are checked read-only; no reference is updated in
this step. No user listening or approval is claimed.

Completion gate: Candidate preparation, repeatability checks, focused checks,
and parent review are complete; Step 2.1 is **Verified** for this scoped gate.
Listening approval, registration, and reference update belong to Step 2.2 and
remain pending. Evidence: [candidate](evidence/candidate.md) and the
historical [native evidence](evidence/native.md).

### Step 2.2 — Approve one case and run final existing checks

Status: **In progress** — candidate approval, case registration, named-reference generation, fresh named verification, and final existing checks passed; saved-reference listening approval remains.
Requirements / acceptance: R8; AC10 (final regression) and AC11 (user and
saved-reference acceptance).
Depends on: Step 2.1.
Review boundary: One reproducible, user-approved `saturator` case and its
reference, followed by final existing checks. No separate matrix, extra assets,
tolerance changes, or unrelated recordings.

Expected files:

- `packages/audio-regression/cases/saturator/{metadata.json,sketch.js}` — the
  approved candidate with portable local resource mapping and provenance.
- `packages/audio-regression/references/saturator/{render.wav,metadata.json}` —
  generated only after explicit approval.
- `packages/audio-regression/README.md` and this feature's overview/status —
  update only with established acceptance results.

Tasks:

- [x] Present the Step 2.1 candidate and its disclosed quality limitations,
      including the unresolved `bends` result, for explicit listening approval.
      The exact candidate approval is recorded in [acceptance evidence](evidence/acceptance.md).
- [x] After approval, add the same candidate as one discovered `saturator` case
      and verify its identity/settings.
- [x] Render the registered case, confirm it remains within the existing raw
      comparison tolerances, and generate only the named saved reference. Add
      case and reference together.
- [x] Verify fresh output against the saved reference. Fresh verification
      passed.
- [ ] Have the user approve the saved WAV itself. Playback success is not
      approval.
- [x] Run final existing checks and record only established outcomes, preserving
      unresolved risks and deviations.

Verification — case commands become valid after the case is added:

```sh
pnpm --filter @web-audio/audio-regression audio:render --case saturator
# Only after explicit candidate approval:
pnpm --filter @web-audio/audio-regression audio:update --case saturator
pnpm --filter @web-audio/audio-regression audio:verify --case saturator
```

Final existing checks:

```sh
pnpm exec turbo run build --filter=@web-audio/audio-engine --filter=@web-audio/fluid --force
pnpm test
pnpm check
pnpm lint
pnpm --filter @web-audio/audio-regression format:check
git diff --check
```

Manual: The user listens to the candidate and then the saved reference. Approval
must cover onset quality, drive/postgain control, and the representative voice
and bus examples. Existing listening evidence does not approve these files.

Completion gate: User approval, the complete case/reference pair, retained
behavioral checks, and final existing checks are all required. No publication or
deployment is part of this gate.

Phase exit gate: Confirm every retained acceptance row points to passed owning
evidence, the saved-reference listening is approved, and final existing checks
are complete before declaring feature acceptance. A blocked check is not a
passing gate.

Evidence: [acceptance](evidence/acceptance.md). Saved-reference listening
approval remains outstanding.

## Final acceptance

Status: **Pending**. Phase 2 evidence and whole-feature acceptance remain outstanding.

This is a coverage map, not another progress checklist. Evidence/status lives in
the owning step or phase gate; these links identify it without duplicating results.

| Spec acceptance ID | Owning step / gate                        | Verification and expected result                                                                                              | Evidence location                                                                                                                                                                                                                                                                                            |
| ------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1                | Step 1.2                                  | Typed authoring, defaults, serialization, replacement, valid attachments                                                      | [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically)                                                                                                                                                                                                                               |
| AC2                | Step 1.2                                  | Invalid input/location/bus automation rejects; invalid schema update preserves pending configuration                          | [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically)                                                                                                                                                                                                                               |
| AC3                | Step 1.1; Steps 2.1/2.2 if distinct       | Independent stable ADAA math; focused native evidence only where distinct                                                     | [Step 1.1](#step-11--implement-the-processor-and-its-disposable-adapter), [Step 2.1](#step-21--align-native-coverage-and-prepare-a-portable-candidate), [Step 2.2](#step-22--approve-one-case-and-run-final-existing-checks)                                                                                 |
| AC4                | Step 1.1; Steps 2.1/2.2 if distinct       | Unit block/channel invariance; focused native evidence only where distinct                                                    | [Step 1.1](#step-11--implement-the-processor-and-its-disposable-adapter), [Step 2.1](#step-21--align-native-coverage-and-prepare-a-portable-candidate), [Step 2.2](#step-22--approve-one-case-and-run-final-existing-checks)                                                                                 |
| AC5                | Steps 1.1, 1.2; Steps 2.1/2.2 if distinct | DSP state table and binding after initial silence; native controls only if distinct                                           | [Step 1.1](#step-11--implement-the-processor-and-its-disposable-adapter), [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically), [Step 2.1](#step-21--align-native-coverage-and-prepare-a-portable-candidate), [Step 2.2](#step-22--approve-one-case-and-run-final-existing-checks) |
| AC6                | Step 1.2; Steps 2.1/2.2                   | Authored order, pre-ADSR/node ownership, and one representative voice/bus case                                                | [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically), [Step 2.1](#step-21--align-native-coverage-and-prepare-a-portable-candidate), [Step 2.2](#step-22--approve-one-case-and-run-final-existing-checks)                                                                           |
| AC7                | Steps 1.1, 1.2; Steps 2.1/2.2 if distinct | Sample-varying arrays, automation targets, bus transitions/stop; native motion only if distinct                               | [Step 1.1](#step-11--implement-the-processor-and-its-disposable-adapter), [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically), [Step 2.1](#step-21--align-native-coverage-and-prepare-a-portable-candidate), [Step 2.2](#step-22--approve-one-case-and-run-final-existing-checks) |
| AC8                | Step 1.2                                  | Cancellation/completion/retirement/destruction and stale callbacks respect ownership and timing                               | [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically)                                                                                                                                                                                                                               |
| AC9                | Steps 1.1, 1.2                            | Readiness rejects; partial allocation cleans; failed paths stay silent without fallback or unrelated teardown                 | [Step 1.1](#step-11--implement-the-processor-and-its-disposable-adapter), [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically)                                                                                                                                                     |
| AC10               | Steps 0.1, 2.2                            | Baseline, unchanged existing references/events, and final existing regression                                                 | [Step 0.1](#step-01--record-the-source-built-baseline), [Step 2.2](#step-22--approve-one-case-and-run-final-existing-checks)                                                                                                                                                                                 |
| AC11               | Step 2.2                                  | One repeatable representative synth/sampler/named-bus candidate plus explicit user listening of candidate and saved reference | [Step 2.2](#step-22--approve-one-case-and-run-final-existing-checks)                                                                                                                                                                                                                                         |

## Rollback and recovery

- No persisted-schema migration, service deployment, or irreversible product action is required. Revert source changes by review unit and rebuild generated packages before re-testing; do not restore stale `dist` as source.
- Revert Step 1.2's schema, builder, both runtime consumers, discovery, and fixtures together. If reverting Step 1.1 too, revert dependent integration first or in the same unit. Never leave an authored discriminator without its consumer.
- Preserve existing filter/gain effects and current consumer paths. Any helper cleanup must retain the portable listening candidate and its provenance through the approval gate.
- Keep the Step 2.2 case and reference together on rollback. Reference updates use ordinary WAV/JSON writes, not an atomic filesystem transaction. If an update fails partway, stop; inspect the named case's pair, restore a known complete pair or remove only the newly created incomplete pair, and rerun the approved named update when authorized. Never regenerate unrelated references as recovery.
- Processor failure remains a silent affected path, without fallback/retry. Dispose its owned resources and preserve unrelated owners. Broader failed-commit rollback is outside scope; fix targeted leaks without claiming transactional engine recovery.
- If quality/performance is materially inadequate, keep acceptance pending, retain reproducible evidence, and ask about the affected choice rather than silently adding modes, compensation, or a new architecture.

## Scope boundaries

- Human listening/reference approval requires user access later; it is an explicit gate, not implicitly waived. Candidate approval must precede registration and reference creation.
- Cross-browser/device certification, a CPU or capacity guarantee, compressor/main effects, and other spec non-goals remain outside this plan.
