# Step 1.1 evidence

## Result

The processor and narrow AudioWorklet adapter are implemented, the independent
reference assertion now uses strict six-decimal-digit matching, and parent review
is complete. Step 1.1 is **Verified**. Phase 1 exit status is assessed by the
minimal Step 1.2 evidence linked from the implementation plan.

## DSP and lifecycle proof

- `saturator-processor` uses first-order ADAA tanh per channel, stable
  `logcosh`, a relative near-equality switch of `1e-5`, zero initial history,
  and history that persists across blocks without silence/mute reset. The
  previous driven input and its antiderivative are cached per channel, so each
  driven sample evaluates the antiderivative once.
- `drive` and `postgain` remain independent a-rate parameters with default `1`;
  scalar/sample arrays, signed values, zero-drive transitions, and postgain
  mute/history behavior are covered. `{ type: "dispose" }` is terminal and the
  next `process()` returns `false` rather than treating silence as disposal.
- `Saturator` owns one node, validates both parameters, and on partial setup
  failure posts terminal disposal before cleanup while preserving the original
  setup error, even when posting disposal throws. Normal processor/error
  notifications are reported once; cleanup is idempotent and removes listeners,
  disconnects, and closes the port without fallback/retry.
- The numerical fixture uses independently integrated `tanh` intervals rather
  than the production antiderivative/threshold, with the first reference
  assertion strictly matching six decimal digits per sample. It checks distinct
  representable Float32 samples on either side of the near-equality threshold,
  useful high drive, and a genuinely large finite driven input. Readiness captures
  Blob payloads and verifies four distinct registered modules with exactly one
  saturator registration.

## Checks

- `pnpm exec turbo run build --filter=@web-audio/worklets --filter=@web-audio/audio-engine --force` — PASS, 4/4 build tasks, 0 cached.
- `pnpm --filter @web-audio/worklets exec vitest run src/processors/__tests__/saturator-processor.test.ts` — PASS, 1 file, 8 tests, with strict six-decimal-digit independent reference assertions.
- `pnpm --filter @web-audio/worklets exec vitest run` — PASS, 6 files, 58 tests.
- `pnpm --filter @web-audio/audio-engine exec vitest run src/effects/__tests__/saturator.test.ts src/__tests__/engine.test.ts` — PASS, 2 files, 70 tests.
- `pnpm exec turbo run check lint --filter=@web-audio/worklets --filter=@web-audio/audio-engine` — PASS, 10/10 tasks (6 cached dependency tasks).
- Prettier `--check` on changed test/evidence/plan files — PASS; `git diff --check` — PASS.

## Limitations and skipped scope

Adapter ordering and processor terminal behavior are unit protocol proofs: the
adapter fake records post-before-disconnect/close and the processor test invokes
its registered processor message handler directly. They are not native
AudioWorklet delivery/channel or sound proofs. No schema, Fluid factory,
voice/bus consumer, generic host, native saturation acceptance, real-time
characterization, listening approval, reference update, or Step 1.2 work was
performed. Generated `dist` output is build output only and is not source
evidence.
