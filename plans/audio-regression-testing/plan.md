# Fluid Audio Regression Testing Implementation Plan

## Status and context

Proposed; no implementation steps are complete. This plan implements [`spec.md`](./spec.md).

The goal is to replace routine manual REPL listening checks with saved Fluid sketches rendered through the real audio engine in a headless browser. Approved schema and audio references provide automated acceptance; recordings and plots support human review.

User sketches are not required to start. Small synthetic sketches establish the harness, determinism, and failure detection first. Representative user coverage is a separate final phase.

## Execution contract

- Each numbered step is a reviewable, independently testable change on top of its stated prerequisites. Keep builds and existing tests green at every step; no partially migrated production types.
- A phase's **tracer bullet** describes its usable outcome, not just a list of new modules.
- Every step includes a validation method and completion criteria. Record commands, results, measured values, and manual approvals as work proceeds; do not mark a checkbox complete from code inspection alone.
- Steps may be grouped into PRs, but do not skip the feasibility gate to build tooling around unproven rendering.
- Production seam changes are behavior-preserving. If characterization uncovers an engine bug, report it and handle the correction separately before approving references.
- No production package imports `packages/audio-regression` or test support. The new package is private and unpublished.
- Use domain-local `__tests__/` for unit tests and package-level `src/__tests__/` for cross-domain/public API tests. Keep fixtures/helpers in suite-local `support/`; keep tests in TypeScript checking.
- Install dependencies with pnpm. Preserve real type safety: no fake `AudioContext`/`AudioClock` casts or `as any` escapes.
- Do not start an app `dev` command. The test runner owns its loopback server. Ask permission before any manual review that requires starting the application.
- Existing unrelated plans and working-tree changes are outside this work.

## Scope boundaries

**Included:** shared synchronous Fluid evaluation, a narrow rendering seam, deterministic offline scheduling, real sample decoding and LFO worklets, local-only fixtures, numerical/schema comparison, explicit baseline approval, reports, root test integration, and one authoritative browser/OS lane.

**Deferred:** REPL UI smoke automation, physical audio/MIDI hardware, real-time timer performance, graph replacement during rendering, mid-render BPM changes, stop/restart rendering scenarios, controlled MIDI input, resolved-event traces, spectral acceptance profiles, and multiple platform baseline lanes.

Do not change musical values to force agreement, normalize gain, align audio automatically, trim silence, clip floats before comparison, or replace worklets with mocks.

## Phase map and dependencies

| Phase                                | Independently usable outcome                                                   | Prerequisite             |
| ------------------------------------ | ------------------------------------------------------------------------------ | ------------------------ |
| 0 — Characterization and environment | A recorded production baseline and a reproducible browser lane                 | None                     |
| 1 — Production seams                 | REPL evaluation is shared; engine accepts rendering context/clock capabilities | Phase 0                  |
| 2 — Real offline rendering           | A command renders isolated synthetic synth/sample/LFO cases                    | Phase 1                  |
| 3 — Assertions and reference data    | Semantic and audio changes can be classified numerically                       | Phase 2 feasibility gate |
| 4 — Review artifacts                 | A reviewer can inspect and listen to a failed/candidate render                 | Phase 3                  |
| 5 — Baseline workflow                | Verify, generate candidates, and explicitly approve references                 | Phases 3–4               |
| 6 — Automation and operations        | Root tests run approved cases on the authoritative lane                        | Phase 5                  |
| 7 — Representative sketches          | User-selected API/audio behaviors have approved regression coverage            | Phase 6 and user inputs  |

Within Phase 1, context and clock narrowing can be reviewed separately. Within Phase 3, canonicalization and float serialization can proceed independently. Within Phase 4, preview and plot generation can proceed independently against Phase 3's result model. Otherwise follow the numbered dependency order.

---

## Phase 0 — Characterize production and choose the browser lane

**Tracer bullet:** The current source-to-sound path has recorded invariants and passing characterization coverage; a clean checkout can launch the intended browser without the production app.

### Step 0.1 — Record the pre-change contract

**Files/areas:** REPL worker/player, Fluid public API tests, audio-engine/clock/worklet tests, and new `plans/audio-regression-testing/feasibility.md`.

**Work:**

- Re-read current implementations before editing; other active plans may have changed schema or runtime details since this spec was written.
- Inventory concrete context/clock members used by the engine, instruments, buses, sample caches, reverse-buffer utilities, worklet registration, and MIDI output scheduling.
- Record fresh-Drome evaluation, `drome`/`d` aliases, synchronous execution, worker error serialization, default BPM, `prebar` commit, and `bar` scheduling semantics.
- Identify existing coverage for preparation, alternate-direction state, LFO phase origins, cancellation, retirement, and sample warnings. Add focused characterization tests only where necessary.
- Record the relevant test commands and baseline results in the feasibility document. Do not rewrite expectations to anticipate the new harness.

**Validation:** Run existing Fluid, clock, audio-engine, and worklet `test:ci` tasks and changed-package checks. Exercise the worker's source/error protocol with existing app tests or a focused new test, using the app's actual test script.

**Acceptance criteria:**

- [ ] Every context/clock consumer has an identified required-capability list.
- [ ] Shared evaluation extraction has explicit behavior to preserve.
- [ ] Production characterization is green; unrelated pre-existing failures are recorded distinctly.

### Step 0.2 — Create the private package and reproducible browser launch

**Files/areas:** New `packages/audio-regression/package.json`, TypeScript/lint/format/test configuration, README, and environment setup instructions.

**Work:**

- Create private `@web-audio/audio-regression` with the source/test layout from the spec. Install dependencies with pnpm, matching repository versions where practical.
- Add `check`, `lint`, `format`, and unit-test scripts; tests remain checked by TypeScript.
- Select and record a concrete Playwright Chromium revision, fixed OS image, and architecture. Pin the image by an immutable identifier where available.
- Implement a minimal browser-launch smoke test with guaranteed browser cleanup. No audio engine or test server is required yet.
- Document browser installation and how to run the authoritative lane from a clean checkout. Do not claim a developer's different OS is equivalent.
- Keep root audio verification integration until Phase 6; no missing reference may be silently treated as a passed render.

**Validation:** On the selected lane, install dependencies/browser and run the launch smoke test plus package check/lint. Confirm the smoke test exits cleanly on both launch success and deliberate launch failure.

**Acceptance criteria:**

- [ ] Browser provenance is concrete, not merely “latest Chromium.”
- [ ] A clean setup can run the smoke test without app/database credentials.
- [ ] The package is private, type-checked, and not a production dependency.

**Phase exit gate:** Record the intended environment and production characterization results in `feasibility.md` before changing shared APIs.

---

## Phase 1 — Add behavior-preserving production seams

**Tracer bullet:** The existing REPL still works through shared evaluation, and the real engine can accept an offline rendering context and a structural scheduling driver without unsafe casts.

### Step 1.1 — Share synchronous source evaluation

**Depends on:** Phase 0.

**Files/areas:** New Fluid evaluation helper and public export, `apps/web/src/lib/globals/eval.worker.ts`, Fluid public API tests, worker integration coverage.

**Work:**

- Extract the worker's fresh-Drome/source/schema operation into Fluid; retain worker message handling and error serialization in the app.
- Preserve both aliases, defaults, synchronous semantics, and thrown evaluation/schema errors. Do not add top-level async support.
- Test sequential calls for state isolation and test an error followed by a successful evaluation.
- Keep this helper narrowly scoped to trusted source evaluation; do not present `new Function` as a sandbox.

**Validation:** Fluid tests/build/check/lint; app checking and worker/player tests. Compare representative helper output with the pre-extraction behavior, including alias use and syntax/runtime/schema failures.

**Acceptance criteria:**

- [ ] Worker uses the shared helper and retains its protocol.
- [ ] Both aliases produce equivalent schemas.
- [ ] Repeated evaluation does not retain prior instruments/banks.
- [ ] Error behavior and supported synchronous language semantics are unchanged.

### Step 1.2 — Narrow rendering context dependencies

**Depends on:** Step 0.1; independently reviewable from Step 1.1.

**Files/areas:** Audio-engine context consumers identified in Step 0.1 and their relevant tests/types.

**Work:**

- Change rendering-only dependencies to `BaseAudioContext` or a derived minimal context contract.
- Keep context management/resume/close and the production real-time clock on appropriate real-time types.
- Update touched fake-node test annotations without weakening the production contract.
- Add compile-checked construction coverage proving the real engine accepts both real-time and offline contexts. Do not instantiate browser APIs in Node merely to test types.

**Validation:** Engine/dependent package build/check/lint/tests and workspace checking. Inspect declarations to confirm existing real-time callers remain valid.

**Acceptance criteria:**

- [ ] An offline context is accepted without an `AudioContext` cast.
- [ ] No rendering method or real-time lifecycle behavior is removed.
- [ ] Existing engine, cache, reverse-buffer, bus, and instrument tests remain green.

### Step 1.3 — Define the engine clock capability contract

**Depends on:** Step 0.1; integrate after Step 1.2.

**Files/areas:** Clock type exports, engine/instrument/bus/MIDI scheduler clock consumers, relevant type/tests.

**Work:**

- Define a narrow contract derived from existing clock capabilities and the Step 0.1 inventory. Avoid a parallel manually maintained clone of the full clock class.
- Make engine-facing consumers depend on that contract while retaining the actual real-time clock implementation and scheduler.
- Keep MIDI timestamp conversion capabilities if existing consumers require them, but do not introduce external MIDI operation in render tests.
- Add compile-checked coverage for the production clock and a minimal driver implementation.

**Validation:** Clock and engine tests/build/check/lint plus workspace checking. Verify the real-time scheduler implementation is unchanged apart from necessary type/import changes.

**Acceptance criteria:**

- [ ] Both production clock and a structural driver satisfy the contract without casts.
- [ ] Engine subscriptions, BPM updates, and bar duration remain available.
- [ ] No second real-time scheduling system is introduced.

**Phase exit gate:** Production behavior is still green. The harness will consume these seams rather than private engine methods or manually instantiated instruments.

---

## Phase 2 — Prove real, isolated offline rendering

**Tracer bullet:** A targeted render command produces real float audio for a sine synth, a local sampler, and an LFO-filtered synth, with repeatable results and fatal resource diagnostics.

### Step 2.1 — Own browser/server lifecycle and fixture inputs

**Depends on:** Phases 0–1.

**Files/areas:** New package browser/runner entry points, fixture registry, integration `support/`, artifact ignore rules.

**Work:**

- Start a minimal Vite harness on an available loopback port from the Node runner. Transfer source/settings to the page; keep fixture imports and registry ownership in test entry points, not production modules.
- Define typed, runtime-validated cases: stable IDs, description/features, source, bar count, sample rate/channels, start frames, tail duration, local assets, signal expectations, profile name, and warning allowlist.
- Reject duplicate IDs, unsafe file paths, unknown case selectors, and invalid numeric settings.
- Use a fresh browser context/page per case; isolate workers, caches, and globals. Run cases sequentially initially.
- Add per-case timeout handling that closes a stuck page/context from the Node side, even if synchronous sketch evaluation blocks the page thread.
- Collect page/worker exceptions, console diagnostics, request failures, and HTTP failures from the start.

**Validation:** Integration tests launch/stop the server and browser, load the harness, reject bad fixtures, and recover from a deliberate infinite-loop sketch and startup failure. Run twice to check for leaked ports/processes.

**Acceptance criteria:**

- [ ] No manually started app server or credentials are needed.
- [ ] Hung evaluation is terminated by the runner.
- [ ] Failure cleanup leaves no browser/server process behind.
- [ ] Unknown selectors and invalid fixtures fail rather than run zero cases successfully.

### Step 2.2 — Render a fixed-graph synth through AudioEngine

**Depends on:** Step 2.1.

**Files/areas:** Browser offline driver/render function, synthetic synth fixture, integration tests.

**Work:**

- Evaluate with the shared helper, validate the graph, and derive effective BPM, duration, and frame length from the fixture/schema.
- Create the offline context, structural clock driver, and real engine. Await worklet readiness, update the engine, and await preparation.
- Emit ordered `prebar`/`bar` events at exact timestamps, beginning at bar zero; schedule only requested bars and retain the explicit tail.
- Render to completion, transfer channel floats losslessly to Node, and clean up only after rendering finishes or fails.
- Provide a temporary targeted `audio:render --case <id>` diagnostic command producing float data and a compact metadata/diagnostic summary. It is not yet baseline verification.

**Validation:** Assert finite/non-silent sine output, exact shape/settings, expected leading silence, and release-tail capture. Test an omitted BPM against the engine default and a multi-bar fixture against calculated timestamps. Confirm no real-time clock start, musical sleeps, or analyser polling occurs.

**Acceptance criteria:**

- [ ] The render goes through production commit and scheduling subscriptions.
- [ ] Audio buffers arrive intact in Node with channels and length preserved.
- [ ] Start/tail settings and BPM determine the documented timeline.
- [ ] Engine destruction cannot cancel voices before the render.

### Step 2.3 — Add strict local sample rendering

**Depends on:** Step 2.2.

**Files/areas:** Local PCM WAV fixtures/provenance, sample serving, request policy, sampler integration cases.

**Work:**

- Add tiny deterministic tones, an asymmetric transient, and a multi-region sprite with documented generation/provenance and hashes.
- Serve approved fixture paths on the harness origin; use inline Fluid sample manifests.
- Block external requests including worker-originated requests. Restrict fixture access to registered assets; do not broadly expose repository files.
- Implement explicit URL-to-local mappings for any initial built-in-bank test, preserving sample/key/variation identity.
- Fail on HTTP/decode failures and unexpected sampler warnings even when preparation resolves with a null cached buffer.
- Negative cases may assert a specific expected diagnostic; they must not generate passing audible references from failed resources.

**Validation:** Real browser tests cover successful sample playback, distinct variation selection, reverse-buffer preparation, sprite regions, missing file, HTTP error, corrupt WAV, missing bank/name, and a blocked external URL. Check worker request blocking explicitly.

**Acceptance criteria:**

- [ ] Audio comes from real fetch/decode/buffer playback, not a mocked cache.
- [ ] External hosts are never needed or used as fallback.
- [ ] A failed sample cannot pass solely because another voice remains audible.
- [ ] Asymmetric fixtures make reversal and region mistakes observable.

### Step 2.4 — Prove real LFO/worklet operation and case isolation

**Depends on:** Steps 2.2–2.3.

**Files/areas:** Filter/LFO fixtures, multi-bar/seeded cases, integration tests.

**Work:**

- Render a filtered synth with the actual registered LFO processor and `AudioWorkletNode`.
- Include changing bar-level LFO endpoints, phase offsets, and a multi-speed/waveform case supported by the current API.
- Verify audible modulation differs from a static control; fail worklet registration/runtime errors distinctly.
- Add explicit seeded random/chance and multi-bar fixtures.
- Render cases in different orders and repeat an alternate-direction sampler case in fresh contexts to prove no retained playback state.

**Validation:** Compare control/modulated output numerically, assert all output is finite, and capture deliberate registration failures. Repeated isolated cases must agree regardless of prior case order; seeded fixtures must retain deterministic schemas and audio.

**Acceptance criteria:**

- [ ] The real worklet changes rendered audio; no stubs are involved.
- [ ] Scheduling ahead correctly updates bar-level automation.
- [ ] Case order does not change output or sampler direction state.

### Step 2.5 — Measure repeatability and close the feasibility gate

**Depends on:** Step 2.4.

**Files/areas:** `feasibility.md`, comparison-profile definitions, environment setup README.

**Work:**

- Measure raw maximum/RMS difference and short-window RMS differences for repeated synth/sample/LFO/seeded renders. Include a fresh browser launch and a fresh authoritative-lane process, not only same-page repetition.
- Run the documented clean environment setup again.
- Record exact environment provenance, worst observed differences, chosen threshold values/units, window settings, and rationale. Reuse the measured formulas in Phase 3; do not leave a competing throwaway comparator in the package.
- Set initial timeout, case-count, frame/memory limits, and runtime/artifact budgets from observed costs.
- Record unsupported behavior or blockers explicitly.

**Validation:** At least two independent renders per representative synthetic case, plus fresh-launch repeatability on the authoritative lane. Inspect results before choosing tolerances; do not automatically tune them until cases pass.

**Acceptance criteria:**

- [ ] Real synth, sampler, filter, and worklet rendering are demonstrated.
- [ ] Numeric tolerances and limits are concrete and evidence-based.
- [ ] The authoritative lane is reproducible from a clean setup.
- [ ] No silence, warning, worklet error, or nondeterminism is masked.

**Hard phase exit gate:** Stop here if deterministic real-worklet rendering cannot be established. Revise the spec/plan with evidence before implementing approved baselines. Do not lower the test to mocked scheduling.

---

## Phase 3 — Implement semantic/audio assertions and reference data

**Tracer bullet:** Known equal renders pass; controlled schema, amplitude, timing, channel, and signal mutations fail with structured metrics and precise failure categories.

### Step 3.1 — Canonicalize schemas without losing identity

**Depends on:** Phase 2 gate.

**Files/areas:** Runner canonicalization/diff helpers and domain-local unit tests.

**Work:**

- Canonicalize object-key serialization and documented nondeterministic IDs only.
- Assign stable LFO IDs by deterministic traversal with one identity map, preserving shared references and independent objects.
- Retain array order, musical values, routes, seeds, timing, and defaults.
- Produce readable differing paths/JSON diffs; retain the original schema for diagnostics where useful.

**Validation:** Hand-authored unit schemas verify equivalent ID renaming/key order, shared versus independent LFOs, duplicate/ordered voices, and meaningful note/timing/effect/routing/seed changes. Verify the input schema is not mutated.

**Acceptance criteria:**

- [ ] UUID variation alone does not cause a regression.
- [ ] Shared and independent LFO graphs never collapse into one meaning.
- [ ] Musical/schema differences remain visible.

### Step 3.2 — Define lossless float references and manifests

**Depends on:** Phase 2 gate; independent of Step 3.1.

**Files/areas:** Float serialization, versioned manifest validation, hashing helpers, runner unit tests.

**Work:**

- Select and document a versioned channel layout, Float32 encoding, and explicit byte order. Preserve all rendered finite values, including amplitudes above one.
- Define reference metadata from the spec: source/assets hashes, render settings/resolved frame count, profile/version, analysis settings, and environment/revision provenance.
- Define environment compatibility independently from musical equality. Unknown/unsupported environments must not appear authoritative.
- Validate formats, lengths, hashes, schema presence, and resource paths before trusting a reference. Reject unsupported versions and corrupt/truncated payloads.

**Validation:** Round-trip known floats/channels byte-for-byte; test endian/layout expectations, amplitudes above one, hash changes, corrupt files, shape mismatch, unsupported format, and incompatible browser/OS/architecture metadata.

**Acceptance criteria:**

- [ ] The stored audio is lossless and documented; previews are not references.
- [ ] Corrupt or incompatible references fail explicitly.
- [ ] Source, assets, profile, and render-contract changes can be identified.

### Step 3.3 — Add numerical comparisons and signal expectations

**Depends on:** Steps 3.1–3.2 and measured profiles from Step 2.5.

**Files/areas:** Audio/schema comparison result model and runner unit tests.

**Work:**

- Enforce sample rate, channel count, frame length, finite values, audible/silent expectations, and configured activity/silence windows.
- Implement per-channel maximum absolute error, RMS sample error, and short-window RMS-envelope differences, with documented final partial-window behavior.
- Report channel and sample/time location of worst differences and every failed threshold; both semantic and audio gates are required.
- Define staged failures: evaluation, schema, resource, worklet, render, environment, provenance/reference, and comparison.
- Treat peak-above-one assertions as case-specific, not a blanket Web Audio validity rule.

**Validation:** Tiny known arrays cover identity, gain changes, dropped transient, sample shift, channel swap, NaN/infinity, accidental/intentional silence, trailing-window errors, unequal length, and over-range finite samples. Check values on and just beyond thresholds.

**Acceptance criteria:**

- [ ] Localized errors cannot hide behind whole-recording averages.
- [ ] No gain normalization, alignment, trimming, or clipping is applied.
- [ ] Signal expectations distinguish intentional silence from broken playback.
- [ ] Structured failures retain all relevant measurements and settings.

**Phase exit gate:** Tests demonstrate independent semantic and audio failures, with measured fixed profiles. No approved-reference creation is automatic.

---

## Phase 4 — Make renders reviewable by ear and eye

**Tracer bullet:** A synthetic mismatch opens as a self-contained report with schema differences, measurements, playable recordings, waveforms, loudness, and spectrograms.

### Step 4.1 — Generate labeled audio previews

**Depends on:** Phase 3.

**Files/areas:** WAV writer, difference-audio generation, preview unit tests.

**Work:**

- Generate reference/current/difference WAV previews with correct channels/sample rate.
- Keep float comparison data unchanged; if playback requires attenuation, use a documented preview-only policy and label the scale.
- Use compatible preview scaling for A/B review so independent loudness normalization cannot hide gain regressions.
- Support a current-only preview when no reference exists.

**Validation:** Read generated WAV headers/data with a test decoder; verify duration, channel order, known amplitudes, reference-minus/current difference convention, and attenuation labels. Manually listen to a tone/transient preview without starting the web app.

**Acceptance criteria:**

- [ ] Preview encoding preserves the documented timeline/channel mapping.
- [ ] Difference sign/scaling is explicit.
- [ ] Listening artifacts never replace lossless reference measurements.

### Step 4.2 — Generate waveform, RMS, and spectral plots

**Depends on:** Phase 3; can proceed alongside Step 4.1.

**Files/areas:** Plot/STFT helpers and runner domain-local tests.

**Work:**

- Plot reference/current waveforms and windowed loudness on common time/amplitude scales. Use peak-preserving display reduction so a short transient is not averaged away.
- Implement fixed STFT window/FFT/hop parameters and shared dB scales for reference/current/difference spectrograms.
- Define whether the difference spectrogram visualizes difference audio or spectral-magnitude differences and label it; do not leave the meaning ambiguous.
- Handle exact silence without infinities in displayed data. Store analysis settings in report metadata.
- Keep all plots diagnostic: no screenshot-based pass/fail assertions.

**Validation:** Known tones produce expected frequency bins; a transient appears at its expected time; silence respects the display floor; gain/pitch/shift changes are visible on common scales. Test partial frames and channels.

**Acceptance criteria:**

- [ ] Plots show local timing, loudness, and spectral changes faithfully.
- [ ] Displays use stable, documented scales/settings.
- [ ] Diagnostic generation does not modify acceptance results or raw floats.

### Step 4.3 — Assemble reports and retain partial failures

**Depends on:** Steps 4.1–4.2.

**Files/areas:** HTML/JSON report writer, artifact paths, report integration tests.

**Work:**

- Write grouped case results with source/environment provenance, semantic diffs, thresholds, worst-error positions, diagnostics, previews, and plots.
- Produce a self-contained HTML document plus colocated audio files requiring no network access, and a machine-readable summary.
- Escape source/diagnostic text. Reports must not execute sketch code or load external scripts.
- Retain partial reports for evaluation/resource/worklet/timeouts; missing reference/current audio is represented clearly.
- Use unique per-run artifact paths, keep candidate/failed artifacts, and permit compact summaries for successful verification.

**Validation:** Open a successful and deliberately failed report locally, inspect an evaluation-only failure, and verify all links/media work with network access disabled. Integration tests confirm JSON classifications, escaping, and artifacts survive cleanup.

**Acceptance criteria:**

- [ ] A reviewer can hear and inspect the relevant changes without the REPL.
- [ ] Failures without audio still provide useful diagnostics.
- [ ] Generated reports/candidates are gitignored.

**Phase exit gate:** Manually review at least one intentional gain/timing/pitch mismatch and verify that both listening and plots agree with the numerical explanation.

---

## Phase 5 — Build the explicit baseline lifecycle

**Tracer bullet:** A developer generates repeatability-checked candidates, reviews their reports, explicitly approves selected cases, and subsequently verifies without changing references.

### Step 5.1 — Generate repeatability-checked candidates

**Depends on:** Phases 3–4.

**Files/areas:** Candidate command, staging storage, runner integration tests.

**Work:**

- Implement `audio:candidates --case <id>` with explicit selectors and at least two fresh isolated renders.
- Apply signal/resource/schema checks and the strict fixed comparison profile to repeated outputs; require semantic and numeric repeatability.
- Write lossless candidate data, metadata, repeatability evidence, and a review report outside approved references.
- Do not overwrite approved references or infer a wider tolerance from a mismatch.
- Retain failed candidate diagnostics but mark those candidates ineligible for promotion.

**Validation:** A synthetic case creates a valid candidate without touching approved files. Controlled nonrepeatable input, invalid audio, failed samples, and unexpected warnings produce ineligible candidates and nonzero exit codes.

**Acceptance criteria:**

- [ ] Only repeatable, healthy renders are eligible.
- [ ] Candidate output includes enough evidence for human review.
- [ ] Approved references are byte-identical before/after generation.

### Step 5.2 — Promote only explicit, still-valid candidates

**Depends on:** Step 5.1.

**Files/areas:** Approval command, safe writes, manifest validation, integration tests.

**Work:**

- Implement `audio:approve --case <id>` as an explicit local action, unavailable in CI.
- Revalidate candidate completeness, hashes, environment, profile/render settings, and repeatability evidence; reject a candidate if current inputs have changed since generation.
- Require an approval reason recorded with metadata or a review record. Make profile/threshold changes visible alongside audio/schema changes.
- Promote selected cases using an atomic reference-set replacement strategy; interrupted promotion must not leave a mixed old/new reference.
- Initially approve only reviewed synthetic fixtures, not placeholders for pending user sketches.

**Validation:** Integration tests reject stale/corrupt/failed candidates and CI invocation, preserve unrelated cases, and handle interrupted writes. Manually review the synthetic recordings/report and exercise one successful promotion.

**Acceptance criteria:**

- [ ] No generation or test command implicitly approves references.
- [ ] Promotion rejects stale inputs and incompatible provenance.
- [ ] Review reasons and threshold changes are traceable.
- [ ] Failed promotion preserves the prior complete reference set.

### Step 5.3 — Verify approved cases read-only

**Depends on:** Step 5.2.

**Files/areas:** `audio:verify` command, staged result handling, integration tests.

**Work:**

- Implement targeted/full verification against approved references using real renders and all configured gates.
- Missing references, an empty suite, and selectors matching no case fail with actionable instructions.
- Classify changed source/assets/settings/profile as stale provenance requiring review; do not use hash equality to skip rendering or hash difference to regenerate references.
- Distinguish incompatible environments from regressions. Non-authoritative inspection can render/report but cannot certify or promote an authoritative baseline.
- Return nonzero on any failed case, retain reports, and verify the reference directory is never written.

**Validation:** Verify approved synthetics, deliberately remove a reference, edit source/assets/settings, and simulate environment mismatch. Compare approved-file hashes before/after every successful and failed verification run.

**Acceptance criteria:**

- [ ] Equal renders pass; all configured failures are nonzero.
- [ ] Environment, provenance, resource, and comparison failures are distinguishable.
- [ ] Verification cannot mutate approved references.

### Step 5.4 — Demonstrate end-to-end regression sensitivity

**Depends on:** Step 5.3.

**Files/areas:** Cross-domain regression tests and their `support/` cases.

**Work:**

- Add a controlled mutation matrix for note pitch, onset/rhythm, gain/envelope, filter cutoff, sample selection, reverse direction, and stereo/channel mapping.
- Feed mutations through real source evaluation/rendering where the Fluid API expresses them. Apply artifact-level mutations only for format/channel guards that lack an equivalent source fixture.
- Confirm each mutation fails the intended semantic/audio checks. Include an audio-only corruption and a schema-only meaningful change to prove neither layer substitutes for the other.
- Leave approved references unchanged; mutated variants remain test support, not alternate approved outcomes.

**Validation:** Automated matrix fails each controlled variant against its reference and passes the original; manually inspect at least one synth and one sampler report. Record detection results in `feasibility.md` or a dedicated validation table.

**Acceptance criteria:**

- [ ] Representative regressions are detected through the real pipeline.
- [ ] The harness itself is tested for false passes, not only happy paths.
- [ ] Every reported mutation has an expected failure category/gate.

**Phase exit gate:** The complete candidate → review → approve → read-only verify loop works for synthetic cases, with evidence that intentional breakage is caught.

---

## Phase 6 — Integrate routine verification and operations

**Tracer bullet:** A clean authoritative environment runs the suite through the root test command and retains useful artifacts on failure, without any manual server setup.

### Step 6.1 — Finalize scripts and Turbo integration

**Depends on:** Phase 5.

**Files/areas:** Package scripts/README, Turbo task configuration where needed, build/setup tooling.

**Work:**

- Make package `test:ci` run unit/integration coverage and approved-case verification. Expose targeted verify/candidate/approval commands documented in the spec.
- Ensure workspace dependency builds are completed before browser imports; keep lightweight helper tests independently runnable.
- Integrate with root `pnpm test` and disable audio-task caching initially, including the relevant Turbo task override, so verification/artifacts cannot be skipped by cached success.
- Confirm generated outputs and reports stay outside source/reference inputs. Keep server/port ownership automatic.
- Document platform-incompatibility behavior and the command for authoritative local execution. Do not silently skip audio verification on a developer's different platform.

**Validation:** Run targeted commands and package `test:ci`, then root `pnpm test` on the authoritative lane. Rerun without source changes and confirm audio verification actually executes again. Check root discovery and exit propagation with an intentional failed case.

**Acceptance criteria:**

- [ ] Root tests discover and execute the audio package.
- [ ] Dependency builds and browser setup are explicit.
- [ ] Failures propagate; caching cannot hide audio runs or reports.

### Step 6.2 — Add the authoritative CI lane and artifacts

**Depends on:** Step 6.1.

**Files/areas:** CI configuration chosen for this repository, pinned environment setup, artifact retention instructions.

**Work:**

- Inspect the repository's current CI setup; add or extend the actual provider configuration rather than assuming one already exists.
- Install the locked dependencies/browser in the pinned OS/architecture lane and run approved verification plus relevant helper tests/checks.
- Upload summaries and failed/candidate diagnostic files even when the test task exits nonzero, including timeout/launch errors where artifacts exist.
- Make approved-reference storage read-only where practical. Enforce the prohibition on CI approval.
- Record runtime and report size against Step 2.5 budgets; keep concurrency conservative.

**Validation:** Run the lane once green and once with a controlled regression. Download/open the failure report offline, verify the reference remains unchanged, and confirm no secret app/database configuration was needed. If provider execution is unavailable, document the blocker; a local lane rehearsal alone does not mark hosted CI complete.

**Acceptance criteria:**

- [ ] CI provenance matches baseline provenance.
- [ ] Failed test jobs retain actionable artifacts.
- [ ] Approval cannot occur from CI.
- [ ] Measured runtime/storage stay within the recorded budget or trigger an explicit revision.

### Step 6.3 — Document usage and run production regression checks

**Depends on:** Step 6.2.

**Files/areas:** Package README, root testing documentation, this plan's outcome records.

**Work:**

- Document clean setup, targeted/full verification, adding a fixture, local sample mapping, environment mismatch, candidate review/approval, and intended baseline changes.
- Explain signal/semantic gates, units, tails/bar counts, licensing, and why plots are diagnostics rather than screenshot assertions.
- Describe known limitations: fixed graphs, no real-time timing guarantee, no hardware MIDI, and no async evaluation expansion.
- Run all relevant production checks after shared changes and record results; keep any unrelated pre-existing failures separate.

**Validation:** Follow the README from a clean authoritative checkout. Run the common verification checklist below. Have a reviewer reproduce one failure and its explicit baseline-update workflow from the documentation.

**Acceptance criteria:**

- [ ] A developer can operate the suite without undocumented setup.
- [ ] Shared production changes preserve current app/engine behavior.
- [ ] Package/workspace checks and the authoritative audio suite pass.

**Phase exit gate:** Synthetic coverage is operational and may merge independently of user-sketch delivery. Do not claim representative API coverage until Phase 7 is complete.

---

## Phase 7 — Onboard the representative user sketches

**Tracer bullet:** The user's actual manual regression set becomes approved, locally reproducible automated coverage with a documented feature/gap map.

### Step 7.1 — Inventory sketches and make resources reproducible

**Depends on:** Phase 6 and supplied sketches/assets.

**Files/areas:** Registered source fixtures, local assets/provenance, coverage matrix.

**Work:**

- Obtain each sketch's intended protected behaviors and permission to commit sample files, or agree on synthetic alternatives.
- Choose an initial 5–10 representative cases spanning public API use: synths, chords/rests/multi-bar transformations, seeds/chance, envelopes/LFOs/effects, sampler region/chop/fit/reversal, buses/sends, and mixed output.
- Keep source unchanged where possible. Document and get approval for every resource replacement or nondeterministic-input edit; never quietly rewrite musical behavior.
- Map built-in/external sample sources to fixed local copies without losing key/variation distinctions.
- Set sufficient bar/tail lengths and explicit signal expectations for each case. Record missing coverage instead of implying every API feature is covered.

**Validation:** Evaluate and render each imported sketch with the network blocked, inspect diagnostics, and compare its intended behavior with the user's existing listening expectations. Async/live-control-dependent sketches are documented as deferred rather than adapted silently.

**Acceptance criteria:**

- [ ] Every case has a stable ID, feature rationale, and adequate duration.
- [ ] Sample licensing/provenance and resource mappings are complete.
- [ ] All source adaptations are explicit and approved.

### Step 7.2 — Review and approve the initial representative references

**Depends on:** Step 7.1.

**Work:** Generate candidates through the normal repeatability-checked command. Review schema, measurements, plots, and recordings with the user. Record approval reasons and promote selected candidates; correct or defer any fixture whose initial output is not trusted.

**Validation:** Manual listening approval for each representative sketch, automated repeatability evidence, then full read-only authoritative verification after promotion. Listening may use reports; the app is optional and requires permission if it must be started.

**Acceptance criteria:**

- [ ] Every representative reference is listening-approved, not merely generated from today's engine.
- [ ] Full verification passes without external resources or warnings.
- [ ] Pending/unapproved cases are clearly identified, not auto-created on the next run.

### Step 7.3 — Verify coverage and close out

**Depends on:** Step 7.2.

**Work:** Re-run controlled sensitivity tests for the newly covered sampler/effect/routing behaviors where the synthetic matrix is insufficient. Record suite runtime/storage and the final feature/gap map. Document deferred follow-ups without adding them to this implementation.

**Validation:** Common verification checklist, full authoritative suite, representative failure report review, and unchanged-reference checks. Verify CI runs all approved registered cases rather than only the original synthetics.

**Acceptance criteria:**

- [ ] User sketches participate in normal local/root/CI verification.
- [ ] Distinct newly protected behaviors have demonstrated failure sensitivity.
- [ ] Runtime/artifacts remain manageable with the representative set.
- [ ] Completion records distinguish automated results, human approvals, and remaining gaps.

---

## Common verification checklist

Use the narrowest relevant commands at each step; run the full set for shared-seam PRs and final closeout. Formatting should target changed files/packages, not rewrite unrelated work.

**New package, once implemented:**

- [ ] `pnpm --filter @web-audio/audio-regression check`
- [ ] `pnpm --filter @web-audio/audio-regression lint`
- [ ] Changed-file/package formatting check
- [ ] Comparator/serialization/report unit tests
- [ ] Browser lifecycle/rendering/resource integration tests
- [ ] `pnpm --filter @web-audio/audio-regression test:ci` on the authoritative lane after Phase 6

**Changed production packages:**

- [ ] Fluid build/check/lint/test:ci for shared evaluation changes
- [ ] Clock build/check/lint/test:ci for capability-contract changes
- [ ] Audio-engine build/check/lint/test:ci for context/clock changes
- [ ] Worklet/dependent package verification where touched
- [ ] App check/lint and relevant worker/player tests using actual app scripts

**Workspace/final:**

- [ ] `pnpm check`
- [ ] `pnpm lint`
- [ ] `pnpm test` on the authoritative lane once integrated
- [ ] `pnpm exec prettier --check plans/audio-regression-testing/spec.md plans/audio-regression-testing/plan.md`
- [ ] `git diff --check`
- [ ] No production import from test support or the regression package
- [ ] No verification command modifies approved reference files
- [ ] No generated artifact/candidate is staged for commit

## Reassessment gates

Pause and revise the plan/spec if implementation requires:

- mocks instead of real offline worklets or sample decoding;
- tolerance widening without measured repeatability evidence;
- changes to production musical/evaluation semantics;
- a general parameter host, replacement scheduler, or duplicated event compiler;
- async REPL semantics, live graph replacement, or MIDI input to render the initial fixtures;
- external unpinned samples or platform-dependent auto-approved references;
- normalizing gain/time/channels to make mismatches disappear;
- unsafe concrete-type casts to bypass context/clock boundaries;
- reference storage or suite runtime beyond the measured budgets.

A newly discovered production bug or unsupported sketch should produce a documented decision, not a golden recording that legitimizes broken output.

## Completion criteria

- [ ] Every numbered step has recorded validation and all hard gates are satisfied.
- [ ] Actual Fluid source runs through the shared evaluator and real engine offline.
- [ ] Local samples and real worklets are tested with external networking blocked.
- [ ] Semantic and raw/windowed audio assertions catch representative intentional regressions.
- [ ] Tolerances, limits, formats, analysis settings, and authoritative environment are documented and pinned.
- [ ] Candidate generation proves repeatability; approval is explicit and unavailable in CI.
- [ ] Verification is read-only and classifies environment/provenance failures separately.
- [ ] Reports are useful for listening and visual inspection, including partial failures.
- [ ] Root/CI verification executes all approved cases and retains failed artifacts.
- [ ] Representative user sketches have listening-approved references and documented coverage gaps.
- [ ] Production/package/workspace verification is green, with unrelated blockers documented rather than hidden.
