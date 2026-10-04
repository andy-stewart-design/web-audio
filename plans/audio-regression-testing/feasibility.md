# Audio regression feasibility and characterization record

## Status

**Phase 0 is complete on the user's Mac; Steps 1.1–1.3 are complete.** The unnecessary Linux/container validation requirement has been removed. Fluid exports the shared synchronous source evaluator used by the REPL worker; the engine accepts native `BaseAudioContext` and a public structural `EngineClock` contract. Actual audio rendering/comparison and reference approval are not implemented yet.

This record supports Phase 0 and Steps 1.1–1.3 of the [implementation plan](./plan.md). Do not interpret the browser-launch smoke tests as audio regression coverage.

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

Existing engine tests use mocks; they do not prove browser audio. Existing LFO tests cover parameter offsets and cleanup but do not directly prove processor phase/origin in an actual render. Source-string tests do not execute the real worklet. Explicit origin/quantum phase, real decoding, actual audio output, execution timeouts, and repeatability remain Phase 1 gates—not evidence inferred from these green tests.

No numerical audio tolerances or listening-approved references have been selected yet. The simplified spec chooses standard 32-bit float WAV references; richer reporting and provenance are deferred.

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

Step 1.4 (owned browser harness and real synth rendering) is next. No actual offline audio render or reference has been produced; browser/worklet feasibility and repeatability are still explicit future gates.
