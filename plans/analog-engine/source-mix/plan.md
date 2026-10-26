# Synth Source Mixing Implementation Plan

## Status and governing source

- Governing spec: [spec.md](spec.md).
- Input baseline: Existing [parameter shorthand](../../completed/parameter-shorthand/plan.md) and [Fluid pattern-input](../../fluid-pattern-inputs/plan.md) implementations. Their recorded verification is prerequisite evidence, not a fresh source-mix baseline.
- Delivery state: Step 1.1 and Step 1.2 are verified; Phase 1 is complete and Phase 2 remains pending.
- Acceptance still pending: Phase 2 composed lifecycle follow-ups, documentation, registered references, final native acceptance, and human listening review remain.
- Blockers: None for implementation. Native checks require the existing Chromium harness; final audio acceptance requires a human reviewer.

Step statuses below are the authoritative execution record. A phase is complete
only when its step gates and phase exit gate pass. Task checkboxes do not prove
verification. `Verified` means the scoped checks and implementation review passed,
not that publication or unrelated work is approved. In supervised execution,
record manual approvals in extension state rather than task checkboxes.

## Execution constraints

- All paths and commands are relative to the repository root unless stated otherwise. This plan does not authorize execution.
- Preserve unrelated work and the existing `docs/reference/` tree. Expected files describe the relevant change surface, not permission to overwrite other edits.
- Keep the spec and step IDs stable. Escalate product conflicts rather than changing the contract to simplify implementation.
- Reuse `_applyParamSchema()`, existing envelope/LFO/MIDI helpers, and multi-source voice cleanup. Add only source-specific configuration, connections, and static numeric coercion. Do not add automation flooring, a new gain engine, a generic source framework, or another renderer.
- Use existing `SingleSlotAudioParamInput` and `resolveAudioParamValue()` for every new gain slot, including gain-only calls. Accept scalar, shorthand/reusable shorthand, numeric structured value, and permitted direct random/audio sources; reject raw arrays and extra pattern arguments. Do not add a parallel source-gain input adapter or change the shared parser.
- Clamp only new main/sub **static** gain values below zero, uniformly after decoding scalars, shorthand, structured values, or direct static schemas. Do not mutate reusable values or caller schemas. Random-cycle, envelope, LFO, MIDI CC, noise, and effect behavior stays unchanged.
- Use optional `sourceGain` and `sub` on the common synth schema, a native sub oscillator, and existing basic-waveform levels. Keep these fields off sampler schemas and preserve omitted-field compatibility.
- Include focused tests with each implementation increment. Extend existing suites/fakes instead of reproducing the gain-automation matrix. Put new test-only helpers under the relevant suite's `support/`; production code must not import test modules. Keep tests in TypeScript checking.
- Use package-manager commands only if dependencies genuinely become necessary; none are anticipated. Do not edit lockfiles manually, run app `dev` servers, publish, commit, or deploy.
- Evidence entries should summarize the result and material limitations. Add supporting notes only for substantive baseline, native, failure, or listening evidence; do not create empty evidence files or store transcripts in this plan.

### Existing implementation and verification seams

Static inspection identifies these reuse points; it does not establish a passing baseline:

- Fluid's `drome.ts` owns engine overloads; `instruments/synth-base.ts` shares synth serialization. The concrete constructors feed this shared builder without exposing synth controls on samplers. `inputs/types.ts` defines `SingleSlotAudioParamInput`; `parameters/resolve-audio-param.ts` already supplies `resolveAudioParamValue()` for fixed slots. Numeric decoding and structured snapshot ownership are implemented, not new work for this SOW.
- Schema's `index.ts` and `validate-graph.ts` own optional fields and validation. Validation is not a normalization pass: accept finite negative static gain schemas and apply the zero floor when binding these new gain targets, without mutating caller schemas or shared parameter sources.
- Engine `instruments/synthesizer.ts` resolves common detune once per note and selects basic/unison sources. `instrument.ts` owns source connection, effects, amplitude envelope, local bindings, and completion. Its current single detune target needs a small fan-out extension, not a second resolver. Envelope minimum/maximum already use `NumberPattern`; `_resolveDetune()` retains the event-resolved envelope for scheduling. Reuse that result for both targets and current schema fixtures, not scalar-minimum compatibility code.
- `instruments/__tests__/synthesizer.test.ts`, `noise.test.ts`, and `voice-sources.test.ts` already cover scheduling, topology, event identity, binding cleanup, and multi-source failures. Engine `src/__tests__/engine.test.ts` covers invalid-update preservation and graph retirement.
- `packages/audio-regression` already supplies `withRenderer()`, numerical helpers in `src/__tests__/support/noise.ts`, native unison/noise tests, and individually reviewed references. Its scripts build dependencies; direct `exec vitest` commands need `build:deps` first.
- Fluid's public export is its default Drome class. `build` emits declarations; preserving only source-level inferred types is insufficient if declarations fail to build.

### Verification conventions

Commands below use existing package scripts. Test files identified as **new** are
planned additions, runnable only after the owning step creates them. An ordinary
`vitest run` does not prove type checking; use package `check` separately.

At implementation step gates, run the named focused tests and `check`/`lint` for
the touched packages, plus Prettier on the files changed by that step and
`git diff --check`. Phase gates broaden the checks only as specified. Record
pre-existing failures separately; neither a baseline failure nor a skipped check
is automatically an accepted deviation.

## Phase overview and delivery boundary

| Phase | Outcome                                                                  | Dependencies                          | Exit gate                                                                           |
| ----- | ------------------------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------- |
| 0     | Establish the existing source/voice parity baseline                      | Existing workspace and native harness | Recorded focused baseline and unchanged reference results                           |
| 1     | Main-source gain and sub work from public authoring through native audio | Phase 0                               | Both vertical slices compose; focused suites, declarations, and package checks pass |
| 2     | Complete cross-layer ownership, user documentation, and audio acceptance | Phase 1                               | Whole-feature regressions and human-reviewed native sound                           |

Delivery boundary: **One feature-complete PR.** Phases are review increments,
not separate product releases. Step 1.1 is an atomic schema/builder/runtime
main-gain slice; Step 1.2 is the equivalent sub slice. Do not merge a builder
that serializes an ignored control, or revert only the runtime half of a slice.
A new registered audio case and its reviewed reference are another atomic unit.

## Phase 0 — Existing behavior baseline

Outcome: Reproducible evidence for existing source levels, voice ownership, and
selected native references before changing the shared voice path.
Depends on: Existing workspace dependencies; local Chromium installation for native checks.
Review boundary: Read-only characterization. No feature code or reference updates.

### Step 0.1 — Record the focused baseline

Status: Verified
Requirements / acceptance: R9; AC13 (baseline only; final parity/listening belongs to Step 2.3).
Depends on: None.
Review boundary: Existing commands and environment readiness, not a new harness or baseline repair project.

Expected files:

- This plan's evidence entry; `evidence/0.1.md` only if failures or environment details warrant a supporting note.

Tasks:

- [x] Record the starting revision/worktree and preserve unrelated changes.
- [x] Build runtime dependencies, then run existing schema, Fluid positional-input/unison/noise, and engine source/voice suites below. Confirm the current single-slot and patterned-envelope contracts rather than reconstructing pre-shorthand behavior.
- [x] Verify selected approved references covering basic, unison, and pre-envelope sampler playback.
- [x] Separate existing failures or missing prerequisites from regressions. Fix an affected prerequisite only through a separately scoped decision; do not regenerate references to manufacture a baseline.

Verification:

- Automated: `pnpm --filter @web-audio/audio-regression build:deps` prepares built workspace imports.
- Automated: `pnpm --filter @web-audio/schema test:ci`; `pnpm --filter @web-audio/fluid exec vitest run src/__tests__/positional-pattern-inputs.test.ts src/instruments/__tests__/unison.test.ts src/instruments/__tests__/noise.test.ts`; `pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/__tests__/synthesizer.test.ts src/instruments/__tests__/noise.test.ts src/instruments/__tests__/voice-sources.test.ts`. These establish the relevant existing contract baseline, not the new feature.
- Native: Run `pnpm --filter @web-audio/audio-regression audio:verify --case sine`, then the same command with `--case unison` and `--case pre-envelope-sampler`. Expect unchanged reviewed recordings under existing tolerances.
- Manual: Not needed for characterization. If Chromium is unavailable, stop the native gate and request installation approval before using the existing `browser:install` script; do not install during plan authoring.

Completion gate: Focused checks and selected references pass, or affected work is explicitly blocked with the observed failure recorded. No green-baseline claim from source inspection alone.
Evidence: [evidence/0.1.md](evidence/0.1.md) — complete baseline: 7 focused test files and 197 tests passed; selected `sine`, `unison`, and `pre-envelope-sampler` references passed unchanged. The initial headed-executable preflight and one concurrent sampler invocation were classified as harness false positives/contention and the exact native check was rerun successfully.

Phase exit gate: After Step 0.1, review baseline results and prerequisite availability before advancing. Unresolved failures affecting source/voice parity block dependent work; unrelated failures require explicit disposition, not silent waiver. Evidence lives in Step 0.1 or its linked note.
Evidence: Complete; Step 0.1 verified. Phase 0 exit gate passed. No human listening was required for characterization; final audio acceptance remains Step 2.3.

## Phase 1 — End-to-end source controls

Outcome: Both controls can be authored, validated, rendered, and cleaned up using
the existing parameter and voice machinery.
Depends on: Phase 0 exit gate.
Review boundary: Two working vertical slices, each with its own tests and native
smoke proof; use existing shorthand/structured inputs without new grammar,
normalization infrastructure, oscillator builders, or unrelated DSP changes.

### Step 1.1 — Deliver main-source gain, including gain-only synth creation

Status: Verified
Requirements / acceptance: R1–R4, R6–R9; AC1 (main-gain forms), AC3–AC6 (main-gain portions), AC9/AC12 (main-gain portions). Sub portions belong to Step 1.2; composed lifecycle and final native acceptance belong to Phase 2.
Depends on: Step 0.1 and Phase 0 exit gate.
Review boundary: Atomic main-gain schema, authoring, runtime binding, and focused proof.

Expected files:

- `packages/schema/src/index.ts`, `validate-graph.ts`, `validate-graph.test.ts` — optional synth-only `sourceGain`, existing AudioParam validation, and sampler rejection.
- `packages/fluid/src/drome.ts`, `instruments/synth-base.ts`, `instruments/synthesizer.ts`, `instruments/unison-synthesizer.ts` — factory dispatch, constructor configuration, and shared serialization.
- Existing `packages/fluid/src/inputs/types.ts` and `parameters/resolve-audio-param.ts` — reuse `SingleSlotAudioParamInput` and `resolveAudioParamValue()`; no new source-gain adapter/type is planned.
- `packages/fluid/src/__tests__/source-mix.test.ts` — new public-factory/schema/type coverage.
- `packages/audio-engine/src/instruments/instrument.ts`, `synthesizer.ts`, `__tests__/synthesizer.test.ts`; `packages/audio-engine/src/__tests__/engine.test.ts` — source-local gain wiring and validation-before-update assertions.
- `packages/audio-regression/src/__tests__/source-mix.test.ts` — new native integration suite, initially main-gain checks only.

Tasks:

- [x] Add optional `sourceGain` to common synth schemas and validate it with existing AudioParam checks. Reject the known field on samplers; omitted fields and finite negative static schemas remain valid.
- [x] Implement default, gain-only, selector-only, and selector-plus-gain factory forms, including explicit `undefined` selectors. For a sole string, exact supported selectors take precedence; all other strings use existing numeric shorthand gain decoding. With two arguments, require a selector/undefined followed by gain. Place selector-specific overloads ahead of general gain-string overloads so basic/unison types remain concrete; reject extra arguments and raw gain arrays.
- [x] Resolve each gain with existing `resolveAudioParamValue()` and pass configuration through the concrete constructors/shared synth serializer. Reuse `SingleSlotAudioParamInput`, existing shorthand/structured decoding, direct-source permissions/lifecycle, and the MIDI `gain` context. Do not reinterpret the shared amplitude envelope or add a new fluent gain setter.
- [x] Add an owned, stereo-preserving main-source gain stage before the common effect inlet when configured. Register its LFO through the existing additional-parameter list and bind using existing helpers. Apply static-only numeric coercion locally so direct schemas also resolve below-zero entries to zero; leave automation and noise/effect gains untouched. Preserve the omitted-control path.
- [x] Add focused factory/type/schema and runtime target tests for selector-versus-shorthand dispatch, equivalent shorthand/reusable/structured gain patterns, negative/above-one static values across representations/direct schemas, initial-zero automation, invalid update preservation, and unchanged MIDI/duck behavior. Reuse existing positional-input/ownership tests for rejected arrays/wrapper misuse; include a setup-failure check proving the new gain node/source is released.
- [x] Add native main-source comparisons: omission versus unity, zero versus silence, gain-only versus explicit sine, scaled unison stereo difference, and main-zero noise preservation. These prove source-level scaling is consumed by the real runtime, not just serialized.

Verification:

- Automated: `pnpm --filter @web-audio/schema test:ci`; `pnpm --filter @web-audio/fluid exec vitest run src/__tests__/source-mix.test.ts src/instruments/__tests__/unison.test.ts`; `pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/__tests__/synthesizer.test.ts src/instruments/__tests__/noise.test.ts src/__tests__/engine.test.ts`. The new factory suite includes compile-time assertions checked by Fluid `check`, including known selector literals versus general string gain inputs. Reuse `src/__tests__/positional-pattern-inputs.test.ts` and `src/__tests__/structured-inputs.test.ts` as existing test seams; do not copy their full input/ownership matrices.
- Native: After `pnpm --filter @web-audio/audio-regression build:deps`, run `pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/source-mix.test.ts` (new suite). Expect matching default/unity and default-sine spellings, silent zero gain, preserved/scaled stereo difference, unchanged noise with zero main gain, and finite output.
- Quality: Run `check` and `lint` in schema, Fluid, and audio-engine; `pnpm --filter @web-audio/fluid build` must emit valid public declarations. Formatting and whitespace follow the shared conventions.
- Manual: Review overloads and gain-target placement. Human sound approval remains Step 2.3; mocks are not native playback evidence.

Completion gate: Main gain is consumed correctly from both public factory forms through native audio; direct schema behavior, omitted-field parity, cleanup smoke coverage, and typed declarations pass together. No publicly accepted but ignored setting.
Evidence: [evidence/1.1.md](evidence/1.1.md) — verified focused implementation, quality, declaration, cleanup, and native checks; final human listening remains a Phase 2.3 requirement.

### Step 1.2 — Deliver the pitched sub as one owned source layer

Status: Verified
Requirements / acceptance: R1–R9; AC1–AC3 (remaining authoring coverage), AC4–AC6/AC9/AC12 (remaining sub portions), AC7–AC8 (core topology/pitch), AC10–AC11 (basic ownership smoke). Step 2.1 owns composed lifecycle/failure coverage; Step 2.3 owns final native stereo/pitch/timing/listening proof.
Depends on: Step 1.1.
Review boundary: Atomic sub schema, builder, source creation, detune connection, and focused tests; no lifecycle framework rewrite.

Expected files:

- `packages/schema/src/index.ts`, `validate-graph.ts`, `validate-graph.test.ts` — optional `sub` with canonical waveform, fixed octave, and gain.
- `packages/fluid/src/instruments/synth-base.ts`, `inputs/waveform.ts` only if a small shared alias guard is needed — positional parsing and canonical serialization using the existing single-slot resolver.
- `packages/fluid/src/instruments/__tests__/sub.test.ts` — new domain-local API/default/replacement tests; extend the new public `src/__tests__/source-mix.test.ts` for fluent types.
- `packages/audio-engine/src/instruments/instrument.ts`, `synthesizer.ts`, `sources/types.ts`, `sources/supersaw-source.ts` — per-source gain paths, native sub, common-detune fan-out, and constructor-boundary cleanup.
- `packages/audio-engine/src/instruments/__tests__/synthesizer.test.ts`, `voice-sources.test.ts`, `noise.test.ts`; `src/sources/__tests__/supersaw-source.test.ts`; `src/__tests__/engine.test.ts` — extend existing fakes and negative graph-update coverage.
- `packages/audio-regression/src/__tests__/source-mix.test.ts` — extend the native suite for sub smoke checks.

Tasks:

- [x] Implement the three required-gain sub forms, validating the entire call before replacing configuration. Canonicalize all four waveforms/aliases, accept only static `-1`/`-2`, reset omitted waveform/octave defaults, and resolve gain through `resolveAudioParamValue()`. Accept shorthand/reusable/structured patterns in every gain position; reject missing/extra arguments, raw arrays, invalid shorthand, and unsupported wrapper/source combinations. Keep the method on `SynthBase`, not shared `Instrument`.
- [x] Add optional synth-only sub schema validation; reject the field on samplers. Reuse existing single-slot input types/resolution and Step 1.1's local static coercion. Emit existing pattern schemas without wrapper objects; add no new gain semantics or exported oscillator builder.
- [x] Create exactly one native oscillator per musical note at the selected octave, centered and independent of unison count/spread/width. Resolve common detune once and bind that same resolved trajectory, including its cached resolved envelope, to main and sub targets. Both envelope bounds use the current per-event pattern lookup; do not reroll patterns/randomness, migrate envelope schemas, or run another event scheduler.
- [x] Give main and sub separate gain paths feeding the existing effects/ADSR inlet, alongside unchanged noise. Keep source creation inside a cleanup boundary: if a later source constructor, parameter setup, or start fails, every already-created sibling must be owned and released. Extend the existing scheduling seam only as needed.
- [x] Add focused tests for defaults/replacement/aliases, single-slot representation parity and rejection, chord sub counts, octave pitch, static coercion without mutating reused patterns, additional LFO discovery, common-detune target fan-out, patterned-bound/long layer envelopes with unchanged stop time, main-zero/sub-audible behavior, and unchanged event/MIDI/duck counts. Include early completion and partial-setup/cancel smoke checks now, not solely in Phase 2.
- [x] Extend native smoke tests to render each sub waveform and both octave choices, check sub audibility with main gain zero, and confirm unchanged main/noise output when the sub contribution is zero.

Verification:

- Automated: `pnpm --filter @web-audio/schema test:ci`; `pnpm --filter @web-audio/fluid exec vitest run src/__tests__/source-mix.test.ts src/instruments/__tests__/sub.test.ts src/instruments/__tests__/unison.test.ts src/instruments/__tests__/noise.test.ts`; `pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/__tests__/synthesizer.test.ts src/instruments/__tests__/voice-sources.test.ts src/instruments/__tests__/noise.test.ts src/sources/__tests__/supersaw-source.test.ts src/__tests__/engine.test.ts`.
- Native: Rebuild dependencies and run `pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/source-mix.test.ts`. These are working audio smoke tests, not final listening approval or a complete gain-helper retest.
- Quality: Run `check`/`lint` for schema, Fluid, and audio-engine; build Fluid declarations. Update affected mocks/consumers with the seam change; leave sampler offset/start handling intact.
- Manual: Review that the graph gives only the main source its main gain, only the sub its sub gain, and that every created source reaches ownership before a subsequent failing operation.

Completion gate: Sub authoring, typed chaining, canonical schemas, pitched source creation, independent mixing, shared timing, and cleanup smoke checks work in the same review unit. The no-sub path remains usable and both native source controls compose.
Evidence: [evidence/1.2.md](evidence/1.2.md) — verified focused sub implementation, package quality, declarations, and native smoke checks.

Phase exit gate: After Step 1.2's checks, run full schema/Fluid/audio-engine package `test:ci` scripts, then `pnpm exec turbo run build check lint --filter=@web-audio/fluid --filter=@web-audio/audio-engine --filter=@web-audio/schema`. Rebuild and run the source-mix native suite plus existing native `src/__tests__/noise.test.ts` and `src/__tests__/unison.test.ts` together. Expect working declarations, unchanged existing suites, and both new controls composed without regressions. Review results before advancing; evidence stays in Steps 1.1/1.2 with a concise composition result here.
Evidence: Phase 1 exit passed; full package tests, workspace filtered quality gate, dependency rebuild, and combined native source-mix/noise/unison suites passed. Detailed results are in [evidence/1.2.md](evidence/1.2.md).

## Phase 2 — Composition, documentation, and audio acceptance

Outcome: Complete ownership/failure coverage, discoverable public documentation,
and native/human acceptance for the combined feature.
Depends on: Phase 1 exit gate.
Review boundary: Close the specific new integration risks and deliver examples;
no duplicate parameter/DSP certification or blanket reference updates.

### Step 2.1 — Close composed voice ownership and event boundaries

Status: Pending
Requirements / acceptance: R4–R9; AC4 (binding/lifetime completion), AC8 (detune fan-out completion), AC9–AC12 (composed lifecycle/update coverage).
Depends on: Step 1.2 and Phase 1 exit gate.
Review boundary: Existing voice/engine test seams with main+sub+noise enabled; minimal fixes only where new composition reveals a defect.

Expected files:

- `packages/audio-engine/src/instruments/__tests__/synthesizer.test.ts`, `voice-sources.test.ts`, `noise.test.ts`; `src/__tests__/engine.test.ts` — extend existing ownership, binding, and graph-update assertions.
- Relevant suite `support/` modules only if small reusable fakes need extraction; do not create a parallel fake-node framework.
- `packages/audio-engine/src/instruments/instrument.ts`, `synthesizer.ts` — bounded integration fixes if needed; already covered helpers are not a refactoring target.

Tasks:

- [ ] Exercise main/sub/noise sibling completions in representative different orders, stale callbacks, future cancellation while another voice sounds, and repeated destruction. Assert one cleanup and no early disconnection of surviving audio.
- [ ] Extend existing failure injection for sub construction/setup/start after main allocation and for main unison processor failure with a surviving sub. Errors must remain visible; sibling lifetime and retiring `finished` resolution must remain correct.
- [ ] Verify new gain/detune bindings detach per voice without stopping a surviving voice's shared LFO/MIDI source. Use existing binding fixtures and focused target/subscription assertions, not another smoothing/oscillator test matrix.
- [ ] Compose releasing source layers with graph replacement and original routing; verify invalid new schemas preserve valid pending/active configuration. Keep existing MIDI velocity and duck scheduling unchanged with main gain zero and a chord sub.

Verification:

- Automated: `pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/__tests__/synthesizer.test.ts src/instruments/__tests__/voice-sources.test.ts src/instruments/__tests__/noise.test.ts src/__tests__/engine.test.ts` plus engine `check`/`lint` and touched-file formatting. Expect exact ownership/binding/event outcomes, not merely no thrown error.
- Manual: Review failure cleanup around source creation, especially errors before `_scheduleVoice()` currently takes ownership. No separate live acceptance is needed for deterministic ownership assertions; native timing/stereo is Step 2.3.

Completion gate: The new source composition cannot leak resources, truncate siblings, multiply musical events, or retain an old graph indefinitely under the scoped failure/cancellation cases.
Evidence: Not run.

### Step 2.2 — Document the public source-mixing contract

Status: Pending
Requirements / acceptance: R1–R6, R9; user-facing documentation supporting AC1–AC9 and AC13. Behavior verification remains owned by the implementation/native gates.
Depends on: Step 1.2 and Phase 1 exit gate; can be prepared independently of Step 2.1.
Review boundary: Current public API and examples; preserve existing reference work and do not document deferred syntax as shipped.

Expected files:

- `docs/reference/instruments/synth.md`, `sub.md` — new focused factory/sub pages following existing instrument reference conventions.
- `docs/reference/instruments/index.md` — targeted factory/sub links and availability updates; preserve unrelated in-progress content.
- `plans/analog-engine/roadmap.md` — align the delivered forms and link to this plan; update delivery checkbox only after final acceptance.

Tasks:

- [ ] Document gain-only/default/basic/unison factory forms and the three required-gain sub forms, with selector-versus-shorthand dispatch, aliases, replacement defaults, existing single-slot inputs, raw-array rejection, and synth-only availability.
- [ ] Explain main/sub gain versus shared `.gain()`/`.adsr()`, additive headroom, centered common-detuned sub, and shared lifetime. State static negative-to-zero coercion and unchanged automation semantics directly, without interview/revision narration.
- [ ] Include examples for a muted main with audible sub, stereo unison plus sine sub, layer envelope use, and equivalent shorthand / `d.sh()` / `d.str()` gain patterns. Show `d.str(0.3, 0.5)` as successive bars and `d.str([0.3, 0.5])` as within-bar values. Keep only `d.osc()` composition and other unimplemented features deferred.
- [ ] Validate examples through the existing Fluid public evaluation path and cross-check the reference index/relative links. Add a small public API example assertion only if existing source-mix tests do not already exercise the example's form.

Verification:

- Automated: Run the Fluid source-mix suite and any added example assertions, Fluid `check` if tests changed, and `pnpm exec prettier --check docs/reference/instruments/synth.md docs/reference/instruments/sub.md docs/reference/instruments/index.md plans/analog-engine/roadmap.md`; `git diff --check`.
- Manual: Read the pages without the conversation. Confirm all examples use accepted syntax and correctly distinguish source gain, amplitude gain, and deferred functionality; follow the new relative links.

Completion gate: A reader can author the delivered mix without interview context; examples match implemented schema/API behavior and no existing documentation edits are lost.
Evidence: Not run.

### Step 2.3 — Accept native mixing, parity, and sound

Status: Pending
Requirements / acceptance: R3–R9; AC6–AC8/AC10 (remaining native portions), AC13 (full parity/listening); final integration of AC1–AC12 from their owning gates.
Depends on: Steps 2.1 and 2.2.
Review boundary: Real runtime composition and one bounded reviewed sound example; unchanged gain helpers are not being recertified.

Expected files:

- `packages/audio-regression/src/__tests__/source-mix.test.ts`; `src/__tests__/support/source-mix.ts` only if needed — extend existing native suite/helpers, not a new renderer.
- `packages/audio-regression/cases/source-mix/{metadata.json,sketch.js}` and `references/source-mix/{metadata.json,render.wav}` — new registered case and individually reviewed reference, delivered atomically.
- `packages/audio-regression/README.md` — focused native coverage/command note; no rewrite of existing reference policy.
- `evidence/2.3.md` — create when substantive native/repeatability/listening results exist; link it from this step. Other evidence remains at its owning gate.

Tasks:

- [ ] Complete native comparisons using deterministic sketches: unity/omitted main parity, one representative shorthand-versus-structured mix comparison, main+sub additive sum with linear effects, preservation of main stereo difference when adding centered sub, and pitch tracking under common detune independent of unison count/spread/width. Reuse prior smoke renders and existing numeric helpers; assert nonempty observation windows and unchanged tolerances.
- [ ] Check representative basic/unison/sub/noise starts and stops at non-quantum-aligned offsets, main-zero/sub-audible output, and shared release bounds. Use 48 kHz for the main suite and a small 44.1 kHz timing/pitch smoke check, not a full waveform-by-automation-by-rate matrix. Render identical sketches in fresh contexts to establish repeatability.
- [ ] Register one short source-mix listening case covering all sub waveforms and a useful unison-plus-centered-sub passage, at conservative overall amplitude. Its source uses fixed event/random inputs and existing effects, not unshipped saturation or automatic limiting.
- [ ] Render the candidate and have a human listen for intended octave balance, centered low end, preserved upper-source stereo, useful waveform levels, and abnormal clicks. Address defects before reference acceptance. Add/update only this case's reference with explicit approval; never regenerate existing references to obtain a pass.
- [ ] Run the final workspace regression/quality gates below and verify existing approved recordings remain unchanged. Record a bounded representative overlapping-voice render's duration/polyphony/wall time alongside native results; this is characterization, not a new performance SLA or benchmark harness.

Verification:

- Automated native: `pnpm --filter @web-audio/audio-regression build:deps`, then `pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/source-mix.test.ts`. Expect finite, repeatable output and the specific additive/stereo/pitch/timing invariants; signed automation remains on the existing path.
- Candidate/reference workflow: Use existing `audio:render --case source-mix` for candidate playback. After review, use `audio:update --case source-mix`, inspect/listen to the resulting `references/source-mix/render.wav`, and run `audio:verify --case source-mix`, all via `pnpm --filter @web-audio/audio-regression`. Stage the registered case and its approved reference as one unit; missing or unapproved reference keeps this gate pending.
- Manual: Requires the local Chromium harness, audio playback equipment, and a human reviewer. Play the generated candidate at a safe level, then the final reference; record who listened and the outcome when known. Playback-command success and numerical agreement do not constitute listening approval.
- Final automated gate: `pnpm test`, `pnpm check`, and `pnpm lint` from the root after dependency builds, plus Prettier on changed files and `git diff --check`. Root tests already freshly verify registered audio references; do not add another redundant all-case verify pass. No unrelated reference bytes may change.

Completion gate: Native composition assertions, unchanged approved references, workspace quality gates, and the new case's human listening acceptance pass. A missing reviewer or browser keeps the applicable gate blocked, not verified. No implementation-complete claim while required listening remains pending.
Evidence: Not run.

Phase exit gate: After Step 2.3's checks, review the acceptance map, each owning gate's evidence, unchanged existing reference files, public documentation, and any recorded baseline failures. The full one-PR feature is ready only when all required outcomes and listening acceptance are satisfied. Evidence stays in the owning steps, with substantive final native/listening details linked from Step 2.3.
Evidence: Not run.

## Final acceptance

This table points to the authoritative owning gates; it is not a second progress
checklist or a claim that verification has occurred.

| Spec acceptance ID | Owning step / gate           | Verification and expected result                                                                                              | Evidence location                                       |
| ------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| AC1                | Steps 1.1, 1.2; Phase 1 exit | All factory/single-slot forms and selector-string precedence preserve fluent types and sampler boundaries; declarations build | Steps 1.1/1.2 evidence                                  |
| AC2                | Step 1.2                     | Sub defaults, aliases, and replacement leave one canonical layer                                                              | Step 1.2 evidence                                       |
| AC3                | Steps 1.1, 1.2               | Invalid arguments/configuration fail without partial mutation                                                                 | Steps 1.1/1.2 evidence                                  |
| AC4                | Steps 1.1, 1.2, 2.1          | Existing parameter machinery targets the new gains; dynamic zero and shared lifetime remain correct                           | Owning step evidence                                    |
| AC5                | Steps 1.1, 1.2               | Equivalent scalar/shorthand/structured/direct static gains resolve negatives to zero without mutating reusable patterns       | Steps 1.1/1.2 evidence                                  |
| AC6                | Steps 1.1, 1.2, 2.3          | Independent pre-effects gains, baseline unity, unchanged compensation/noise, native additive mix                              | Owning step evidence; final native note linked from 2.3 |
| AC7                | Steps 1.2, 2.3               | Centered sub preserves main stereo and is independent of unison controls                                                      | Steps 1.2/2.3 evidence                                  |
| AC8                | Steps 1.2, 2.1, 2.3          | One sub per chord tone follows octave/common detune without rerolling; selected native pitch checks                           | Owning step evidence                                    |
| AC9                | Steps 1.1, 1.2, 2.1, 2.3     | No extra notes/velocity/duck events; main-zero sub/noise is audible in native audio                                           | Owning step evidence                                    |
| AC10               | Steps 1.2, 2.1, 2.3          | Shared scheduling/cancellation, sibling completion, stale callbacks, native timing                                            | Owning step evidence                                    |
| AC11               | Steps 1.2, 2.1               | Setup/source failures, retirement, and repeated destruction release whole-voice ownership correctly                           | Steps 1.2/2.1 evidence                                  |
| AC12               | Steps 1.1, 1.2, 2.1          | Omitted schemas work; malformed new fields/sampler misuse fail without replacing valid graphs                                 | Owning step evidence                                    |
| AC13               | Step 2.3; Phase 2 exit       | Repeatable native mixes, unchanged existing recordings, and human-approved sound                                              | Step 2.3 evidence and its linked native/listening note  |

## Rollback and recovery

- No persisted-data migration, deployment, or irreversible external operation is planned. The complete feature can be reverted as one PR.
- For internal review rollback, revert sub Step 1.2 with its dependent tests/docs/cases before reverting main-gain Step 1.1. Within either slice, keep schema, builder, consumer, and tests together; never leave a serialized control ignored by its runtime.
- A new registered source-mix case and its reference must be removed/reverted together. Preserve all pre-existing approved references and tolerances. Failed candidate rendering or listening does not authorize replacement of unrelated recordings.
- A failed implementation gate stays pending/blocked while its scoped defect is fixed and rerun. Report pre-existing unrelated failures separately; accepted deviations require an explicit owner/rationale and are not recorded as passed checks.
- Preserve unrelated worktree edits and prerequisite shorthand/pattern-input implementations during fixes or rollback. Do not use destructive repository resets.

## Deferred checks and accepted deviations

- No accepted deviations or waived acceptance criteria.
- Human listening is a required Step 2.3 gate, not a presumed approval. Chromium installation, if needed, requires separate permission before running the existing install command.
- Packed publication, deployment, hardware MIDI interoperability certification, exhaustive cross-browser/rate matrices, and a new CPU SLA are outside this PR. Local binding/event assertions plus native Chromium composition meet this feature's verification boundary.
- `d.osc()` composition, additional octaves, new unison waveforms, independent layer lifetimes, and new effects remain deferred by the spec. Existing shorthand and structured gain inputs are included; no new parser/evaluator work is planned.
