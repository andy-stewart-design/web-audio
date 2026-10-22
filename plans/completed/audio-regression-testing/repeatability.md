# Native mixing repeatability investigation

## Finding

Unchanged `techno-drum-loop` input does **not** render bit-identically on the pinned local Chromium 147.0.7727.15. The difference is native Float32 **addition order at the engine's master input**, not changed source, sample decoding, scheduling, WAV storage, or reference mutation. The original zero comparison gates correctly detected the numerical differences, but consequently rejected repeated unchanged renders of this case. Following explicit user review, the fixed default gates are now **maximum `1e-6` / RMS `1e-7`**; see the policy/validation section below.

The sketch commits 140 BPM, four bars plus 0.25 s tail, stereo 48 kHz and 345,943 frames. The initial isolation experiments below used the original full-length Float32 samples with **max/RMS gates 0/0**. No alignment, gain normalization, trimming, resampling, quantization, clipping, or tolerance relaxation was applied.

## Isolation measurements

| Unchanged input                                       | Comparisons against its baseline | Numerical mismatches |
| ----------------------------------------------------- | -------------------------------: | -------------------: |
| Full five-drum loop, isolated contexts in one browser |                               12 |                   12 |
| Each of five drums rendered alone                     |                  25 (5 per drum) |                    0 |
| First two drums together                              |                                8 |                    0 |
| First three drums together                            |                                8 |                    4 |
| Full loop, newly launched browser/server per render   |                                3 |                    3 |

Full-loop maximum error was **2.384185791015625e-7**; largest observed per-channel RMS was **1.2827216983311065e-8**. Every individual drum and the two-drum combination compared exactly. The user's stored reference also differs from the newly rendered diagnostic baseline at the same maximum scale. These are observed variations, **not newly accepted tolerances**, cross-platform guarantees, or listening approval.

## Exact explanation of the recorded audio

Individually rendered drum channels are stable. Adding these unmodified Float32 signals in different orders, with `Math.fround` at each addition to model native single-precision accumulation, reproduces the original mixed recordings **exactly across every frame in both channels**:

- Three-drum baseline matches drum order `[1, 2, 0]`; its differing repeat matches `[0, 2, 1]`.
- Five-drum baseline matches `[3, 4, 1, 0, 2]`; its differing repeat matches `[1, 2, 3, 0, 4]`.

Indices follow sketch instrument order: kick, closed hat, snare, clap, open hat. Swapping the first two operands gives the same respective result. This arithmetic experiment explains the raw differences; it is **not** a substitute renderer, a comparator transformation, or a promoted reference.

## Native-only reproduction and Chromium implementation

An `about:blank` browser page, with no Fluid, AudioEngine, sample fetch/decode, worklets, or WAV codec, repeatedly rendered three constant buffers with values `[16777216, -16777216, 1]` through unity gains into a native three-input sum:

- **60 identical wide-mixer renders:** 23 returned constant **0**, 37 returned constant **1**.
- **60 fixed binary-chain renders:** all returned constant **1**.

The deliberately extreme constants expose Float32 non-associativity clearly; these controls are not musical coverage or tolerance calibration. Each output was constant over all 512 frames. A fixed sequence of two-input native additions demonstrates a possible structural remedy, not an implemented engine change or a proof that every other DSP graph is repeatable.

The exact pinned Chromium source corroborates the mechanism:

- [`audio_summing_junction.h`](https://raw.githubusercontent.com/chromium/chromium/147.0.7727.15/third_party/blink/renderer/modules/webaudio/audio_summing_junction.h): connections are stored in `HashSet<AudioNodeOutput*> outputs_`, not an insertion-ordered sequence.
- [`audio_summing_junction.cc`](https://raw.githubusercontent.com/chromium/chromium/147.0.7727.15/third_party/blink/renderer/modules/webaudio/audio_summing_junction.cc): `UpdateRenderingState()` copies hash-set iteration order into the rendering vector.
- [`audio_node_input.cc`](https://raw.githubusercontent.com/chromium/chromium/147.0.7727.15/third_party/blink/renderer/modules/webaudio/audio_node_input.cc): `SumAllConnections()` zeros its bus and successively adds inputs in that vector's order.

Thus consistent JavaScript creation/connection order and a pinned browser do not guarantee a consistent Float32 accumulation order for a wide native mixer. Floating-point addition is not associative. The five instrument outputs converge directly at the master gain in the current engine, explaining this case's differences. This establishes the current drum-loop cause and a mechanism consistent with the earlier overlapping-three-voice finding; the deleted historical diagnostic inputs were not rerun, so the historical draft is not retrospectively certified.

## Preservation and next decision

SHA-256 snapshots before/after the experiments confirmed unchanged sketch, metadata, all five input WAVs, and **every existing reference file**, including the separate sine reference. No update command, production engine patch, dependency change, tolerance change, or listening approval occurred. No test suite was run; the experiments above were direct diagnostic renders.

Disposable reproduction scripts and reports live under ignored package `artifacts/`:

- `investigate-repeatability.mts`: full/solo/pair/triple isolated renders and protected-file fingerprints.
- `investigate-native-summing.mts`: native-only controls and exact whole-buffer addition-order matching.
- `investigate-fresh-renders.mts`: three fresh-browser/server loop renders and final protected-file checks.
- `repeatability-investigation/`: original diagnostic A/B pairs, `report.json`, `native-summing.json`, `fresh-renders.json`, and `protected-files.json`.

After dependency builds, scripts run with `pnpm --filter @web-audio/audio-regression exec tsx artifacts/<script>.mts` in the order above. They require this local case/reference; the first script creates only diagnostic recordings, never baselines. As with all artifacts, these files may be deleted; this tracked record retains the findings.

A rendering-only mixer replacement would stop protecting the actual production graph and is not recommended. Repeated reference updates cannot repair native nondeterminism. A fixed-order production mixing topology would be an alternative remedy, but was not implemented.

## User-reviewed fixed comparison policy (implemented)

After the investigation, the user explicitly approved **maximum error `1e-6` / RMS error `1e-7`**, rather than changing the production graph. `COMPARISON_TOLERANCE` remains frozen and shared by the comparator and verification. Both inclusive per-channel gates must pass; limits are absolute sample-amplitude differences, independent of the particular reference's loudness. No per-case knobs, adaptive limits, preprocessing or metadata tolerance fields were added.

The initial observations were max **2.384185791015625e-7** / RMS **1.2827216983311065e-8**, so the chosen limits initially left margins about **4.2× / 7.8×**. A subsequent actual command measured a larger maximum **3.5762786865234375e-7** at channel 0/frame 149,491, still below the same fixed maximum gate (about 2.8× margin). This additional observation is recorded, not hidden or used to automatically change limits. There is no claim of a universal browser/DSP error bound.

**Trade-off:** genuine audio changes below both limits are not detectable with this policy. Bit-exact equality is no longer the default guarantee. Explicit comparator callers can still supply zero thresholds. Unexpected silence, non-finite data, incompatible rates/channels/frames and resource/evaluation/worklet errors retain their existing strict checks; finite peaks above one remain legal. Raw error metrics and worst sample locations remain visible even on a passing comparison.

### Direct native validation

The ignored `artifacts/validate-tolerance.mts` uses the production verifier and real engine, plus temporary unapproved recordings for synthetic fixtures. It does not update the user's reference tree. Results:

- **15/15 unchanged drum-loop verifications passed** against the existing user reference: 12 isolated contexts plus 3 fresh browser/server launches. These still retain nonzero measured errors; no recording was altered to remove them.
- **6/6 numerical fixtures rejected** specifically as `Audio mismatch`, with both gates failing in both channels: pitch, timing, gain, second-bar filter, sample variation and reverse direction. Each original passed before/after its changed variant.
- **2/2 diagnostic fixtures rejected** for the intended evaluation/missing-sample errors, with no accepted current/difference audio; originals recovered.
- **4/4 actual drum-loop changes rejected**: kick gain +1%, altered kick hit mask, kick pitch +12 semitones and kick→snare selection. Every unchanged recovery passed against the existing user reference. Approximate max/RMS observations: gain `0.008745/0.002334`, timing `0.87452/0.16502`, pitch `1.42158/0.27811`, selection `1.04071/0.23372`.
- Actual `audio:verify --case techno-drum-loop` and `--case sine` both exited **0 / 1 of 1 passed**. Sine still measured exact 0/0; the drum command retained the larger maximum observation above. Neither command rewrote a reference.

All case sources/metadata/assets and the complete existing reference file set/bytes were SHA-256 checked before/after the direct experiments; temporary fixture recordings were removed. The full reference tree was checked again after the actual commands. Diagnostics/reports remain disposable under `artifacts/tolerance-validation/`. No approved-reference generation, engine/app modification, dependency/lockfile change or listening approval was performed.

At policy adoption, unit expectations were updated for the fixed pair, keeping explicit zero-threshold one-ULP rejection, sparse-roundoff acceptance and independent maximum/RMS rejection. **No test suite was run at that stage**; the measurements above are direct native workflow evidence, not automated-suite results.

## Later routine-test simplification

After the initial 11-case set received human listening approval, the user requested fewer brittle tests. Broad repeated rendering, musical analytical assertions and duplicate command/workflow drivers were removed from routine tooling tests. The fixed tolerance, raw measurements, diagnostics and approved recordings were not changed. Core numerical/storage/reference-safety units and one native failure/recovery workflow remain; root `pnpm test` freshly verifies every authored case once with caching disabled for the audio task. The simplified 166-test tooling suite passes. Repeat `audio:verify` explicitly for onboarding/dependency-change repeatability checks. Earlier ignored experiment scripts may depend on retired test helpers or may have been deleted; they are historical diagnostics, not maintained commands. See [plan.md](./plan.md) for current validation and retained historical evidence.
