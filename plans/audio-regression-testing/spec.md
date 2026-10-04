# Fluid sketch audio regression testing

## Status

Proposed implementation spec. User-provided sketches are pending; the harness can be developed with small synthetic fixtures first.

## Problem

After substantial API or engine changes, representative Fluid sketches are manually run in the web REPL and checked by ear. This is slow, inconsistent, and easy to forget. Existing unit tests cover Fluid schemas, event resolution, scheduling calls, and worklet calculations, but the audio-engine tests generally mock Web Audio rather than verify rendered sound.

Build an automated suite that executes saved Fluid source, renders it through the real audio engine, and flags unintended changes against explicitly approved references. Numerical comparisons determine pass/fail; recordings and plots help humans investigate differences.

## Goals

- Exercise the public Fluid API using the same source-evaluation semantics as the REPL.
- Exercise real synthesizers, samplers, envelopes, filters, gain effects, buses, and LFO worklets in a browser.
- Detect unexpected silence, invalid samples, missing voices, timing changes, gain changes, pitch changes, and altered timbre.
- Make renders deterministic enough for reliable automated comparison.
- Support local audio fixtures without dependence on external sample hosts.
- Produce actionable failure reports and an explicit baseline-review workflow.
- Run locally with one command and integrate with the repository's CI test task.

## Non-goals

- Prove that audio sounds musically good or replace all listening checks.
- Require identical output across all browsers, operating systems, or CPU architectures.
- Test physical speakers, microphones, audio-device latency, or external MIDI hardware.
- Test the entire REPL UI through the offline suite.
- Initially cover live graph replacement, mid-render tempo changes, stop/restart, or MIDI input automation.
- Add production WAV export, a new user-facing app route, or a general rendering service.
- Change sampler or envelope semantics to make tests pass.

Offline rendering checks the sound-producing pipeline, not real-time timer performance. A small separate REPL smoke test can cover evaluation/playback wiring later; current clock and lifecycle unit tests remain necessary.

## Current architecture and implementation constraints

Relevant production files:

- `apps/web/src/lib/globals/eval.worker.ts`: creates a fresh Drome, runs `new Function('drome', 'd', code)(d, d)`, and synchronously obtains `d.getSchema()`.
- `apps/web/src/lib/globals/audio-player.svelte.ts`: evaluates source, awaits `engine.ready`, calls `engine.update(schema)` and `engine.prepare()`, then starts the real-time clock.
- `packages/audio-engine/src/index.ts`: commits pending schemas on `prebar`, schedules voices and bus effects on `bar`, and registers the actual LFO processor.
- `packages/clock/src/index.ts`: runs a lookahead scheduler using `setTimeout` and real-time context state.
- `packages/audio-engine/src/instruments/instrument.ts`: schedules Web Audio sources and automation; LFO initialization accepts an explicit bar start time.
- `packages/audio-engine/src/instruments/sample-buffer-cache.ts`: fetches/decodes samples but catches loading failures and returns null after warning.
- `packages/audio-engine/src/utils/preload-samples.ts`: plans known sources, including reverse buffers; uncertain variation ranges can preload all entries.
- `packages/worklets/src/processors/lfo-processor.ts`: derives modulation phase from `currentFrame`, sample rate, and bar origin, rather than main-thread message timing.

The engine and its dependencies currently accept concrete `AudioContext` and `AudioClock` types. `OfflineAudioContext` is not a drop-in replacement at the TypeScript boundary. The real-time clock must not be started against an offline context.

`apps/web` already uses Playwright-backed Chromium browser tests, but its test globs target Svelte tests and it does not currently expose `test:ci`. The root test command runs Turbo's package `test:ci` tasks. The new suite must explicitly participate rather than assume existing app tests cover it.

## Proposed boundaries

Create a private, test-only workspace package at `packages/audio-regression`. It owns fixture registration, the browser harness, comparisons, baseline management, and reports. It is not imported by any production package and is not published.

Use a small Vite-served browser harness and a Node orchestration runner using Playwright. This keeps browser rendering separate from file I/O, enables local sample serving and binary artifact collection, and avoids requiring the production app, database, login, or SvelteKit routes. Use Vitest for unit tests of the runner's comparison and serialization helpers.

Install new dependencies through pnpm; do not manually add dependencies to package manifests. Reuse repository versions where appropriate.

Suggested layout:

```text
packages/audio-regression/
  src/
    browser/                 # real-engine offline harness
    runner/                  # orchestration, baseline I/O, comparisons, reports
    __tests__/               # cross-domain/public harness tests
      support/
        sketches/            # trusted Fluid source files
        samples/             # local WAV fixtures and provenance
        cases.ts             # typed case registry
        baselines/           # reviewed reference data
    runner/__tests__/        # domain-local comparator/serialization tests
      support/
  artifacts/                 # generated reports; gitignored
  package.json
  README.md
```

Keep tests included in TypeScript checking. Production modules must never import from these test directories. Do not migrate unrelated test layouts.

### Shared source evaluation

Extract the synchronous source-to-schema operation into a small shared production helper in `@web-audio/fluid`, used by both the REPL worker and the browser harness. Preserve the existing fresh-Drome behavior, `drome`/`d` aliases, defaults, and error semantics. The worker keeps responsibility for its message protocol.

This is trusted repository code evaluation, not a security sandbox. Do not execute remotely submitted sketches in this harness. Time-limit each case and terminate its browser/page on hangs.

Top-level asynchronous sketch execution is not currently supported by the REPL worker and is out of scope. Sampler fixtures should use inline manifests with local URLs. Do not silently give test sketches broader language semantics than production.

### Audio context and scheduling seam

Generalize rendering-only context dependencies to `BaseAudioContext` or a narrowly derived structural interface containing the methods actually needed. Preserve `AudioContext` where resume, close, or real-time state control is required.

Derive an engine-facing clock contract from the required `AudioClock` capabilities, including event subscription, BPM, bar duration, and any scheduling/MIDI conversion members referenced by engine dependencies. The production clock implements this contract; the offline driver implements only that contract. Avoid casts pretending an offline context is an `AudioContext` or a driver is a full `AudioClock`.

The driver emits deterministic `prebar` and `bar` events through the same engine subscriptions as production. It must not bypass engine commit, routing, sample preparation, or bus scheduling by manually constructing instruments.

## Fixture contract

Each registered case includes:

- Stable ID, description, and covered features.
- Fluid source file.
- Render bar count, starting at bar index zero.
- Sample rate (default 48,000 Hz) and channel count (default stereo).
- Fixed start offset in integer sample frames (default 4,800 frames / 100 ms).
- Explicit tail duration in seconds; capture release tails and one-shots without scheduling additional bars.
- Local sample assets/manifests, if needed.
- Signal expectations: audible versus intentionally silent, peak limits where meaningful, and optionally expected active/silent time windows.
- Named comparison profile, with documented and reviewed per-case overrides.
- Explicit warning allowlist for negative/resource-error cases only.

Use the schema's BPM, with the engine's existing default when omitted. Do not impose a different test tempo after evaluation. Initial fixtures use four beats per bar and a constant tempo.

Render length is derived from start offset + bar count × bar duration + tail duration, rounded up to a whole sample frame. Store the resolved length in baseline metadata. Choose bar counts long enough to cover the relevant multi-bar pattern, not merely its first bar.

### Deterministic input policy

- Use explicit Fluid random ribbons/seeds, including chance patterns. Current random cycles default to seed zero, but fixtures should state their intended seed rather than depend on that default.
- Do not use `Math.random`, wall-clock time, device state, or arbitrary network responses in sketches.
- Do not globally monkey-patch randomness or rewrite generated musical values to force agreement.
- Normalize nondeterministic identity fields such as LFO IDs for schema comparison only. Preserve sharing relationships, array order, and all semantic values. Canonical IDs are assigned consistently by traversal; independent LFOs must remain distinct.
- Give every case a fresh evaluator, context, clock driver, and engine. Isolate cases from prior caches, voices, alternate-direction state, and page globals.

### Sample fixtures

Serve fixture assets from the harness's loopback HTTP origin. A file path alone is not a fetchable browser URL. Fixture source uses stable harness-relative URLs.

Prefer small uncompressed PCM WAV files with documented origin, licensing, format, and hashes. Provide purpose-built signals such as distinct tones, an asymmetric transient, and a multi-region sprite. Add representative real samples where licensing permits.

For built-in banks, explicitly map approved source URLs to pinned local copies, preserving bank/sample/source-key/variation relationships. Do not replace a whole bank with one generic sound or permit fallback to the public host.

Block external network access for the harness, including worker requests. Allow only required harness resources and explicitly approved local fixtures. Treat failed HTTP responses, decode failures, missing assets, and unexpected sampler warnings as test failures. `engine.prepare()` resolving is not sufficient proof that samples loaded successfully under the current cache behavior.

## Offline rendering lifecycle

For each case:

1. Read trusted source, validate fixture metadata, and establish timeout and diagnostic collection.
2. Evaluate source with the shared helper and obtain the production `DromeSchema`.
3. Validate the schema and determine effective BPM, bar duration, and buffer length.
4. Create an `OfflineAudioContext` with the specified sample rate, channel count, and frame length.
5. Create the offline clock driver and real AudioEngine.
6. Await `engine.ready`; use the real worklet module and `AudioWorkletNode`, without stubs.
7. Call `engine.update(schema)` and await `engine.prepare()`; enforce strict resource/warning checks.
8. Emit `prebar` for bar zero at the exact start timestamp, committing the pending schema before the first `bar` event.
9. Emit `bar` for each requested bar at its exact timestamp, with subsequent `prebar` events in production order. Schedule the static graph before rendering starts.
10. Call `startRendering()` and await the complete buffer under a timeout.
11. Collect raw float samples per channel, canonical schema, diagnostics, timings, and environment metadata.
12. Compare and produce artifacts, then destroy the engine and release browser resources in `finally` cleanup.

Do not call `clock.start()`, sleep for musical time, poll an analyser, or use speaker capture. Do not call stop/destroy before rendering completes: current note cancellation uses context `currentTime` and could cancel all future voices.

Fixed-graph sketches can schedule ahead. Mid-render graph replacement and real-time controls require separate lifecycle tests, potentially using offline suspend/resume points, and are deferred.

## Comparison and pass/fail

A case passes only if all configured assertions pass. A correct schema cannot compensate for wrong audio, and similar audio cannot compensate for a changed API/event structure.

### Required semantic check

Compare a canonical schema against its approved JSON reference. Preserve notes, sample choices, timing, duration, envelope/effect parameters, routing, and random seeds. Normalize only documented nondeterministic identities and serialization ordering.

Require canonicalization to preserve LFO aliasing. Add focused unit tests for this behavior. A readable JSON/path diff should identify changed fields.

Resolved-event expectations can be added for selected cases in a later slice using existing production resolvers. Do not introduce a second event compiler or a test-only imitation of scheduling. The initial semantic layer is the canonical schema plus focused existing resolver tests.

### Required audio checks

- Sample rate, channel count, and frame length agree with the fixture/reference.
- All sample values are finite.
- Audible cases exceed a specified minimal signal floor; deliberately silent cases assert silence explicitly.
- Per-channel raw samples are compared without gain normalization, automatic time alignment, or trimming silence.
- Report maximum absolute sample error and root-mean-square sample error. Enforce both using the approved profile.
- Compare per-channel short-window RMS envelopes to catch localized missing or altered events, not just whole-recording energy changes.
- Respect explicit expected-silence/activity windows where a fixture defines them.

Peak amplitude above one is not automatically an engine error: Web Audio buffers can contain values outside the nominal output range. Peak/overload assertions are fixture-specific. Never clip floats before comparison.

A first feasibility spike must measure repeated-render noise on the intended environment. Select concrete numeric thresholds from that evidence, store them in named profiles, and document their units. Do not ship unexplained arbitrary tolerances or automatically widen them to accept a change.

The initial default profile should be strict for a pinned environment. Optional feature-based profiles may follow if a justified fixture is phase-sensitive; they must not silently relax the raw-sample gate for the whole suite.

### Spectral diagnostics

Generate short-time Fourier spectrograms for reference/current/difference visualization using a fixed window, FFT size, hop size, and shared dB scale. Store analysis settings in report metadata.

Spectrograms are diagnostics in the first release, not screenshot assertions or the only acceptance gate. A whole-recording spectrum loses timing information and is insufficient on its own. Later frequency-band assertions may complement raw comparisons when justified by a fixture.

## Baselines and approval

Store the reference's raw float samples in a documented lossless format, canonical schema JSON, and a versioned metadata manifest. WAV previews are generated for review, not the source of truth for comparisons.

Manifest fields include case ID, source hash, asset hashes, render settings, comparison profile/version, baseline-format version, analysis settings, and authoritative browser/OS/architecture provenance. Record the generating revision where available. Source and asset hashes detect stale provenance; they must not bypass rendering or silently replace a reference.

A changed source, asset, or render contract requires explicit baseline review. Environment mismatch must be reported distinctly from audio regression; do not silently compare incompatible references or create platform-dependent replacements.

Workflow:

1. Normal verification reads references and never modifies them.
2. A missing baseline fails with a clear instruction; it is never auto-created by CI.
3. A separate candidate-generation command renders named cases at least twice to establish repeatability, then writes candidates and reports outside the approved baseline directory.
4. The developer reviews semantic diffs, listens to the audio, and inspects plots/metrics.
5. A separate approval command promotes explicitly selected candidates and records their settings/provenance.
6. Commit baseline changes with the reason for the intended behavioral change.

Candidate repeatability applies the same strict assertions as regular verification. Baseline promotion must reject nonfinite output, failed loads, unexplained warnings, or nondeterministic repeated renders. Threshold-only changes must be visible in review.

## Failure reports

Write a self-contained local HTML report and machine-readable JSON summary, grouped by case. Include:

- Failure stage: evaluation, schema, resource, worklet, render, environment, or comparison.
- Semantic diff, unexpected warnings/errors, and failed requests.
- Audio metrics, thresholds, channel, and the time/sample index of the worst error.
- Playable reference/current/difference WAVs.
- Overlaid waveform and short-window loudness plots.
- Reference/current/difference spectrograms with consistent scales.
- Source/asset hashes and browser/render provenance.

Keep unclipped float data for measurements. If a playable preview needs attenuation, label that fact and never use the attenuated preview in assertions. Partial artifacts should survive failures where possible.

Successful runs may retain only a compact summary. Failed runs retain full diagnostic artifacts for CI upload. Never commit generated HTML reports or candidate directories.

## Environment, commands, and CI

Choose one authoritative CI lane: pinned Playwright Chromium plus a fixed OS image and architecture. Record the selected versions/image during the spike. A lockfile alone does not pin the OS audio implementation.

Local runs on the same lane are authoritative. Other platforms can render and inspect reports, but must clearly indicate incompatibility instead of appearing to certify the CI baseline. Provide instructions for running the authoritative environment locally where practical.

Suggested package commands:

- `pnpm --filter @web-audio/audio-regression test:ci`: comparator/harness tests and approved-case verification; nonzero exit on failure.
- `pnpm --filter @web-audio/audio-regression audio:verify --case <id>`: targeted verification.
- `pnpm --filter @web-audio/audio-regression audio:candidates --case <id>`: generate repeatability-checked review candidates.
- `pnpm --filter @web-audio/audio-regression audio:approve --case <id>`: explicitly promote reviewed candidates.

Implement `check`, `lint`, and `format` scripts for the new package. Root `pnpm test` should discover its `test:ci` task through Turbo. Ensure workspace dependency builds and Playwright browser installation are documented and present in the CI lane.

The runner owns starting/stopping its test server on an available loopback port. It must not require a developer to run an app `dev` command. It must not depend on production environment variables or databases.

Initially run cases sequentially to limit offline rendering memory and simplify repeatability. Measure suite runtime and retained artifact size before increasing coverage/concurrency. Disable caching for audio verification initially, or explicitly configure outputs and complete inputs before enabling it; failure reports must not disappear behind a cached task.

## Delivery slices

### 1. Feasibility and production seams

- Add the private package and browser harness.
- Extract shared synchronous Fluid evaluation and narrow context/clock dependencies.
- Render a sine synth, a local sample, and a filtered/LFO-modulated synth through the real engine.
- Confirm real offline worklet registration and repeated-run determinism on the authoritative lane.
- Verify local resource blocking and fatal handling of missing/corrupt samples.
- Document measured noise, environment pinning, and initial comparison thresholds.

Gate: if real worklets or deterministic output cannot be established, report the blocker and revise the architecture before building baseline tooling. Do not substitute mocked worklets or treat silence as success.

### 2. Reliable references and comparison

- Implement typed fixture metadata, canonical schema references, float serialization, signal checks, and raw/windowed audio comparisons.
- Implement candidate generation, repeatability checks, explicit promotion, and stale-provenance handling.
- Add unit tests with tiny known arrays and intentional mutations: amplitude, missing transient, sample shift, channel swap, invalid sample, silence, and length mismatch.
- Demonstrate that changing note pitch, rhythm, gain, filter, sample selection, or reverse direction is detected end to end.

### 3. Useful diagnostics and automation

- Add WAV previews, waveform/RMS plots, spectrograms, HTML report, and JSON summary.
- Add targeted commands, root test integration, environment instructions, and CI artifact upload instructions/configuration appropriate to the repository's eventual CI setup.
- Confirm failures clean up the server/browser and retain artifacts.

### 4. Representative sketch onboarding

- Add the user's supplied sketches as unchanged Fluid source where possible.
- Replace external resources with documented pinned local equivalents and remove explicitly identified nondeterministic inputs with approval.
- Begin with 5–10 cases chosen for coverage: synth, chords/rests/multi-bar transformations, seeded randomness/chance, envelopes, LFOs, effects, sampler regions/chops/fit/reversal, buses/sends, and mixed output.
- Choose adequate bar/tail lengths and approve initial references by ear and report review.
- Document each sketch's coverage and gaps.

## Acceptance criteria

- A single command executes registered source sketches and compares actual offline audio without manual REPL operation.
- Both REPL worker and harness share synchronous evaluation semantics, including `drome`/`d` aliases.
- Real AudioEngine commit, event scheduling, routing, sample decode/playback, and LFO worklets are exercised; there are no fake audio nodes in render tests.
- Static sketches run without real-time sleeps or clock timers.
- Local samples work with external network access blocked; missing/corrupt fixtures fail even when production cache code only warns.
- Repeated runs on the authoritative lane pass at documented fixed tolerances.
- Representative intentional pitch/timing/gain/sample/filter/direction changes fail, with useful reports.
- Canonicalization preserves shared versus independent LFO identity.
- Intentional silence is distinguished from a sketch that failed to produce sound.
- Verification never updates references; CI cannot silently approve changes.
- Candidate generation rejects failed or nonrepeatable renders, and promotion is explicit.
- Environment incompatibility, baseline provenance changes, and rendering failures are distinguishable from numeric audio differences.
- Existing production tests, checking, and linting continue to pass after shared-boundary changes.
- The new package includes unit/integration tests, TypeScript checking, linting, formatting, and documented commands.

## Remaining inputs and deferred decisions

No user input is required to begin the feasibility slice. Before approving the representative suite, obtain:

- The actual regression sketches and the behaviors each is intended to protect.
- Sample files and permission to commit/use them as fixtures, or acceptable synthetic alternatives.
- A listening-approved initial output for each sketch.

Resolve during implementation rather than guessing now:

- Exact browser/OS image and architecture for authoritative runs.
- Measured tolerance values, window sizes, and initial runtime/storage budgets.
- Whether larger real-world fixtures eventually justify Git LFS or a checksum-pinned artifact store. Small initial references should remain in the repository.

Potential follow-ups: resolved-event traces, real REPL browser smoke coverage, graph replacement/stop/resume rendering scenarios, controlled MIDI automation, spectral acceptance profiles, and additional browser-specific baseline lanes.
