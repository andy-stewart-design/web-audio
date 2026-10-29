# Step 1.2 evidence

> **Superseded.** This historical record reflects the prior broad Step 1.2
> implementation and verification scope. It is retained for provenance only;
> the minimal-integration redo is recorded in
> [step-1.2-minimal.md](step-1.2-minimal.md).

## Result

Step 1.2 is **Verified**. Parent implementation review is complete, and the Phase 1 integration exit gate passed and was reviewed from the required source rebuild, focused suites, and fresh public-path native smoke. This verifies the scoped implementation and integration only: no manual user approval is claimed, and no supervised extension-state approval record is available. No Phase 2 listening, real-time characterization, case, or reference work was performed.

## Implementation and lifecycle

- Added the typed saturator schema, Fluid authoring/defaults, explicit runtime dispatch, voice LFO discovery, pre-envelope voice placement, named-bus placement, existing parameter scheduling, and main-effect rejection.
- Runtime bus construction and destruction isolate independent cleanup. Partial effects, worklet adapters, duck automation, and graph nodes are cleaned without masking the original setup error; repeated destruction remains idempotent. Synthesizer and Sampler constructor-local rollback releases partial LFO/output/send ownership.
- MIDI binding registration still rolls back on an initial binding error. `WritableSignal.subscribe` now removes only a newly added subscriber when its immediate notification throws, preserves a prior same-callback subscription, and rethrows the original error. Focused MIDI tests cover this behavior; the audio-engine test exercises an actual MIDI CC signal with an AudioParam assignment failure and verifies no later callback remains.
- Added focused typed authoring/schema, topology, control, lifecycle/failure, constructor rollback, MIDI rollback, engine pending-graph, and public-path native smoke tests. The smoke covers synth and named-bus paths, finite/repeatable output, and a dry comparison proving authored saturation changes the signal.

## Checks

- Forced source build before dependent engine tests: `pnpm exec turbo run build --filter=@web-audio/audio-engine --filter=@web-audio/fluid --force` — PASS, 6/6 tasks.
- MIDI focused/full unit and package checks: `pnpm --filter @web-audio/midi test:ci` — PASS, 4 files, 61 tests; `check` and `lint` — PASS.
- Relevant engine suites after the rebuild: `instrument.test.ts` and `pre-envelope-effects.test.ts` — PASS, 2 files, 57 tests; audio-engine `check` and `lint` — PASS.
- Core gate: `pnpm exec turbo run test:ci check lint --filter=@web-audio/worklets --filter=@web-audio/schema --filter=@web-audio/fluid --filter=@web-audio/audio-engine` — PASS, 22/22 tasks. Direct totals: worklets 58, schema 143, Fluid 1,351, audio-engine 482 tests passing.
- Final forced source rebuild followed immediately by Phase 1 native gate: `saturator.test.ts`, `worklets.test.ts`, and `pre-envelope-effects.test.ts` — PASS, 3 files, 5 tests. Audio-regression `check` and `lint` — PASS.
- Prettier checks on changed files and `git diff --check` — PASS.

## Limitations

This is focused integration and minimal native-smoke evidence, not the full Phase 2 native matrix, real-time capacity characterization, human listening approval, saved-reference approval, or final feature acceptance. Existing reference cases were not changed.
