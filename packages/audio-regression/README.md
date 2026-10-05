# @web-audio/audio-regression

Private local tooling for Fluid-sketch audio regression tests. **Steps 1.1–1.4 are complete on the user's Mac:** the package renders real synth audio through Fluid, AudioEngine, and Chromium's `OfflineAudioContext`. Sample coverage, LFO execution/repeatability checks, WAV files, and reference comparison are still upcoming.

See [`spec.md`](../../plans/audio-regression-testing/spec.md), [`plan.md`](../../plans/audio-regression-testing/plan.md), and [`feasibility.md`](../../plans/audio-regression-testing/feasibility.md).

## Setup and current commands

From the repository root:

```sh
pnpm install
pnpm --filter @web-audio/audio-regression browser:install
pnpm --filter @web-audio/audio-regression audio:render --case sine
pnpm --filter @web-audio/audio-regression test
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression format:check
```

`audio:render` and `test` first run `build:deps`, using the existing Turbo workspace builds/cache for Fluid, audio-engine, and their dependencies. Changed production code is rebuilt before browser imports; no app/database build is involved. For first-time type checking without tests/rendering, run `build:deps` first.

`audio:render --case sine` prints browser version, sample rate, channels, frame count, BPM, and per-channel peak/RMS. It currently writes **no WAV/reference files** and performs **no reference comparison**. Unknown selectors or invalid arguments exit nonzero. Register trusted sketches in `src/cases.ts`; sample cases are explicitly rejected until Step 1.5.

`test` runs the unit/CLI tests, browser launch checks, and actual synth render/lifecycle tests. `test:smoke` selects only the original three launch checks. Root `pnpm test` does not yet run this package; root verification integration is planned once actual references exist.

Install and launch sequentially. `browser:install` downloads only the Chromium headless shell associated with the exact Playwright dependency in package/lockfile; no separate environment manifest or OS-version check is used.

## Rendering behavior

- The runner owns an ephemeral-port, loopback-only Vite harness and browser. No app `dev` process, database, login, production environment variables, Docker, or hosted CI is needed.
- Source evaluation uses Fluid's public synchronous `evaluateSource(code)`, with fresh Drome instances and `drome`/`d` aliases. Trusted source is arbitrary JavaScript, not sandboxed; source promises are not awaited.
- Each case gets a fresh page/browser context, offline audio context, engine, and explicit clock driver. Cases run sequentially initially.
- Defaults: 48,000 Hz, stereo, four beats per bar, 4,800-frame start offset. Schema BPM or engine default 120 BPM determines duration; bars and tail are explicit, with frame length rounded up.
- The real engine awaits worklet registration/preparation, commits on `prebar`, and schedules requested `bar` events. Rendering finishes before engine destruction. No speaker capture, musical sleeps, or real-time clock start is used.
- Original Float32 samples return to Node without normalization, clipping, quantization, alignment, or resampling. Finite peaks above one are legal. Expected audibility uses an initial RMS health floor of `1e-8`; intentional silence requires exact zero. This is not a comparison tolerance or quality certification.
- External requests are blocked. Page errors, warnings/errors, failed requests, and HTTP errors fail rendering. Already-started requests drain under the same deadline; missing files do not fall back to HTML.
- A Node-side 10-second execution deadline covers navigation/readiness, source execution, rendering, and request draining, including synchronous source hangs. Pages/contexts, browser, and server close on success/failure. Initial fixtures must not author MIDI output.

The current tests verify real sine pitch/output, default/schema tempo, multi-bar timing, start silence, release tail, alternate rate/mono output, explicit silence, invalid sources/settings/selectors, diagnostics, a synchronous hang, and startup/failure cleanup. Registration success does **not** yet prove LFO processor output or sampler decoding; those remain Steps 1.5–1.6. No numerical comparison tolerances or listening-approved references exist yet.

## Planned comparison commands — not implemented yet

```sh
pnpm --filter @web-audio/audio-regression audio:verify
pnpm --filter @web-audio/audio-regression audio:verify --case <id>
pnpm --filter @web-audio/audio-regression audio:update --case <id>
```

References will be standard 32-bit float WAVs with small settings/browser-version sidecars. Verification will always render and remain read-only. Explicit updates will render/check the selected case before writing; listen and review before committing. Failures will print numerical metrics and save reference/current/difference WAVs under gitignored `artifacts/`. No candidate-promotion workflow, HTML reports, or new CI infrastructure is required.
