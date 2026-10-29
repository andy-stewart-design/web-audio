# Step 1.2 minimal evidence

## Status

**Verified** — minimal integration redo; parent review is complete. The prior
broad failure-hardening record is superseded by the user's latest
minimal-integration direction. Phase 1 implementation exit is verified from
this scoped evidence.

## Result

The source-built minimal integration and required focused/native gates passed;
parent source inspection and read-only review of the scoped change are complete
and approved. No concrete supported-product-path blocker was identified. This evidence does
not claim user manual listening or approval, Phase 2 completion, saved-reference
approval, or final feature acceptance.

## Scope retained

- Saturator schema, authoring defaults/setters, validation, public unions, and
  existing worklet registration remain.
- Voice integration uses the existing completion cleanup list and parameter
  helpers; both saturator controls participate in explicit LFO discovery.
- Bus integration uses explicit effect dispatch and an optional dispose hook only
  for saturators. Newly created saturators are disposed when later bus effect
  construction or initial scheduling fails.
- Generic MIDI rollback, constructor-local LFO rollback, RuntimeBus definite
  assignment assertions, broad cleanup helpers, and speculative failure tests
  were removed.

## Verification

- `pnpm exec turbo run build --filter=@web-audio/audio-engine --filter=@web-audio/fluid --force` — PASS, 6/6 tasks.
- `pnpm exec turbo run test:ci check lint --filter=@web-audio/worklets --filter=@web-audio/schema --filter=@web-audio/fluid --filter=@web-audio/audio-engine` — PASS, 22/22 tasks; worklets 58, schema 143, Fluid 1,351, audio-engine 476 tests.
- Focused audio-engine runtime-bus/pre-envelope/instrument suites — PASS, 81 tests; focused Fluid saturator suite — PASS, 6 tests; schema validation suite — PASS, 143 tests.
- `pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/saturator.test.ts src/__tests__/worklets.test.ts src/__tests__/pre-envelope-effects.test.ts` — PASS, 3 files/5 tests.
- Audio-regression `check`, `lint`, formatting, and `git diff --check` — PASS.

These are source-build and focused integration results only. No Phase 2 work,
reference update, listening approval, or final feature verification is claimed.
Parent review is complete; the remaining limits are unchanged.
