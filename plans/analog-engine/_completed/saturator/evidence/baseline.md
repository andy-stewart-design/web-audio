# Step 0.1 baseline evidence

## Result

Step 0.1 is **Verified**. The source-built baseline checks passed, no relevant
tracked source or reference changes were present, and no implementation or
listening work was started. Future offline native coverage is bounded to 44.1
and 48 kHz; this baseline's existing references render at 48 kHz.

## Environment and preservation

- Revision: `505fb83f17f578c06adf3c5e69573284fb5b8b8d`
- Branch: `analog/saturator`
- Dirty tree at start: clean (`git status --porcelain=v2 --branch` contained
  only branch headers). After the run, only this plan and this evidence note
  were changed; application/source/reference paths remained clean.
- macOS 26.6.2, Darwin 25.6.0, arm64
- Node `v22.22.2` (`.nvmrc` agrees); pnpm `10.33.2`
- Playwright Chromium headless shell was available and launched by the native
  verification: Chromium `147.0.7727.15`.
- The pre- and post-run working trees were clean on the relevant tracked source
  and reference paths. Their staged and unstaged diff checks were empty after
  the run. The post-run content snapshot for those paths was
  `4da16dae1660f0fec4a5d6527cd397eeaad3369bceea0b106ae37136e6296251`.
- No tracked saturator source was found. The forced build regenerated only
  ignored `dist` output. No dependencies, lockfiles, cases, or references were
  changed.

## Commands and results

1. `pnpm exec turbo run build --filter=@web-audio/audio-engine --filter=@web-audio/fluid --force`
   — **PASS**, 6/6 tasks, 0 cached.
2. `pnpm exec turbo run test:ci check lint --filter=@web-audio/worklets --filter=@web-audio/schema --filter=@web-audio/fluid --filter=@web-audio/audio-engine`
   — **PASS**, 22/22 tasks; the first run replayed 19 cached tasks. Per the
   baseline instruction, the same command was then rerun with `--force` and
   **PASS**ed 22/22 tasks with 0 cached. This is a cache-control deviation,
   not a product waiver.
3. `pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/worklets.test.ts src/__tests__/pre-envelope-effects.test.ts`
   — **PASS**, 2 files and 3 tests.
4. `pnpm --filter @web-audio/audio-regression audio:verify`
   — **PASS**, 15/15 existing references; Chromium native renders reported
   48 kHz stereo and references were not updated. Comparison thresholds passed.

Raw logs are retained at `/tmp/web-audio-saturator-baseline-505fb83/`.

## Limitations

This is a source-read-only offline/headless baseline. No microphone, audible
real-time run, interactive device sample-rate measurement, or user listening
was performed; those remain reserved for Step 2.2 and later acceptance gates.
The baseline therefore does not verify a saturator, which is not present in
tracked source.
