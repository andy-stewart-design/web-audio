# Step 4.2 — Native patterned-envelope and final regression proof

## Result and remaining completion boundary

**Native and required workspace gates passed.** AC11–AC13 now have real Chromium audio confirmation in addition to the deterministic AG1 tests. All 14 approved cases passed fresh read-only comparison, with references and thresholds unchanged.

The full Step 4.2/Phase 4 completion gate remains pending solely because its earlier [Step 4.1 user-owned documentation gate](step-4.1.md#user-owned-documentation-handoff) is still open. The user explicitly authorized native Step 4.2 work; this did not waive or verify documentation. There is no remaining technical/native failure from this step.

Starting revision: `82120884ebd9a8662f75484af18fe3698544498d`; initial worktree was clean. Verification applies to the new test/support files and plan/evidence changes relative to that revision. No production API or implementation changed.

## Prerequisites and execution

- Playwright's Chromium headless shell revision `1217` was already executable, with installation/dependency markers present. No installation command ran.
- Actual native verification reported **Chromium 147.0.7727.15**.
- Existing committed cases, local assets, and 14 reference pairs were available; the fresh verifier successfully loaded and compared every case.
- Existing `withRenderer()` owns the ephemeral loopback server, browser, fresh contexts, AudioEngine, native OfflineAudioContext, resource blocking, and cleanup. No app `dev` command, parallel harness, mocked renderer, external asset fetch, or separate Web Audio reference implementation was added.

## New native coverage

Files:

- `packages/audio-regression/src/__tests__/patterned-envelope.test.ts`
- `packages/audio-regression/src/__tests__/support/patterned-envelope.ts`

Three tests perform **10 sequential temporary renders**. Each uses a built-in sine synth, 120 BPM, two bars, two events per bar, stereo 48 kHz, a 4,800-frame start offset, and a 0.5-second tail. ADSR is `(0.1, 0.2, 0.5, 0.2)` in bounded mode. These are unapproved diagnostic sketches, not new registered cases or reference recordings.

### Independent minimum/maximum and event-specific release

Gain bounds:

```js
// Equivalent shorthand and static structured values:
const minimum = "<[0 0.15] [0.3 0.45]>";
const maximum = "<[0.9 0.7] [0.8 0.6]>";
// d.str([0, 0.15], [0.3, 0.45])
// d.str([0.9, 0.7], [0.8, 0.6])
```

The first test renders shorthand, builder, constant-zero-minimum control, constant-first-maximum control, and an independent scalar oracle.

- Shorthand/builder full-channel comparison passes the existing fixed limits: maximum error `<= 1e-6`, RMS `<= 1e-7`.
- Every frame is finite; every event has audible output in its inspected window.
- The first event intentionally shares minimum `0` and maximum `0.9` with both controls; its comparison window matches.
- Each of the three later events must differ from **each** control by more than `1e-5` in its middle-event window. This distinguishes minimum sensitivity from maximum motion and catches always-first-value/bar/hit mistakes.
- Windows cover 50–80% of each one-second event, away from the preceding event's release; window comparisons supplement rather than replace full-channel parity.

Final review identified a genuine proof gap in the initial green diagnostic: sustain-window sensitivity plus shorthand/builder parity could both pass with a wrong release floor. Before acceptance, a scalar oracle was added: four separate synth instruments, each using one constant numeric minimum/maximum pair and a two-bar XOX mask containing exactly its intended event. The notes, bounds, durations, ADSR, and event positions match the patterned sketch.

**Full-channel patterned-versus-scalar-oracle comparison passes**, including attacks, decay/sustain, all release intervals, overlaps, and final tail. The oracle does not depend on patterned minimum lookup, and comparison performs no alignment, normalization, trimming, clipping, or resampling. Combined with control sensitivity and the [resolved scalar scheduling tests](step-2.1.md), this closes native AC11 rather than merely demonstrating audible patterned input.

### External envelope target

Detune bounds:

```js
const minimum = "<[0 180] [-240 360]>";
const maximum = "<[600 960] [720 1200]>";
```

Three renders compare shorthand, builder, and a zero-minimum control applied through `.detune(envelope)` with constant gain `0.3`. Full-channel shorthand/builder parity passes the same fixed limits. The first event matches the control; every later event window differs by more than `1e-5`. All frames are finite, all four windows audible, and no nested/new source type is introduced. This supplies native AC13 support.

### Crossing/inverted bounds

Two equivalent renders use:

```js
const minimum = "<[1.2 0.8] [0.4 1.1]>";
const maximum = "<[0.2 1.4] [1.6 -0.3]>";
```

This includes both normal and inverted relationships and a negative maximum. Every sample remains finite, every event window is audible, and complete shorthand/builder parity passes. Together with AG1's exact unclamped/unsorted arithmetic assertions, this supplies native AC12 confirmation.

Every test also asserts that the renderer has no remaining browser contexts after its renders. Test helpers remain suite-local under `support/`; no generic options/dispatch framework, new public types, or production signature changes were needed.

## Final required gates

All commands exited zero against the final native test/oracle patch:

```sh
pnpm exec turbo run build --filter=@web-audio/fluid --filter=@web-audio/audio-engine
pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/patterned-envelope.test.ts
pnpm check
pnpm lint
pnpm exec prettier --check plans/fluid-pattern-inputs/spec.md plans/fluid-pattern-inputs/plan.md
pnpm test
```

| Gate                                                             | Result                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Dependency/artifact build                                        | 6 successful tasks; Fluid fresh, five upstream/engine tasks cached          |
| Focused native diagnostic                                        | **3 tests / 1 file passed**, including the scalar release oracle            |
| Final root `pnpm check`                                          | **14 successful tasks**, 13 cached; changed audio-regression checking fresh |
| Final root `pnpm lint`                                           | **14 successful tasks**, 13 cached; changed audio-regression lint fresh     |
| Plan/spec and changed test/support/evidence formatting           | Passed                                                                      |
| Final root `pnpm test`                                           | **19 successful tasks**, 18 cached; audio-regression explicitly uncached    |
| Fresh audio-regression tooling/native tests inside root gate     | **179 tests / 22 files passed**                                             |
| Fresh read-only approved native comparisons inside root gate     | **14/14 cases passed**                                                      |
| Protected reference/case/threshold hashes and `git diff --check` | Unchanged / passed                                                          |

Root `pnpm test` executes audio-regression `test:ci`, which runs its dependency build, complete Vitest suite, and `tsx src/verify-cli.ts`. A redundant separate package-wide invocation was unnecessary. Other workspace suites are governed by Turbo's normal caching; this record does not describe all cached tests as fresh executions. The earlier broad run in this step also freshly passed Fluid 1,331, Patterns 434, schema 134, and engine 410 tests.

Final fresh approved-case comparisons used the original `1e-6` maximum / `1e-7` RMS gates. All cases passed. The largest reported channel maximum error was `2.384186e-7`; the largest channel RMS error was `1.265472e-8`, both from `techno-drum-loop`. Three cases had permitted Float32-level differences; the other eleven reported zero sample differences in this run. No unexpected difference, required-gate failure, or baseline failure remains to investigate.

The existing `tsgo` experimental and Vite `__dirname` notices remain non-failing and were not suppressed. The previous bare-Node built-entry runner limitation is unchanged; it did not block the native harness.

## Reference and scope preservation

A before/after SHA-256 manifest covered **83 tracked files**: approved references, authored cases/assets, and `runner/audio.ts` plus `runner/compare.ts`. It was byte-identical after the native/regression runs. Manifest digest:

```text
dfcdecfd4b58f253d954cce9a59e1c1cb4d735d992cec84d873749c0eb2cf8bb
```

Reproduce the manifest digest from the repository root:

```sh
git ls-files packages/audio-regression/references packages/audio-regression/cases packages/audio-regression/src/runner/compare.ts packages/audio-regression/src/runner/audio.ts | xargs shasum -a 256 | shasum -a 256
```

Git checks also show no reference, case, threshold, production Fluid/engine/schema/Patterns/worklet, app, dependency, lockfile, README, spec, overview, or user documentation change. The new diagnostics neither generate nor update approved musical references. No `audio:update`, installation, commit, publication, deployment, or listening command ran.

## Acceptance review and remaining work

- AC11: verified by AG1 deterministic scheduling plus native gain/control/scalar-oracle comparisons, including event-specific release behavior.
- AC12: verified by exact AG1 arithmetic plus finite audible native crossing/inverted output.
- AC13: verified by AG1 external-source behavior plus native detune parity and minimum sensitivity.
- Existing source, builder, permissions, rollback, dedicated-setter, active-migration, public-evaluation, and built-consumption evidence remains available. The broad suite/approved references add regression support without altering those APIs.
- AC1's Phase 4 closure and AC18's documentation/overall agreement remain pending the user-owned documentation work listed in Step 4.1. Formatting success is not documentation-content acceptance.

**All implementation, public/artifact, native, and required workspace checks are technically satisfied.** Full Step 4.1/4.2 completion and Phase 4 exit are not marked verified while that earlier documentation gate remains open. No waiver is assumed.

Native proof is local to the recorded Chromium/macOS environment. It does not establish listening approval, musical quality, cross-platform equivalence, real-time CPU guarantees, package publication, or a release decision.
