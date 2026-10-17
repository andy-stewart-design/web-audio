# Pre-PR test simplification evidence

- Date: 2026-10-17
- Starting revision: `0aa8a160d0d96921cad3f6c1d12cf4b12f2a8fce`; worktree initially clean.
- Scope: Test simplification and plan/evidence updates only. Production code, authored audio cases, recordings/metadata, spec requirements, comparison tolerances, and unrelated tests are unchanged.
- Historical evidence in `0.1.md`, `1.1.md`, `1.2.md`, `2.1.md`, and `2.3.md` is preserved. Its earlier counts and broader dedicated-test descriptions describe the original execution, not the current test inventory.

## Current focused coverage

- Deleted `packages/audio-engine/src/__tests__/pre-envelope-effects.test.ts`, the additional engine composition test. Existing engine routing/send, Stop, graph replacement/retirement, ducking, and MIDI suites remain unchanged.
- Narrowed `packages/audio-engine/src/instruments/__tests__/pre-envelope-effects.test.ts` from 12 to 7 expanded tests: all six topology tests plus `cleans only the ended voice and preserves the surviving effected voice`, now under `pre-envelope voice lifecycle`.
- Removed the five redundant general-contract tests covering synth timing/envelope values, sampler offset/playback/timing/envelope values, mixed effect automation, natural sampler completion/future cancellation, and repeated destruction. Removed their LFO/MIDI fakes, schemas, worklet global stub/reset, unused imports/fake methods/options, and patterned gain helper support. No shared fake infrastructure was introduced.
- Retained `packages/audio-regression/src/__tests__/pre-envelope-effects.test.ts`: both source families still match independent native pre-envelope graphs and reject old post-envelope graphs at 44.1 kHz and 48 kHz. Default limits remain maximum error `1e-6`, RMS error `1e-7`, with the existing wrong-topology difference threshold unchanged.
- Increased only the synthetic native synth fixture's tail from 0.3 to 0.5 seconds: rendering now reaches 2.6 seconds, beyond release completion at 2.5 seconds. The suppression window (approximately 2.51–2.545 seconds for synths) must have a nonnegative start, a strictly later end, and fit every channel. It can no longer silently pass through an empty/truncated `subarray`. Both families still require exact zero peaks in this window before source cleanup.

## Existing retained-contract coverage

These are existing suites, not additional new effect-bearing composition assertions:

- `instruments/instrument.test.ts`: hit-addressed event parameters/envelope components, output balancing/mute/sends, shared voice completion/cancellation, LFO effective values/edge lifecycle, MIDI CC initialization/smoothing/binding cleanup, retirement, and destruction.
- `instruments/{synthesizer,sampler}.test.ts`: source scheduling/selection, sampler playback/region/loop behavior and skip identity, duck events, and synth MIDI note output.
- `instruments/value-pattern-resolver.test.ts` and `utils/compute-envelope.test.ts`: static/random bar/hit identity and envelope timing/amplitude, including nonzero floors.
- `engine.test.ts` and `buses/runtime-bus.test.ts`: routing/send topology, bus processing/automation, graph replacement/retirement, Stop, MIDI lifecycle, and duck timing/cleanup.

Together with focused relocated-path topology and independent cleanup assertions, these suites protect retained contracts without duplicating their full matrix in the new feature suite. The spec remains unchanged.

## Fresh verification

All commands ran from the repository root after the test edits:

| Command                                                  | Result                                                                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @web-audio/audio-engine test:ci`          | Passed: 24 files, 354 tests (six fewer: five domain tests and one composition test removed).                                                   |
| `pnpm --filter @web-audio/audio-regression test`         | Passed: 16 files, 159 tests, including the two native sample-rate tests exercising both source families. Dependency build: 6 successful tasks. |
| `pnpm --filter @web-audio/audio-regression audio:verify` | Passed: 13/13 authored recordings, Chromium `147.0.7727.15`, unchanged numerical limits. References were not updated.                          |
| `pnpm check`                                             | Passed: 14 successful workspace tasks, including fresh audio-engine/audio-regression typechecks.                                               |
| `pnpm lint`                                              | Passed: 14 successful workspace tasks.                                                                                                         |
| Targeted Prettier check                                  | Passed for the two edited test files, plan, and this evidence file.                                                                            |
| `git diff --check`                                       | Passed.                                                                                                                                        |

The engine suite emitted the existing Vite `configLoader: 'native'` / `__dirname` warning; no test failed. Authored audio remains within accepted tolerances, so no reference update or new listening approval was needed. Final diff scope is limited to the three requested test paths, the plan, and this evidence file.
