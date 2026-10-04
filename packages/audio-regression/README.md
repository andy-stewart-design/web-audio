# @web-audio/audio-regression

Private local tooling for Fluid-sketch audio regression tests. **Phase 0 is complete on the user's Mac:** the package can launch Chromium and test browser cleanup, but it does not yet render or compare audio.

Phase 1 is in progress: Steps 1.1–1.3 added Fluid's public `evaluateSource(code)` helper (shared with the REPL worker), offline-compatible rendering-context types, and the engine's public structural `EngineClock` contract. The actual browser harness/rendering is next. The remaining implementation is real rendering, float-WAV comparison, then onboarding the user's sketches and connecting routine testing. See [`spec.md`](../../plans/audio-regression-testing/spec.md), [`plan.md`](../../plans/audio-regression-testing/plan.md), and [`feasibility.md`](../../plans/audio-regression-testing/feasibility.md).

## Setup and current commands

From the repository root:

```sh
pnpm install
pnpm --filter @web-audio/audio-regression browser:install
pnpm --filter @web-audio/audio-regression test
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression format:check
```

`test:smoke` selects the three real browser-launch tests. Install and launch sequentially. `browser:install` downloads only the Chromium headless shell associated with the exact Playwright dependency in `package.json`/the lockfile; no separate environment manifest or OS-version check is used.

Tests cover page creation, cleanup after success/failure, and recovery after a missing executable. They do **not** establish audio repeatability. Root `pnpm test` does not yet run this package; integration is planned once actual references exist.

## Local scope

- Use the Mac. Linux, Docker, a fixed image, architecture checks, and hosted CI are not prerequisites.
- No app `dev` process, database, login, or production environment variables are required.
- The forthcoming runner owns a loopback harness and uses the real AudioEngine, local samples, worklets, fixed settings/seeds, isolated renders, loading diagnostics, and timeouts.
- References will be standard 32-bit float WAVs with small settings/browser-version sidecars. Actual browser details are diagnostic; cross-platform reference compatibility is not promised.

## Planned commands — not implemented yet

```sh
pnpm --filter @web-audio/audio-regression audio:render --case <id>
pnpm --filter @web-audio/audio-regression audio:verify
pnpm --filter @web-audio/audio-regression audio:verify --case <id>
pnpm --filter @web-audio/audio-regression audio:update --case <id>
```

Verification will always render and remain read-only. Explicit updates will render/check the selected case before writing; listen and review the recording before committing. Failures will print numerical metrics and save reference/current/difference WAVs under gitignored `artifacts/`. No candidate-promotion workflow, HTML reports, or new CI infrastructure is required.
