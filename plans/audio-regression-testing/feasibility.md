# Audio regression feasibility and characterization record

## Status

**Phases 0–1 are complete on the user's Mac; Steps 1.1–1.6 are complete.** The unnecessary Linux/container validation requirement has been removed. Shared seams and an owned local browser harness now render real synth/sample/LFO audio with loading/processor-failure detection, seeded multi-bar behavior, isolation, and measured sample-identical repeats including fresh launches. Steps 2.1–2.3 are also complete: exact Node float-WAV storage/sidecars, a tested raw comparator at unchanged 0/0 defaults, and read-only `audio:verify` with failure recordings. Explicit reference updates and listening approval remain future work; Step 2.4 is next. No approved references exist, so normal verification currently fails missing coverage while still rendering.

This record supports Phases 0–1 and Steps 2.1–2.3 of the [implementation plan](./plan.md). Do not interpret the browser-launch smoke tests as audio regression coverage.

Audited production revision: `02059e5755d7011310593bfa38912786bf767cc7`. No production implementation was changed during Phase 0. Re-read these consumers before Phase 1 if other work changes them.

## Source evaluation contract to preserve

Owners: `packages/fluid/src/evaluate-source.ts` (source-to-schema operation, exported from the public entry point) and `apps/web/src/lib/globals/eval.worker.ts` (host messaging/error serialization). Step 1.1 extracted the operation without changing the contract below.

1. Receive `{ id, code }` and create one new Drome for that request, even when the same worker handles multiple requests.
2. Execute `new Function('drome', 'd', code)(d, d)`. Both aliases reference the same instance. This is arbitrary trusted JavaScript execution, not a sandbox.
3. Discard the function's return value; synchronously call `d.getSchema()`. Fluid assembles banks, instruments, and buses and invokes shared graph validation.
4. Post `{ id, schema }` on success; post `{ id, error: (err as Error).message }` on an evaluation/schema error. Preserve request identity and absence of the other response branch.
5. Errors do not poison the next request. Instruments, user banks, buses, and BPM do not carry across evaluations.
6. Top-level `await` is rejected by the Function grammar. A returned Promise is not awaited; a later microtask cannot retroactively add instruments to the schema already posted.

Characterization added: `apps/web/src/lib/globals/__tests__/eval.worker.test.ts` (8 cases). It imports the actual worker and real built Fluid package, replacing only the worker host's messaging API. It covers aliases, identity, isolation, ignored returns, synchronous posting, syntax/runtime/schema/top-level-await errors, and recovery. It does not test real Worker transport/termination or structured-clone behavior. The harness must bound source execution and isolate cases; Worker-specific transport tests are needed only if it uses Workers.

Existing limitation, not corrected here: non-Error throws can have no useful `.message`, and pending app evaluation promises have no timeout/worker-error recovery. Phase 1 extraction should preserve existing semantics unless a separately reviewed fix is approved; Phase 1 must independently bound trusted sketch execution from Node.

## Player and transport contract

Owner: `apps/web/src/lib/globals/audio-player.svelte.ts`.

- App requests use generated IDs and correlate worker replies with pending promises.
- Playback waits for evaluation, `engine.ready`, `engine.update(schema)`, and `engine.prepare()` in that order, then starts the clock only if not already running.
- Errors become an error log entry plus `lastError`, rather than starting playback.
- App initially constructs a 140 BPM/four-beat clock, but engine commit sets the schema's BPM or the engine default **120 BPM**. A harness must use the committed tempo, not copy the app constructor's 140.
- `AudioEngine.update()` clones and validates before replacing pending state; commits are last-valid-write-wins at `prebar`.
- `prebar` creates instruments/buses and establishes LFO bar origin. `bar` schedules instruments, then buses, with the event's bar index/start time/duration.
- `prepare()` operates on the pending schema before commit, filling the exact-URL/reverse cache; it does not create instruments.
- Transport Stop cancels future voices, holds bus automation, and resets MIDI output scheduling. Active voices can finish; retired graphs retain their buses until all voices finish.

Owner: `packages/clock/src/index.ts` and `types.ts`.

- Real-time clock uses `setTimeout`, a 25 ms scheduling interval, 100 ms audio scheduling lead, and an additional 100 ms lookahead for before-events.
- Callback shape: `(metronome: { beat, bar }, audioTime, barDuration)`; `on()` returns an unsubscribe function.
- Start/resume depends on real-time `ctx.state`, `ctx.resume()`, and `ctx.currentTime`, and initializes from bar zero. MIDI time origin uses `performance.now()`.
- `barDuration = (60 / BPM) * beatsPerBar`; default constructor values are 120 BPM and four beats.
- The offline driver must emit production events explicitly and recompute duration after the first commit's BPM update; it must not call the real-time clock's `start()`.

## Context/clock capability inventory

This table inventories every concrete rendering-context/clock consumer found under `packages/audio-engine/src`. Constructors listed here require a base audio context even when no context method is called directly.

| Consumer                                       | Context capabilities actually used                                                                          | Clock capabilities actually used                                                     | Phase 1 disposition                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `audio-engine/src/index.ts` (AudioEngine)      | `createGain`, `createAnalyser`, `destination`; passes context to consumers below                            | `on` for prebar/bar/stop, `bpm`; passes clock to instruments and MIDI scheduler      | Narrow rendering context and derive engine clock contract                                                    |
| `instruments/instrument.ts`                    | `createGain`, `destination`, `currentTime`; constructors `GainNode`, `BiquadFilterNode`, `AudioWorkletNode` | `barDuration` for LFO origin/processor options                                       | Narrow context/clock; keep scheduling/cleanup logic unchanged                                                |
| `instruments/synthesizer.ts`                   | `OscillatorNode` constructor; inherited Instrument capabilities                                             | `barDuration` for event timing; inherited LFO needs                                  | Narrow context/clock                                                                                         |
| `instruments/sampler.ts`                       | `AudioBufferSourceNode` constructor; inherited Instrument capabilities                                      | `barDuration` for offsets/durations and fit rate; inherited LFO needs                | Narrow context/clock                                                                                         |
| `instruments/sample-buffer-cache.ts`           | `decodeAudioData`; passes context to reversal                                                               | None                                                                                 | Narrow context                                                                                               |
| `utils/reversed-buffer-cache.ts`               | `createBuffer`; buffer channel/length/rate operations are AudioBuffer capabilities                          | None                                                                                 | Narrow context                                                                                               |
| `utils/register-worklets.ts`                   | `audioWorklet.addModule`; global `Blob` and `URL.createObjectURL`                                           | None                                                                                 | Narrow context, preserve real registration                                                                   |
| `buses/runtime-bus.ts` and its `buildEffect()` | `createGain`, `currentTime`; constructors `GainNode`, `BiquadFilterNode`                                    | None; receives bar/time/duration as arguments                                        | Narrow context only                                                                                          |
| `midi-output-scheduler.ts`                     | Context is already structural: `clock.ctx.currentTime` only                                                 | `ctx.currentTime`, `schedulingLeadTime`, `schedulingInterval`, `audioTimeToMIDITime` | Preserve existing minimal structural scheduler boundary; include required members in derived engine contract |

No rendering consumer calls `resume()`, `close()`, or `suspend()`. `BaseAudioContext` covers their native context usage, including node constructor arguments; do not cast an offline context into a concrete `AudioContext` to satisfy the present annotations.

Related owners that must stay real-time:

| Owner                                             | Required behavior                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/clock/src/index.ts`                     | `state`, `resume`, `currentTime`, wall-clock timers/performance; public start/stop/destroy and metronome/getters |
| `packages/context/src/index.ts`                   | Creates `AudioContext`; resume/suspend/close, gesture/visibility listeners and silent media-tag lifecycle        |
| `apps/web/src/lib/globals/audio-player.svelte.ts` | Managed context `state`, real-time clock start/stop, engine/worker/MIDI ownership                                |

The engine-facing minimum is the union of `on`, `bpm`, `barDuration`, and the scheduler's structural members above. Derive it from clock capabilities, rather than cloning all clock state or requiring unused getters/start/resume behavior.

### Node, parameter, and worklet behavior

- Nodes require connect/disconnect; source nodes require start/stop/onended. Parameter scheduling uses value assignment, `setValueAtTime`, `linearRampToValueAtTime`, `setTargetAtTime` (MIDI), and `cancelAndHoldAtTime` (bus Stop).
- Instrument cancellation reads current audio time and cancels only future starts. Destruction stops/disconnects all tracked voices. An offline harness must not destroy or stop the graph before rendering completes.
- LFO registration deduplicates by schema ID within an instrument; target intrinsic value is set to zero because worklet input is summed with it.
- Explicit origin is `barStartTime - startingBar * barDuration`. Missing start time falls back to `ctx.currentTime`.
- LFO endpoint updates use audio-parameter automation at exact bar timestamps, not message-port timers.
- `packages/worklets/src/processors/lfo-processor.ts` consumes `currentFrame` and global `sampleRate`, a-rate endpoint parameters, waveform/speed/phase settings, and supplied bar origin/duration. It derives phase per quantum and uses a sample-based slew limiter.
- Worklet registration uses Blob URLs and currently does not revoke them. No lifecycle change is part of this phase; future isolation/cleanup must account for resources.
- MIDI scheduler construction enforces `0.05 + schedulingInterval < schedulingLeadTime`. Even without connected hardware, authored `notesOut` queues timers. Initial offline fixtures should not author MIDI output; do not assume disconnecting MIDI prevents those timers.

### Sample-resource behavior

- Sources resolve by canonical bank/name/source key, then rounded/wrapped variation; fetch/cache identity is the exact URL.
- Preparation includes all static names/source keys and known variations; uncertain random variation ranges can include all entries. Reverse/alternate playback prepares reversed buffers.
- A pending fetch is deduplicated; decoded hits are synchronous; failed loads warn, return null, and can retry.
- The cache does **not** inspect `response.ok` before decoding. Both HTTP failures and decode failures must therefore be observed independently by the harness.
- Missing bank/name/source/entry/buffer/valid region can warn and skip a voice without rejecting graph validation or preparation. Other voices may still sound: a whole-buffer audibility check alone would miss a resource regression.
- Alternate direction is chosen once per event and advances once only if a voice was emitted. Cancelling future notes resets its next direction to forward.

## Existing characterization coverage and remaining gaps

| Protected behavior                                                                   | Current test owner/evidence                                                                                     |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Default BPM, prebar-only commit, exact bar forwarding, valid-write isolation         | `packages/audio-engine/src/engine.test.ts`, update/prebar/bar suites                                            |
| Named routing/sends, bus commit timestamps, retirement/failure cleanup               | `engine.test.ts` output graph, retirement, construction-failure suites                                          |
| URL preload name/key/variation coverage and deduplication                            | `engine.test.ts` prepare suites; `utils/preload-samples.test.ts`                                                |
| Concurrent fetch/decode, exact hits, failed retry, reversed cache                    | `instruments/sample-buffer-cache.test.ts`; `utils/reversed-buffer-cache.test.ts`                                |
| Alternate direction, partial/all-failed events, reset, missing-resource hit identity | `instruments/sampler.test.ts` alternate/missing-resource/cancellation cases                                     |
| Future versus active voice cancellation, finished/retired state, LFO edge cleanup    | `instruments/instrument.test.ts` finished/output/LFO lifecycle suites                                           |
| Bus exact-time initialization, bar transitions, Stop holding and idempotent teardown | `buses/runtime-bus.test.ts`                                                                                     |
| Clock lead and duration callback behavior                                            | `packages/clock/tests/index.test.ts`                                                                            |
| Worklet source registration string, pure output/waveform mathematics                 | `packages/worklets/src/processors/lfo-processor.test.ts`, `utils/lfo-output.test.ts`, `utils/waveforms.test.ts` |
| Real app MIDI owner behavior                                                         | `apps/web/src/lib/globals/audio-player.svelte.test.ts` (browser suite)                                          |
| Actual worker evaluation/protocol with real Fluid                                    | New `globals/__tests__/eval.worker.test.ts` (Node host stub)                                                    |

Existing engine unit tests use mocks; they do not prove browser audio. Steps 1.4–1.6's separate regression-package tests demonstrate actual synth/sample/LFO output, loading/processor failures, origin/quantum phase, execution timeouts, isolation, and measured repeatability. Those claims come from native browser rendering, not source-string/registration-only tests or mocked engine suites.

Step 1.6 selected initial suite-wide maximum/RMS tolerance **0/0** from sample-identical local repetitions; no listening-approved references have been selected yet. The simplified spec chooses standard 32-bit float WAV references; richer reporting and provenance are deferred.

## Local browser setup

- Playwright: exact `1.59.1` in package/lockfile, matching the app's installed version.
- Browser observed during Phase 0: Chromium headless shell revision `1217`, version `147.0.7727.15`, confirmed from the installed browser registry and local `browser.version()`.
- Local execution host: macOS 26.6.2 (25G83), Darwin/ARM64, Node 22.22.2, pnpm 10.33.2.

The package's `browser:install` command installs Playwright's matching headless shell. There is no separate environment manifest, OS/architecture gate, or container rehearsal requirement. The former image pins and pin-consistency tests have been removed. Browser/version details are diagnostic; cross-platform audio equivalence is not claimed. Phase 1 measures actual repeatability on the Mac.

## Commands and results

### Pre-change production baseline

Forced execution (not a cached assertion of success):

```sh
pnpm exec turbo run test:ci --force \
  --filter=@web-audio/fluid --filter=@web-audio/clock \
  --filter=@web-audio/audio-engine --filter=@web-audio/worklets
```

| Package      | Result                        |
| ------------ | ----------------------------- |
| Fluid        | 24 files / 1,007 tests passed |
| Clock        | 1 file / 3 tests passed       |
| Audio engine | 20 files / 316 tests passed   |
| Worklets     | 3 files / 28 tests passed     |

`pnpm exec turbo run check lint` with the same four filters passed (14 tasks including dependencies). These checks were also rerun during Phase 0; some unchanged tasks were cached. Existing Vite `__dirname`/future-native-config and tsdown experimental-tsgo notices are warnings, not failures.

### Added characterization and browser smoke

```sh
pnpm --filter @web-audio/fluid build
pnpm --filter web test:unit --run --project server src/lib/globals/__tests__/eval.worker.test.ts
pnpm --filter web test:unit --run --project client src/lib/globals/audio-player.svelte.test.ts
pnpm --filter @web-audio/audio-regression browser:install
pnpm --filter @web-audio/audio-regression test
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression format:check
pnpm --filter web check
```

- Fresh Fluid build and worker protocol suite: 8 tests passed.
- Existing AudioPlayer browser suite: 8 tests passed.
- Original Phase 0 package validation: 3 pin-consistency unit tests and 3 real browser smoke tests passed. The unnecessary pin-consistency tests were subsequently removed; the 3 smoke tests are retained and rerun after cleanup. Browser success, callback failure, and launch failure/recovery all exit cleanly.
- Package check/lint/format checks and app checking passed; app checking reports zero errors/warnings. The new worker test also passed targeted app ESLint/Prettier checks.
- Browser install downloaded the pinned mac-arm64 headless shell. An initial concurrent app-browser launch raced that installation and failed with spawn error -88; after installation completed, the unchanged app suite passed. Keep install and test commands sequential.
- `pnpm install --frozen-lockfile` succeeded after package creation; the package's complete tests and separate unit/smoke commands passed again, including a fresh second smoke process. This is local reinstall/re-run evidence; no container rehearsal is required.
- Final `pnpm check`, `pnpm lint`, and `pnpm test` passed (14 checking tasks, 14 lint tasks, 18 existing test/build tasks; unchanged work may be cached). Root `test:ci` has no runnable regression-package command yet, as intended for Phase 0; the new package and app suites were run explicitly above.
- Formatting and `git diff --check` passed. A post-smoke process inspection found no remaining launched headless-shell processes.
- pnpm reported deprecated subdependencies, an ignored core-js build-script notice, and a missing optional tsdown/unrun bin-link warning during reinstall; no unrelated dependencies/approval settings were changed, and the relevant builds/checks/tests succeeded.

### Scope cleanup and Phase 0 closeout

- [x] Use the user's Mac as the local validation environment; remove the Linux/container requirement.
- [x] Remove the environment manifest and pin-consistency tests while retaining exact Playwright dependency and browser launch/cleanup tests.
- [x] Simplify the spec/plan/README to three remaining phases: render, compare, use.

Cleanup validation on the same Mac:

- Package check/lint/format checks passed.
- `test` and a separate fresh `test:smoke` process each passed all 3 retained browser tests.
- Workspace `pnpm check` and `pnpm lint` passed (14 tasks each; 13 cached). `pnpm test` passed (18 existing tasks, all cached); the regression package's smoke tests were run explicitly above.
- Formatting checks for the spec/plan/record and `git diff --check` passed.

Phase 0 is closed. Audio rendering, repeated-run tolerance measurements, comparisons, and user reference review remain actual future work; no launch-only result is presented as audio coverage.

## Step 1.1 — Shared synchronous source evaluation (complete)

Added `evaluateSource(code)` as a named Fluid export while preserving the default Drome export. The helper creates a fresh Drome, invokes `new Function('drome', 'd', code)(d, d)`, ignores its return value, and synchronously returns `d.getSchema()`. It does not wrap errors, await promises, introduce a sandbox, or manage messaging/timeouts. The REPL worker now calls it inside the existing try/catch; message shapes and error serialization are unchanged. The future browser harness can call the same public helper.

Added 11 public API tests in `packages/fluid/src/__tests__/evaluate-source.test.ts`, using the real Fluid implementation. These cover return typing/defaults, aliases, constructor/instrument defaults, state isolation, ignored returns, syntax/runtime/schema/top-level-await errors and recovery, preservation of non-Error throws, and ignored asynchronous mutations. The existing worker characterization tests were not changed.

Validation:

```sh
pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/fluid test:ci
pnpm exec turbo run build test:ci --force \
  --filter=@web-audio/fluid --filter=@web-audio/clock \
  --filter=@web-audio/audio-engine --filter=@web-audio/worklets \
  --output-logs=errors-only
pnpm --filter web test:unit --run --project server src/lib/globals/__tests__/eval.worker.test.ts
pnpm --filter web test:unit --run --project client src/lib/globals/audio-player.svelte.test.ts
pnpm check
pnpm lint
pnpm test
```

Fluid passed all 1,018 tests in 25 files (11 new). Forced workspace dependency/production builds and tests passed (10 tasks, none cached). The unchanged worker and AudioPlayer browser suites each passed all 8 tests against freshly built Fluid. Workspace checking/linting/tests and changed-file/document formatting passed; unchanged tasks may be cached. `git diff --check` passed. Existing Vite config-loader and tsdown experimental-tsgo warnings are unrelated.

## Step 1.2 — Rendering context types (complete)

Changed only context annotations in eight production modules under `packages/audio-engine/src`:

- `index.ts`: engine constructor and retained context.
- `instruments/instrument.ts`, `synthesizer.ts`, and `sampler.ts`: graph/synthesis/sampling context.
- `instruments/sample-buffer-cache.ts`: decode and cache context.
- `buses/runtime-bus.ts`: bus context and effect construction.
- `utils/reversed-buffer-cache.ts`: reversed buffer creation.
- `utils/register-worklets.ts`: real worklet registration.

All use native `BaseAudioContext`, which supports their existing operations and node constructors. No custom context interface or unsafe cast was needed. Scheduling, envelopes, sample loading/error behavior, routing, worklet registration/lifecycle, and runtime cleanup are unchanged. Real-time `AudioClock`, managed context creation/resume/suspend/close, and the app player remain untouched. At Step 1.2 closeout, the engine still required a concrete `AudioClock`; Step 1.3 below removes that requirement.

Added `packages/audio-engine/src/__tests__/rendering-context.test.ts` (3 type-contract cases). TypeScript checks an uninvoked `new AudioEngine(ctx, clock)` call where `ctx` is `AudioContext | OfflineAudioContext`, exact common-context annotations across rendering consumers/helpers, and the clock's retained `AudioContext` boundary. Tests remain in the existing `src` TypeScript inclusion. These are compile-time compatibility checks, not browser construction/rendering evidence.

Validation:

```sh
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine test:ci
pnpm exec turbo run build test:ci --force \
  --filter=@web-audio/fluid --filter=@web-audio/clock \
  --filter=@web-audio/audio-engine --filter=@web-audio/worklets \
  --output-logs=errors-only
pnpm --filter web test:unit --run --project server src/lib/globals/__tests__/eval.worker.test.ts
pnpm --filter web test:unit --run --project client src/lib/globals/audio-player.svelte.test.ts
pnpm check
pnpm lint
pnpm test
```

Engine passed all 319 tests in 21 files (316 unchanged tests plus 3 type-contract cases). Forced dependency/production builds and tests passed (10 tasks, none cached). The unchanged worker and AudioPlayer browser suites each passed all 8 tests against freshly built dependencies. Workspace checking verifies existing app callers remain valid; workspace check/lint/tests, changed-file/document formatting, and `git diff --check` passed. Unchanged workspace tasks may be cached. Existing Vite config-loader and tsdown experimental-tsgo notices remain unrelated warnings.

## Step 1.3 — Engine-facing clock capabilities (complete)

Added the public `EngineClock` type to `packages/audio-engine/src/types.ts`: `Pick<AudioClock, 'on' | 'bpm' | 'barDuration'>` composed with the MIDI scheduler's existing `SchedulerClock`. The scheduler only gained a type export; its boundary and construction invariant are unchanged. Its `ctx` requires only read-only `currentTime`, allowing a native offline context without a real-time context cast. The built package entry point exports `EngineClock` alongside the unchanged default AudioEngine export.

Engine constructor/state annotations now use `EngineClock`. Base/synth/sampler instrument consumers use `InstrumentClock`, a pick of `barDuration` only. Both live in the existing root types module; a separate clock-only file is unnecessary. All production runtime logic, real-time clock implementation, managed context lifecycle, and app callers are unchanged. There is no new real-time scheduler, general scheduling abstraction, or duplicated event compiler.

Added a cast-free manual driver in `src/__tests__/support/manual-clock.ts` for testing only. It registers/emits callbacks, recomputes four-beat bar duration when BPM changes, and supplies the existing scheduler timing/conversion members. It has no transport/start/getter-state clone or wall-clock timers; the production offline driver remains harness work.

Three new type-contract cases in `src/__tests__/clock-contract.test.ts` check production-clock compatibility, minimal-driver/native-context construction, the exact engine capability set/currentTime boundary, and duration-only instrument consumers. Three behavior cases added to the existing engine suite reuse its Web Audio/instrument mocks to prove real engine subscription/commit/routing and exact bar/bus timestamps, committed/default BPM, stop/unsubscription cleanup, and rejected invalid MIDI lead. No new unsafe clock/context cast was added. These tests do not claim real audio/worklet execution.

Validation:

```sh
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine test:ci
pnpm exec turbo run build test:ci --force \
  --filter=@web-audio/fluid --filter=@web-audio/clock \
  --filter=@web-audio/audio-engine --filter=@web-audio/worklets \
  --output-logs=errors-only
pnpm --filter web test:unit --run --project server src/lib/globals/__tests__/eval.worker.test.ts
pnpm --filter web test:unit --run --project client src/lib/globals/audio-player.svelte.test.ts
pnpm check
pnpm lint
pnpm test
```

Engine passed all 325 tests in 22 files (6 new cases). Forced dependency/production builds and tests passed (10 tasks, none cached), including the unchanged clock and MIDI scheduler tests. Worker and AudioPlayer browser suites each passed all 8 tests against freshly built dependencies. Built declarations were inspected to confirm the public structural contract. Workspace check/lint/tests, changed-file/document formatting, and `git diff --check` passed; unchanged workspace tasks may be cached. Existing Vite config-loader and tsdown experimental-tsgo notices remain unrelated warnings.

## Step 1.4 — Owned harness and real synth render (complete)

Added the loopback harness (`index.html`, `src/browser/render.ts`, `src/runner/with-harness.ts`) and Node renderer/CLI (`src/runner/render.ts`, `src/runner/audio.ts`, `src/cli.ts`). Case types/settings/registry live in `src/types.ts` and `src/cases.ts`. Dependencies were installed through pnpm: workspace Fluid/audio-engine, exact Vite 8.0.12, and tsx 4.21.0. An initial manual lockfile narrowing was incorrect and discarded. `pnpm install --prefer-offline` regenerated the lockfile from the committed baseline and updated package manifests; its shared Vite transitive-resolution changes are retained without hand edits. Frozen installation succeeded, and all six upstream builds passed with caching forced off. `AGENTS.md` now explicitly prohibits manual lockfile edits. Installation warned about the unchanged `unrun@0.2.38` dependency's missing CLI binary; this did not prevent those builds. No production implementation changed.

The Vite server uses an available loopback port with app/config/env isolation and no SPA fallback. Node owns server/browser lifetime; each render gets a fresh page/browser context, evaluator, offline context, driver, and engine. Source uses the shared public evaluator. The real engine awaits worklet registration, update/preparation, commits on `prebar`, and schedules exact requested `bar` events using committed tempo. The audio context renders bars plus tail, then returns original samples through exact Float32 → JS-number → Float32 transfer. Engine destruction occurs only after rendering (or failure), never before future voices run. No speaker capture, real-time transport, musical sleeps, or audio/worklet mocks are used.

`audio:render --case sine` and package tests build changed workspace dependencies with existing Turbo tasks before browser imports. At Step 1.4 closeout the command printed settings/browser version and peak/RMS metrics only; Step 2.1 below adds diagnostic recordings, not reference comparison. Cases reject invalid settings, duplicate/unknown IDs, and missing CLI selectors. Expected audibility uses a small initial RMS health floor (`1e-8`); explicit silence requires zero. Finite values above one remain legal and unchanged. No comparison tolerance has been selected.

The Node-side 10-second execution deadline covers navigation/readiness, source execution, offline rendering, and pending-request draining. A synchronous `while (true) {}` source is terminated by disposing its context, and the next render succeeds. Unexpected page errors, console warnings/errors, failed requests, HTTP errors, and blocked external URLs fail rendering. Draining observed requests prevents fast renders from hiding late HTTP failures. Startup collisions, missing browser executables, callback failures, and successful completion release browser/server resources; the tests verify closed contexts/connections and successful subsequent launches/rebinding.

At Step 1.4 closeout, sampler cases explicitly failed pending local resources and decode diagnostics; Step 1.5 below removes that guard. Authored MIDI output also fails rather than queueing real-time timers. Worklet registration is real and succeeds on OfflineAudioContext, but this synth proof does not instantiate an LFO node or claim processor output/phase/repeatability.

Validation:

```sh
pnpm --filter @web-audio/audio-regression test
pnpm --filter @web-audio/audio-regression audio:render --case sine
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression format:check
pnpm check
pnpm lint
pnpm test
```

All 44 package tests in 6 files passed: 18 case/settings/layout cases, 3 signal-health cases, 2 CLI exit cases, 3 retained launch smoke cases, 3 harness lifecycle cases, and 15 actual render/error/recovery cases. Browser tests use the real built Fluid/AudioEngine and native Chromium audio APIs. They verify 440 Hz sine output, stereo channels, exact initial silence/frame count, release tail, default/schema BPM, multi-bar onset timing, mono/44.1 kHz, explicit silence, failures/diagnostics, and Node-side hang recovery.

Observed CLI result on the Mac: Chromium 147.0.7727.15; 48,000 Hz, stereo, 112,800 frames, 120 BPM; channel peaks 0.162500, RMS approximately 0.106532. Workspace check/lint/tests, package formatting, document formatting, and `git diff --check` passed; unchanged workspace tasks may be cached. Root testing does not yet discover this package, so its real browser tests are explicitly run through its own command. No app `dev` command or container/hosted CI was needed.

## Step 1.5 — Local samples and loading failures (complete)

Added `resources` mappings to case definitions: exact normalized sample URL → package-relative or absolute local file path. `src/runner/resources.ts` mounts each case at unique loopback URLs, reads original file bytes in Node, disables caching, reports missing/unreadable/non-file resources, and removes mounts after cleanup. The browser only rewrites matching bank-entry `src` values before the real engine update/preparation. Bank/name/source-key/variation identity and sprite bounds remain intact; the real engine still selects, fetches, decodes, reverses, and schedules samples. No fetch/decoder/AudioBuffer/source-node mocks or remote fallbacks were added.

Added two committed-input fixtures under `resources/`: mono 48 kHz PCM16, 0.5-second 440 Hz tone and unequal-end/silent-middle asymmetric tone. `resources/README.md` records original procedural provenance and the explicit generator command; `src/resources/generate-fixtures.ts` is included in TypeScript checking. Normal rendering/tests read these files, never regenerate them. These are input assets, not float-WAV references or approved output recordings.

Registered `sample-tone` and `sample-reverse`. Browser-context-wide request/response/console collection covers worker requests as well as the page. HTTP failures and sampler warnings reject rendering independently of audibility, including HTTP-success/decode-failure and partial healthy output. Local-file diagnostics include the path/error. Case mounts are disposed even on render failure or context-creation/close failure. No production implementation, dependencies, package scripts, or lockfile changed.

Two harness issues were corrected rather than weakening tests:

- Vite treats configured port zero as its default 5173, contrary to the intended ephemeral-port setup. Node now owns the loopback HTTP listener with `listen(0)` and uses Vite in middleware mode. Simultaneous default harnesses receive distinct OS-assigned ports, with no temporary port probe/rebind race; startup errors still close Vite/server resources.
- Converting the integer start offset to seconds and summing durations before multiplication could round 105,600 frames up to 105,601 solely through floating-point arithmetic. Frame planning now retains the integer offset and rounds the musical/tail frames. Existing synth/default/schema-tempo tests remain green, and the 0.1-second-tail case has an explicit frame-count assertion.

Validation:

```sh
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression test
pnpm --filter @web-audio/audio-regression audio:render --case sample-tone
pnpm --filter @web-audio/audio-regression audio:render --case sample-reverse
pnpm --filter @web-audio/audio-regression format:check
pnpm check
pnpm lint
pnpm test
```

All 66 package tests in 8 files passed (22 added): 20 case/settings/layout cases, 3 signal-health cases, 2 CLI exit cases, 3 launch smoke cases, 4 harness lifecycle cases, 2 HTTP-resource cases, 15 existing render/error/recovery cases, and 17 real sampler cases. Sample tests demonstrate decoded pitch/duration and initial silence; reversal of unequal ends; forward/reversed region and sprite selection; explicit built-in mappings; selected-variation preloading without fetching unused external entries; HTTP missing/unmapped files, successful HTTP with corrupt audio, absent banks/names/entries, invalid regions, and external requests. Failures alongside healthy synth/sampler voices are rejected, failed contexts close and recover with a healthy sample, and a real authored worker's external fetch is blocked.

Observed CLI results on Chromium 147.0.7727.15: both sample cases rendered 105,600 stereo frames at 48,000 Hz/120 BPM. Tone peak/RMS were approximately 0.437513/0.147232 per channel; reverse approximately 0.524995/0.0932111. Package/workspace checking/lint/tests, formatting, and `git diff --check` passed; unchanged workspace tasks may be cached. Root testing still does not run this package's browser suite, which was explicitly executed. No app `dev` command was run.

At Step 1.5 closeout, LFO processor execution and repeatability remained Step 1.6; the section below supplies that evidence. Float-WAV output/references/comparison remain Phase 2; no listening-approved reference has been produced.

## Step 1.6 — Real worklets, isolation and repeatability (complete)

Registered three more diagnostic sketches in `src/cases.ts`:

- `lfo-filter`: two bars of real sawtooth/filter audio with normalized sine-LFO phase 0.25 and cutoff endpoint patterns 300→900 / 2500→4500. Static-filter comparison shows real modulation. Freezing endpoints leaves bar one exactly unchanged and changes bar two, proving timestamped endpoint automation.
- `seeded-multibar`: three bars of random pitches (ribbon 11) and chance timing (ribbon 42), eight candidate steps/bar. Actual audio contains hits and misses with sound in every bar. Changing only the pitch seed changes audio but not the hit mask; changing the chance seed changes the hit mask.
- `sample-alternate`: three hits/bar of the asymmetric local sample over two bars. Audible beginnings alternate 440/880 Hz and approximately 0.525/0.175 peak, including the bar boundary. Two-bar, odd one-bar, then fresh two-bar renders each begin forward. The fixture uses `.sequence(3, [0, 1, 2])`; separate scalar arguments instead denote separate bar patterns, which the initial audio assertions correctly caught.

Added seven native worklet checks in `src/__tests__/worklets.test.ts`. Besides filter/endpoint comparisons, a gain-LFO is compared with the same native sine carrier and an analytical sine-gain function at 48,000/44,100 Hz with 4,837/4,417-frame starts. Both start positions split 128-frame quanta. These checks establish authored origin/phase without duplicating event compilation. Their `1e-6` ideal-math bound is not the recording-comparison tolerance.

Unexpected native worklet errors were not automatically visible as page exceptions or rejected offline completion. The harness now temporarily subclasses the actual `AudioWorkletNode` constructor to observe native failures; DSP, parameter data/options, connections and production code are untouched. Errors reject the rendering race and retain the processor name/native `ErrorEvent.message`; the constructor is restored in `finally`. Chromium 147 dispatches its `onprocessorerror` event with event type **`error`**, so observing only `processorerror` initially let a broken processor plus healthy sibling pass. Observing both names fixes this; no diagnostic sleeps, extra worklet barriers or production changes remain. Constructor events provide a generic native “invoking user-supplied constructor failed” message rather than the thrown constructor's text.

Expected-error fixtures replace only module bytes, then use native Blob registration, node construction and worklet execution. Syntax/registration failure, throwing constructor, first-quantum process failure, and a final-quantum process failure all reject renders alongside a healthy synth, close their contexts, and recover with the real LFO case. The final-quantum case first emits healthy filter control, then throws in the last quantum of a one-bar/no-tail render. It verifies completion/error ordering rather than relying on silence or arbitrary waits. None of these fault modules become normal fixtures/references.

Four checks in `src/__tests__/repeatability.test.ts` cover raw-metric correctness/invalid shapes, seeded audio, alternate direction, and repeated whole-buffer rendering. Measurement/fault helpers live only in that suite's `support/`; production imports no test helper. Each registered case has four isolated renders: baseline, same-order repeat, reversed order after odd alternate-state/different-file/silence interference, then reversed order in a genuinely fresh browser and server. The old browser is disconnected first. The interference reuses the same logical URL for different file bytes and verifies healthy changed output, while explicit silence checks that no earlier voice survives.

### Measurements and chosen pair

On the same Mac with Chromium **147.0.7727.15**, stereo 48,000 Hz, 120 BPM and default 4,800-frame origin:

| Case               |  Frames | Largest maximum sample error | Largest RMS sample error |
| ------------------ | ------: | ---------------------------: | -----------------------: |
| `sine`             | 112,800 |                            0 |                        0 |
| `sample-tone`      | 105,600 |                            0 |                        0 |
| `sample-reverse`   | 105,600 |                            0 |                        0 |
| `lfo-filter`       | 204,000 |                            0 |                        0 |
| `seeded-multibar`  | 297,600 |                            0 |                        0 |
| `sample-alternate` | 201,600 |                            0 |                        0 |

These are maxima over the three repetitions and both full-length channels: **18 comparisons / 36 per-channel error pairs**, all exactly zero. A separate fresh Node process also measured all six cases across same-order and fresh-browser repeats with zero error. No audio was aligned, trimmed, normalized, resampled, clipped or quantized; settings/frame count/tempo/browser metadata were checked too.

Chose immutable `COMPARISON_TOLERANCE = { maxError: 0, rmsError: 0 }` in the existing `src/runner/audio.ts`. Repeatability tests enforce the pair; Phase 2 will reuse it for reference comparison. Exact observed equality needs no invented floating-point slack. This does not promise every future sketch or browser/OS to be bit-identical: rerun/review new input and rendering-dependency changes, and report/explain variance rather than automatically widening thresholds. LFO UUIDs were not canonicalized; fresh source/IDs and resource URLs still produced identical audio. The independent audible/silent health checks remain unchanged.

Validation:

```sh
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression test
pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/worklets.test.ts src/__tests__/repeatability.test.ts
pnpm --filter @web-audio/audio-regression audio:render --case lfo-filter
pnpm --filter @web-audio/audio-regression audio:render --case seeded-multibar
pnpm --filter @web-audio/audio-regression audio:render --case sample-alternate
pnpm --filter @web-audio/audio-regression format:check
pnpm check
pnpm lint
pnpm test
```

All **77 package tests in 10 files passed** (66 existing plus 7 worklet and 4 metric/seed/direction/repetition checks). The focused suite was also rerun in fresh processes. CLI channel peak/RMS: LFO approximately 0.188983/0.0465954, seeded approximately 0.186562/0.0738467, alternate approximately 0.524995/0.164802. Package/workspace check/lint/tests, formatting and `git diff --check` passed; unchanged workspace tasks may be cached, and root tests still do not discover this browser suite, which was explicitly run. No production implementation, dependencies, scripts, lockfile, or sample bytes changed. No app `dev` command was run.

**Phase 1 exit gate passed.** Native synth/sample/LFO rendering, failures, isolation and local repeatability are demonstrated. Float-WAV I/O follows in Step 2.1 below; comparisons and listening-approved references do not exist yet.

## Step 2.1 — Standard float-WAV storage (complete)

Added `src/runner/wav.ts`: dependency-free Node encoding/decoding of little-endian RIFF/WAVE IEEE float32, format tag 3. The writer emits 18-byte WAVEFORMATEX with `cbSize=0`, a 4-byte `fact` count interpreted as frames per channel, and interleaved `data`. The 58-byte preamble follows the [McGill WAVE format documentation](https://www.mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html), including the non-PCM extension/fact requirements. This is a standard WAV, not a custom binary container.

The reader scans chunks rather than assuming a 44-byte header. It checks exact RIFF length, chunk bounds/padding, required unique fmt/fact/data, supported format, rate/channel/alignment/byte-rate consistency, whole nonempty frames and matching fact count; every sample must be finite. Unknown properly padded chunks can appear before/after data. PCM, float64, extensible/RF64/big-endian and nonconforming float headers are deliberately unsupported rather than silently converted. Chunk identifiers use byte-preserving decoding so high-bit bytes cannot alias ASCII magic. Ordered 1–32 channels are supported without speaker-layout metadata. No gain adjustment, clipping, resampling, trimming, alignment or quantization is performed.

Added `src/runner/recording.ts` and `RecordingMetadata` in the existing private `src/types.ts`. The WAV gets a same-stem JSON sidecar containing only ID, settings (sample rate/channels/beats/start frames), bars/tail, committed BPM/frame count and actual browser version. Runtime source/resource paths/metrics are not persisted. Metadata parsing checks fields using real narrowing, reuses existing case/frame validation and checks audio shape; missing/corrupt sidecars or mismatched audio fail with paths. A changed nonempty browser version remains valid diagnostic provenance, not a compatibility prohibition.

All validation/encoding finishes before file I/O, so invalid audio/metadata cannot overwrite an old file. Storage uses ordinary writes; it is not a multi-file or reference-set transaction, and disk-write failures may leave partial diagnostic output. Explicit reference replacement remains Step 2.4. No production module imports test support. Readers use Node bytes/float operations, not browser decode/resampling.

`audio:render --case <id>` now saves successful healthy output to ignored `artifacts/render/<id>.wav` and `.json`, reports paths, and explicitly labels it diagnostic/unapproved. It never creates/promotes references or compares them. Unknown/invalid arguments still exit nonzero. Failed rendering does not call storage; an earlier diagnostic can remain. No dependency, package script, lockfile, production implementation, input sample bytes or tolerance changed.

Validation:

```sh
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression test
pnpm --filter @web-audio/audio-regression exec vitest run src/runner/__tests__/wav.test.ts src/runner/__tests__/recording.test.ts src/__tests__/recording.test.ts
pnpm --filter @web-audio/audio-regression audio:render --case sine
pnpm --filter @web-audio/audio-regression audio:render --case lfo-filter
afinfo packages/audio-regression/artifacts/render/sine.wav
afplay packages/audio-regression/artifacts/render/sine.wav
pnpm --filter @web-audio/audio-regression format:check
pnpm check
pnpm lint
pnpm test
```

All **122 package tests in 13 files passed** (77 existing plus 45 added):

- **27 codec cases:** independent known standard bytes (not just writer/reader agreement), mono/stereo/four-channel exact bit round trips, channel interleaving, offset byte views, rate/frame count, signed zero, subnormals, maximum finite float and above-one values. Cover invalid magic, truncation/trailing data, PCM/float64/extensible, malformed extensions/chunks/padding, missing/duplicate chunks, fact/alignment/byte-rate mismatches, empty/partial frames and non-finite samples. Test-only RIFF builders live in runner `__tests__/support/`.
- **16 storage/metadata cases:** real temporary file round trips, small-field sidecar selection, missing/malformed metadata, rate/channel/frame mismatch, changed-browser acceptance, and invalid encoding/metadata preserving existing file bytes. Tests clean up temporary directories.
- **One real-engine storage integration case:** stereo sine, mono 44.1 kHz and 1.3-peak synthesis all retain every full-length Float32 sample exactly on Node readback, including original rate/frame count and metadata. The above-one render remains legal; it is not clipped for file output.
- **One added CLI case:** actual child-process rendering saves the diagnostic WAV/sidecar, reports paths, exposes correct metadata/shape and does not claim reference comparison/approval. The existing two CLI error cases still pass.

CLI sine output on Chromium 147.0.7727.15: stereo 48,000 Hz, 112,800 frames, 120 BPM, peak 0.1625/RMS about 0.106532. `afinfo` independently recognized WAVE, interleaved Float32, 2.35-second duration, 902,400 audio bytes/112,800 packets and data offset 58. **`afplay` completed successfully** on the Mac. This verifies local player acceptance/playback-command success; the assistant does not certify what was heard or grant listening approval. No approved reference was created. LFO CLI also saved 204,000 frames with unchanged peak/RMS approximately 0.188983/0.0465954. Both diagnostic pairs remain ignored artifacts, not tracked references.

Package/workspace checking, lint/tests, formatting and `git diff --check` passed; unchanged workspace tasks may be cached. Root `test:ci` still does not discover this package, whose full browser suite was explicitly run. No app `dev` command was run.

At Step 2.1 closeout the production comparator remained Step 2.2; the section below supplies it. Verify/update commands, failure difference recordings and initial listening-approved references remain later steps.

## Step 2.2 — Raw numerical and signal checks (complete)

Added `src/runner/compare.ts` with `compareAudio(reference, current, options)` and `formatComparison(result)`. Inputs are rate plus original readonly Float32 channels, suitable for decoded WAVs and native render output. Checks require positive integer/matching rates, matching channel/frame counts, nonempty rectangular Float32 channels (including rejection of sparse channel lists), finite values and the existing audible/exact-silence policy on both sides. Validation errors identify reference/current or include both mismatched dimensions; finite peaks above one remain legal. `inspectAudio` gained only a readonly input annotation, with unchanged runtime signal policy.

For each channel and full original frame count N, errors are `current[n] - reference[n]`: maximum is the largest absolute error and RMS is `sqrt(sum(error^2)/N)`. Values are computed in Node double precision without touching original audio. Maximum/RMS gates independently use inclusive `<=`; every gate in every channel must pass. Each channel and the whole comparison retain the worst error's channel/frame/time and reference/current sample values. Ties select first frame/channel; identical samples have `worst: null`. Coordinates are zero-based from the beginning of the file, including the authored start offset, not onset-aligned musical time.

Default thresholds use the immutable measured `COMPARISON_TOLERANCE` **0/0**. An explicitly supplied finite/nonnegative pair can exercise test boundaries or a reviewed caller threshold, but never changes suite defaults or adapts to results. Invalid input/configuration throws clear diagnostics; valid changed audio returns `passed: false` with metrics. `formatComparison` prints rates/counts, thresholds, both per-channel errors/gates and worst location/sample values, preserving information for Step 2.3 artifacts. The helper performs no I/O and imposes no browser-version equality gate or blanket peak cap.

The Phase 1 test-only measurement helper now delegates to this comparator and projects just maximum/RMS values, removing its duplicate arithmetic. Its non-finite-current fixture now uses a healthy reference so the new reference-health check cannot fail before reaching that invalid current. All six repeated native cases still pass 0/0 under the production implementation, including different order and fresh browser launches. Production modules never import test helpers.

Validation:

```sh
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression test
pnpm --filter @web-audio/audio-regression exec vitest run src/runner/__tests__/compare.test.ts src/__tests__/comparison.test.ts
pnpm --filter @web-audio/audio-regression format:check
pnpm check
pnpm lint
pnpm test
```

All **157 package tests in 15 files passed** (122 existing plus 35 added):

- **34 comparator units:** identity, legal above-one peaks/silent sibling channels/full finite Float32 range, unchanged inputs, one-frame shift/gain/polarity/channel-swap changes, a one-ULP change failing zero defaults, independent inclusive boundaries, negative/non-finite threshold rejection, worst-error values/coordinates/first ties and formatted diagnostics. Invalid rate/channel/frame/empty/ragged/sparse/non-finite inputs fail explicitly. Unexpected/negligible silence fails, while opted-in silence requires exact zero even if numerical thresholds would allow a difference.
- The **dropped transient** example changes one sample by 1 in 8,192 frames. With explicit test-only maximum/RMS thresholds 0.5/0.02, RMS is about 0.0110485 (passes) but maximum is 1 (fails), proving RMS cannot hide a localized regression. Its worst location is exactly frame 4,800 / 0.1 s at 48 kHz. This test pair is not a changed suite tolerance.
- **One real rendering/storage comparison integration:** native sine is stored as an unapproved temporary WAV/sidecar, then matches freshly rendered native audio at 0/0. A real Fluid gain change from 0.5 to 0.55 produces failure with a located error above 0.01; reading the original stored samples again confirms comparison did not mutate them. The temporary directory and all browser contexts are cleaned up. This is implementation proof, not approval/promotion or a full mutation framework.

Package/workspace checking/lint/tests, formatting and `git diff --check` passed; unchanged workspace tasks may be cached. Root tests still do not discover this package's browser suite, which was explicitly executed. No engine/application implementation, dependencies, scripts, lockfile, input samples, stored references or measured defaults changed. No app `dev` command was run.

At Step 2.2 closeout, read-only verification remained Step 2.3; the section below supplies it. `audio:render` remains diagnostic output only, and there is still no listening-approved reference.

## Step 2.3 — Read-only verification and failure recordings (complete)

Added `src/runner/verify.ts`, `src/verify-cli.ts` and package `audio:verify [--case <id>]`, building workspace dependencies first. Default selection includes every registered case; targeted selection includes exactly one, with registry/settings validation before launch. Empty/duplicate registries, invalid arguments and unknown IDs fail before any browser starts. Shared `selectCases` validates all/one; existing render selection delegates without changed rendering semantics.

The owned server/browser renders every selected case sequentially, including cases with absent or invalid references. Reference WAV/JSON pairs are read only from package `references/<id>.*`, decoded in Node and validated (including case ID). No source/resource hashing, environment skips or automatic reference generation is involved. Browser-version differences warn but do not prohibit comparison. Valid audio uses the existing `compareAudio` and fixed 0/0 defaults; output includes case/settings, both error gates/thresholds, worst location/values and per-case/final status. Individual failures continue to later cases; failed commands exit 1 and owned contexts/browser/server are cleaned up.

Failures save available accepted audio to ignored `artifacts/verify/<id>/reference.wav`, `current.wav`, and `difference.wav`, each with settings/browser sidecar. A/B preserve original float samples, channels, rate and full frame count. Difference is signed **current - reference**, represented as Float32 for standard WAV; no playback boost or numerical preprocessing. Incompatible shapes provide A/B only, with explicit no-difference/no-resampling diagnostics. Differences overflowing finite Float32 are reported, not clipped. Missing/invalid references provide current-only audio. Evaluation/resource/render failure produces no accepted current buffer; a valid reference copy can still be saved, but partial healthy DSP is never accepted.

Each selected case's old failure directory is cleared before execution, including eventual passes; unselected artifacts remain. Cleanup/write errors are reported/nonzero, and available remaining recordings are still attempted. Artifact/reference configuration must use separate non-overlapping directory trees. Writes are ordinary diagnostic I/O, not a transaction; no code path writes the reference directory. The public CLI uses fixed package paths; test-only options/drivers use temporary, unapproved reference directories. Production imports no test helpers.

Validation:

```sh
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression test
pnpm --filter @web-audio/audio-regression audio:verify
pnpm --filter @web-audio/audio-regression audio:verify --case sine
pnpm --filter @web-audio/audio-regression format:check
pnpm check
pnpm lint
pnpm test
```

All **189 package tests in 18 files passed** (157 existing plus 32 added):

- **18 orchestration units:** strict all/one selection, empty/duplicate/unknown rejection, overlapping-path rejection before I/O, always-render calls on repeated invocation, version-warning/non-gating behavior, stale-selected cleanup and unselected preservation. Numerical mismatch retains A/B and signed differences, including legal above-one amplitudes. Rate/channel/frame mismatch never fabricates differences. Missing/corrupt WAV/JSON or wrong reference ID produce current-only failure without changing the existing reference bytes/file set. Render failure removes stale current audio, preserves reference files, and continues to later cases. Exact silence forwards correctly. Extreme finite A/B values survive while an overflowing difference is rejected rather than clipped. Cleanup and write errors are explicit; write failures do not prevent attempting other recordings.
- **4 actual-browser/storage integrations:** all six synth/sample/LFO cases pass 0/0 against fresh temporary unapproved recordings; selected alternate-direction rerun passes too. Gain 0.5→0.55 fails with retained exact A/B and every difference sample checked as `Math.fround(current-reference)`; subsequent healthy rerun removes stale failure output. Real evaluation and missing-sample failures (with a healthy sibling voice) return no current buffer and then recover to a passing case. Missing sampler reference still renders real output, saves current-only and never creates a reference directory. Full reference WAV/JSON bytes and filenames are unchanged after both successful and failed verification; all browser contexts close.
- **10 command tests:** actual CLI rejects unknown/invalid selections with exit 1. A suite-local child driver uses the production verifier and the same CLI exit policy with temporary unapproved references, avoiding real reference writes: all/targeted originals pass in fresh Node/browser processes, while real gain/evaluation/sample/missing/empty failures propagate exit 1, print useful diagnostics, save appropriate audio, and preserve reference files. All temporary directories are removed.

The normal package CLI rendered all six registered cases and returned **exit 1 / 0 of 6 passed** because no reference WAVs exist. Every case got current-only WAV/JSON; no reference directory/file was created. Targeted sine likewise returned **exit 1 / 0 of 1**. This is intentional missing-coverage detection, not a failing implementation test, and those ignored diagnostics persist after exit.

An ignored manual script rendered original sine into a temporary unapproved directory, verified a real gain 0.5→0.55 change through the production wrapper in a fresh browser, checked both temporary reference files were byte-identical, and then removed the temporary references. It retained A/B/difference under `artifacts/verify-demo/sine/`. Both channels measured max about **0.01625**, RMS about **0.01065321**, worst channel **0**, frame **6,300**, time **0.13125 s**, reference -0.162499994/current -0.178749993, against unchanged **0/0** thresholds.

```sh
afinfo packages/audio-regression/artifacts/verify-demo/sine/difference.wav
afplay packages/audio-regression/artifacts/verify-demo/sine/reference.wav
afplay packages/audio-regression/artifacts/verify-demo/sine/current.wav
afplay packages/audio-regression/artifacts/verify-demo/sine/difference.wav
```

`afinfo` recognized stereo 48 kHz interleaved Float32, 112,800 frames/2.35 s and data offset 58. **All three playback commands completed successfully.** The assistant cannot certify what was heard or grant approval: human A/B review remains user validation, and initial reference listening approval remains Phase 3. Diagnostic demo files persist for that review, not as approved references.

Package/workspace checking/lint/tests, formatting and `git diff --check` passed; unchanged workspace tasks may be cached. Root tests still do not discover this package's browser verification, whose full 189-test suite was explicitly executed. No production engine/app code, dependency resolution, lockfile, input asset, measured tolerance or reference changed. The only package-script addition is `audio:verify`. No app `dev` command was run.

**Step 2.4 (explicit `audio:update --case <id>`) is next.** Verification is usable now but correctly fails until trusted references exist. Update workflow, broader representative mutations, supplied sketches, listening approval and root integration remain later steps.
