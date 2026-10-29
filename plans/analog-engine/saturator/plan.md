# Saturator Implementation Plan

## Status and governing source

- Governing spec: [spec.md](spec.md); plain-language scope: [overview.md](overview.md).
- Delivery state: Baseline characterization complete; Step 1.1 processor/adapter implementation and parent review are complete; public authoring integration, native verification, real-time characterization, listening, and approved-reference work have not begun.
- Acceptance still pending: All later implementation, native verification, real-time characterization, user listening approval, and approved-reference gates remain outstanding.
- Blockers: None for planning. Missing local browser/dependencies or unavailable user listening block the affected execution gate, not permission to skip it. The spec's A1–A3 remain working assumptions, not individually approved product decisions.

Step statuses below are the authoritative execution record. A phase is complete
only when its step completion gates and phase exit gate are satisfied. Task
checkboxes do not prove that gates passed. `Verified` means the scoped gate and
required implementation review passed; it does not imply user listening approval
or release. In supervised execution, record manual approvals in extension state,
not task checkboxes; evidence may link to that record without duplicating it.

## Execution constraints

- Paths and commands are relative to the repository root, `/Users/andy/Documents/Development/web-audio`, unless explicitly stated otherwise.
- This plan is not permission to begin implementation, install software, run `dev`, commit, publish, or deploy. Do not run a `dev` command without asking. Implementation needs no new package or lockfile change.
- Preserve unrelated work, including the existing planning-document changes. Expected files describe scope, not permission to change unrelated files. Read files completely and follow `AGENTS.md`.
- Keep step IDs stable. Escalate conflicts with the spec rather than weakening it. Stop for a decision if sound quality requires another DSP backend, timing compensation, or scope expansion.
- Reuse current parameter, scheduling, routing, and test seams. No generic effect host, compressor, main chain, new tails, or shared-bus modulation expansion.
- New domain tests belong in domain-local `__tests__/`; cross-domain native tests belong in `packages/audio-regression/src/__tests__/`. Test-only helpers live in the relevant `support/` directory. Production code must not import them; tests remain type-checked. Do not migrate unrelated existing tests.
- All new files/tests/diagnostic commands named below are **proposed additions**, not currently available tooling. Existing scripts come from the inspected package manifests. Chromium native tests use the existing loopback harness, not an application server.
- Generated `dist` output is not source evidence: inspection found stale saturator output despite no corresponding source implementation. Force a source rebuild before the baseline and each phase's native integration gate. Build in a separate completed command before dependent tests/checks: Turbo's `check` and `lint` tasks do not depend on `build`. Never copy generated output into source or treat it as completed work.
- Do not update references to obtain a pass. Keep candidate audio under ignored `artifacts/`; require explicit user approval before the named reference update. No normalization, alignment, clipping, resampling, or tolerance widening.
- Evidence entries stay brief: result, relevant command/revision, limitations, and a relative link when useful. Create supporting notes only for meaningful reproducibility or unresolved failures; no empty reports or transcripts in this plan.

## Phase overview and delivery boundary

| Phase | Outcome                                                                                 | Dependencies                   | Exit gate                                                                                        |
| ----- | --------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| 0     | Current-source baseline and available verification environment                          | Existing checkout/dependencies | Baseline results and any blockers recorded; no untrusted generated output                        |
| 1     | One-node saturator integrated through the public API, voices, and named buses           | Phase 0                        | Atomic consumers build and pass focused unit/integration tests plus a fresh native smoke         |
| 2     | Native behavior, real-time characterization, and listening-approved regression coverage | Phase 1                        | All AC1–AC12 evidence accounted for; final saved-reference listening and broader checks complete |

Delivery boundary: **one feature-complete PR**, containing reviewable increments;
these phases are not separate release commitments. Step 1.1 may be reviewed as an
unused tested processor/adapter, but is not feature completion. Step 1.2 is the
atomic schema/authoring/runtime integration group: land and revert its consumers
together. Step 2.3 adds the registry case and its approved reference together;
never leave a registered case with a missing reference at a review boundary.

## Phase 0 — Establish a trustworthy baseline

Outcome: Know which current-source checks work before attributing differences to
saturation; select the bounded verification environment.
Depends on: Existing checkout, installed workspace dependencies, and the
Playwright Chromium headless shell matching the installed Playwright version.
Review boundary: Source-read-only characterization; builds and renders may write
generated output and ignored diagnostics. No source changes, dependency changes,
reference updates, or recovery of old branch implementations.

### Step 0.1 — Record the source-built baseline

Status: Verified
Requirements / acceptance: R8; AC10 (baseline portion only; final parity belongs to Steps 2.1 and 2.3).
Depends on: None.
Review boundary: Establish tooling and existing behavior, not a preparatory refactor.

Expected files:

- No application-source edits. Update this step's evidence; use `evidence/baseline.md` only if environment details or failures need a supporting note.

Tasks:

- [x] Record revision, relevant working-tree changes, runtime/package-manager versions, and browser availability. Do not reset or clean another person's work.
- [x] Force rebuild Fluid/audio-engine and their dependencies from source, replacing stale generated output through the build, not manual edits.
- [x] Run the baseline below and distinguish pre-existing failures from new regressions. Record actual results; do not assume the historical green state still applies.
- [x] Use 44.1 and 48 kHz for new offline coverage. Reserve the current local Mac/browser/audio device for real-time characterization; record its actual rate rather than requiring it to honor an offline rate.

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
`browser:install` command installs only the headless shell; it does not establish
availability of an interactive browser for Step 2.2.

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
- [x] Define a minimal explicit disposal message/processor stop path. A disposal request stops processing rather than merely muting or disconnecting output; test the processor's terminal return/state directly.
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
checks, readiness assertions, and the same-step strict independent-reference
assertion fix passed. Parent implementation review is complete. No fallback,
shared channel history, or silence-triggered shutdown was introduced.
Evidence: [step 1.1](evidence/step-1.1.md).

Phase 1 exit gate: **NOT satisfied**. Step 1.2 remains Pending and its public
API, voice/bus ownership, and native gates have not been run.

### Step 1.2 — Wire the public effect, voices, and named buses atomically

Status: Pending
Requirements / acceptance: R1–R8; AC1, AC2, AC6, AC7 (binding/scheduling), AC8, AC9 (owner/failure portions); AC4/AC5/AC10/AC11 (native smoke or targeted portions only). Full native comparison/listening/parity remain Phase 2.
Depends on: Step 1.1.
Review boundary: The complete typed effect discriminator and every affected
consumer, with lifecycle proof in the same increment—not a later hardening phase.

Expected files:

- `packages/schema/src/{index.ts,validate-graph.ts,validate-graph.test.ts}` — variant, both parameter fields, and validation tests.
- `packages/fluid/src/effects/saturator.ts`, `effects/__tests__/saturator.test.ts`, `src/drome.ts`, and `src/__tests__/drome.test.ts` — builder/factory/defaults and public tests.
- `packages/fluid/src/instruments/instrument.ts`, `src/buses/bus.ts`, and their existing relevant tests — accepted builder unions and attachments.
- `packages/audio-engine/src/instruments/instrument.ts`, `instruments/__tests__/pre-envelope-effects.test.ts`, and relevant existing voice/source tests — node construction, modulation discovery, cleanup, ordering.
- `packages/audio-engine/src/buses/runtime-bus.ts` and `buses/__tests__/runtime-bus.test.ts` — explicit dispatch, bindings, partial-constructor cleanup.
- `packages/audio-engine/src/__tests__/engine.test.ts` and narrow adapter tests as needed — pending-update preservation, replacement failure, retirement, and error boundaries.
- `packages/audio-regression/src/__tests__/saturator.test.ts` and `support/saturator/` — new minimal public-path native smoke; expanded in Step 2.1.

Tasks:

- [ ] Add the distinct `{ type: "saturator", drive, postgain }` variant and required-field validation, plus the spec's optional single-slot factory and variadic postgain setter. Preserve reusable inputs, signed values, default `1`/`1`, replacement semantics, and argument rejection.
- [ ] Update all effect consumers/types together. Replace the bus's non-filter-means-gain fallback with explicit supported-effect dispatch; include both saturator controls in voice LFO discovery. Do not leave an accepted variant without a working runtime branch.
- [ ] Bind through existing parameter helpers, including first-audible-sample initialization, per-voice envelope/LFO/MIDI behavior, and named-bus step-zero static/random transitions. Reject unsupported bus modulation before activation; keep main effects rejected without redesigning other effects' validation.
- [ ] Connect one adapter per voice/effect or shared bus/effect in authored order. Register disposal with the existing owners, preserve pre-ADSR placement and retirement, and keep failed series paths silent without stopping sibling owners or shared modulation sources.
- [ ] Make partial voice/bus construction release newly acquired resources, including earlier effects in a bus constructor that fails before engine registration. Add cancellation/completion/retirement/repeated-destroy/stale-event and injected-failure coverage now. Preserve schema-validation-before-pending-assignment without promising general engine rollback.
- [ ] Add authoring/type/schema negatives, synth/sampler/bus topology and control tests, and one deterministic fresh native smoke through the public factory. Update affected mocks/fixtures/exports in this atomic group; keep existing graphs supported.

Verification:

```sh
pnpm exec turbo run build --filter=@web-audio/audio-engine --filter=@web-audio/fluid --force
pnpm exec turbo run test:ci check lint --filter=@web-audio/worklets --filter=@web-audio/schema --filter=@web-audio/fluid --filter=@web-audio/audio-engine
pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/saturator.test.ts
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
```

The core suites must cover AC1/AC2 authoring and validation, AC6 ordering/node
ownership, AC7 target discovery/scheduling/stop, and AC8/AC9 lifecycle/failures.
Check every new union consumer rather than relying only on a successful build.
The new native smoke proves the source-built public path actually produces
finite, repeatable audible saturation; it is not listening approval or the full
native matrix. Format changed files and run `git diff --check`.

Manual: Review all new owner-cleanup registrations and every failed setup path.
Confirm tests distinguish a silent failed path from a dry fallback and verify
that another voice/bus remains connected and its controls remain alive.

Completion gate: This atomic group's API, schema, runtime, and affected tests pass
together; native smoke passes after rebuilding; no new discriminator is handled
as gain accidentally; ownership safety is not deferred to Phase 2.
Evidence: Not run.

Phase exit gate: After Step 1.2 checks, force rebuild as above and run the new
`saturator.test.ts` together with existing `worklets.test.ts` and
`pre-envelope-effects.test.ts` through `pnpm --filter @web-audio/audio-regression exec vitest run`.
Require composed registration, public-path smoke, and unchanged existing routing
coverage to pass. Assess before requesting approval to advance. Mocks alone do
not satisfy this integration gate.
Evidence: Not run.

## Phase 2 — Verify the sound and finish acceptance

Outcome: Bounded native and real-time evidence plus explicitly approved saved
reference coverage, without hiding residual quality or performance risks.
Depends on: Phase 1 exit gate.
Review boundary: Verification and one representative reference case; no second
DSP mode or broad performance framework.

### Step 2.1 — Expand native verification and produce listening candidates

Status: Pending
Requirements / acceptance: R2–R8; AC3 (native cross-check), AC4, AC5, AC6, AC7, AC8, AC9 (selected native portions), AC10, AC11 (render/repeatability portion). User approval is owned by Step 2.3; real-time evidence by Step 2.2.
Depends on: Step 1.2 and Phase 1 exit gate.
Review boundary: Reuse the existing Chromium offline renderer and local fixtures;
no new registered case or approved-reference writes yet.

Expected files:

- `packages/audio-regression/src/__tests__/saturator.test.ts` — expand the Phase 1 smoke.
- `packages/audio-regression/src/__tests__/support/saturator/` — independent expected math, sketches, and candidate recording helper as needed.
- `packages/audio-regression/README.md` — focused native command and its proof limitations.
- Ignored `packages/audio-regression/artifacts/saturator/` — candidate WAV/JSON, not committed approval evidence.

Tasks:

- [ ] Cover 44.1/48 kHz synth and sampler paths, stereo/unison with source layers, named-bus summed processing, and deliberately different effect orders. Use existing local procedural samples and deterministic seeds, not network assets.
- [ ] Compare representative complete-chain output with an independent ADAA expectation or explicit known samples, accounting for the existing amplitude envelope. Check native channel isolation, repeatability, non-quantum starts/stops, signed/zero controls, and meaningful drive/postgain motion; no WaveShaper waveform-identity gate.
- [ ] Extend only needed native failure/cancellation/retirement checks using existing diagnostic seams. Observe actual processor errors and disposal behavior without replacing native DSP with a fake.
- [ ] Save a small, reproducible listening candidate with synth, sampler, and named-bus examples under ignored `artifacts/saturator/`, using existing `writeRecording()` for raw float audio. Include onsets and both gentle/strong drive with sensible postgain. Keep the candidate sketch/settings portable for Step 2.3.
- [ ] Re-run existing references read-only and confirm none were modified. Record numerical/native results separately from pending human approval.

Verification:

```sh
pnpm exec turbo run build --filter=@web-audio/audio-engine --filter=@web-audio/fluid --force
pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/saturator.test.ts src/__tests__/worklets.test.ts src/__tests__/pre-envelope-effects.test.ts
pnpm --filter @web-audio/audio-regression audio:verify
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression format:check
```

The extended proposed test writes the candidate, for example
`artifacts/saturator/candidate-48000.wav`, without adding it to the case registry.
Repeated fresh renders must meet existing comparison tolerances. This proves
native behavior and parity, not real-time capacity or listening acceptance.

Manual: Inspect candidate metadata/settings and record paths for review. Optional
playback does not grant approval. A reproducible unexpected onset/automation
artifact blocks sound acceptance and needs diagnosis, not normalization or an
unannounced envelope delay.

Completion gate: Focused native coverage and unchanged-reference comparisons
pass at the chosen rates; candidate output is reproducible and ready for the
user; no unapproved reference or registry case has been created.
Evidence: Not run; use `evidence/native.md` if the independent reference method or selected diagnostics need supporting detail.

### Step 2.2 — Characterize a bounded real-time workload

Status: Pending
Requirements / acceptance: R7, R8; AC12. This is required characterization, not a CPU threshold or polyphony guarantee.
Depends on: Step 2.1.
Review boundary: A small opt-in diagnostic reusing the loopback harness, not a
new application, production telemetry system, or benchmark framework.

Expected files:

- `packages/audio-regression/src/__tests__/support/saturator/realtime.ts`, `realtime.html`, and `realtime-browser.ts` — proposed Node entry, minimal page, and browser-only real-time runner.
- `packages/audio-regression/README.md` — opt-in command, Start/Stop instructions, limitations.
- `evidence/realtime.md` — create when results exist; record reproducible workload/environment and observations, not a transcript.

Tasks:

- [ ] Add a narrowly scoped manual runner using existing `withHarness()`, a printed loopback URL, and the normal browser's real `AudioContext`. Start audio only after a user gesture. Use real Fluid/AudioEngine and a test-local structural driver typed with the already-exported `EngineClock`: timer lookahead based on `AudioContext.currentTime`, emitting the required prebar/bar/stop events, with explicit start/stop/destroy and timer cancellation. Do not import the transitive `@web-audio/clock` package, add a dependency, or reuse the offline scheduling driver as a real-time substitute.
- [ ] Provide finite runs at 4 and 16 overlapping saw/sub voices, one saturator per voice, plus a separate shared-bus run of the same source workload. Use fixed settings, at most 30 seconds per run, conservative authored output gain, visible Stop, and no external resources/MIDI output. Counts characterize this workload, not supported limits or sonic equivalence.
- [ ] Ensure Stop, timeout, setup/error, and page teardown release engine/context resources. The launcher closes its server in `finally`; an independent browser-side timeout bounds playback even if the launcher exits unexpectedly. Show the context's closed state and useful error diagnostics; keep all instrumentation test-only.
- [ ] Record browser/device/context sample rate and workload, actual elapsed playback, audible stability or glitches, and cleanup observations. Do not infer real-time capacity from offline render speed or a headless browser without audible output.

Verification — **proposed command, available only after adding this runner**:

```sh
pnpm --filter @web-audio/audio-regression build:deps
pnpm --filter @web-audio/audio-regression exec tsx src/__tests__/support/saturator/realtime.ts
```

Manual prerequisites: An interactive local browser with audio output, the user's
availability to audition if the executing agent cannot hear it, and an initially
low device volume. Open the printed URL, click Start for each workload, listen
for the bounded duration, and exercise Stop and a repeated start/stop. Expected:
real-time playback observations are recorded honestly; contexts close, owned
processors stop, and the loopback server closes when the launcher exits. This
uses no app `dev` command. No audible environment means this gate is `Blocked`,
not a headless/offline substitute.

Run package `check`, `lint`, and `format:check` after adding the helper. Review
setup/failure/finally paths; keep the helper out of ordinary tests and production
imports.

Completion gate: Required characterization and lifecycle observations exist.
Observed glitches remain explicit unresolved risks, never a claimed performance
pass. Resource leaks fail the cleanup gate. A material usability problem returns
to the affected implementation decision before acceptance; it does not authorize
an automatic switch from voice to bus saturation.
Evidence: Not run.

### Step 2.3 — Obtain listening approval and add one saved regression case

Status: Pending
Requirements / acceptance: R8; AC10 (final regression), AC11 (user and saved-reference acceptance); final reconciliation of AC1–AC12.
Depends on: Steps 2.1 and 2.2.
Review boundary: One reproducible, user-approved `saturator` case and its reference;
no unrelated recordings or tolerance changes.

Expected files:

- `packages/audio-regression/cases/saturator/{metadata.json,sketch.js}` — new case based on the approved candidate; use an explicit relative resource mapping to an existing local sample asset, with provenance, if needed.
- `packages/audio-regression/references/saturator/{render.wav,metadata.json}` — generated only through the named update command after explicit approval.
- `packages/audio-regression/README.md` and this feature's overview/status — accurate acceptance state and usage; update the roadmap checkbox only after acceptance.

Tasks:

- [ ] Present Step 2.1's reproducible candidate and the disclosed quality/performance limitations to the user. Ask for explicit listening approval; if changes are requested, revise and repeat the affected earlier gates. No approval means `Blocked` here, not implementation failure or assumed consent.
- [ ] After approval, add the same sketch/settings as one discovered `saturator` case; keep its local resources portable. Verify candidate identity/settings rather than silently substituting a different sound.
- [ ] Render the registered candidate and obtain renewed approval if it differs, then explicitly generate only the named saved reference. Add case and reference as one review/revert unit.
- [ ] Verify fresh output against the saved reference, have the user audition the saved WAV itself, and record the approval through the supervised workflow's approval state. Playback-command success is not approval.
- [ ] Run final broader gates, check the diff for unrelated reference changes, and reconcile the acceptance table. Update documentation only with outcomes actually established; preserve unresolved risks and deviations visibly.

Verification — case commands become valid after this step adds the case:

```sh
pnpm --filter @web-audio/audio-regression audio:render --case saturator
# Only after explicit candidate approval:
pnpm --filter @web-audio/audio-regression audio:update --case saturator
pnpm --filter @web-audio/audio-regression audio:verify --case saturator
```

Manual: The user listens first to the candidate, then to
`packages/audio-regression/references/saturator/render.wav`. On this Mac, `afplay`
can play the file; it does not establish who heard or approved it. Approval must
cover onset quality, useful drive/postgain control, and the representative voice
and bus examples. Existing listening evidence from the old spike is not approval
of these files.

Final integration commands, from repository root:

```sh
pnpm exec turbo run build --filter=@web-audio/audio-engine --filter=@web-audio/fluid --force
pnpm test
pnpm check
pnpm lint
pnpm --filter @web-audio/audio-regression format:check
git diff --check
```

Also run Prettier checks on changed files outside audio-regression, including
planning documents; avoid formatting unrelated files. Root `pnpm test` includes
the native package's tests and read-only verification of all discovered cases.
A pre-existing unrelated workspace failure is reported with its exact boundary
and disposition, not called green or silently waived.

Completion gate: User approval of candidate and saved reference is recorded,
all required behavioral checks pass, new registry/reference files form a complete
pair, unchanged references remain untouched, and broader results/limitations are
honest. No publication or deployment is part of this gate.
Evidence: Not run; use `evidence/acceptance.md` only for useful supporting detail and links to approval records.

Phase exit gate: After Step 2.3's final checks, confirm each final-acceptance row
points to passed owning evidence (or an explicitly accepted deviation), that
saved-reference listening is actually approved, and that AC12 contains real-time
rather than offline-only observations. Assess before declaring feature acceptance
or requesting final supervised approval. A blocked check is not a passing gate.
Evidence: Not run.

## Final acceptance

This is a coverage map, not another progress checklist. Evidence/status lives in
the owning step or phase gate; these links identify it without duplicating results.

| Spec acceptance ID | Owning step / gate  | Verification and expected result                                                                              | Evidence location                                                                                                                                                                                                                           |
| ------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1                | Step 1.2            | Typed authoring, defaults, serialization, replacement, valid attachments                                      | [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically)                                                                                                                                                              |
| AC2                | Step 1.2            | Invalid input/location/bus automation rejects; invalid schema update preserves pending configuration          | [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically)                                                                                                                                                              |
| AC3                | Steps 1.1, 2.1      | Independent stable ADAA math and selected native cross-checks                                                 | [Step 1.1](#step-11--implement-the-processor-and-its-disposable-adapter), [Step 2.1](#step-21--expand-native-verification-and-produce-listening-candidates)                                                                                 |
| AC4                | Steps 1.1, 2.1      | Unit block/channel invariance plus native stereo preservation                                                 | [Step 1.1](#step-11--implement-the-processor-and-its-disposable-adapter), [Step 2.1](#step-21--expand-native-verification-and-produce-listening-candidates)                                                                                 |
| AC5                | Steps 1.1, 1.2, 2.1 | DSP state table, binding after initial silence, and native zero/signed/mute behavior                          | [Step 1.1](#step-11--implement-the-processor-and-its-disposable-adapter), [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically), [Step 2.1](#step-21--expand-native-verification-and-produce-listening-candidates) |
| AC6                | Steps 1.2, 2.1      | Authored order, pre-ADSR/node ownership, and independent voices versus bus sum                                | [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically), [Step 2.1](#step-21--expand-native-verification-and-produce-listening-candidates)                                                                           |
| AC7                | Steps 1.1, 1.2, 2.1 | Sample-varying arrays, correct automation targets, bus step-zero transitions/stop, selected native motion     | [Step 1.1](#step-11--implement-the-processor-and-its-disposable-adapter), [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically), [Step 2.1](#step-21--expand-native-verification-and-produce-listening-candidates) |
| AC8                | Steps 1.2, 2.1      | Cancellation/completion/retirement/destruction and stale callbacks respect ownership and timing               | [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically), [Step 2.1](#step-21--expand-native-verification-and-produce-listening-candidates)                                                                           |
| AC9                | Steps 1.1, 1.2, 2.1 | Readiness rejects; partial allocation cleans; failed paths stay silent without fallback or unrelated teardown | [Step 1.1](#step-11--implement-the-processor-and-its-disposable-adapter), [Step 1.2](#step-12--wire-the-public-effect-voices-and-named-buses-atomically), [Step 2.1](#step-21--expand-native-verification-and-produce-listening-candidates) |
| AC10               | Steps 0.1, 2.1, 2.3 | Baseline followed by unchanged existing references/events and final broader regression                        | [Step 0.1](#step-01--record-the-source-built-baseline), [Step 2.1](#step-21--expand-native-verification-and-produce-listening-candidates), [Step 2.3](#step-23--obtain-listening-approval-and-add-one-saved-regression-case)                |
| AC11               | Steps 2.1, 2.3      | Fresh repeatable native candidates plus explicit user listening of candidate and saved reference              | [Step 2.1](#step-21--expand-native-verification-and-produce-listening-candidates), [Step 2.3](#step-23--obtain-listening-approval-and-add-one-saved-regression-case)                                                                        |
| AC12               | Step 2.2            | Documented bounded real-time observations and cleanup, with no invented capacity claim                        | [Step 2.2](#step-22--characterize-a-bounded-real-time-workload)                                                                                                                                                                             |

## Rollback and recovery

- No persisted-schema migration, service deployment, or irreversible product action is required. Revert source changes by review unit and rebuild generated packages before re-testing; do not restore stale `dist` as source.
- Revert Step 1.2's schema, builder, both runtime consumers, discovery, and fixtures together. If reverting Step 1.1 too, revert dependent integration first or in the same unit. Never leave an authored discriminator without its consumer.
- Validate the new consumer path before removing any genuinely obsolete wiring. Existing filter/gain effects remain; there is no shipped native saturator to delete. Search remaining consumers before deleting integration helpers; do not pull code from archived branches as a cleanup prerequisite.
- Keep the Step 2.3 case and reference together on rollback. Reference updates use ordinary WAV/JSON writes, not an atomic filesystem transaction. If an update fails partway, stop; inspect the named case's pair, restore a known complete pair or remove only the newly created incomplete pair, and rerun the approved named update when authorized. Never regenerate unrelated references as recovery.
- Processor failure remains a silent affected path, without fallback/retry. Dispose its owned resources and preserve unrelated owners. Broader failed-commit rollback is outside scope; fix targeted leaks without claiming transactional engine recovery.
- If quality/performance is materially inadequate, keep acceptance pending, retain reproducible evidence, and ask about the affected choice rather than silently adding modes, compensation, or a new architecture.

## Deferred checks and accepted deviations

- None accepted. Step 0.1 and the Phase 0 exit-gate assessment are verified with baseline evidence; Step 1.1 is verified with its scoped evidence; Steps 1.2–2.3 and the Phase 1/2 gates remain Pending/not run.
- Human listening/reference approval and the interactive real-time run require user/environment access later; they are explicit gates, not implicitly waived checks.
- Cross-browser/device certification, a numerical real-time SLA, maximum supported polyphony, compressor/main effects, and other spec non-goals remain outside this plan.
