# Fluid Audio Regression Testing Implementation Plan

## Status and goal

**Phase 0 is complete on the user's Mac. Phase 1 is in progress: Steps 1.1–1.4 are complete; Step 1.5 is next.** Phases 2–3 have not started. This simplified plan implements [spec.md](./spec.md); production characterization and test evidence are in [feasibility.md](./feasibility.md).

The deliverable is a local command that runs saved Fluid sketches through the real engine and compares their audio to listening-approved recordings. It does not require Linux, containers, hosted CI, a report application, or a separate candidate/approval system.

## Execution rules

- Each numbered step is independently testable on top of its prerequisites. Keep existing builds/tests green; record validation before checking off a step.
- Production seam changes preserve current behavior. Report discovered engine bugs instead of approving their broken output as a reference.
- Keep the existing private `packages/audio-regression` package. Production modules never import it or test support.
- Use domain-local `__tests__/` for unit tests, package-level `src/__tests__/` for integration tests, and suite-local `support/` for fixtures. Keep tests in TypeScript checking.
- Install dependencies through pnpm. Use real context/clock capabilities, not `as any` or casts pretending an offline context/driver is a concrete real-time object.
- The runner owns its loopback server; do not start an app `dev` command. Ask permission if manual app review actually requires one.
- Retain real worklets/decoding, local samples, fixed seeds/settings, isolated cases, loading diagnostics, and timeouts/cleanup.
- Do not normalize gain, align time, trim silence, clip samples, or widen tolerances to make a regression disappear.
- Onboard supplied sketches as soon as the harness supports them. No plots or CI prerequisite.

## Phase map

| Phase                       | Usable outcome                                                       | Prerequisite                  |
| --------------------------- | -------------------------------------------------------------------- | ----------------------------- |
| 0 — Characterize and launch | Production inventory and passing browser launch/cleanup on the Mac   | Complete                      |
| 1 — Render                  | Real, repeatable synth/sample/LFO output from a local command        | Phase 0                       |
| 2 — Compare                 | Float-WAV references, verify/update commands, and failure recordings | Phase 1                       |
| 3 — Use                     | Listening-approved user sketches in routine local/root tests         | Phase 2 and supplied sketches |

The current phase numbers replace the previous eight-phase plan. All previously unimplemented report, provenance, schema-snapshot, promotion, and hosted-CI steps are deferred—not prerequisites hidden elsewhere.

---

## Phase 0 — Characterize and launch (complete)

### Step 0.1 — Record the existing contract

**Completed work:** Inventoried context/clock consumers and recorded worker evaluation, BPM, commit/scheduling, preparation, lifecycle, LFO, and sample-warning behavior. Added eight tests importing the actual worker and real Fluid with only host messaging stubbed.

**Validation:** Fluid 1,007 tests, engine 316, clock 3, worklets 28, worker protocol 8, and app AudioPlayer browser tests 8 passed. Workspace checking/linting/tests and formatting passed. See `feasibility.md` for commands and limitations.

- [x] Rendering/clock capability inventory is available for Phase 1.
- [x] Shared evaluation has behavior to preserve.
- [x] Existing production behavior is characterized without implementation changes.

### Step 0.2 — Create the private package and local browser smoke

**Completed work:** Added package checking/lint/format scripts and exact Playwright dependency, plus launch/page/cleanup tests for success, callback failure, and missing-executable recovery. Removed the unnecessary image/environment pins and their tests during scope cleanup.

**Validation:** Three real browser smoke tests pass on the Mac; package check/lint/format pass. Browser installation/setup is documented in the package README. A browser-version string is collected in smoke tests, not checked against a duplicate environment manifest.

- [x] Playwright is pinned through package/lockfile, with no separate environment framework.
- [x] Local browser tests run without app/database credentials and clean up on failures.
- [x] Package is private and not a production dependency.

**Outcome:** Phase 0 is closed. Browser launch alone is not proof of audio consistency; actual render/repeatability checks remain Phase 1.

---

## Phase 1 — Render real audio locally

**Usable outcome:** A targeted command renders a real synth, local sampler, and LFO-filtered synth with deterministic timing, no manual REPL operation, and useful loading/error diagnostics.

### Step 1.1 — Share synchronous Fluid evaluation

**Files/areas:** Fluid evaluation helper/export, REPL worker, public API and worker tests.

**Work:** Extract the fresh-Drome/source/schema operation into a small helper used by worker and harness. Preserve `drome`/`d` aliases, defaults, ignored source return values, synchronous execution, and errors. Keep message handling in the worker; do not add async language support or claim a sandbox.

**Completed work:** Added the public `evaluateSource(code)` export in Fluid (`src/evaluate-source.ts`) and updated the REPL worker to call it. Kept the default Drome export and worker messaging/error serialization unchanged. The helper is ready for the future harness; it executes trusted source synchronously, ignores source return values/promises, and propagates errors. Added 11 public API tests for aliases, defaults, state isolation, ignored returns, error recovery/non-Error throws, and synchronous promise behavior.

**Validation:** Fluid check/lint/build and all 1,018 tests passed. Forced builds/tests for Fluid, clock, audio-engine, and worklets passed; all 8 unchanged worker protocol tests and 8 existing AudioPlayer browser tests passed against freshly built Fluid. Workspace check/lint/tests, changed-file formatting, and `git diff --check` passed; unchanged workspace tasks may be cached.

- [x] Worker uses the shared operation without protocol/behavior changes.
- [x] Existing characterization tests remain green.

### Step 1.2 — Accept a rendering context

**Depends on:** Phase 0 inventory; independently reviewable from Step 1.1.

**Files/areas:** Engine, instruments, buses, caches/reversal, worklet registration, relevant tests/types.

**Work:** Narrow rendering-only context annotations to `BaseAudioContext` or the small capabilities actually used. Retain real-time context management and resume/close behavior in their owners. Do not change scheduling, envelopes, nodes, or sample behavior.

**Completed work:** Replaced rendering-only `AudioContext` annotations with native `BaseAudioContext` in the engine, base/synth/sampler instruments, buses/effect construction, sample cache/reversal, and worklet registration. No runtime logic, clock types, context lifecycle ownership, or existing tests changed. Added three package-level type-contract tests, included in TypeScript checking, covering cast-free engine construction with both native contexts, all rendering consumers, and the unchanged real-time clock context boundary.

**Validation:** Engine check/lint/build and all 319 tests in 21 files passed (316 existing, 3 new type-contract cases). Forced builds/tests for Fluid, clock, audio-engine, and worklets passed; the unchanged worker and AudioPlayer browser suites each passed all 8 tests against freshly built dependencies. Workspace check/lint/tests, changed-file/document formatting, and `git diff --check` passed; unchanged workspace tasks may be cached. This is context type compatibility, not yet an actual offline browser render; clock-driver compatibility and real rendering remain Steps 1.3–1.4.

- [x] Offline context is accepted without an `AudioContext` cast.
- [x] Production playback and relevant existing tests are unchanged.

### Step 1.3 — Accept a small clock driver

**Depends on:** Step 1.2 and Phase 0 inventory.

**Files/areas:** Clock capability types, engine/instrument/MIDI scheduler consumers, type/tests.

**Work:** Derive the engine-facing clock contract from existing `on`, `bpm`, `barDuration`, and scheduler timing/conversion capabilities. Keep the real-time clock implementation unchanged. Do not clone its whole class or build another real-time scheduler.

**Completed work:** Added the public `EngineClock` type in audio-engine, deriving event/tempo/duration members from `AudioClock` and composing the MIDI scheduler's existing structural clock type. Narrowed instrument consumers to `InstrumentClock` (only `barDuration`). The real-time clock and all production runtime logic remain unchanged; the MIDI scheduler only gained a type export. Added a cast-free test-only manual driver, three type-contract cases, and three engine behavior cases covering commit/BPM, exact bar/bus timing, stop/unsubscription, default tempo reset, and MIDI lead validation. Existing Web Audio/instrument mocks are reused for behavior tests; this is not audio-rendering evidence.

**Validation:** Engine check/lint/build and all 325 tests in 22 files passed (6 new cases). Forced builds/tests for Fluid, clock, audio-engine, and worklets passed; worker and AudioPlayer browser suites each passed all 8 tests against freshly built dependencies. Built declarations expose `EngineClock` without requiring the real-time clock class's private state or transport API. Workspace check/lint/tests, changed-file/document formatting, and `git diff --check` passed; unchanged workspace tasks may be cached. Actual browser rendering remains Step 1.4.

- [x] Engine can subscribe and commit through a structural driver.
- [x] Existing MIDI scheduler construction invariant remains valid.
- [x] Real-time clock behavior is unchanged.

### Step 1.4 — Own the harness and render a synth

**Depends on:** Steps 1.1–1.3.

**Files/areas:** Browser harness, Node/Playwright runner, typed cases, integration `support/`.

**Work:**

- Start/stop a small Vite harness on an available loopback port. Keep file I/O in Node and real audio in the browser; no production app/database setup.
- Register cases with ID/source, bars/tail, shared render defaults, local resources, and audible/silent expectation. Reject invalid settings, duplicate IDs, and unknown selectors.
- Create fresh page/context, evaluator, offline context, driver, and engine per render.
- Await readiness/preparation, commit with `prebar`, emit exact `bar` events using committed BPM, then render requested bars plus tail.
- Return original Float32 channels and actual browser/render settings to Node.
- Bound execution from Node, including synchronous evaluation hangs; clean up page/context/server/browser on all exits.
- Expose `audio:render --case <id>` for initial diagnostic use. It is not yet verification.

**Completed work:** Added the owned loopback Vite harness, validated case registry/settings, real browser source/engine rendering, an offline driver satisfying `EngineClock`, Float32 transfer and signal-health metrics, and `audio:render --case <id>`. Each case has isolated page/context/engine state. A Node-side execution deadline covers navigation/readiness, synchronous source hangs, rendering, and request draining; cleanup runs on success/failure. External requests and unexpected browser/HTTP diagnostics fail. Vite uses no SPA fallback so missing resources remain errors. CLI/tests build changed workspace dependencies through existing Turbo tasks before importing them. Sample-resource entries/decoding remain Step 1.5; sampler cases are explicitly rejected until supported, and authored MIDI output is excluded.

**Validation:** All 44 regression-package tests in 6 files passed, including real 440 Hz stereo sine output, default 120/schema 90 BPM, multi-bar onset timing, exact frame count/start silence, release tail, mono/44.1 kHz, explicit silence, invalid settings/source/selectors, browser/network diagnostics, a Node-bounded infinite source loop followed by recovery, and server/browser startup/failure cleanup. The CLI rendered 112,800 stereo frames at 48 kHz/120 BPM, peak 0.1625 and RMS about 0.106532 per channel. Package/workspace checking, linting, tests, formatting, and `git diff --check` passed; unchanged workspace tasks may be cached. No production implementation changed. Worklet registration is real, but sampler decoding and LFO processor output/repeatability are not yet claimed; there are no WAVs/references/comparisons yet.

- [x] Render goes through real engine commit and scheduling, not fake instruments/nodes.
- [x] No clock start, musical sleeps, speaker capture, or pre-render destruction.
- [x] Failure cleanup and Node-side timeout work.

### Step 1.5 — Render local samples and reject loading failures

**Depends on:** Step 1.4.

**Files/areas:** Sample fixtures, loopback serving, diagnostics, sampler integration tests.

**Work:** Serve tiny tone/asymmetric-transient fixtures through inline manifests/local URLs. Use supplied sample files if available, with origin/license notes. Map relevant built-in sources to local copies only when a case needs them. Block external requests, including workers if used; fail on HTTP/decode/resource errors and unexpected sampler warnings despite `prepare()` resolving.

**Validation:** Render a real decoded sample and its reversal/region; assert missing/corrupt samples and external URLs fail. Include a sample failure alongside a healthy voice so partial audio cannot disguise the failure.

- [ ] Fetch/decode/playback are real, not mocked.
- [ ] No external host is needed or used as fallback.
- [ ] Loading failures cannot pass as healthy renders.

### Step 1.6 — Prove worklets, isolation, and repeatability

**Depends on:** Steps 1.4–1.5.

**Files/areas:** LFO/seeded/multi-bar fixtures and render integration tests; brief measurements in `feasibility.md`.

**Work:** Render an LFO-filtered synth using the real processor, including bar-level endpoint changes. Add explicitly seeded random/chance behavior and a multi-bar case. Repeat renders, including a fresh browser launch and different case order; test alternate-direction state in fresh instances. Initial fixtures do not author MIDI output, whose scheduler can queue real-time timers.

Measure maximum/RMS differences for the synth/sample/LFO set. Record observations and choose a documented suite-wide tolerance pair; no named profile system, OS certification, or formal budget exercise. Do not automatically relax tolerances until output agrees.

**Validation:** Modulation differs from a static control, worklet errors fail, repeat renders agree at fixed measured tolerances, and prior cases do not change the next case's output.

- [ ] Real worklet affects audio; no registration/runtime error is hidden.
- [ ] Isolated renders do not retain voices, caches, or direction state.
- [ ] Repeatability is measured on the Mac, including a fresh launch.

**Phase exit gate:** Real synth/sample/LFO rendering and repeatability are demonstrated. If not, report the specific blocker before creating references; do not substitute mocks or silently accept silence.

---

## Phase 2 — Compare recordings and update references explicitly

**Usable outcome:** A local command compares float-WAV references, catches meaningful sound changes, and leaves recordings to inspect. A separate explicit update command replaces only selected references.

### Step 2.1 — Read/write standard float WAVs

**Depends on:** Phase 1.

**Files/areas:** WAV reader/writer and runner domain-local tests.

**Work:** Use standard 32-bit IEEE-float WAV for references and generated recordings. Preserve channels, sample rate, and Float32 values directly, including finite amplitudes above one. Read samples in Node rather than browser decoding/resampling. Store a small JSON sidecar with render settings and actual browser version; no hashes, schema golden, custom binary container, or compatibility manifest.

**Validation:** Known mono/stereo arrays round-trip exactly; verify sample rate/frame count/channel order, values above one, and clear rejection of malformed/unsupported/truncated WAVs. Play one generated file locally to check it is useful for listening.

- [ ] References retain the actual rendered floats without quantization/clipping.
- [ ] WAV files work as both references and listening recordings.
- [ ] Metadata is small and diagnostic, not an environment certification gate.

### Step 2.2 — Implement basic numerical and signal checks

**Depends on:** Step 2.1 and measured tolerances from Step 1.6.

**Files/areas:** Comparator and unit tests.

**Work:** Check matching rate/channels/frame count, finite samples, audible-versus-intentionally-silent expectation, and per-channel maximum/RMS sample error. Report threshold values and worst-error channel/sample/time. Do not impose blanket peak limits above one, normalize gain/time, or require schema/windowed/spectral assertions.

**Validation:** Small known arrays cover identity, gain change, dropped transient, sample shift, channel swap, invalid samples, shape mismatch, and explicit/unexpected silence. Test threshold boundaries.

- [ ] Localized changes fail the maximum-error gate even if overall RMS is small.
- [ ] Signal health and comparison errors are clearly explained.
- [ ] No comparison preprocessing can hide a regression.

### Step 2.3 — Verify read-only and save failure audio

**Depends on:** Steps 2.1–2.2.

**Files/areas:** `audio:verify`, reference paths, failure artifacts, integration tests.

**Work:** Render selected/all registered cases and compare with committed WAVs. Print case IDs, diagnostics, max/RMS/thresholds, and worst-error location. On mismatches, write reference/current/difference float WAVs under ignored `artifacts/`; document the difference sign. Handle missing-reference current-only audio and failures without a rendered buffer.

Fail for missing references, empty suites, and unknown selectors. Always render; no source/asset hash gates or environment-based skips. Browser/version changes may produce a helpful warning but do not prohibit running locally. Never write references during verification.

**Validation:** Known equal renders pass; deliberate mismatch/failed evaluation/missing sample/missing reference fails with useful output. Compare reference files before/after both success and failure. Listen to one failure's A/B files.

- [ ] Default verification is read-only and nonzero failures propagate.
- [ ] Empty or missing coverage cannot appear green.
- [ ] Failure recordings are useful without an HTML/plot framework.

### Step 2.4 — Provide one explicit update command

**Depends on:** Step 2.3.

**Files/areas:** `audio:update --case <id>`, reference I/O, integration tests, README.

**Work:** Update explicitly selected references using fresh, healthy renders. Validate/render before replacing the selected WAV/settings; failed source/loading/rendering leaves old references untouched. No separate candidates, promotion, enforced approval reasons, or reference-set transaction machinery. Document listening and git review before committing intended changes.

**Validation:** Explicit update creates/replaces the chosen reference only, and subsequent verification passes. Failed updates preserve old reference files; ordinary verification never updates. Check repeated output for new cases before accepting their first recording.

- [ ] Reference updates require an explicit separate command.
- [ ] Broken rendering/loading cannot overwrite an old reference.
- [ ] Listen/review/commit workflow is documented and tested once manually.

### Step 2.5 — Show that actual regressions are caught

**Depends on:** Step 2.4.

**Files/areas:** Focused integration cases and suite-local test support.

**Work:** Compare a few controlled pitch, timing, gain, filter, sample-selection, and reverse-direction changes against original references through real source rendering. Reuse cases rather than build an exhaustive mutation framework. Keep mutated variants outside approved references.

**Validation:** Originals pass; changed variants fail the intended numerical/resource/evaluation checks. Inspect at least one synth and one sampler failure recording. Unit tests already cover artifact-level corruption/channel guards.

- [ ] The suite detects representative meaningful changes, not just malformed files.
- [ ] Failed variants do not silently regenerate or alter references.

**Phase exit gate:** Render → compare → listen → explicit update → verify works locally. Supplied sketches can already use this workflow; plots and hosted CI remain optional.

---

## Phase 3 — Use the suite for real sketches

**Usable outcome:** The user's manual regression sketches have trusted references and run with one local command, including normal root test invocation.

### Step 3.1 — Register representative sketches and samples

**Depends on:** Rendering/comparison support and supplied sketches; start importing during Phases 1–2 whenever supported.

**Files/areas:** Case registry, source/sample fixtures, brief coverage notes.

**Work:** Obtain sketches, intended protected behavior, and sample files suitable for committing. Preserve source where possible; document and get agreement for resource/nondeterministic-input changes. Use local resources, explicit seeds, and enough bars/tail for each pattern. Start with the available representative set; no required case-count target before the suite is useful.

**Validation:** Render each case with external networking blocked and inspect errors. Check repeatability for new cases. Identify async/live-control/hardware-dependent cases as deferred rather than silently rewriting their behavior.

- [ ] Each case has an ID, purpose, adequate duration, and local resources.
- [ ] Source/resource adaptations and sample permissions are explicit.
- [ ] Missing behaviors are noted without requiring a comprehensive coverage program.

### Step 3.2 — Listen and commit initial references

**Depends on:** Step 3.1 and Phase 2 commands.

**Work:** Use `audio:update` for selected healthy cases. Listen to every initial recording with the user, review settings and changes, and commit only trusted output. Incorrect recordings are corrected/discarded before commit, not automatically legitimized by the command.

**Validation:** User listening approval plus repeated renders for initial cases, then full read-only verification on the Mac. Use recordings for listening; the app is optional and starting it requires permission.

- [ ] Initial representative references are trusted by listening, not just generated.
- [ ] Full verification passes without external resources or warnings.

### Step 3.3 — Connect normal local testing and document operation

**Depends on:** Working references from Step 3.2; hosted CI is not a prerequisite.

**Files/areas:** Package scripts/README, Turbo task configuration where needed, root testing documentation.

**Work:** Add package `test:ci` for root Turbo discovery, running helper/integration tests and approved-case verification. Ensure workspace dependency builds and browser setup are documented. Disable audio-task caching initially so routine tests actually render. Keep automatic server/port cleanup. Document targeted/full verification, fixture addition, explicit updates, and reading failure recordings.

**Validation:** Run package/root tests locally; rerun unchanged and confirm audio verification executes. Deliberately fail a case and confirm root exit propagation and unchanged references. Run checking/lint/format and relevant production tests after shared changes.

- [ ] One documented local command runs all approved user cases.
- [ ] Root tests discover audio verification and propagate failures.
- [ ] Verification always renders and never updates references.
- [ ] Package/workspace verification is green and setup has no hidden app/container requirements.

**Completion:** The initial suite replaces routine manual REPL regression checks with repeatable audio comparison and useful recordings. It does not certify musical quality, real-time transport behavior, or other platforms.

---

## Verification and scope guard

At each changed step, run package check/lint/format and relevant unit/integration tests. For shared evaluation/context/clock changes, build and test Fluid, clock, audio-engine, touched dependencies, and relevant worker/player app suites. Run workspace `pnpm check`, `pnpm lint`, `pnpm test`, planning-document formatting, and `git diff --check` at closeout. Root tests before Step 3.3 do not yet include this package's audio verification.

Stop and reassess if implementation requires mocked worklets, a duplicate event compiler, altered production musical semantics, unsafe context/clock casts, external sample fallbacks, or unexplained tolerance widening. Keep fixes narrow.

Deferred enhancements—not completion gates:

- Waveform/loudness/spectrogram plots and HTML/JSON reports.
- Schema snapshots, LFO identity canonicalization, and resolved-event assertions.
- Windowed/spectral acceptance checks and named tolerance profiles.
- Source/asset hashes and richer provenance.
- Candidate/promotion tooling or stronger multi-case write transactions.
- Hosted CI, container/OS images, other browsers/platforms.
- Live graph/tempo changes, MIDI input/output, stop/restart rendering, and REPL UI automation.
- **Workspace tooling dependency normalization (separate follow-up, outside this SOW):** Vite currently resolves to 8.0.12 for web/audio-regression and 8.2.1 through Astro/library-package Vitest. Other shared tooling currently agrees, but declarations mix exact pins and caret ranges. Consider pnpm catalogs for shared tooling versions, a consistent pinning policy, explicit Vite dependencies for library tests, and review of the root Rolldown override. Respect framework compatibility rather than forcing every transitive dependency to one version. Generate all dependency/lockfile changes through pnpm; validate affected builds/tests and reassess audio repeatability/references if browser or rendering dependencies change. This is not a prerequisite for the audio-regression deliverable.
