# Fluid sketch audio regression testing

## Status and purpose

**Phases 0–2 implementation is complete on the user's Mac.** The package renders real synth, local sampler and LFO audio with isolation/diagnostics, stores exact float-WAV/metadata, compares raw samples, saves useful failure recordings and provides separate read-only verification/selected reference updates. Six meaningful numerical regressions and two API/resource failures remain detected without rewriting references.

The original six sketches repeated at exact 0/0. The supplied `techno-drum-loop` exposed native Float32 mixing-order variation; after causal investigation and explicit user review, the fixed defaults are now **maximum `1e-6` / RMS `1e-7`**. Repeated unchanged loop verifications pass and meaningful controlled changes still fail. See [repeatability.md](./repeatability.md) for evidence, trade-offs and direct validation. No production DSP graph or reference was changed to obtain a pass. User-case onboarding is underway; listening review, representative trusted coverage and root integration remain Phase 3. Missing selected references still fail. See [plan.md](./plan.md) and historical [feasibility.md](./feasibility.md) for remaining work and prior validation.

Replace routine manual REPL checks with a local command that executes saved Fluid sketches, renders through the real audio engine, and compares the sound with listening-approved recordings. Build a useful regression suite, not a cross-platform testing service.

## Initial scope

- Run locally on the user's Mac using the package's exact Playwright dependency and its bundled Chromium.
- Evaluate trusted repository sketches with the same synchronous `drome`/`d` semantics as the REPL.
- Render real synthesis, sampling, envelopes, filters, gain, routing, and LFO worklets with `OfflineAudioContext`.
- Use fixed sample assets, random seeds, tempo, start position, sample rate, and duration.
- Compare raw audio numerically with explicit tolerances.
- Save 32-bit float WAV references and useful failure recordings.
- Provide read-only verification and one explicit reference-update command.
- Add user sketches as soon as rendering/comparison support them; expose the suite through the normal repository test command.

## Not required for the initial suite

- Linux, containers, fixed OS images, architecture certification, or an environment compatibility gate.
- Hosted CI setup or new CI-provider configuration. The existing Turbo script name `test:ci` can be used for local root-test integration without requiring hosted CI.
- Schema snapshots, LFO-ID canonicalization, resolved-event traces, or a duplicate event compiler. Source evaluation failures already detect broken API usage; existing schema/resolver tests remain in place.
- A custom binary reference format, source/asset hash gates, named comparison profiles, or formal runtime/storage budgets.
- Candidate staging, a promotion/approval command, eligibility records, approval reasons enforced by tooling, or atomic multi-case reference transactions.
- Waveform/spectrogram generation, HTML reports, or a machine-readable report framework.
- REPL UI automation, real-time scheduler performance, physical audio/MIDI devices, mid-render graph/BPM changes, or stop/restart scenarios.
- New async REPL semantics, production WAV export, or changes to musical behavior just to make tests pass.

These can be considered later if practical use demonstrates a need. They must not delay testing the actual sketches.

## Implementation boundaries

Keep the private, unpublished `packages/audio-regression` package established in Phase 0. It owns the test harness, fixtures, comparisons, and WAV file I/O. Production packages must not import it or test support.

Use a small Vite-served browser harness with Node/Playwright orchestration: the browser renders real audio, Node reads/writes references and compares floats. The runner starts/stops its own loopback server; no app `dev` process, database, login, or production environment variables are needed. Vitest covers helpers and integration behavior.

Prefer domain-local `__tests__/` for unit tests, package-level `src/__tests__/` for cross-domain tests, and suite-local `support/` for fixtures. Keep tests in TypeScript checking. Add dependencies through pnpm, not by manually changing dependency entries.

### Minimal production seams

- Extract the current synchronous evaluation operation into a small Fluid helper used by the REPL worker and harness. Preserve fresh Drome instances, aliases, defaults, ignored source return values, and errors; the worker retains its message protocol.
- Narrow rendering-only context annotations to `BaseAudioContext` or the capabilities actually needed. Keep resume/close/context management on real-time owners.
- Derive a small engine-facing clock contract from current capabilities. A deterministic driver emits `prebar` and `bar` through the existing engine subscriptions; it does not bypass commit/routing or manually construct instruments.
- Preserve production behavior and real type safety. Do not cast an offline context into `AudioContext`, imitate the entire clock class, or introduce a general scheduling abstraction.

The capability inventory in `feasibility.md` is the starting point. In particular, the existing MIDI scheduler requires timing/conversion members even when the initial fixtures do not use MIDI output.

## Fixtures and repeatability

Cases are authored as `packages/audio-regression/cases/<id>/metadata.json` plus `sketch.js`, with optional colocated `samples/` and origin notes. Folder names supply IDs; Node discovers immediate nonhidden case folders in stable sorted order without a central registry edit. Required metadata fields are `description`, `bars`, `tailSeconds`; optional fields are `settings`, `expectSilence`, `resources`. Source is read as complete text and evaluated as ordinary synchronous REPL JavaScript, not imported as a module; multiline variables/functions/loops and existing `d`/`drome` aliases work. Unknown/malformed fields, invalid IDs/settings, missing files and empty coverage fail before browser startup. Files under each case's `samples/` folder automatically map to `/samples/<path>`, including nested folders. Optional exact `resources` mappings override those defaults and resolve relative to the case folder (explicit shared/absolute paths are also supported). Native sample loading/diagnostics remain unchanged; references stay separately under package `references/` and are never generated by discovery.

A loaded case contains:

- Stable ID and a brief description of what it protects.
- Trusted Fluid source.
- Bar count, starting at bar zero, and explicit tail duration.
- Render settings with suite defaults: 48,000 Hz, stereo, four beats per bar, and a 4,800-frame start offset.
- Local sample resources if needed.
- Audible output expected by default; intentionally silent cases opt in explicitly.
- The suite-wide measured maximum/RMS tolerance pair remains separate from authored metadata; no per-case tolerance knobs/profile system are implemented.

Use the generated schema's BPM or the engine's default 120 BPM. Calculate frame length from start offset + requested bars + tail, rounded up to a whole frame. Choose enough bars for the behavior being protected, not just the first bar of a long pattern.

Use explicit random ribbons/seeds; avoid wall-clock input and `Math.random`. Give each render a fresh evaluator, page/context, clock driver, and engine. Run cases sequentially initially.

Before setting thresholds/references, repeat synth, sampler, and LFO renders, including a fresh browser launch. Record maximum/RMS differences and choose documented limits from evidence, not automatically from a failing comparison. The original six cases measured 0/0; a historical overlapping-three-voice draft then showed small variation. The user's drum loop subsequently isolated the cause: unordered native Float32 mixing, confirmed without Fluid/AudioEngine and by exactly reproducing mixed recordings from stable individual signals in different addition orders.

The user-reviewed suite-wide limits are now **maximum `1e-6` / RMS `1e-7`**, exported as frozen `COMPARISON_TOLERANCE` from the runner audio module and shared by comparator, repeatability checks and verification. Both inclusive gates must pass in every channel; these are absolute sample differences, not percentage/normalized errors. Initial drum-loop observations were maximum about `2.38e-7` / RMS `1.28e-8`; a later command measured maximum `3.58e-7`, still below the same fixed limits. No automatic adjustment, preprocessing, graph rewrite or reference update is involved. Genuine differences below both limits are not detectable; exact equality is no longer the default promise, although explicit comparator callers can still request zero thresholds. See [repeatability.md](./repeatability.md) for the reviewed rationale and positive controls.

These are local measurements, not a universal DSP/browser error bound or listening approval. Remeasure new sketches/platform changes and investigate outliers; do not widen limits automatically or approve an unexplained musical change.

The browser dependency is pinned in `package.json` and the lockfile; there is no separate environment-pinning framework. Record the actual browser version and render settings beside references for troubleshooting. Browser/OS changes may warrant rechecking repeatability or reviewing differences, but do not prohibit running on a Mac or fail solely because provenance changed. Cross-platform reference compatibility is not promised.

## Local samples and error detection

Serve fixed sample files from the harness's loopback origin; a filesystem path alone is not a browser-fetchable URL. Use inline sample manifests and local URLs. For a built-in bank used by a sketch, map its relevant sources to local copies while preserving sample/key/variation identity.

Keep sample origin/license notes. A few tiny tone/transient fixtures are sufficient to start; an asymmetric transient makes reversal and region errors detectable. Use the user's real samples when available and suitable for the repository.

Block external requests, including worker requests if used. Fail on failed HTTP responses, decode errors, missing resources, unexpected sampler warnings, page exceptions, and worklet errors. `engine.prepare()` resolving is not enough: current cache behavior can warn and return null, while sibling voices continue producing sound.

Expected-error tests can assert specific diagnostics separately. They do not create normal audio references from failed loads.

## Rendering lifecycle

1. Evaluate source with the shared helper and validate the resulting graph.
2. Derive BPM, duration, and frame count; create an `OfflineAudioContext`, deterministic driver, and real AudioEngine.
3. Await `engine.ready`, update the engine, and await sample preparation with diagnostic collection active.
4. Emit `prebar` at the fixed start time, then `bar` events for the requested bars in production order. Use the committed BPM when scheduling. Schedule no additional bars during the tail.
5. Await `startRendering()` and transfer the original channel Float32 samples to Node.
6. Check signal health and compare/write WAVs as requested, then clean up in `finally`.

Do not start the real-time clock, sleep for musical time, poll an analyser, or capture speakers. Do not stop/destroy the engine before rendering finishes; cancellation can otherwise remove future voices.

Bound each case with a Node-side timeout and close its page/context on hangs, including synchronous evaluation hangs. Clean up the server/browser on success and failure. Initial offline fixtures exclude MIDI output because the current scheduler can queue timers even without connected hardware.

## Comparison and reference storage

Store each reference in its matching case-ID folder as **`references/<id>/render.wav` and `references/<id>/metadata.json`**: standard **32-bit IEEE-float WAV** plus a small JSON file containing render settings and actual browser version. Inputs remain separate under `cases/<id>/`. Update/verification share this folder layout; verification does not migrate or read flat legacy pairs. Existing ID-named pairs can be moved/renamed into the matching folder without changing their contents or regenerating audio. Keep it simple: no source hashes, compatibility certifications, or schema golden files.

Write the rendered Float32 values without PCM16 quantization, gain normalization, clipping, or resampling. Read reference WAV samples directly in Node, rather than decoding/resampling them through the browser. Step 2.1 implements little-endian IEEE float32 tag 3 with 18-byte WAVEFORMATEX (`cbSize=0`), a `fact` frame count per channel, and interleaved data. The reader validates the container/chunks and finite samples, accepts unknown padded chunks, and deliberately rejects unsupported formats instead of converting them. Unit/native-render tests verify exact sample/channel round trips, including finite values above one. JSON sidecars contain only ID, settings, bars/tail, BPM/frame count and browser version; malformed metadata or mismatched audio shape fails, while browser-version changes alone do not.

Verification checks:

- Matching sample rate, channel count, and frame length.
- Finite samples in both current/reference audio.
- Expected audibility, or explicit silence for a silent case.
- Per-channel maximum absolute sample error and RMS sample error against documented fixed tolerances.

Step 2.2 implements these checks in `src/runner/compare.ts`: malformed/invalid shape or signal throws labelled errors; valid numerical mismatches return failure plus per-channel maximum/RMS metrics and worst channel/frame/time/sample values. Both gates use inclusive `<=` thresholds and must pass in every channel. Locations include the full recording's initial silence; ties choose the first channel/frame and identity has no fictitious worst error. Formatting reports thresholds and failed gates. The helper does not write files or use provenance as an equality gate; Step 2.3 orchestrates verification/artifact storage separately without changing these checks.

Do not time-align recordings, trim silence, or normalize loudness to make them agree. The maximum-error gate helps catch short localized changes that whole-recording RMS alone can hide. Windowed loudness and spectral assertions are follow-ups, not prerequisites.

Finite values above one are legal in Web Audio and must be preserved. Do not impose a blanket peak-above-one failure or alter the reference for playback convenience.

## Commands and baseline review

Available commands (verification is read-only; updating is a separate explicit action):

```sh
pnpm --filter @web-audio/audio-regression audio:verify
pnpm --filter @web-audio/audio-regression audio:verify --case <id>
pnpm --filter @web-audio/audio-regression audio:update --case <id>
```

References are created/replaced only by explicit update as package `references/<id>/render.wav` plus `references/<id>/metadata.json`, then committed after human listening/review; none are approved yet. Step 2.4 requires exactly one named case (no all/default/multiple update), validates selection before launch, always renders fresh, and checks accepted audio/metadata/encoding before writing only that pair. Source/resource/worklet/timeout/health/validation failures leave old files untouched and cannot create a first reference. Other references and measured tolerances remain unchanged. Ordinary WAV/JSON disk writes are not transactional: later I/O failures may leave partial output, propagate nonzero and require inspection/restoration. The command reports paths/settings/signal metrics and states that generation is not approval.

- Verification always renders and compares; it never writes references. Missing references, unknown selectors, or an empty suite fail clearly rather than passing with no coverage.
- Updating is an explicitly selected action, not a test flag invoked by normal verification. Render and validate output before writing the selected reference. Failed evaluation/loading/rendering must not overwrite the old recording.
- Generate the reference, listen to it, inspect changed settings/numeric differences where available, and commit only after review. Git review/commit messages are sufficient approval records.
- Do not auto-update references after a mismatch or force a second candidate/promote workflow. Initial repeatability is established by the render tests and checked for newly added cases.

On failure, print the case ID, relevant errors, maximum/RMS errors, thresholds, and worst-error channel/time. Step 2.3 saves reference/current/difference float WAVs and small sidecars under gitignored `artifacts/verify/<id>/`. The difference sign is **current - reference**, retained as Float32 without playback amplification. Rate/channel/frame mismatches save A/B but explain that no difference is available; there is no resampling/trimming/channel remapping. Unrepresentable Float32 differences are reported instead of clipped. Missing/invalid references provide current-only audio when possible. Failed evaluation/loading/rendering yields no accepted current buffer (no partial healthy output), but can save a valid reference copy; diagnostics and later cases still run. Selected stale artifacts are cleared before each case; unselected case files remain. Cleanup/write failures are reported and exit nonzero. Verification never writes reference files; ordinary artifact I/O is not a multi-file transaction. Native playback-command success demonstrates player acceptance, not human listening approval.

Plots and richer reports are optional enhancements. Difference recordings may be quiet; do not change measurement data merely to make them louder.

Once representative cases work, give the package a `test:ci` script for local root `pnpm test` discovery. Build workspace dependencies first, disable caching for the audio verification task initially, and confirm nonzero failures propagate. Actual hosted CI is separate future work.

## Delivery and acceptance

### Phase 0 — Characterize and launch (complete)

Production contract inventory, worker protocol tests, private package, and local browser launch/cleanup tests are complete. No Linux/container gate remains.

### Phase 1 — Render

Add the minimum production seams and local harness; render real synth/sample/LFO output; prove loading failures, isolation, timeouts, and repeatability. Use small synthetic cases first and incorporate supplied sketches whenever supported.

### Phase 2 — Compare (implementation complete)

Standard float-WAV storage, numerical assertions, read-only verification, explicitly selected updates and failure recordings are implemented. Eight focused native integration cases prove healthy pitch, timing, gain, bar-two filter, sample-variation and direction changes fail numerically (originally at 0/0, now retained under the reviewed fixed limits), while API/resource failures reject before accepting partial audio. Originals pass before/after each failure; complete reference file sets/bytes remain unchanged, and signed difference samples are checked without preprocessing. Synth/sampler failure WAVs work in the local player, but playback success is not listening approval. Test-only variants and temporary references never populate the approved case/reference set.

### Phase 3 — Use

Register representative user sketches, make their samples local, choose adequate bar/tail lengths, listen to initial references, and connect the suite to routine local/root tests. Do not wait for plots or hosted CI.

The initial suite is complete when a single local command runs the registered sketches through the real engine, repeatable output passes, meaningful intentional changes fail, resources cannot silently fail, references update only explicitly, and recordings make failures reviewable. Existing production tests/checks/lint remain green.

Remaining user inputs are the sketches, their intended protected behaviors, and usable sample files. Optional follow-ups include plots/spectrograms, schema/event assertions, hosted CI, extra browsers/platforms, and live-control scenarios.
