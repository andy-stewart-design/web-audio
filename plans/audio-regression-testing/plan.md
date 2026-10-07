# Fluid Audio Regression Testing Implementation Plan

## Status and goal

**The initial local suite is implemented, with 11 listening-approved cases and root test integration.** The user confirmed listening review is complete and everything sounds good. Tooling tests have been simplified to independent fixtures and focused contracts; root testing freshly verifies all authored cases once. Earlier numbered validation records below are historical: some characterization suites and helper paths were retired during simplification, not retained as duplicate routine checks. The reviewed fixed comparison limits are now **maximum `1e-6` / RMS `1e-7`**, following causal investigation of native mixing roundoff. Current references are `references/<id>/render.wav` and `metadata.json`; samples map automatically from each case's `samples/` folder, with optional explicit overrides. This plan implements [spec.md](./spec.md); historical characterization/test evidence is in [feasibility.md](./feasibility.md), and the later policy/evidence is in [repeatability.md](./repeatability.md). Earlier numbered validation records retain their historical paths/0/0 policy.

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

**Completed work:** Added per-case `resources` mappings from exact normalized sample URLs to local files, case-scoped HTTP mounts, and real sampler support. Only declared URLs are remapped in the freshly evaluated schema; bank/name/source-key/variation identity and engine resolution/preparation remain unchanged. Added two tiny procedural PCM16 input WAVs with generator/provenance notes, plus `sample-tone` and `sample-reverse` diagnostic cases. Requests/console diagnostics are observed across the browser context, including worker requests; HTTP/file/decode errors and sampler warnings reject partial renders. Resource mounts are disposed after context cleanup. No production implementation, dependency, or lockfile changed.

**Harness corrections:** Vite treats port zero as its default port, so Node now owns an actual `listen(0)` HTTP listener with Vite in middleware mode; simultaneous default harnesses use distinct ports without probe/rebind races. Frame calculation retains the integer start offset and rounds musical/tail frames, avoiding a floating-point-only extra frame. Both corrections have regression coverage.

**Validation:** All 66 package tests in 8 files passed, including 17 real sampler cases covering decoded pitch/duration, reversal, forward/reversed regions, sprites, selected variations, explicit built-in source mapping, and missing/corrupt/unmapped/external resources. Failures alongside healthy synth/sampler voices are rejected, failed cases recover, and an authored worker's external fetch is blocked. HTTP tests cover original bytes, mount isolation/disposal, missing files/directories, and no HTML fallback. Both sample CLI cases rendered 105,600 stereo frames at 48 kHz/120 BPM; tone peak/RMS about 0.437513/0.147232, reverse about 0.524995/0.0932111. Package/workspace check/lint/tests, formatting, and `git diff --check` passed; unchanged workspace tasks may be cached. Input WAVs are not reference recordings: LFO execution/repeatability remain Step 1.6 and output WAV/comparison remain Phase 2.

- [x] Fetch/decode/playback are real, not mocked.
- [x] No external host is needed or used as fallback.
- [x] Loading failures cannot pass as healthy renders.

### Step 1.6 — Prove worklets, isolation, and repeatability

**Depends on:** Steps 1.4–1.5.

**Files/areas:** LFO/seeded/multi-bar fixtures and render integration tests; brief measurements in `feasibility.md`.

**Work:** Render an LFO-filtered synth using the real processor, including bar-level endpoint changes. Add explicitly seeded random/chance behavior and a multi-bar case. Repeat renders, including a fresh browser launch and different case order; test alternate-direction state in fresh instances. Initial fixtures do not author MIDI output, whose scheduler can queue real-time timers.

Measure maximum/RMS differences for the synth/sample/LFO set. Record observations and choose a documented suite-wide tolerance pair; no named profile system, OS certification, or formal budget exercise. Do not automatically relax tolerances until output agrees.

**Completed work:** Registered `lfo-filter`, `seeded-multibar`, and `sample-alternate`. Real filter modulation differs from a static control, and endpoint changes affect bar two without altering bar one. Analytical gain-LFO checks exercise authored origin/phase at non-quantum-aligned offsets in 48/44.1 kHz renders. Seeded chance produces hits/misses across three bars; changing the pitch seed changes audio without changing hit timing, while changing the chance seed changes hit timing. Alternate sample direction crosses an odd-hit bar boundary and restarts forward in fresh instances.

The harness observes native worklet-node failure events without changing DSP. Chromium 147 delivers its `onprocessorerror` event with type `error`, so both event names are observed; native error messages are retained. Real module registration, constructor, first-quantum, and final-quantum faults reject renders alongside healthy voices and recover. No arbitrary diagnostic sleep, production implementation, dependency, or lockfile change was needed.

**Measurements:** All six registered cases were rendered four times: baseline, same-order repeat, reversed order after odd alternate-state/different-asset/silence interference, and reversed order in a fresh browser/server launch. All 18 comparisons (both channels, full original frame lengths) measured maximum error **0** and RMS error **0**. A separate fresh process repeated these measurements. Chose immutable suite-wide `COMPARISON_TOLERANCE = { maxError: 0, rmsError: 0 }` in the existing runner audio module and enforce it in repeatability tests. No unexplained variance was accepted, no samples were processed, and no slack was invented; newly supplied sketches and browser/rendering changes still need remeasurement/review. Phase 2 will reuse this pair.

**Validation:** All 77 package tests in 10 files passed, including 7 real worklet cases and 4 measurement/seed/direction/repeatability cases. The three new CLI cases rendered healthy stereo audio at 48 kHz/120 BPM. Package/workspace check/lint/tests, formatting, and `git diff --check` passed; unchanged workspace tasks may be cached. See `feasibility.md` for per-case frame counts, observations, commands, and limits. Output WAVs/reference comparison/listening approval remain Phases 2–3.

- [x] Real worklet affects audio; no registration/runtime error is hidden.
- [x] Isolated renders do not retain voices, caches, or direction state.
- [x] Repeatability is measured on the Mac, including a fresh launch.

**Phase exit gate passed:** Real synth/sample/LFO rendering, failure diagnostics, isolation, and local repeatability are demonstrated. Phase 1 is closed; standard float-WAV I/O follows in Step 2.1 below. No listening-approved reference exists yet.

---

## Phase 2 — Compare recordings and update references explicitly

**Usable outcome:** A local command compares float-WAV references, catches meaningful sound changes, and leaves recordings to inspect. A separate explicit update command replaces only selected references.

### Step 2.1 — Read/write standard float WAVs

**Depends on:** Phase 1.

**Files/areas:** WAV reader/writer and runner domain-local tests.

**Work:** Use standard 32-bit IEEE-float WAV for references and generated recordings. Preserve channels, sample rate, and Float32 values directly, including finite amplitudes above one. Read samples in Node rather than browser decoding/resampling. Store a small JSON sidecar with render settings and actual browser version; no hashes, schema golden, custom binary container, or compatibility manifest.

**Completed work:** Added dependency-free Node float-WAV encoding/decoding (`src/runner/wav.ts`) and WAV/JSON storage (`src/runner/recording.ts`), with `RecordingMetadata` in the existing private types module. Writer uses little-endian IEEE float32 tag 3, 18-byte WAVEFORMATEX (`cbSize=0`), a per-channel `fact` frame count, and interleaved `data`. Reader validates lengths/chunks/format/frames/finiteness, skips unknown padded chunks, and returns original Float32 channels without browser decoding. The intentionally narrow codec rejects PCM, float64, extensible/RF64/big-endian and nonconforming headers rather than converting them. Sidecars retain only ID, render settings, bars/tail, BPM/frame count and actual browser version; fields and audio shape are validated, but changed browser provenance is accepted.

`audio:render --case <id>` now saves the successful selected diagnostic recording to ignored `artifacts/render/<id>.wav` plus `.json`, printing paths. It does not create/promote references or compare audio. Validation/encoding happens before file writes; diagnostic storage is ordinary file I/O, not a reference-set transaction. Production engine, dependencies, lockfile, input sample bytes and measured tolerances are unchanged.

**Validation:** All **122 package tests in 13 files passed**: 77 existing plus 27 codec, 16 storage/metadata, one native-render storage integration and one CLI recording check. Independent known bytes, mono/stereo/four-channel ordering, byte-offset views, negative zero/subnormals/largest finite float/above-one peaks, malformed/truncated/unsupported files, padded extra chunks, bad sidecars/shape and validation-before-write are covered. Real stereo, mono/44.1 kHz and above-one synthesis round-trip every sample exactly. CLI saved sine and LFO recordings; macOS `afinfo` recognized sine as stereo 48 kHz Float32, 112,800 frames/2.35 s with data offset 58, and `afplay` completed successfully. Playback command success is not listening approval; no approved reference exists. Package/workspace check/lint/tests, formatting and `git diff --check` passed; unchanged workspace tasks may be cached.

- [x] Reference storage can retain actual rendered floats without quantization/clipping; references are not approved/generated yet.
- [x] WAV files work as both exact storage and local playback recordings.
- [x] Metadata is small and diagnostic, not an environment certification gate.

### Step 2.2 — Implement basic numerical and signal checks

**Depends on:** Step 2.1 and measured tolerances from Step 1.6.

**Files/areas:** Comparator and unit tests.

**Work:** Check matching rate/channels/frame count, finite samples, audible-versus-intentionally-silent expectation, and per-channel maximum/RMS sample error. Report threshold values and worst-error channel/sample/time. Do not impose blanket peak limits above one, normalize gain/time, or require schema/windowed/spectral assertions.

**Completed work:** Added `src/runner/compare.ts` with `compareAudio` and `formatComparison`. It accepts Node float-WAV/native channels, validates positive matching sample rates, channel/frame counts and rectangular finite Float32 data, and applies the existing audible/exact-silence health policy to both sides. It computes per-channel maximum absolute/RMS errors, independent inclusive gates, per-channel/global worst channel/frame/time and sample values, and readable diagnostics with thresholds. Identity has no fictitious worst error. Invalid inputs throw labelled errors; valid numerical mismatches return `passed: false` plus metrics for Step 2.3. Measured suite-wide 0/0 defaults are unchanged; explicit finite/nonnegative test/caller thresholds never mutate them. No gain/time preprocessing, peak cap, file writes or provenance gate is included.

Phase 1's measurement helper now delegates to the production comparator instead of retaining a second error algorithm. `inspectAudio` only gained a readonly input annotation; rendering and signal policy are unchanged. Native repeated synth/sample/LFO renders still pass exact defaults. No production engine, dependencies, scripts, lockfile or reference files changed.

**Validation:** All **157 package tests in 15 files passed** (122 existing plus 34 comparator units and one actual-render/WAV comparison integration). Units cover identity/above-one/full finite Float32 range, one-ULP/gain/polarity/shift/channel-swap changes, a dropped transient failing maximum despite passing RMS, first-tie/worst-location diagnostics, independent inclusive threshold boundaries, invalid tolerances, empty/ragged/sparse/mismatched inputs, non-finite samples and explicit/unexpected silence. Real stored sine matches fresh native synthesis at 0/0; changed gain fails and leaves stored samples unchanged. Package/workspace check/lint/tests, formatting and `git diff --check` passed; unchanged workspace tasks may be cached. CLI remains diagnostic rendering only: read-only `audio:verify` and failure recordings are Step 2.3, reference updates Step 2.4.

- [x] Localized changes fail the maximum-error gate even if overall RMS is small.
- [x] Signal health and comparison errors are clearly explained.
- [x] No comparison preprocessing can hide a regression.

### Step 2.3 — Verify read-only and save failure audio

**Depends on:** Steps 2.1–2.2.

**Files/areas:** `audio:verify`, reference paths, failure artifacts, integration tests.

**Work:** Render selected/all registered cases and compare with committed WAVs. Print case IDs, diagnostics, max/RMS/thresholds, and worst-error location. On mismatches, write reference/current/difference float WAVs under ignored `artifacts/`; document the difference sign. Handle missing-reference current-only audio and failures without a rendered buffer.

Fail for missing references, empty suites, and unknown selectors. Always render; no source/asset hash gates or environment-based skips. Browser/version changes may produce a helpful warning but do not prohibit running locally. Never write references during verification.

**Completed work:** Added `src/runner/verify.ts`, `src/verify-cli.ts` and `audio:verify [--case <id>]` (dependency builds first). All/selected cases always render sequentially through the owned harness, even with unavailable references; no source/asset hash gate or version skip. References are read from package `references/<id>.wav` plus JSON, with case-ID validation; actual browser changes warn without gating. Output includes case/settings, existing fixed 0/0 numerical metrics/thresholds/worst location, errors and pass/fail summary. Case failures continue to later cases and exit 1; empty/duplicate registries, invalid arguments and unknown selectors fail before launch. Shared registry selection now supports all/one without changing rendering behavior.

Numerical failures save unmodified reference/current WAVs plus signed **current - reference** Float32 differences/sidecars under ignored `artifacts/verify/<id>/`. Shape mismatches save A/B and explain why no difference is fabricated; unrepresentable differences are reported without clipping. Missing/invalid references provide current-only audio. Failed rendering provides no current/difference buffer but can save a valid reference copy. Selected stale artifacts are removed before each case (unselected files remain), and cleanup/write failures are reported/nonzero. Configurable artifact/reference trees must not overlap. Verification never writes reference files; there is no update command or approved reference yet.

**Validation:** All **189 package tests in 18 files passed** (157 existing plus 18 orchestration units, 4 native integrations and 10 command tests). All six native cases pass temporary unapproved references at 0/0, including a selected rerun; real gain/evaluation/missing-sample/missing-reference failures produce appropriate diagnostics/artifacts and recover. Tests compare complete reference WAV/JSON bytes and filenames before/after successful and failed verification, check A/B sample retention and every signed difference sample, reject incompatible shapes/corrupt metadata/ID mismatches, preserve explicit silence/above-one values, and exercise cleanup/artifact I/O failures. Separate Node/browser command-driver fixtures pass originals and propagate mismatch/evaluation/sample/missing/empty failures as exit 1; actual CLI invalid selectors exit 1.

Normal package `audio:verify` rendered all six cases and exited 1 for six absent references without creating any; targeted sine also exited 1. An ignored manual gain-change demo yielded max/RMS about 0.01625/0.01065321, worst channel 0/frame 6,300/time 0.13125 s, with byte-identical temporary reference files. macOS `afinfo` accepted the difference WAV; **A/B/difference `afplay` commands all completed**. The assistant cannot certify what was heard: human A/B/listening approval remains user review, not claimed by playback success. Demo files persist in `artifacts/verify-demo/sine/` for that review. Package/workspace check/lint/tests, formatting and `git diff --check` passed; unchanged workspace tasks may be cached. No engine/dependency/lockfile/input asset/tolerance/reference change; root integration remains Phase 3.

- [x] Default verification is read-only and nonzero failures propagate.
- [x] Empty or missing coverage cannot appear green.
- [x] Failure recordings are useful without an HTML/plot framework; native sample/player checks passed, human review remains explicit.

### Step 2.4 — Provide one explicit update command

**Depends on:** Step 2.3.

**Files/areas:** `audio:update --case <id>`, reference I/O, integration tests, README.

**Work:** Update explicitly selected references using fresh, healthy renders. Validate/render before replacing the selected WAV/settings; failed source/loading/rendering leaves old references untouched. No separate candidates, promotion, enforced approval reasons, or reference-set transaction machinery. Document listening and git review before committing intended changes.

**Completed work:** Added `src/runner/update.ts`, `src/update-cli.ts` and `audio:update --case <id>` with dependency builds first. Exactly one named case is required; empty/all/multiple/unknown selection fails before launch. Each invocation renders fresh through the owned harness, rejects failed/partial output, rechecks signal health, then validates/encodes before writing only the selected WAV/JSON. Other references are untouched; verification has no update flag/path. Shared default reference-directory placement lives in recording storage, not a new path-only module. Output reports case/settings/peak/RMS/paths and explicitly says generation is not listening approval. No candidate/promote/reason system, hashes, tolerance changes or transaction machinery.

Source/loading/worklet/timeout/health/metadata/encoding failures preserve existing bytes and create no missing reference path. Writes remain ordinary I/O, not atomic: later disk-write failures may leave a partial selected pair, are nonzero, and require review/restoration. README documents repeatability, listening, intended-change review, read-only verification and staging both files before committing; user approval is never inferred.

**Validation:** All **216 package tests in 21 files passed** (189 existing plus 13 updater units, 5 native integrations and 9 command tests). Units cover explicit selection, selected-only creation/replacement, fresh repeated renders, original Float32/above-one/signed-zero retention, unexpected/exact silence, wrong render ID, invalid metadata/shape/ragged/nonfinite audio, unchanged references on rejection and filesystem error reporting. Native synth/sample updates verify at unchanged 0/0, healthy gain/tail replacement updates only sine while sample bytes remain intact, and old-source verification fails without rewriting. Real source, missing-sample alongside healthy audio, worklet, silence and synchronous-timeout failures preserve every reference byte, close contexts and recover. Seeded multi-bar updates in fresh browsers are byte-identical. Child commands create/replace selected unapproved fixtures and verify them; source/sample failures exit 1 preserving old WAV/JSON; actual CLI invalid/non-explicit selectors exit 1.

The real package CLI generated temporary sine, targeted verification passed at 0/0 and left bytes unchanged, `afinfo` accepted its float WAV and `afplay` completed. Reviewed git status/new sidecar output; a second explicit update was byte-identical. **No listening approval or commit was claimed:** removed the temporary reference pair, leaving only ignored `artifacts/update-demo/sine.*` for user review. Initial trusted references remain Phase 3. Package/workspace check/lint/tests, formatting and `git diff --check` passed; unchanged workspace tasks may be cached. No production engine/app, dependency/lockfile/input sample/tolerance change; broader regression demonstrations remain Step 2.5.

- [x] Reference updates require an explicit separate command.
- [x] Broken rendering/loading cannot overwrite an old reference.
- [x] Listen/review/commit workflow is documented and manually rehearsed through player/git review/verification; actual human approval and commit remain explicit user actions.

### Step 2.5 — Show that actual regressions are caught

**Depends on:** Step 2.4.

**Files/areas:** Focused integration cases and suite-local test support.

**Work:** Compare a few controlled pitch, timing, gain, filter, sample-selection, and reverse-direction changes against original references through real source rendering. Reuse cases rather than build an exhaustive mutation framework. Keep mutated variants outside approved references.

**Completed work:** Added eight native integration cases in `src/__tests__/regressions.test.ts` with test-only fixtures in `support/regressions.ts`. Reuse the existing synth, LFO and local sampler inputs; authored changes cover an octave pitch shift, half-second rhythm shift, 10% gain change, bar-two filter endpoint, sample variation selection and reverse→forward direction. These six produce healthy same-shape audio and fail specifically with `Audio mismatch` at unchanged 0/0 defaults, not malformed-file/shape/loading checks. Behavioral assertions confirm the intended pitch/onset/gain/filter/sample/direction differences; the filter's first bar is exactly unchanged. Two diagnostic changes (removed notes method and missing mapped sample alongside healthy synth) reject without accepting current/partial audio.

Originals are freshly updated only into temporary unapproved reference directories, verify at 0/0, and pass again after each failed variant. Each test checks the full reference file set and WAV/JSON bytes remain unchanged after both pass/failure/recovery, validates all failure A/B/difference shapes and every signed Float32 difference sample, and closes its browser contexts. Variants never enter the production case registry or approved reference tree. No mutation framework, production implementation, dependency/script/lockfile/asset/tolerance change was required.

**Validation:** All **224 package tests in 22 files passed** (216 existing plus 8 focused cases); the focused eight-test suite also passed separately. A separate fresh-browser manual run verified eight originals at 0/0, then rejected six numerical and two diagnostic changes with byte-identical reference files. Numerical A/B/current-minus-reference WAV/JSON sets remain ignored under `artifacts/regressions-demo/<change>/`, with reference-only output for diagnostic failures. Inspected native synth pitch and sampler direction A/B/difference samples in tests, `afinfo` recognized their standard float WAVs, and **all six A/B/difference playback commands completed**. Playback acceptance is not human listening approval; demo files remain available for user review, not promotion. Temporary references/manual script were removed. Package/workspace checking/lint/tests, formatting and `git diff --check` passed; unchanged workspace tasks may be cached.

- [x] The suite detects representative meaningful changes, not just malformed files.
- [x] Failed variants do not silently regenerate or alter references.

**Phase 2 technical exit gate passed:** Real render → compare → failure recordings/local playback → explicit update → fresh read-only verify is demonstrated. Human musical-quality/listening approval is not claimed; initial trusted user references and root integration remain Phase 3. Supplied sketches can now use this workflow; plots and hosted CI remain optional.

---

## Case authoring follow-up — Folder-based inputs (complete)

Requested after Step 2.5, before supplied-sketch onboarding. Migrated all six cases to `cases/<id>/metadata.json` and multiline `sketch.js`, colocating original PCM16 inputs under each sampler case's `samples/`. Added Node-only `src/runner/load-cases.ts`: stable sorted immediate-folder discovery, folder-derived IDs, runtime metadata validation and case-relative resource resolution. Sketch files are read as text, never imported/executed in Node; existing browser REPL evaluation, renderer, comparator, explicit selected updates and separate `references/` outputs are unchanged. Browser-safe `src/cases.ts` retains only helpers. Defaults/commands/IDs/sample bytes/tolerances/dependencies remain unchanged; discovery does not generate references.

**Validation:** Captured all six pre-migration native renders as ignored/unapproved WAVs, then compared fresh file-authored renders against them at **0/0 in both channels**. Input SHA-256 values are unchanged, including the additional byte-identical asymmetric copy owned by `sample-alternate`. All **258 tests in 24 files passed** (224 existing plus 33 discovery/metadata units and one file-authored native integration). New tests cover sorted discovery, missing/invalid files/settings, exact multiline source preservation without Node execution, case-relative/shared/absolute mappings and fresh discovery after edits. The native test exercises variables, a two-iteration loop, both REPL aliases, colocated fetch/decode, source edits producing numerical failure, missing sample rejection alongside healthy synthesis, unchanged reference bytes and recovery. It passed in four separate focused processes before the full suite. Package/workspace checking/lint/tests, formatting and `git diff --check` passed; unchanged workspace tasks may be cached. No approved references were created.

**Reported finding, not hidden:** An initial draft with a sample and two fully overlapping synths had intermittent raw differences (max/RMS about **5.96e-8/6.70e-9**). Equivalent pre-migration-style inline source reproduced this in **2/10** repeats; file discovery is not required to trigger it. Native cause is not established. The final authoring integration uses loop voices on separate sequence steps to test file authoring without treating this new mixing shape as measured trusted coverage. No threshold was relaxed, audio preprocessed or engine behavior changed. Unapproved source/A-B/report remain ignored under `artifacts/three-voice-repeatability/`. Investigate before approving cases relying on this shape; see feasibility details.

- [x] Cases can be added as source/metadata/sample folders without a registry edit.
- [x] All migrated cases retain the original numerical output and sample bytes.
- [x] Source/resource failures, read-only verification and explicit-update policy remain tested.

---

## Reference layout follow-up — Matching case folders (complete)

Changed update/verification to share `referencePath` in existing recording storage, using **`references/<id>/<id>.wav` and `<id>.json`**. This mirrors input case-ID folders without mixing source/assets with expected output. WAV samples/metadata encoding, commands, render artifacts and comparison defaults are unchanged. Verification only reads the folder layout and never migrates or consumes flat legacy pairs; existing pairs can be manually moved unchanged rather than regenerated. No automatic migration command or new path-only production module was added.

**Validation:** All **260 tests in 24 files passed** (258 existing plus default/configured folder-path and flat-reference rejection tests); the focused 69-test update/verify/regression/command set also passed. Tests check exact selected output paths/file set, fresh nested verification, unchanged reference trees including unrelated non-WAV sibling files, replacement isolation, invalid/partial references, failure preservation/recovery and command exits. Shared test-only snapshots now recurse through nested reference files. Package/workspace checks/lint/tests, formatting and `git diff --check` passed; unchanged workspace tasks may be cached. No engine, dependency/lockfile, input sample, tolerance or approved recording changed.

- [x] Reference output folders match case IDs.
- [x] Update and verification agree on paths; verification stays read-only.
- [x] Layout does not implicitly regenerate or approve recordings.

---

## Comparison policy follow-up — User-reviewed native mixing roundoff (complete)

Investigated unchanged `techno-drum-loop` differences rather than assuming a source regression or automatically changing references. All five individual drums rendered exactly; native-only controls and whole-buffer addition-order reconstruction isolated Chromium's unordered Float32 accumulation. After reviewing the cause, measurements and loss of sub-threshold detection, the user approved frozen suite-wide **maximum `1e-6` / RMS `1e-7`** defaults. Both independent inclusive gates remain mandatory in every channel; raw samples/metrics, signal health, resource errors and incompatible-shape checks are unchanged. Explicit comparator callers can still select 0/0. No production graph, dependency, source/sample input or reference was changed for acceptance.

**Direct validation:** 15/15 unchanged loop verifications passed against the existing reference, including three fresh browser/server launches. Six numerical and two diagnostic fixture regressions were rejected, as were four actual drum-loop gain/hit-mask/pitch/sample-selection changes; unchanged originals recovered. Actual loop and sine verification commands both exited 0 without rewriting references. A later loop command measured maximum `3.5762786865234375e-7`, recorded without changing the proposed fixed limits. All input/reference file sets and bytes were preserved. Tests' expected gates were updated, explicit zero comparison retained, sparse-roundoff/default-gate coverage added and the all-case verification assertion no longer assumes six exact cases. Sources remain TypeScript-checked; check/lint/format passed. **No automated test suite was run**; see [the full experiment/policy record](./repeatability.md).

- [x] Cause identified and independently reproduced without Fluid/AudioEngine.
- [x] Fixed limits explicitly reviewed by the user, not adapted to failures.
- [x] Unchanged output passes while meaningful changes/errors still fail.
- [x] References and production DSP remain untouched.

---

## Phase 3 — Use the suite for real sketches

**Usable outcome:** The user's manual regression sketches have trusted references and run with one local command, including normal root test invocation.

### Step 3.1 — Register representative sketches and samples

**Depends on:** Rendering/comparison support and supplied sketches; start importing during Phases 1–2 whenever supported.

**Files/areas:** `cases/<id>/metadata.json`, `sketch.js`, optional colocated sample fixtures and brief coverage notes.

**Work:** Obtain sketches, intended protected behavior, and sample files suitable for committing. Preserve source where possible; document and get agreement for resource/nondeterministic-input changes. Use local resources, explicit seeds, and enough bars/tail for each pattern. Start with the available representative set; no required case-count target before the suite is useful.

**Validation:** Render each case with external networking blocked and inspect errors. Check repeatability for new cases, including investigation of the reported fully overlapping three-voice variance before approving such coverage. Identify async/live-control/hardware-dependent cases as deferred rather than silently rewriting their behavior.

**Completed work:** The initial set contains `bends`, `ch-ch-chocolate`, `lfo-filter`, `multisample-files`, `multisample-sprite`, `sample-alternate`, `sample-reverse`, `sample-tone`, `seeded-multibar`, `sine` and `techno-drum-loop`. Each has metadata/source and local resources where needed. User-supplied WAV, MP3 and MP4 inputs use native decoding; no WAV-only authoring restriction or source rewrite is needed. Asset origin/permission notes remain the case author's responsibility, not a decoder/test gate. Live control, async manifests and hardware/MIDI output remain outside the initial scope.

- [x] Each case has an ID, purpose, adequate duration, and local resources.
- [x] Source/resource handling is explicit; inputs are preserved rather than adapted to tooling tests.
- [x] Missing behaviors are noted without requiring a comprehensive coverage program.

### Step 3.2 — Listen and commit initial references

**Depends on:** Step 3.1 and Phase 2 commands.

**Work:** Use `audio:update` for selected healthy cases. Listen to every initial recording with the user, review settings and changes, and commit only trusted output. Incorrect recordings are corrected/discarded before commit, not automatically legitimized by the command.

**Validation:** User listening approval plus repeated renders for initial cases, then full read-only verification on the Mac. Use recordings for listening; the app is optional and starting it requires permission.

**Completed work:** Six pairs were supplied by the user; five missing pairs were generated with separately selected update commands. All 11 pairs are now present in the repository. The user explicitly confirmed listening review is done and everything sounds good. Full native read-only verification passes 11/11; generation/player success was not substituted for that human approval.

- [x] Initial representative references are trusted by listening, not just generated.
- [x] Full verification passes without external resources or warnings.

### Step 3.3 — Connect normal local testing and document operation

**Depends on:** Working references from Step 3.2; hosted CI is not a prerequisite.

**Files/areas:** Package scripts/README, Turbo task configuration where needed, root testing documentation.

**Work:** Add package `test:ci` for root Turbo discovery, running helper/integration tests and approved-case verification. Ensure workspace dependency builds and browser setup are documented. Disable audio-task caching initially so routine tests actually render. Keep automatic server/port cleanup. Document targeted/full verification, fixture addition, explicit updates, and reading failure recordings.

**Validation:** Run package/root tests locally; rerun unchanged and confirm audio verification executes. Deliberately fail a case and confirm root exit propagation and unchanged references. Run checking/lint/format and relevant production tests after shared changes.

**Completed work:** Added package `test:ci` (`pnpm test && tsx src/verify-cli.ts`) and package-specific Turbo `cache: false` with dependency builds. Other tasks keep their existing caching. The README now documents setup, normal/targeted verification, format-independent local inputs, failure recordings and selected update/listen/review/commit operation.

At the user's request, removed obsolete migration assertions, copied CLI drivers, duplicate update/verify/comparison workflows, exact musical peak/frequency/phase checks and repeated temporary baselines for every authored case. Tooling fixtures no longer load the authored registry; sample inputs are generated only in temporary test files. Core storage/comparison/discovery/reference-safety units remain, with native diagnostics/cleanup and one end-to-end file-authored update → verify → numerical/resource failure → recovery workflow. Musical behavior is protected by the approved recordings. Broad repeatability is an explicit onboarding/dependency-change diagnostic, not four full-collection renders on every test run.

**Validation:** All **166 tooling tests in 15 files passed**, about **19 seconds**, versus 264/24 and about 154 seconds immediately before simplification. Root testing passed 11/11 fresh comparisons in about 31 seconds, with audio explicitly bypassing cache and unchanged production tasks using their existing caches. A temporary 1% kick-gain reduction in `techno-drum-loop` left all tooling tests green but failed real root reference verification (10/11 passed, root exit 1; max about `0.008745`, RMS about `0.002334`). Original source was restored automatically; complete input/reference hashes match, and no reference update was invoked. Passing recovery/repeat execution, checks/lint/format and final preservation checks are recorded in ignored `artifacts/root-workflow/` logs.

- [x] One documented local command runs all approved user cases.
- [x] Root tests discover audio verification and propagate failures.
- [x] Verification always renders and never updates references.
- [x] Package/workspace verification is green and setup has no hidden app/container requirements.

**Completion:** The initial suite replaces routine manual REPL regression checks with repeatable audio comparison and useful recordings. It does not certify musical quality, real-time transport behavior, or other platforms.

---

## Verification and scope guard

At each changed step, run package check/lint/format and relevant unit/integration tests. For shared evaluation/context/clock changes, build and test Fluid, clock, audio-engine, touched dependencies, and relevant worker/player app suites. Run workspace `pnpm check`, `pnpm lint`, `pnpm test`, planning-document formatting, and `git diff --check` at closeout. Root tests now include uncached audio reference verification. Historical test counts above describe their implementation stages, not today's simplified suite.

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
