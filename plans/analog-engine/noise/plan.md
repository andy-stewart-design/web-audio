# Per-voice Noise Layers Implementation Plan

## Status and governing source

- Governing spec: [spec.md](spec.md), R1–R10 and AC1–AC14; the roadmap/interview supply the decisions recorded there.
- Delivery state: Planning only. This replaces the provisional checklist; that draft had no stable step IDs, completed tasks, or implementation evidence to preserve.
- Acceptance or release still pending: All implementation, automated verification, DSP characterization, performance evidence, documentation, and human listening approval.
- Blockers: No product decision blocks planning. Execution still requires an authorized implementation session; native gates require the pinned Chromium installation, which is available for this baseline, and final audio approval needs a human listener. Step 0.1 found no unexplained baseline failures.

Step statuses below are the authoritative execution record. A phase is complete
only after its step completion gates and phase exit gate pass. Checkboxes record
tasks, not passed gates. `Verified` means the scoped gate and implementation
review passed, not human acceptance or release. In supervised execution, manual
approval belongs in extension state, not another checkbox list here.

## Execution constraints

- Paths and commands are relative to the repository root unless stated otherwise. Preserve unrelated working-tree changes, including the existing roadmap/spec edits.
- Keep IDs stable. Follow `AGENTS.md`: type-safe changes, no manual lockfile edits, no dev server, domain-local `__tests__/` and suite `support/` helpers, and tests included in TypeScript checking. No dependency change is expected; any necessary addition uses the package manager.
- The spec is authoritative. A1–A6 remain inferred defaults, not newly approved product decisions. Do not introduce independent gates/tails, change sampler duration rules, or replace sustained generation with a short buffer loop.
- Keep the plan compact. Record brief results in each owning gate; link a supporting note only for meaningful characterization, failure classification, or reproducibility detail. Do not create empty evidence files or append command transcripts.
- Do not update existing approved references to conceal a regression. New reference writes require explicit authorization; listening approval is separate from successful generation/verification. No commit, publication, deployment, or browser installation is authorized by this document.
- Statuses available during execution: `Pending`, `In progress`, `Blocked`, `Verified`, `Deferred`, `Accepted deviation`. A skipped/waived gate is not a pass; identify its impact, follow-up, and acceptance owner when known.

### Inspected implementation and verification seams

Static inspection only; none of the following establishes a passing baseline:

- `packages/audio-engine/src/types.ts` and `instruments/instrument.ts` currently own a single source. `_track()` and cancellation/destruction are the lifecycle change surface. Existing `instruments/instrument.test.ts` directly exercises `_track()` through a test subclass, so its consumer must change atomically with tracking contracts.
- `_scheduleVoice()`, `_applyParamSchema()`, and `_initLfos()` are the source/automation seams. Synth/sampler constructors and serializers are separate consumers; sampler duration calculation must remain intact.
- `packages/audio-engine/src/index.ts` owns graph commit order, readiness, and retirement. Instrument index can supply deterministic seed identity without altering existing unison phase seeds.
- Worklet source strings and manually maintained declarations live in `packages/worklets/src/index.ts` and `src/types/index.d.mts`; `tsdown.config.ts` copies that declaration entry to dist. Engine registration, exports, declaration consumers, and affected mocks must remain aligned.
- **Native audio belongs in `packages/audio-regression/src/__tests__/`**, using `runner/render.ts` / `withRenderer()`. Audio-engine's `src/__tests__/rendering-context.test.ts` is type coverage, not a native browser harness. This corrects the provisional plan's proposed location without changing the spec's acceptance behavior.
- Existing native supersaw/pre-envelope tests demonstrate direct adapter imports, explicit reference graphs, local procedural samples, isolated contexts, and cleanup. `support/worklet-failures.ts` currently replaces the first (LFO) registration only; noise injection must not accidentally break the LFO instead.
- Browser `render.ts` observes both `processorerror` and Chromium's `error` event, rejects failures, then destroys the engine. A successful rejected-render cleanup alone cannot prove normal graph retirement after a failed noise source; test that ownership separately.
- Audio-regression Vitest has a 30-second test timeout; its renderer defaults to a 10-second deadline and accepts an explicit `timeoutMs`. Long diagnostics need local bounded overrides, not globally weakened timeouts.

### Command recipes and working directories

Commands below are execution instructions for the owning steps; Step 0.1 records the baseline commands already run. Proposed new test paths are identified in their owning steps.

- Dependency build: `pnpm --filter @web-audio/audio-regression build:deps` (builds Fluid/audio-engine and their build dependencies).
- Focused unit command form: `pnpm --filter @web-audio/<package> exec vitest run <test-paths>`; actual package/path arguments are supplied below. Schema has `test:ci`, not a watch/test script.
- Before native Vitest commands, run the dependency build. Native tests import built public packages/worklet strings; source-only unit passes do not prove the dist consumer path.
- Affected checks: `pnpm exec turbo run check lint --filter=@web-audio/schema --filter=@web-audio/worklets --filter=@web-audio/audio-engine --filter=@web-audio/fluid --filter=@web-audio/audio-regression` after dependency build.
- Formatting: `pnpm exec prettier --check <changed-files>` with the actual changed paths, plus `git diff --check`. Do not reformat unrelated files.
- Existing reviewed audio: `pnpm --filter @web-audio/audio-regression audio:verify`. It builds dependencies and compares without approving/updating references.
- Missing browser: mark native gates blocked and request authorization for the existing `pnpm --filter @web-audio/audio-regression browser:install` command. Do not install during planning or silently skip the gate.

## Phase overview and delivery boundary

| Phase | Outcome                                                                     | Dependencies                           | Exit gate                                                              |
| ----- | --------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| 0     | Classify the current baseline and retain reference safety                   | Authorized execution, existing tooling | Recorded baseline, limitations, and no reference mutation              |
| 1     | Multi-source ownership with unchanged existing voices                       | Phase 0                                | Tracking/scheduling/retirement compose and no-noise audio is unchanged |
| 2     | Tested continuous noise source and native adapter                           | Phase 1                                | Built worklet exports and real frame/failure behavior agree            |
| 3     | Complete public noise feature and failure/lifecycle integration             | Phase 2                                | API/schema/runtime compose with gain parity and sampler release        |
| 4     | Native acceptance, characterization, documentation, and reviewed recordings | Phase 3                                | All AC owners satisfied and broad regression classified/passing        |

Delivery boundary: One feature-complete PR; phases are review increments, not
independent promises of a shipped feature. Do not merge an exposed builder/schema
that the engine ignores.

Atomic groups: Step 1.1's tracking contract and consumers; Step 2.2's export,
declaration, adapter, registration, and mocks; Step 3.1's public builder/schema and
runtime consumer. Keep each group together when applying or reverting. Final
feature delivery includes its tests/docs/approved new references, never a
standalone rebaseline.

Assess each phase exit gate after the final step's checks and before dependent
work or asking for supervised approval to advance.

## Phase 0 — Establish the unchanged baseline

Outcome: Known failures and native prerequisites are distinguished from noise regressions.
Depends on: Explicit authorization to execute this plan.
Review boundary: Read-only baseline; no product, dependency, or reference changes.

### Step 0.1 — Record a reproducible baseline

Status: Verified
Requirements / acceptance: R9; AC14 (baseline only; parity is owned by subsequent phase gates and Step 4.2).
Depends on: None.
Review boundary: Existing behavior and environment classification, not a prerequisite cleanup campaign.

Expected files:

- `plans/analog-engine/noise/plan.md` — brief result here; add `evidence/0.1.md` only if failure/environment details need a durable explanation.
- No application, dependency, or reference files change.

Tasks:

- [x] Record revision, existing working-tree changes, package-manager/tool availability, and pinned browser availability without installing anything.
- [x] Build dependencies, then run current schema/worklet/engine/Fluid unit suites and affected check/lint recipes.
- [x] Verify existing reviewed audio with `audio:verify`, preserving all reference bytes; classify pre-existing diagnostics/failures instead of assuming a green baseline.
- [x] Record whether native execution can proceed; unresolved lifecycle/audio baseline failures block affected work unless explicitly accepted as deviations.

Verification:

- Automated: Baseline commands passed; see [evidence/0.1.md](evidence/0.1.md) for revision, toolchain, test counts, native browser, and reference-safety details.
- Manual: Working-tree scope and reference preservation were reviewed; no new listening approval was requested. See [evidence/0.1.md](evidence/0.1.md) for the classified non-failing warning.

Completion gate: Baseline and native prerequisites are honestly recorded; unexplained failures are not treated as passes.
Evidence: [evidence/0.1.md](evidence/0.1.md).

Phase exit gate: Step 0.1 is verified. Reference safety, the existing check path, and native execution are confirmed; native-dependent work may proceed.
Evidence: [evidence/0.1.md](evidence/0.1.md).

## Phase 1 — Establish multi-source voice ownership

Outcome: One voice can own multiple scheduled sources without changing existing single-source behavior.
Depends on: Phase 0 exit gate.
Review boundary: Internal lifecycle/scheduling only; no noise API or DSP yet.

### Step 1.1 — Track and schedule a source collection

Status: Pending
Requirements / acceptance: R7, R9, R10; AC9 (fake scheduling portion), AC10 (source-order portion), AC14 (topology/source-end portion). Native timing remains Step 2.2; full composition remains Step 3.2.
Depends on: Step 0.1 and Phase 0 exit gate.
Review boundary: Atomic internal tracking/scheduling contract and all existing consumers.

Expected files:

- `packages/audio-engine/src/types.ts`, `instruments/instrument.ts` — source records and shared voice ownership.
- `packages/audio-engine/src/instruments/instrument.test.ts`, `instruments/__tests__/pre-envelope-effects.test.ts` — update existing contract consumers/assertions.
- Proposed `packages/audio-engine/src/instruments/__tests__/voice-sources.test.ts` and `support/` helper if needed — multi-source lifecycle tests.

Tasks:

- [ ] Normalize existing single-source scheduling into a nonempty owned-source collection, retaining buffer offset type safety and source-specific output/start handling.
- [ ] Start/stop every owned source against the voice boundary; attach completion tracking before operations that may complete synchronously.
- [ ] Disconnect each ended source independently, retaining shared effects/envelope and cleanup bindings until all siblings finish; make duplicate completion harmless.
- [ ] Preserve the exact single-source topology and natural-end cleanup timing; do not add a summing node or hold no-noise samplers open merely for the new abstraction.
- [ ] Update every tracking-contract consumer/test together; prove both completion orders and unchanged source parameters/offsets with fake sources.

Verification:

- Automated: `pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/instrument.test.ts src/instruments/__tests__/pre-envelope-effects.test.ts src/instruments/__tests__/voice-sources.test.ts`, then engine `check` and `lint`. Assert individual disconnects, one shared cleanup, offset preservation, separate musical voices, and existing topology.
- Manual: Review the atomic contract and confirm production code does not import test support. Fake sources do not prove native audio timing.

Completion gate: All existing consumers compile and scoped lifecycle assertions pass; no unimplemented noise consumer is required for verification.
Evidence: Not run.

### Step 1.2 — Close cancellation, construction, and retirement paths

Status: Pending
Requirements / acceptance: R7–R10; AC10, AC11 (fake lifecycle/composition portions), AC13 (partial construction portion). Noise processor errors remain Steps 2.2/3.2; native proof remains Phase 4.
Depends on: Step 1.1.
Review boundary: Shared teardown and engine composition, not changes to transport stop policy or bus DSP.

Expected files:

- `packages/audio-engine/src/instruments/instrument.ts` — centralized idempotent teardown/partial-setup cleanup.
- `packages/audio-engine/src/index.ts` — only if a real ownership integration gap is exposed.
- `packages/audio-engine/src/instruments/__tests__/voice-sources.test.ts`, existing `engine.test.ts`, `instruments/instrument.test.ts` — targeted composition/failure tests.

Tasks:

- [ ] Release all future-voice sources on cancellation and all sources on destroy, clearing callbacks before stop/disconnect; preserve currently active stop semantics.
- [ ] Ensure partial graph/source construction releases already-created nodes and parameter cleanups and leaves failures observable.
- [ ] Exercise stale callbacks after cancellation/destruction, overlapping voices, LFO/MIDI cleanup ownership, and source start/stop failures through deterministic injection.
- [ ] Exercise a retiring instrument with one early-ended and one active source, confirming buses remain until the whole voice completes and unrelated voices remain intact.

Verification:

- Automated: `pnpm --filter @web-audio/audio-engine test:ci`, then engine `check` and `lint`; use the existing test subclasses/manual clock or suite-local fakes. Assert cleanup exactly once, no retained scheduled voice, correct `finished` timing, and unchanged graph routing.
- Manual: Review resource ownership and failure propagation; no new runtime recovery policy is introduced.

Completion gate: Whole-voice cancellation/destruction/retirement composes with existing engine behavior, including partial construction and late notifications.
Evidence: Not run.

Phase exit gate: After Step 1.2, build dependencies and run existing `audio:verify`; no-noise output must remain unchanged. Engine suites/check/lint pass, with baseline-only failures explicitly classified. Record a concise integration result here; do not rebaseline.
Evidence: Not run.

## Phase 2 — Deliver a continuous scheduled noise source

Outcome: White/pink DSP and a scheduled-source adapter are verifiable independently of the public noise builder.
Depends on: Phase 1 exit gate.
Review boundary: Internal source/adapter, worklet exports, and registration; instruments still expose no noise method.

### Step 2.1 — Generate stateful white/pink noise with measured targets

Status: Pending
Requirements / acceptance: R5–R7; AC7 (processor/statistical portion), AC8 (processor portion), AC9 (processor portion). Native scheduling is Step 2.2; sustained listening/profile is Step 4.1.
Depends on: Step 1.2 and Phase 1 exit gate.
Review boundary: Noise generation, bounded timing protocol, and DSP characterization; no instrument API.

Expected files:

- Proposed `packages/worklets/src/processors/noise-processor.ts` — processor implementation.
- Proposed `packages/worklets/src/processors/__tests__/noise-processor.test.ts` and `support/noise-analysis.ts` — deterministic generation/statistical assertions.
- `packages/worklets/src/test-setup.ts` — only minimal missing processor-test capabilities.
- Optional `plans/analog-engine/noise/evidence/2.1.md` — final DSP provenance, measurements, and material limits, not a retry diary.

Tasks:

- [ ] Choose/document a long-period deterministic PRNG and sample-rate-aware pink method, checking provenance/licensing before any port. Do not reuse the short sequencing resolver; do not allocate in the sample loop.
- [ ] Accept internal color/seed/start-frame/stop-frame options, preserve PRNG/filter state, generate only active samples, signal completion once, and return false when finished. Constructor frames establish initial offline timing; control messages support cancellation.
- [ ] Test non-block-aligned bounds, before-start cancellation, malformed messages/options, arbitrary block partitions, distinct seeds, and long-run finite output with the existing processor setup.
- [ ] Use fixed calibration, never per-note AGC/normalization. Implement engineering targets below and record startup behavior before freezing constants/tolerances.
- [ ] Add statistical proof with deterministic seed averaging and the same sample-rate input as production, keeping analysis helpers test-only.

Engineering targets selected for this plan under A6, not new product guarantees:
44.1/48/96 kHz; uniform white `[-1, 1)` with RMS within 3% of `1/sqrt(3)`;
pink within 1.5 dB of white RMS after settling. Analyze at least 8 seconds after a
2-second settling interval using averaged/Hann-windowed spectral estimates over
100 Hz–8 kHz. Fit power spectral density slope against octave frequency: white
within ±0.5 dB/octave, pink −3.01 ±0.75 dB/octave; absolute mean/RMS below 0.05.
Use multiple fixed seeds, and inspect startup separately so settling does not hide
an audible attack defect. These are initial engineering gates, not measured
results. A justified adjustment must be recorded/reviewed before baseline
approval; a meaningful sound-quality compromise goes back to the user.

Verification:

- Automated: `pnpm --filter @web-audio/worklets exec vitest run src/processors/__tests__/noise-processor.test.ts`, then worklet `check` and `lint`. Expected: frame gates, block invariance, repeatability/separation, completion once, finite long runs, and statistical targets above.
- Manual: Review method/provenance and measurement design; analysis is not listening approval. Do not fabricate benchmark results or tune tolerances solely to pass a failing implementation.

Completion gate: Source behavior and stated characterization targets pass with documented coefficients/calibration and no unresolved licensing concern.
Evidence: Not run.

### Step 2.2 — Integrate the adapter, exports, and native scheduling

Status: Pending
Requirements / acceptance: R5, R7, R8; AC9 (native/adapter portions), AC13 (failed-source portion). Instrument retirement after failure remains Step 3.2.
Depends on: Step 2.1.
Review boundary: Atomic internal adapter/export/declaration/registration group and its native test consumer.

Expected files:

- `packages/worklets/src/index.ts`, `src/types/index.d.mts` — matching source-string export/declaration.
- Proposed `packages/audio-engine/src/instruments/sources/noise-source.ts`, `sources/__tests__/noise-source.test.ts` — scheduled adapter and fake-node tests.
- `packages/audio-engine/src/index.ts`, affected `engine.test.ts` mocks — register the new module without changing old ordering/behavior.
- Optional shared frame helper under `packages/audio-engine/src/utils/` and existing supersaw adapter/tests — only a parity-preserving extraction, not unison DSP changes.
- Proposed `packages/audio-regression/src/__tests__/noise-source.test.ts`, suite `support/` only if needed — native direct-adapter frame/error proof.

Tasks:

- [ ] Implement the scheduled-source interface and resource ownership, idempotent start/stop/disconnect, constructor timing, and completion forwarding; expose no new pitch parameters.
- [ ] Observe both supported processor failure event names without swallowing diagnostics or double-completing. A failed source completes ownership; automatic retry/substitution is excluded.
- [ ] Update source-string export/declaration and engine registration with affected mocks together. Keep LFO first so existing fault injection is not silently redirected.
- [ ] Prove constructor-only frame scheduling in native OfflineAudioContext and adapter cancellation/late notifications/port closure with focused tests.
- [ ] Fault-inject the noise processor in a direct adapter test; prove failure completion and visible diagnostics separately from harness-wide engine destruction.

Verification:

- Automated: `pnpm --filter @web-audio/worklets test:ci`; `pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/sources/__tests__/noise-source.test.ts src/instruments/sources/__tests__/supersaw-source.test.ts src/engine.test.ts`; dependency build; `pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/noise-source.test.ts src/__tests__/supersaw-source.test.ts src/__tests__/worklets.test.ts`. New paths are added in this step. Expected: exported dist source loads, real frame silence is exact outside bounds, errors are visible, and contexts/ports close.
- Manual: Inspect built worklet export/declaration agreement; no packed/published artifact or live cross-browser support is claimed.

Completion gate: Adapter unit proof and real native timing/failure proof pass using built dependencies, with no registration/mock regressions.
Evidence: Not run.

Phase exit gate: After Step 2.2, run affected checks and `audio:verify`. Existing instruments still behave identically despite additional module registration; built exports and native adapter checks pass. Record limitations without treating browser-test cleanup as graph-retirement proof.
Evidence: Not run.

## Phase 3 — Connect the public feature atomically

Outcome: All supported instruments author, validate, and render noise with full gain automation and shared lifetime.
Depends on: Phase 2 exit gate.
Review boundary: The smallest complete public vertical slice, followed by high-risk lifecycle/validation composition.

### Step 3.1 — Add the builder/schema/runtime vertical slice

Status: Pending
Requirements / acceptance: R1–R4, R6, R9, R10; AC1, AC2 (configuration), AC3 (parameter scheduling), AC4 (topology/events), AC6 (duration scheduling), AC8 (seed identity). Native portions remain Step 4.1.
Depends on: Step 2.2 and Phase 2 exit gate.
Review boundary: One atomic change across public configuration and its actual runtime consumer; no silently ignored noise schema intermediate state may merge.

Expected files:

- `packages/schema/src/constants.ts`, `index.ts`, `validate-graph.ts`, existing `validate-graph.test.ts` — colors, optional layer shape, validation/public schema exports.
- `packages/fluid/src/instruments/instrument.ts`, `synth-base.ts`, `sampler.ts` — input parsing/defaults/replacement and both serialization paths.
- Proposed `packages/fluid/src/instruments/__tests__/noise.test.ts`, existing public API/evaluation tests as needed — type and input coverage.
- `packages/audio-engine/src/index.ts`, `types.ts`, `instruments/instrument.ts`, `synthesizer.ts`, `sampler.ts` — instrument identity, layer graph, gain/LFO integration and source ownership.
- Proposed `packages/audio-engine/src/instruments/__tests__/noise.test.ts`, existing `engine.test.ts` and suite fixtures/support where affected — focused runtime composition.

Tasks:

- [ ] Add optional canonical noise configuration and validation, accepting old schemas; parse only an optional color prefix and delegate gain values to existing input helpers, explicitly defaulting empty input to one.
- [ ] Expose both overloads with concrete fluent inference; serialize optional noise in synth and sampler builders and replace the whole configuration on every call. Test malformed forms and every input kind with their existing gain context.
- [ ] Thread committed instrument index and emitted musical voice index to noise seed derivation with a noise-specific hash/salt; leave existing unison seeds unchanged and avoid wall-clock/global scheduling counters.
- [ ] Construct one mono source and one gain per successful musical voice, mixing before effects/shared ADSR through Phase 1 ownership; leave unison oscillator counts, main levels, stereo output, and skip paths unchanged.
- [ ] Apply gain using existing parameter scheduling and include it in LFO discovery/MIDI cleanup. Bind envelope timing to the existing event/shared stop; preserve sampler duration calculations verbatim where possible.
- [ ] Add tests with the vertical slice: all variants/defaults/replacement, old schemas, all parameter inputs including negative/above-one levels, seed variation, one layer per musical voice, no new MIDI/duck events, and source-end versus shared-end behavior.

Verification:

- Automated: `pnpm --filter @web-audio/schema test:ci`; `pnpm --filter @web-audio/fluid exec vitest run src/instruments/__tests__/noise.test.ts src/instruments/__tests__/unison.test.ts src/__tests__/evaluate-source.test.ts src/__tests__/midi-integration.test.ts`; `pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/__tests__/noise.test.ts src/instruments/__tests__/voice-sources.test.ts src/engine.test.ts`; dependency build and affected checks. Assert the complete input-to-scheduled-voice path, not only serialization.
- Manual: Review atomic alignment of builders, validator, and engine; inspect typings through normal public Drome usage. No live hardware MIDI is needed for existing binding-contract tests.

Completion gate: The full public vertical slice is buildable and usable for all variants; each offered input is consumed by the runtime, and existing schemas/voices retain parity. Fake-node scheduling does not complete native acceptance.
Evidence: Not run.

### Step 3.2 — Prove failure, automation, and retirement composition

Status: Pending
Requirements / acceptance: R2, R4, R7–R10; AC3 (binding lifecycle), AC5/AC6 (source lifecycle), AC10, AC11, AC12, AC13 (engine portions). Native behavior remains Step 4.1.
Depends on: Step 3.1.
Review boundary: High-risk integration assertions and bounded corrections, not a sampler redesign or generalized error framework.

Expected files:

- `packages/audio-engine/src/instruments/__tests__/noise.test.ts`, existing engine/sampler tests, suite `support/` — failure/retirement scenarios.
- `packages/schema/src/validate-graph.test.ts`, Fluid noise tests — malformed configurations/argument cases.
- Relevant Phase 3.1 production files only for defects exposed by these tests.

Tasks:

- [ ] Exercise short main-source completion with a still-active noise release; cover looping, one-shot, clipped, fitted-chop, reverse/region/fit, and detune-driven early completion by extending existing fixtures rather than duplicating sampler algorithms.
- [ ] Check zero-initialized dynamic gain later sounding, short/long noise envelopes never changing stop time, and per-voice LFO/MIDI cleanup not stopping shared modulation or sibling voices.
- [ ] Inject unavailable samples/variations/buffers and invalid windows; prove no orphan noise. Inject partial setup failures and failed-noise completion after tracking; prove surviving main sources finish on schedule and retiring graphs resolve.
- [ ] Submit invalid noise schemas while a graph is active; prove rejection leaves the active graph unchanged. Deliver duplicate/stale source notifications across cancellation, destroy, and graph replacement.
- [ ] Search remaining tracking/source consumers before removing any compatibility-only path introduced in Phase 1; remove only after equivalent noise and no-noise consumer tests pass.

Verification:

- Automated: `pnpm --filter @web-audio/schema test:ci`, `pnpm --filter @web-audio/fluid test:ci`, and `pnpm --filter @web-audio/audio-engine test:ci`, then dependency build and affected checks. Assert every source/binding/node cleanup once, `finished` at whole-voice completion, no silent error substitution, and unchanged duration/active graph invariants.
- Manual: Review failure observability and tracking consumer search; distinguish intended sample-end noise tails from accidental sustained gates.

Completion gate: Adversarial composition does not leak or truncate siblings/voices, no-noise tests still pass, and every validation/failure branch has a named test rather than a future promise.
Evidence: Not run.

Phase exit gate: After Step 3.2, run dependency build, affected package checks, all four production package unit suites, and existing `audio:verify`. Public exports, runtime scheduling and retirement compose; old reviewed cases remain unchanged. Native noise acceptance and new reference approval are explicitly still pending.
Evidence: Not run.

## Phase 4 — Establish native and user-facing acceptance

Outcome: The complete feature has real audio proof, bounded performance evidence, documentation, and human-reviewed references.
Depends on: Phase 3 exit gate.
Review boundary: Native acceptance and delivery evidence, not new DSP controls or a new testing platform.

### Step 4.1 — Verify native integration and sustained behavior

Status: Pending
Requirements / acceptance: R1–R8; AC2–AC9 (remaining native portions), AC11/AC13 (native error/cleanup composition where applicable). Fake lifecycle ownership from Step 3.2 remains essential.
Depends on: Step 3.2 and Phase 3 exit gate.
Review boundary: Reuse the existing Chromium renderer with test-local fixtures/diagnostics; no app dev server or global timeout expansion.

Expected files:

- Proposed `packages/audio-regression/src/__tests__/noise.test.ts`, `support/noise.ts` — native engine passages, stereo/reference comparisons and temporary fixtures.
- Proposed `packages/audio-regression/src/__tests__/noise-diagnostics.test.ts` — sustained/statistical/profile diagnostic, with locally bounded deadlines if necessary.
- Existing suite `support/worklet-failures.ts` — minimal targeted noise injection, preserving existing LFO failure coverage.
- Optional `plans/analog-engine/noise/evidence/4.1.md` — final native/quality/profile results and limits.

Tasks:

- [ ] Render basic/unison/sampler with both colors, gain zero versus absent noise, envelope/LFO motion and exact post-stop silence; compare against explicit native graphs or independent expected time windows so a silent/misrouted layer cannot pass.
- [ ] Prove sample-end noise release and stereo-main preservation. Use temporary procedural stereo/short samples or existing provenance-recorded local assets; do not depend on external sample fetches.
- [ ] Repeat fresh-context renders and compare active, preroll-trimmed audio across start offsets; test changed hit/voice/instrument identities without mistaking complete mix differences for isolated seed separation.
- [ ] Target the noise module by its content/name, not a fragile registration ordinal. Inject first/late processor errors; assert observable rejection and context cleanup. Separately exercise adapter/instrument completion without relying on harness `finally { engine.destroy(); }` to resolve ownership.
- [ ] Render a separate 60-second held-noise diagnostic for each color and profile 32 simultaneous layers at 48 kHz. Record hardware/browser, wall time and memory/context cleanup; summarize measurements in-browser rather than moving unnecessary long arrays/WAVs through the runner.
- [ ] Listen to startup/sustained passages at safe volume and inspect long-run analysis for seams/periodicity. A real-time CPU claim requires an authorized local real-time check; offline render duration alone is not real-time performance proof.

Verification:

- Automated: Dependency build, then `pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/noise-source.test.ts src/__tests__/noise.test.ts src/__tests__/noise-diagnostics.test.ts src/__tests__/worklets.test.ts`. New diagnostics may set explicit per-test/renderer deadlines (for example 120 seconds) without changing global defaults. Expected: real DSP/graph/frame/stereo/seed/error behavior agrees with the spec and Step 2.1 targets, all contexts close.
- Manual: With native renders available and a local listener/audio device, audition each color's attack and 60-second passage; listen for clicks, block seams, repeating bursts and unintended level jumps. For real-time profiling, use a disposable browser page/AudioContext only with permission; compare 0/8/32-layer workloads and listen for dropouts. No numerical CPU SLA is invented; a material cost problem blocks acceptance pending a tradeoff decision.

Completion gate: Native tests and sustained characterization pass; machine/profile limitations and listening observations are recorded. Missing listener/device/permission blocks the relevant manual portion, not silently waived.
Evidence: Not run.

### Step 4.2 — Document and accept the delivered feature

Status: Pending
Requirements / acceptance: R1–R10; AC1–AC14 final coverage reconciliation, especially AC7 listening and AC14 unchanged reviewed audio.
Depends on: Step 4.1.
Review boundary: Documentation, short musical references, human review, and final regression; no release/publication action.

Expected files:

- `packages/fluid/README.md`, `packages/audio-engine/README.md`, relevant audio-regression guidance — API and lifetime/headroom semantics where appropriate.
- Proposed `packages/audio-regression/cases/noise-synth/` and `cases/noise-sampler/` — short passages, metadata, and only needed provenance-recorded assets. Together cover white/pink, basic/unison, modulation and sample-end release.
- Corresponding new `packages/audio-regression/references/noise-synth/` and `references/noise-sampler/` — explicitly authorized and human-reviewed recordings only.
- `plans/analog-engine/roadmap.md` and this plan — delivery status only after gates; no retroactive approval claims.

Tasks:

- [ ] Document overload/default/replacement behavior, full automation, additive headroom/signed gain, mono/static/unpitched defaults, deterministic restarts and limits, and sampler duration/two-envelope interaction without implying standalone noise or main-source gain shipped.
- [ ] Add short musical cases with adequate release tails and existing local-fixture/provenance conventions; verify fresh-process repeatability before creating references.
- [ ] With explicit authorization, generate one named new reference at a time and obtain human listening approval for each; do not overwrite unrelated references or equate playback-command success with approval.
- [ ] Reconcile the final AC ownership table and record unresolved/deviated checks honestly; run broad regression and formatting on the final tree.
- [ ] Mark the roadmap delivered only after automated, native, performance/quality and listening gates pass. Preserve implementation verification versus any future publishing/deployment distinction.

Verification:

- Automated: First use `pnpm --filter @web-audio/audio-regression audio:render --case noise-synth` and the analogous `noise-sampler` command; repeat in fresh processes. Authorized reference writes use `pnpm --filter @web-audio/audio-regression audio:update --case noise-synth` and `pnpm --filter @web-audio/audio-regression audio:update --case noise-sampler`, followed by `pnpm --filter @web-audio/audio-regression audio:verify`. Final root commands: `pnpm test`, `pnpm check`, `pnpm lint`; targeted formatting and `git diff --check`. Expected: new approved cases pass, prior references remain byte-unchanged, no new diagnostics or unclassified regression.
- Manual: A human listener reviews each generated reference at safe volume, checking both colors, intended automation and sampler release against the documented behavior; record reviewer/observation when available and supervised approval in extension state. Prerequisites are explicit authorization to write references and available audio playback. If unavailable, keep acceptance blocked.

Completion gate: Every mandatory acceptance owner has passing evidence and no required listening approval is missing. If a required check is waived, record `Accepted deviation`, not `Verified`. A root suite failure traceable to Phase 0 remains a documented limitation, not a fabricated pass. No publication is performed.
Evidence: Not run.

Phase exit gate: After Step 4.2, review final acceptance links, final-tree broad-check results, reference diff and human approval state. Confirm no unapproved reference changes, unresolved mandatory gates, or hidden performance/quality compromises before feature-complete delivery.
Evidence: Not run.

## Final acceptance

This table is a coverage index, not a second progress ledger. Evidence is recorded
in the linked owning steps/phase gates, initially `Not run` throughout.

| Spec acceptance ID | Owning step / gate             | Verification and expected result                                                                  | Evidence / status                                                                                                                                                                                       |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1                | Step 3.1; Step 4.2             | Public types/defaults/old schemas are compatible; final docs agree.                               | [3.1](#step-31--add-the-builderschemaruntime-vertical-slice), [4.2](#step-42--document-and-accept-the-delivered-feature)                                                                                |
| AC2                | Step 3.1; Step 4.1             | Last-call replacement and zero/default gain match serialized and native behavior.                 | [3.1](#step-31--add-the-builderschemaruntime-vertical-slice), [4.1](#step-41--verify-native-integration-and-sustained-behavior)                                                                         |
| AC3                | Steps 3.1/3.2; Step 4.1        | All gain inputs schedule/bind correctly; native envelope/LFO motion and bounded lifetime hold.    | [3.2](#step-32--prove-failure-automation-and-retirement-composition), [4.1](#step-41--verify-native-integration-and-sustained-behavior)                                                                 |
| AC4                | Step 3.1; Step 4.1             | Per-musical-voice additive topology/events and native stereo identity are preserved.              | [3.1](#step-31--add-the-builderschemaruntime-vertical-slice), [4.1](#step-41--verify-native-integration-and-sustained-behavior)                                                                         |
| AC5                | Step 3.2; Steps 4.1/4.2        | Sample-end release survives and is heard, with silence by shared stop.                            | [3.2](#step-32--prove-failure-automation-and-retirement-composition), [4.1](#step-41--verify-native-integration-and-sustained-behavior), [4.2](#step-42--document-and-accept-the-delivered-feature)     |
| AC6                | Steps 3.1/3.2; Step 4.1        | Existing sampler duration branches remain unchanged, with representative native release proof.    | [3.2](#step-32--prove-failure-automation-and-retirement-composition), [4.1](#step-41--verify-native-integration-and-sustained-behavior)                                                                 |
| AC7                | Step 2.1; Steps 4.1/4.2        | Spectra/mean/levels meet reviewed engineering targets; sustained listening/profile is acceptable. | [2.1](#step-21--generate-stateful-whitepink-noise-with-measured-targets), [4.1](#step-41--verify-native-integration-and-sustained-behavior), [4.2](#step-42--document-and-accept-the-delivered-feature) |
| AC8                | Steps 2.1/3.1; Step 4.1        | Processor block invariance and seed separation survive fresh native contexts/preroll changes.     | [2.1](#step-21--generate-stateful-whitepink-noise-with-measured-targets), [4.1](#step-41--verify-native-integration-and-sustained-behavior)                                                             |
| AC9                | Step 2.2; Step 4.1             | Real start/stop/cancellation boundaries and completion agree with processor/adapter tests.        | [2.2](#step-22--integrate-the-adapter-exports-and-native-scheduling), [4.1](#step-41--verify-native-integration-and-sustained-behavior)                                                                 |
| AC10               | Steps 1.1/1.2; Step 3.2        | Completion order/stale messages do not truncate siblings or duplicate binding teardown.           | [1.2](#step-12--close-cancellation-construction-and-retirement-paths), [3.2](#step-32--prove-failure-automation-and-retirement-composition)                                                             |
| AC11               | Steps 1.2/3.2; Step 4.1        | Whole-voice cancellation/destroy/retirement is correct, with native cleanup corroboration.        | [3.2](#step-32--prove-failure-automation-and-retirement-composition), [4.1](#step-41--verify-native-integration-and-sustained-behavior)                                                                 |
| AC12               | Steps 3.1/3.2                  | Invalid public/schema inputs reject without active-graph mutation.                                | [3.2](#step-32--prove-failure-automation-and-retirement-composition)                                                                                                                                    |
| AC13               | Steps 1.2/2.2/3.2; Step 4.1    | Missing-main/setup/processor failures are visible and do not leak or hang retirement.             | [3.2](#step-32--prove-failure-automation-and-retirement-composition), [4.1](#step-41--verify-native-integration-and-sustained-behavior)                                                                 |
| AC14               | Phase 1–3 exit gates; Step 4.2 | No-noise lifecycle/topology and all previously reviewed recordings remain unchanged.              | [Phase 1](#phase-1--establish-multi-source-voice-ownership), [Phase 3](#phase-3--connect-the-public-feature-atomically), [4.2](#step-42--document-and-accept-the-delivered-feature)                     |

## Rollback and recovery

- No database/persistence migration or irreversible external operation is needed. Pre-approval renders and profiling are disposable diagnostics; do not commit large diagnostic WAVs by default.
- Revert internal tracking contracts with their consumers/tests (Step 1.1), export/declaration/adapter/registration changes together (Step 2.2), and public API/schema/runtime together (Step 3.1). After dependent work exists, include those dependents in a revert; never leave noise accepted but ignored.
- Revert final delivery with its new cases/references/docs as a coherent feature unit. Restore existing references only from their prior approved version if accidentally changed; numerical regeneration is not recovery approval.
- A failed step remains Pending/In progress/Blocked until its gate passes or a named deviation is accepted. Preserve material failure evidence; rerun affected focused checks and the phase exit gate after recovery, not every workspace check after every edit.
- If a reference update partially writes its WAV/metadata pair, restore that named case's pair from the last approved state (or remove the unapproved new pair), then regenerate only with authorization and renewed review. Do not repair by widening comparison tolerances.
- A DSP quality/performance result requiring a material behavior change is a decision gate for affected downstream work, not permission to weaken the governing spec.

## Deferred checks and accepted deviations

- Accepted deviations: None. Step 0.1 baseline verification is complete; all feature verification remains pending and no gate has been waived.
- Exact pink method/PRNG/calibration remain engineering selections in Step 2.1, bounded by its documented targets and the spec. Targets are not claimed empirical results or new public support guarantees.
- Native gates are blocked if the pinned browser cannot run; installation requires separate authorization. Human audio acceptance is blocked if playback/reviewer access is unavailable. Do not count mock/automated success as a substitute.
- Real-time performance measurements require an authorized local AudioContext session; offline profiling alone must be labeled as such. Cross-browser/hardware certification, live hardware MIDI, packed/published artifact validation, deployment, and standalone noise remain outside this plan.
