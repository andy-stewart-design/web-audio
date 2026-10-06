# @web-audio/audio-regression

Private local tooling for Fluid-sketch audio regression tests. **Phase 1 is complete on the user's Mac:** the package renders real synth, local sampler, and LFO audio through Fluid, AudioEngine, and Chromium's `OfflineAudioContext`, with seeded multi-bar and isolation/repeatability checks. **Phase 2 implementation is also complete:** exact float-WAV/JSON storage, numerical comparison, read-only verification/failure recordings and explicit reference updates, with focused real-render regression checks. User sketches, listening-approved references and root verification integration remain Phase 3.

See [`spec.md`](../../plans/audio-regression-testing/spec.md), [`plan.md`](../../plans/audio-regression-testing/plan.md), and [`feasibility.md`](../../plans/audio-regression-testing/feasibility.md).

## Setup and current commands

From the repository root:

```sh
pnpm install
pnpm --filter @web-audio/audio-regression browser:install
pnpm --filter @web-audio/audio-regression audio:render --case sine
pnpm --filter @web-audio/audio-regression audio:render --case sample-tone
pnpm --filter @web-audio/audio-regression audio:render --case sample-reverse
pnpm --filter @web-audio/audio-regression audio:render --case lfo-filter
pnpm --filter @web-audio/audio-regression audio:render --case seeded-multibar
pnpm --filter @web-audio/audio-regression audio:render --case sample-alternate
pnpm --filter @web-audio/audio-regression audio:verify
pnpm --filter @web-audio/audio-regression audio:verify --case sine
# Explicitly writes a reference; listen/review before committing:
pnpm --filter @web-audio/audio-regression audio:update --case sine
pnpm --filter @web-audio/audio-regression test
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression format:check
```

`audio:render`, `audio:verify`, `audio:update` and `test` first run `build:deps`, using the existing Turbo workspace builds/cache for Fluid, audio-engine, and their dependencies. Changed production code is rebuilt before browser imports; no app/database build is involved. For first-time type checking without tests/rendering, run `build:deps` first.

`audio:render --case sine` prints browser version, sample rate, channels, frame count, BPM, and per-channel peak/RMS. It writes the successful selected render to **`artifacts/render/sine.wav` plus `sine.json`** (or the selected case ID), prints the paths, and performs **no reference comparison**. These ignored diagnostic files are replaced by subsequent successful renders, never promoted to approved references. Failed rendering never reaches storage; an older diagnostic may remain. Unknown selectors or invalid arguments exit nonzero. Register trusted sketches in `src/cases.ts`; sample cases use the local resource mapping below.

`test` runs the unit/CLI tests, browser launch checks, and actual synth/sampler/LFO render, lifecycle, and repeatability tests. `test:smoke` selects only the original three launch checks. Root `pnpm test` does not yet run this package; root verification integration is planned once actual references exist.

Install and launch sequentially. `browser:install` downloads only the Chromium headless shell associated with the exact Playwright dependency in package/lockfile; no separate environment manifest or OS-version check is used.

## Rendering behavior

- The runner owns an ephemeral-port, loopback-only Vite harness and browser. No app `dev` process, database, login, production environment variables, Docker, or hosted CI is needed.
- Source evaluation uses Fluid's public synchronous `evaluateSource(code)`, with fresh Drome instances and `drome`/`d` aliases. Trusted source is arbitrary JavaScript, not sandboxed; source promises are not awaited.
- Each case gets a fresh page/browser context, offline audio context, engine, and explicit clock driver. Cases run sequentially initially.
- Defaults: 48,000 Hz, stereo, four beats per bar, 4,800-frame start offset. Schema BPM or engine default 120 BPM determines duration; bars and tail are explicit, with frame length rounded up.
- The real engine awaits worklet registration/preparation, commits on `prebar`, and schedules requested `bar` events. Rendering finishes before engine destruction. No speaker capture, musical sleeps, or real-time clock start is used.
- Original Float32 samples return to Node without normalization, clipping, quantization, alignment, or resampling. Finite peaks above one are legal. Expected audibility uses an initial RMS health floor of `1e-8`; intentional silence requires exact zero. This is not a comparison tolerance or quality certification.
- External requests are blocked. Page errors, warnings/errors, failed requests, HTTP errors, and native worklet processor failures fail rendering. The harness temporarily subclasses the native worklet node only to observe error events, retaining the native DSP, options, parameters, and connections; the constructor is restored on cleanup. Already-started requests drain under the same deadline; missing files do not fall back to HTML.
- A Node-side 10-second execution deadline covers navigation/readiness, source execution, rendering, and request draining, including synchronous source hangs. Pages/contexts, browser, and server close on success/failure. Initial fixtures must not author MIDI output.

The current tests verify real synth/sample pitch/output, reversal, forward/reversed regions, sprites, selected variations, explicit built-in mappings, default/schema tempo, multi-bar timing, start silence, release tail, alternate rate/mono output, explicit silence, invalid sources/settings/selectors, diagnostics, a synchronous hang, and startup/failure cleanup. Loading failures alongside healthy voices are rejected; external fetches from an authored worker are also blocked. Real LFO filter modulation, exact bar-level endpoint changes, and origin/phase at non-quantum-aligned starts in 48/44.1 kHz renders are now tested. Native registration/constructor/process errors, including the final render quantum, reject partial healthy audio and recover. Seeded pitch/chance behavior and odd-hit cross-bar alternate sample direction are exercised. No listening-approved references exist yet.

## Measured repeatability

The six registered cases are each rendered four times: baseline, same-order repeat, reversed order after an odd alternate render/different bytes under the same logical sample URL/explicit silence, and reversed order in a fresh browser/server launch. All full-length Float32 channels measured maximum/RMS error **0/0** on the Mac with Chromium 147.0.7727.15. Separate fresh-process runs also passed.

The initial suite-wide pair is therefore **`maxError: 0`, `rmsError: 0`**, exported as immutable `COMPARISON_TOLERANCE` from `src/runner/audio.ts`. Repeatability tests, the production comparator and reference verification use it. No gain/time normalization, trimming, alignment, resampling, or tolerance widening is used. The analytical phase proof's `1e-6` bound is for an ideal mathematical gain versus native floating-point DSP, **not** a recording-comparison tolerance.

This is local repeatability evidence for these inputs, not cross-platform/browser certification or musical quality approval. Recheck new sketches and browser/rendering dependency changes; investigate differences rather than automatically loosening the pair. Detailed observations are in `feasibility.md`.

To rerun only these checks after building dependencies:

```sh
pnpm --filter @web-audio/audio-regression build:deps
pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/worklets.test.ts src/__tests__/repeatability.test.ts
```

## Demonstrated regression detection

`src/__tests__/regressions.test.ts` runs eight focused real-engine cases using test-only `support/regressions.ts` fixtures. Six healthy, same-shape authored changes fail specifically on maximum/RMS error at unchanged **0/0** defaults:

| Change           | Actual protected difference                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| Pitch            | MIDI 69 → 81, native carrier 440 → 880 Hz                                    |
| Timing           | Sequence hits `[0, 2]` → `[1, 3]`, shifting onsets by 0.5 s                  |
| Gain             | 0.5 → 0.55, 10% larger native amplitude                                      |
| Filter           | Bar-two LFO cutoff endpoint 900 → 1800; all bar-one samples stay exact       |
| Sample selection | Variation 0 (tone) → 1 (asymmetric file), with both local files healthy      |
| Direction        | Reverse → forward asymmetric sample, swapping loud/quiet and 440/880 Hz ends |

A removed notes method and a missing local sample mapping also fail with evaluation/resource diagnostics, without accepting partial healthy output. Originals pass, every changed variant fails for its intended reason, and originals pass again afterward. Tests check reference filenames/bytes remain unchanged and every stored difference sample equals Float32 **current - reference**. Reference fixtures are temporary/unapproved and cleaned up; variants are not registered production cases. This is a focused proof, not exhaustive mutation testing or musical-quality certification.

After dependency builds, rerun just these checks:

```sh
pnpm --filter @web-audio/audio-regression build:deps
pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/regressions.test.ts
```

Manual unapproved failure sets persist under **`artifacts/regressions-demo/<change>/`** (the six change IDs in the table, with `pitch`, `timing`, `gain`, `filter`, `sample-selection`, `reverse`). Each numerical directory has `reference`, `current` and `difference` WAV/JSON pairs. `evaluation` and `resource` have reference-only recordings because no current buffer was accepted. Native Mac playback completed for the pitch and reverse A/B/difference sets; this does **not** grant listening approval. For example:

```sh
afplay packages/audio-regression/artifacts/regressions-demo/pitch/reference.wav
afplay packages/audio-regression/artifacts/regressions-demo/pitch/current.wav
afplay packages/audio-regression/artifacts/regressions-demo/reverse/reference.wav
afplay packages/audio-regression/artifacts/regressions-demo/reverse/current.wav
```

These ignored files are diagnostics, not approved baselines. No production references were created or promoted.

## Local samples

Use synchronous inline manifests and map their exact normalized source URLs to local files:

```ts
{
  id: "sample-tone",
  description: "Local sample playback",
  code: "d.loadSamples({bank: 'local', samples: {tone: ['/samples/tone.wav']}}); d.sample('tone').bank('local').push();",
  resources: { "/samples/tone.wav": "resources/tone.wav" },
  bars: 1,
  tailSeconds: 0.1,
}
```

File paths are relative to this package, or absolute for local experimentation. Committed cases should use repository assets with origin/permission notes. Each render mounts files at unique loopback HTTP URLs and replaces only matching sample-entry `src` values after evaluation. Bank names, sample names, source keys, variation order, and sprite bounds remain unchanged. Built-in source URLs can be mapped the same way; unmapped external requests are blocked, never downloaded as fallback. Arbitrary source `fetch()` calls/async manifest loading are not rewritten or awaited.

Files are served as original bytes with caching disabled; missing/unreadable files report HTTP errors plus local paths, while real decoder/resource warnings fail even if other voices sound. Mounts are removed after rendering/failure. This is trusted local tooling, not a filesystem or JavaScript sandbox.

See [`resources/README.md`](./resources/README.md) for the two synthetic PCM16 **input fixtures** and their explicit generator command. Tests/rendering never regenerate them. These input WAVs are not approved references and do not change the planned float-WAV output format.

## Float-WAV recordings

From the repository root, render and listen locally:

```sh
pnpm --filter @web-audio/audio-regression audio:render --case sine
afplay packages/audio-regression/artifacts/render/sine.wav
```

`src/runner/wav.ts` reads/writes little-endian **32-bit IEEE-float WAV** in Node: tag 3, an 18-byte `fmt` chunk with `cbSize=0`, a per-channel `fact` frame count, and interleaved data. Channel order, full frame count/rate, negative zero, subnormals and finite amplitudes above one are retained. There is no PCM16 conversion, clipping, normalization, trimming or browser decode/resample step. Playback hardware may limit above-one peaks; measurement data is not changed for listening.

The reader is deliberately narrow, not a general sample decoder. It rejects PCM, float64, extensible/RF64/big-endian, incomplete/nonconforming headers, inconsistent lengths/format/fact counts, duplicate required chunks and non-finite samples. Unknown chunks with valid lengths/padding are skipped. The existing PCM16 sample **inputs** still use real browser decoding, independently of this output/reference codec.

`src/runner/recording.ts` writes/reads `.wav` plus same-stem `.json`. Sidecars contain only case ID, settings (rate/channels/beats/start offset), bars/tail, BPM/frame count and actual browser version. Metadata and WAV shape are validated, but provenance changes do not create an environment gate. Encoding/validation completes before writing; these are ordinary diagnostic file writes, not a multi-file reference update transaction. File errors propagate nonzero. `artifacts/` is ignored by git and formatting.

macOS `afinfo` recognized the generated sine file as stereo 48 kHz Float32, and `afplay` completed successfully. This confirms player acceptance, **not** listening approval of a regression reference. No approved references exist yet.

## Raw-audio comparator

`src/runner/compare.ts` provides `compareAudio(reference, current, options)` and `formatComparison(result)`. Inputs have `{ sampleRate, channels }`, using original Float32 channels (including directly decoded WAVs). It checks matching rates/channel/frame counts, finite rectangular data and signal health on **both** sides. Audible cases require at least one channel above the existing RMS floor; `expectSilence: true` requires exact zeros, independently of numerical thresholds. Finite peaks above one remain legal.

Each channel reports maximum absolute sample error and RMS sample error (`sqrt(sum((current-reference)^2)/frames)`) with independent inclusive gates. The report includes the fixed thresholds and worst channel/frame/time/reference/current values. Frame/time are zero-based relative to the entire untrimmed recording, including start silence; ties use the first channel/frame, and identity has no worst-error location. Default thresholds remain measured **0/0**, not automatically widened.

Invalid inputs throw labelled diagnostics. Valid but changed audio returns `passed: false` and error metrics, rather than throwing away information needed for later failure recordings. The helper never writes files or aligns, trims, normalizes, resamples or clips audio. Tests cover real stored-WAV versus fresh native synthesis and reject an actual gain change; the six-case repeated native suite also uses this comparator now.

`audio:render` still only saves diagnostic output. Use the separate verification command below for comparison.

## Read-only verification

```sh
pnpm --filter @web-audio/audio-regression audio:verify
pnpm --filter @web-audio/audio-regression audio:verify --case <id>
```

Without a selector, verification runs **all registered cases**, sequentially; `--case` selects exactly one. References are intended to be committed as **`references/<id>.wav` plus `<id>.json`** inside this package after listening review. **No approved reference files exist yet**, so normal verification currently fails for missing coverage while still rendering/saving current audio. Tests use temporary, explicitly unapproved fixtures and never populate this reference directory.

Verification always renders through the owned harness, even if a reference is missing or invalid. It never creates, updates or promotes references, and does not skip based on source/assets/version. Browser-version changes produce a warning, not an environment gate. Output identifies cases, browser/rate/channels/frames/BPM, per-channel max/RMS values and fixed **0/0** thresholds, failed gates and worst-error channel/frame/time/sample values where comparison is possible. It continues later cases after individual failures and exits **1** if any case fails. Empty/duplicate registries, unknown selectors and invalid arguments also fail rather than appearing green.

### Failure recordings

For a numerical mismatch, the selected case gets:

```text
artifacts/verify/<id>/reference.wav + reference.json
artifacts/verify/<id>/current.wav   + current.json
artifacts/verify/<id>/difference.wav + difference.json
```

A/B retain original Float32 samples, rate, channel order and full length. The signed difference is **`current - reference`**, stored as Float32 with current settings; it receives **no playback amplification**, normalization, clipping or alignment. It may be quiet. A rate/channel/frame mismatch saves A/B but reports that difference audio is unavailable instead of resampling, trimming or remapping channels. Unrepresentable Float32 differences are likewise reported, never clipped.

Missing/invalid references yield current-only audio when rendering succeeds. Evaluation/loading/render failures return no accepted current buffer: diagnostics are printed, and only a valid reference copy is saved if available. Partial healthy output from a failed sampler/worklet is not accepted. Filesystem failures are reported and cannot turn a failed case green.

Before each selected case runs, its previous failure directory is removed so a passing rerun or failed render cannot leave misleading stale current/difference files. Unselected case artifacts are left alone. Startup/cleanup errors fail explicitly; older files should not be taken as evidence of a new render. Artifacts are ignored and persist after exit until replaced/cleared by another invocation. Writes are ordinary diagnostic I/O, not a multi-file transaction.

For a mismatch, listen from the repository root:

```sh
afplay packages/audio-regression/artifacts/verify/<id>/reference.wav
afplay packages/audio-regression/artifacts/verify/<id>/current.wav
afplay packages/audio-regression/artifacts/verify/<id>/difference.wav
```

The Step 2.3 unapproved gain-change demonstration also remains under **`artifacts/verify-demo/sine/`** with the same three filenames. macOS recognized its difference file as stereo 48 kHz Float32; all three playback commands completed. This is player acceptance, **not** human listening approval. Human A/B review and approved reference creation remain separate.

## Explicit reference updates

```sh
pnpm --filter @web-audio/audio-regression audio:update --case <id>
```

This is the **only command that writes reference recordings**. It requires exactly one explicit case ID: no default full-suite update, `--all`, multiple selectors, or update flag on verification. Unknown/invalid selection fails before browser startup. The selected case always gets a fresh real render; unchanged source is not a skip. Healthy output creates/replaces **only `references/<id>.wav` and `<id>.json`**, reporting the paths, browser/settings and per-channel peak/RMS. It does not copy an old diagnostic file, change tolerances, or update any other case.

Source, sample-loading, worklet, timeout, and signal-health failures occur before reference I/O and leave old recordings untouched; an invalid first render creates no reference directory. Metadata/shape/finiteness validation and encoding also finish before writes. Finite peaks above one remain legal; silence requires explicit case opt-in. The WAV/JSON pair uses ordinary writes, **not an atomic transaction**: a later disk-write error can leave partial output, exits nonzero, and requires inspecting/restoring the pair rather than assuming rollback.

### Listen → review → verify → commit

For a new case, first check repeated output in fresh renders (the six initial fixtures have already measured 0/0). For an intended change, inspect the existing verification failure/A/B recordings before choosing to update. Never run update automatically just to make a failing test green.

```sh
# Explicitly generate/replace this one reference:
pnpm --filter @web-audio/audio-regression audio:update --case sine
# Listen and inspect the settings and intended change:
afplay packages/audio-regression/references/sine.wav
git status --short -- packages/audio-regression/references/
git diff -- packages/audio-regression/references/sine.json
# Fresh comparison; this never writes references:
pnpm --filter @web-audio/audio-regression audio:verify --case sine
# Only after human listening/review, stage both files and commit the intended change:
git add packages/audio-regression/references/sine.wav packages/audio-regression/references/sine.json
git diff --cached --stat
git diff --cached -- packages/audio-regression/references/sine.json
git commit -m "audio: review sine reference"
```

New untracked sidecars appear in `git status`, not ordinary `git diff`; staged diff above shows them. If output is wrong, fix the sketch/engine and discard or restore the unapproved pair—do not commit it as a reference. Verification can numerically pass an unreviewed generated recording; **generation, comparison and playback-command success are not listening approval**. Git review/commit records suffice; there is no candidate/promotion or approval-reason framework.

The manual Step 2.4 CLI check generated sine, verified it at 0/0 without changing bytes, completed macOS playback, reviewed its sidecar/status and repeated a byte-identical update. The temporary reference was then removed without approval or commit. An ignored copy remains at **`artifacts/update-demo/sine.wav` plus `.json`** for listening; there are still no approved references in this package. Human listening approval and initial committed coverage remain Phase 3.
