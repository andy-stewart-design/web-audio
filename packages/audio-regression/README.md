# @web-audio/audio-regression

Private local tooling that renders Fluid sketches through the real AudioEngine and Chromium `OfflineAudioContext`, then compares raw audio with listening-approved recordings. The initial set has **11 cases with reviewed references**. It is a local Mac regression suite, not cross-platform or musical-quality certification.

## Setup and commands

From the repository root:

```sh
pnpm install
pnpm --filter @web-audio/audio-regression browser:install
pnpm test
```

Root `pnpm test` discovers this package through Turbo `test:ci`: build dependencies, run tooling tests, then freshly render and verify every registered case. **Caching is disabled for this package's `test:ci` task**; other packages and dependency builds retain their existing caching. Any tooling or verification failure makes the root command fail. No test command updates the approved reference tree.

For focused work:

```sh
# All approved cases, or one selected case; read-only:
pnpm --filter @web-audio/audio-regression audio:verify
pnpm --filter @web-audio/audio-regression audio:verify --case sine

# Diagnostic output, without reference comparison:
pnpm --filter @web-audio/audio-regression audio:render --case sine

# Tooling tests only, using temporary unapproved fixtures:
pnpm --filter @web-audio/audio-regression test
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression format:check
```

Rendering/testing commands build Fluid, audio-engine and their workspace dependencies first. For first-time type checking alone, run `build:deps` first. Browser installation uses the headless shell bundled with the exact Playwright dependency; install and launch sequentially. The harness owns its loopback server, ephemeral port and browser; no app `dev` process, database, Docker or hosted CI is needed.

## Authoring cases

```text
cases/<id>/                 references/<id>/
  metadata.json               metadata.json
  sketch.js                   render.wav
  samples/       # optional
```

Cases are discovered automatically in sorted folder-ID order. IDs use lowercase letters/digits/underscore/hyphen, starting with a letter or digit. Root files and hidden folders are ignored. Each case needs both files; malformed metadata, missing files and empty coverage fail rather than silently skipping cases.

`metadata.json`:

```json
{
  "description": "What this sketch protects",
  "bars": 4,
  "tailSeconds": 0.25
}
```

Required fields: nonempty `description`, positive integer `bars`, nonnegative `tailSeconds`. Optional fields: `expectSilence`, partial `settings` (`sampleRate`, `channels`, `beatsPerBar`, `startOffsetFrames`) and exact `resources` overrides. Unknown fields reject typos. IDs come from folders; source and comparison tolerances do not belong in metadata.

`sketch.js` is ordinary trusted, synchronous REPL JavaScript. Variables, functions, loops and both `d`/`drome` aliases work. Source is read as text, not imported in Node. No module imports/exports, top-level await, async manifest waiting or authored MIDI output is supported.

```js
d.loadSamples({
  bank: "local",
  samples: { hit: ["/samples/hit.mp3"] },
});
d.sample("hit").bank("local").push();
```

Files under this case's `samples/` map automatically to `/samples/<path>`, including nested directories. **Inputs need not be WAV:** they use Chromium's real audio decoder. Original bytes are served unchanged; discovery does not inspect their encoding. Keep asset origin/permission notes with the case.

Use `resources` only for exceptions, such as a shared file or a built-in URL mapped to a local copy. Values resolve relative to the case folder (absolute paths also work locally). Explicit mappings override automatic ones, with no fallback if missing. Only matching sample-entry URLs change; bank/name/variation/sprite identity remains intact. Unmapped external requests are blocked, including worker requests. Arbitrary asynchronous `fetch()` calls are not remapped or awaited.

Defaults are stereo 48 kHz, four beats/bar and a 4,800-frame start offset. Duration uses the committed sketch BPM (default 120), configured bars and explicit tail. Use sufficient bars/tail for the behavior protected, fixed assets and explicit random seeds; avoid wall-clock input and `Math.random`. See [case input provenance](./cases/README.md) for the original procedural sample assets and their separate, explicit generator.

## Comparison and failures

Each case gets fresh evaluation, page/browser context, offline context, clock and engine. The runner awaits preparation, commits/schedules through the real engine and renders before destruction. Source/resource/decode/worklet errors reject output even if sibling voices sound. A Node-side deadline handles synchronous hangs; browser/server/context cleanup runs on success and failure.

Verification checks rate/channel/frame agreement, finite audio and expected audibility. Intentional silence requires `expectSilence: true` and exact zeros; finite peaks above one are legal. Both per-channel inclusive gates must pass:

- Maximum absolute error **<= `1e-6`**.
- RMS error **<= `1e-7`**.

These user-reviewed fixed limits accommodate measured native Float32 mixing-order roundoff. They never adapt to failures. Genuine differences below both limits cannot be detected. No normalization, alignment, trimming, resampling, clipping or quantization is used. Browser-version changes warn, not skip or automatically fail. Investigate unexpected differences rather than widening limits; see [repeatability evidence](../../plans/audio-regression-testing/repeatability.md).

References and diagnostics use exact **32-bit IEEE-float WAV** storage plus small JSON sidecars. This output format is separate from input sample decoding. Stored channels retain original Float32 values, including signed zero and above-one peaks. Missing/invalid references fail, even when fresh rendering succeeds.

Numerical failures save ignored files under `artifacts/verify/<id>/`:

```text
reference.wav + reference.json
current.wav + current.json
difference.wav + difference.json
```

Difference is signed **current - reference**, without playback amplification. Shape mismatches or unrepresentable differences save available A/B but do not fabricate aligned/clipped audio. Missing references provide current-only recordings; render failures never invent current/partial audio. Selected stale artifacts are cleared on the next verification. Reference/artifact roots are checked for overlap after resolving symlinks, including existing ancestors of uncreated directories; overlapping aliases are rejected before browser startup or cleanup. All `artifacts/` are disposable.

```sh
afplay packages/audio-regression/artifacts/verify/<id>/reference.wav
afplay packages/audio-regression/artifacts/verify/<id>/current.wav
afplay packages/audio-regression/artifacts/verify/<id>/difference.wav
```

Diagnostic rendering saves `artifacts/render/<id>.wav` plus same-stem JSON, without comparison or approval.

## Explicit reference updates

```sh
pnpm --filter @web-audio/audio-regression audio:update --case <id>
afplay packages/audio-regression/references/<id>/render.wav
pnpm --filter @web-audio/audio-regression audio:verify --case <id>
```

Update requires exactly one named case; there is no all/default update or update flag on verification. It freshly renders and validates before replacing only that case's `render.wav`/`metadata.json`. Evaluation/loading/render/health/validation failures preserve existing references. Later disk failures may leave a partial pair: ordinary writes are not an atomic transaction.

For new cases, check repeated fresh output, listen and review settings. For intended changes, inspect failure recordings before choosing to update. Commit both files only after human review. Never update automatically just to obtain a pass. Generation, numerical verification and playback-command success are **not** listening approval.

## Keeping tests practical

Tooling tests use self-contained synthetic sketches and temporary files, not the authored case registry. They cover numerical/storage contracts, discovery/mapping, reference safety, native diagnostics and cleanup, with one end-to-end update/verify/failure/recovery workflow. They do not assert authored case IDs, input headers, exact musical peaks/frequencies, browser-version formatting or complete report prose.

Musical regression coverage lives in the reviewed recordings. Root testing verifies every authored case once, rather than repeatedly generating temporary baselines for the full collection. For onboarding or dependency changes, repeat `audio:verify` explicitly; repeated fresh processes also exercise new browser launches. Historical characterization experiments remain in the [plan](../../plans/audio-regression-testing/plan.md) and [feasibility record](../../plans/audio-regression-testing/feasibility.md), not as duplicated routine tests.
