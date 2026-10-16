# Pre-envelope effects implementation plan

## Status and governing source

- Governing spec: [spec.md](spec.md), ready for planning; R1–R8 and AC1–AC9 govern this work.
- Delivery state: Planning only. All steps are Pending; no baseline, implementation checks, or listening review have been run for this plan.
- Acceptance or release still pending: All implementation gates, native regression verification, and individual human listening approval for new/changed recordings. No publication or deployment is included.
- Blockers: No unresolved product decisions. Chromium availability and the current test baseline are unverified; a missing browser or unexplained baseline failure blocks the affected execution gate, not plan authoring.

Step statuses below are the authoritative execution record. A phase is complete only when its step completion gates and phase exit gate are satisfied. Task checkboxes do not prove verification. Verified means the scoped gate and required implementation review passed; it does not imply human listening approval, publication, or release. In supervised execution, extension state owns manual approval records; evidence entries may link to them without duplicating approval checklists.

## Execution constraints

- All paths and commands are relative to `/Users/andy/Documents/Development/web-audio`; run shell commands from that repository root unless stated otherwise.
- Preserve unrelated work, including the existing untracked `plans/analog-engine/` documents. Read a file before editing it. Expected file lists describe scope, not permission for unrelated cleanup.
- Keep step IDs stable; escalate conflicts with the spec instead of weakening it. No legacy position switch, schema migration, gain compensation, new effects, new source layers, or tail-lifetime redesign.
- Do not install packages, alter lockfiles, launch the app's `dev` command, commit, push, or deploy as an implicit step. If Chromium is absent, obtain approval before the existing machine-changing `pnpm --filter @web-audio/audio-regression browser:install` setup command; installation and browser tests must be sequential.
- Use existing native render infrastructure. Do not replace Web Audio DSP with mocks for acoustic claims, add production test hooks, or create a new general rendering/scheduling framework.
- Preserve the audio harness's default comparison limits (maximum error `1e-6`, RMS error `1e-7`) and update safeguards. Never bulk-update references or infer listening approval from command success.
- Keep evidence concise in each owning gate. Use `evidence/<step-id>.md` only if baseline failures, comparison details, or reproducibility findings warrant supporting notes; do not create empty notes or a second progress checklist. Raw WAV diagnostics remain disposable artifacts, not spec/plan attachments.

### Inspected implementation and verification seams

- The production change is concentrated in `packages/audio-engine/src/instruments/instrument.ts`, `_scheduleVoice()`: its current chain is `[envelopeGain, ...effectNodes]`. Both real instrument types delegate to it. Existing parameter scheduling and `_track()` ownership need not be redesigned.
- Existing synth/sampler tests provide fake native nodes and schema fixtures. The shared instrument suite extensively tests binding/lifecycle helpers, but a test of `_track()` alone does not prove `_scheduleVoice()` connects the new graph. Add direct scheduling-path coverage.
- `packages/audio-engine/src/test-utils/schema-fixtures.ts` provides reusable synth/sampler schemas and file banks. `src/__tests__/support/manual-clock.ts` provides manual engine events. Some existing engine tests substitute instruments; they are useful regressions, not sufficient evidence of end-to-end voice placement.
- `packages/audio-regression/src/runner/render.ts`, `withRenderer()`, exposes the owned browser/origin and the real `render()` pipeline. The pipeline uses built Fluid/audio-engine artifacts, so rebuild dependencies before focused native tests. Its normal render path owns diagnostics, resource mounting, and context cleanup.
- Native tooling tests live in `packages/audio-regression/src/__tests__/`; their synthetic fixtures and temporary assets are separate from the authored case registry. `compareAudio()` already accepts native channels and uses the default tolerances.
- Authored cases are discovered from `packages/audio-regression/cases/<id>/`; references are separate `render.wav`/`metadata.json` pairs. Existing `lfo-filter` and `bends` are candidates for changed output, not predeclared failures. Existing no-effects cases include `sine` and `sample-tone`.
- Scripts below come from the inspected root/package manifests. Dependency artifacts exist, but that is not evidence they are fresh or that any check passes.

## Phase overview and delivery boundary

| Phase | Outcome                                                              | Dependencies                         | Exit gate                                                                                  |
| ----- | -------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| 0     | Establish unchanged-code baseline and protect existing references    | Approved local execution environment | Known baseline, no unexplained failures or reference writes                                |
| 1     | Deliver the new topology with scheduling/lifecycle/downstream parity | Phase 0                              | Engine composition, package checks/build, and classified reference differences             |
| 2     | Prove native behavior, document the break, and accept recordings     | Phase 1                              | Discriminating native tests, individual listening approval, and final workspace regression |

Delivery boundary: One feature-complete PR may contain all increments; the steps are review boundaries, not independently promised PRs. No intermediate reference mismatch is a release-ready state.

Atomic groups: The production wiring change and its topology tests in Step 1.1 land/revert together. Final delivery/reversion must keep wiring, topology-sensitive tests, documentation, and changed/new audio references mutually consistent; never ship a rebaseline independently of its governing behavior.

## Phase 0 — Establish baseline without accepting new output

Outcome: A reproducible reference point and execution-ready tooling.
Depends on: Existing project checkout and approved execution environment.
Review boundary: Read-only inspection plus normal build/test artifacts; no production edits or accepted-reference updates.

### Step 0.1 — Record the unchanged-code baseline

Status: Pending
Requirements / acceptance: R3–R8; baseline support for AC3, AC5–AC9, not acceptance of the new behavior.
Depends on: None.
Review boundary: Existing engine/schema/Fluid tests and native recordings, with failures attributed before implementation.

Expected files:

- No production or reference changes.
- Gate evidence below; optional `evidence/0.1.md` only for material environment/failure or reference-provenance details.

Tasks:

- [ ] Record the starting revision/worktree state and verify unrelated changes are preserved; inventory the existing case/reference pairs and their byte identities for later comparison.
- [ ] Establish browser/tool availability and build the workspace dependencies needed by package tests. If setup needs installation or another machine change, stop for approval.
- [ ] Run the existing engine, schema, and Fluid suites and the native reference verification before changing wiring; distinguish pre-existing failures from feature regressions.
- [ ] Record the browser version and baseline result concisely. Preserve any consequential failure evidence outside the runner's disposable per-case diagnostic directories before a later verification replaces it; do not update references.

Verification:

```sh
pnpm --filter @web-audio/audio-regression build:deps
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/schema test:ci
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/audio-regression audio:verify
```

Expected result: Current tests and reviewed recordings pass, or an existing failure is identified and resolved/explicitly escalated. The native command renders the actual current engine without writing accepted references. Review the worktree afterward for accidental reference/source changes.

Manual: No listening acceptance is needed for an unchanged, numerically passing baseline. Browser installation approval, if needed, is separate from this test gate.

Completion gate: The baseline is reproducible and reference bytes are untouched; unresolved failures affecting this feature remain Blocked rather than silently waived.
Evidence: Not run.

Phase exit gate: After Step 0.1 checks, review the baseline and ensure there are no unexplained failures or reference mutations before Phase 1 or supervised approval to advance. A pre-existing failure is not automatically an accepted deviation.
Evidence: Not run.

## Phase 1 — Relocate voice processing and preserve its boundaries

Outcome: Both instrument families use effects-before-ADSR with unchanged scheduling and downstream ownership.
Depends on: Phase 0 exit gate.
Review boundary: Small production wiring change with immediate tests; no new DSP, source abstractions, or reference acceptance.

### Step 1.1 — Move the chain with direct topology and isolation proof

Status: Pending
Requirements / acceptance: R1–R4; AC1, AC2 (topology portion), AC3 (connection portion), AC5 (source/envelope schedule portion). Native portions remain owned by Phase 2; broader lifecycle parity is Step 1.2.
Depends on: Step 0.1 and Phase 0 exit gate.
Review boundary: Reorder the existing audio path, retain all its nodes/ownership, and prove it through actual synth/sampler scheduling.

Expected files:

- `packages/audio-engine/src/instruments/instrument.ts` — change the shared connection order only.
- `packages/audio-engine/src/instruments/__tests__/pre-envelope-effects.test.ts` — new domain-local scheduling/topology tests.
- `packages/audio-engine/src/__tests__/support/audio-graph.ts` — new minimal fake-node/context helper if needed for reuse by Steps 1.1/1.2; not a fake DSP renderer.
- Existing `src/test-utils/schema-fixtures.ts` — reuse without changing unrelated defaults; extend only if necessary for the focused fixtures.

Tasks:

- [ ] Connect `source → effect nodes in authored order → existing envelope gain → balancing gain`, with direct `source → envelope gain` for empty effects. Keep envelope calculation, effect creation/automation, source start/stop, and tracked node ownership unchanged.
- [ ] Add tests constructing real `Synthesizer` and `Sampler` instances with fake native nodes and a cached sample. Assert exact connection targets/counts for zero, one, and multiple effects, including reversed authored orders; detect bypasses and old envelope-first edges.
- [ ] Schedule overlapping/chord synth notes and layered sampler voices; assert separate effect/envelope node identities and no cross-voice audio edges.
- [ ] Assert unchanged amplitude scheduling, configured nonzero floor, source start/stop times, sample offset/playback settings, and skip behavior without renumbering later hits. Reuse existing tests for already-covered selection/region details rather than duplicating their full matrix.
- [ ] Keep tests type-checked and clean up global stubs/instances between cases. Do not expose private production methods or create a new public position option for testing.

Verification (the new test path becomes runnable only after this step adds it):

```sh
pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/__tests__/pre-envelope-effects.test.ts src/instruments/synthesizer.test.ts src/instruments/sampler.test.ts src/instruments/instrument.test.ts
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
```

Expected result: Direct scheduling assertions prove one correctly ordered path per voice and unchanged timing; existing instrument regressions pass. These fake-node checks do not claim native acoustic parity or listening approval.

Manual: Review the connection diff and node-tracking list together; no second amplitude envelope, shared per-voice effects, or untracked connection may have appeared.

Completion gate: The production change and its focused proof pass together and remain buildable, without depending on later native fixtures or accepted reference updates.
Evidence: Not run.

### Step 1.2 — Prove automation, cleanup, and graph composition

Status: Pending
Requirements / acceptance: R3–R6; AC2 (cleanup portion), AC5, AC6, AC7; AC8 (existing API/schema portion). AC8 documentation and all recording acceptance remain Phase 2.
Depends on: Step 1.1.
Review boundary: Fill meaningful integration gaps against the implemented graph; no unrelated scheduler, bus, or lifecycle refactor.

Expected files:

- `packages/audio-engine/src/instruments/__tests__/pre-envelope-effects.test.ts` — focused parameter and voice-end/cancellation coverage.
- `packages/audio-engine/src/__tests__/pre-envelope-effects.test.ts` — new cross-domain engine composition test if existing tests do not exercise real instruments.
- `packages/audio-engine/src/__tests__/support/audio-graph.ts` and existing manual-clock/schema fixtures — reuse only as needed.
- Existing instrument/engine/bus suites — extend only for uncovered invariants; production files outside Step 1.1 should not need changes unless a scoped regression is found.

Tasks:

- [ ] Exercise gain/filter parameters through the real scheduling path using static/hit-patterned/random values, an envelope, an LFO, and MIDI CC. Confirm unchanged values, event origins, phase/target semantics, and binding cleanup using focused examples plus existing coverage.
- [ ] End one overlapping effected voice while another remains; cancel future voices, stop with an active voice, and destroy repeatedly. Include natural short-buffer completion and verify no lifetime extension or premature cleanup of surviving voices.
- [ ] Use a manual clock and real runtime instruments for an effected engine graph with named routing/sends; assert balancing/mute/send topology without a duplicated dry route. Check graph replacement keeps old/new voice nodes isolated and retirement still waits for the tracked voices.
- [ ] Re-run existing bus, ducking, MIDI, source-selection, authoring, and schema regressions. Add only missing effect-bearing composition cases; do not rewrite unchanged suites just to match new file layout.

Verification:

```sh
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/schema test:ci
pnpm --filter @web-audio/fluid test:ci
```

Expected result: Automation schedules, binding ownership, Stop/retirement, routing, and MIDI/duck contracts remain intact. For effect-bearing engine assertions, do not replace runtime instruments with mocks that hide `_scheduleVoice()`.

Manual: Inspect any change outside the connection order and test/docs surface for scope creep. A discovered unrelated pre-existing defect is reported, not silently repaired here.

Completion gate: Existing suites and the added composition tests pass, with direct evidence for every retained lifecycle/downstream contract not already established by existing coverage.
Evidence: Not run.

Phase exit gate: After Step 1.2 checks, run `pnpm --filter @web-audio/audio-regression build:deps`, then `pnpm --filter @web-audio/audio-regression audio:verify`. Review the composed engine build and all resulting reference mismatches. No-effects controls must retain their baseline output; changed filter cases may still fail against old references, but only classified, placement-attributable differences may advance to Phase 2. Do not update references to pass this gate. Unexplained mismatches, diagnostics, or shape/lifecycle failures block advancement. Record the classified cases, not an assumed green regression suite.
Evidence: Not run.

## Phase 2 — Native proof, documentation, and recording acceptance

Outcome: Native behavior demonstrably matches the new topology, users can understand the break, and the reference suite reflects individually accepted output.
Depends on: Phase 1 exit gate.
Review boundary: Verification assets and documentation, followed by approval-gated reference updates. No further feature expansion.

### Step 2.1 — Add discriminating native tests and listening material

Status: Pending
Requirements / acceptance: R1, R2, R7, R8; AC3 (native portion), AC4 (automated portion), AC9 (diagnosis/preparation portion). Listening/reference acceptance is Step 2.3.
Depends on: Step 1.2 and Phase 1 exit gate.
Review boundary: Prove real filter/envelope behavior with self-contained tooling tests; author two focused listening cases without accepting their references yet.

Expected files:

- `packages/audio-regression/src/__tests__/pre-envelope-effects.test.ts` — new native tests using the current renderer.
- `packages/audio-regression/src/__tests__/support/pre-envelope-effects.ts` — new test-only fixture/reference-graph helper as needed.
- `packages/audio-regression/cases/pre-envelope-synth/{sketch.js,metadata.json}` and `cases/pre-envelope-sampler/{sketch.js,metadata.json}` — proposed new authored cases.
- `packages/audio-regression/cases/README.md` — provenance clarification only if needed. Reuse the existing original `sample-tone/samples/tone.wav` through a relative resource mapping rather than regenerate unrelated inputs.

Tasks:

- [ ] Add small deterministic synth and sampler fixtures with a resonant filter, zero envelope floor, and nonconstant attack/release. Ensure the source remains live through the observation window, including time after release and before scheduled stop; sample exhaustion must not masquerade as envelope gating.
- [ ] Render actual Fluid/AudioEngine output through `withRenderer().render()`. In a separately owned test browser context, render explicit native reference graphs for pre-envelope and old post-envelope placement with matching source data, scheduling, gains, sample rate, and frame count. Keep this helper test-local and independent of production routing helpers; close every context on failure and retain diagnostic checks/deadlines.
- [ ] Compare the engine render to the intended reference with unchanged `compareAudio()` defaults, and assert the old topology fails the same comparison by a meaningful signal difference. Assert finite output and final zero-gain suppression in a window before source cleanup. Exercise both 44.1 kHz and 48 kHz with appropriately aligned frame timing.
- [ ] Use temporary locally served assets for tooling tests, following existing native sample-test patterns; do not import authored cases into those tests. Resolve fixture mismatch by matching real scheduling/sample decoding, not by increasing tolerances or normalizing output.
- [ ] Add the two authored cases for musical review, with enough duration/tail and a sample event short enough for its release to complete before the reused half-second input ends. Verify repeatable fresh renders. Keep these cases separate from the synthetic contract tests and do not write accepted references yet.

Verification (new tests/case IDs below are proposed additions, not existing commands that can pass before this step):

```sh
pnpm --filter @web-audio/audio-regression build:deps
pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/pre-envelope-effects.test.ts
pnpm --filter @web-audio/audio-regression test
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression audio:render --case pre-envelope-synth
pnpm --filter @web-audio/audio-regression audio:render --case pre-envelope-sampler
```

Run the focused native test and each diagnostic render again in fresh processes to check determinism. Existing `audio:verify --case sine` and `audio:verify --case sample-tone` must still pass their unchanged references. The full registry is not expected to verify yet: newly added cases intentionally lack accepted references until Step 2.3.

Manual: Review reference-graph timing/levels against the fixture contract and confirm the wrong-topology comparison fails for placement, not unrelated scheduling or decoding differences. This is technical review, not human musical approval.

Completion gate: Both source families match explicit intended native graphs and reject the old graphs; unchanged controls pass. Diagnostic recordings are repeatable, native resources clean up, and no accepted reference bytes have changed.
Evidence: Not run.

### Step 2.2 — Document the new contract and the intentional break

Status: Pending
Requirements / acceptance: R3, R7; AC8 (documentation portion); AC9 communication support, not recording approval.
Depends on: Step 2.1.
Review boundary: User-facing signal placement and migration expectations only.

Expected files:

- `plans/effects-chain/signal-processing.md` — correct the instrument voice flow without implementing its deferred bus proposals.
- `packages/fluid/README.md` — explain `.fx()` placement for synths and samplers and the sonic breaking change.
- `plans/analog-engine/roadmap.md` — link the feature documents if useful; do not mark the feature delivered before final acceptance.

Tasks:

- [ ] Show effects-before-amplitude-ADSR, authored order, and per-voice ownership; distinguish effect modulation from the final voice envelope.
- [ ] Explain that syntax/schema remain unchanged, there is no legacy selector, and affected filter attacks/releases may sound different. Do not promise equivalent old sound or imply every sketch changes.
- [ ] Preserve existing route/send tap points, named-bus restrictions, and current main-gain-only behavior. Do not describe future saturation, layering, compression, or tail handling as implemented.

Verification:

```sh
pnpm exec prettier --check plans/effects-chain/signal-processing.md packages/fluid/README.md plans/analog-engine/pre-envelope-effects/{spec,plan}.md
```

Include `plans/analog-engine/roadmap.md` in the check if edited. Review remaining envelope/effects diagrams with `rg -n 'envelope|ADSR|effects|\.fx\(' plans/effects-chain/signal-processing.md packages/fluid/README.md`; historical “before” examples may remain only when clearly labeled. Check formatting only on modified files rather than performing an unrelated whole-tree rewrite.

Manual: Read the final explanation against the implemented and natively tested graph and the unchanged public API/schema.

Completion gate: AC8's documentation accurately states the break and existing boundaries, with no unsupported features or stale current-flow claim.
Evidence: Not run.

### Step 2.3 — Individually review recordings, update references, and integrate

Status: Pending
Requirements / acceptance: R3–R8; AC3 and AC4 (final reviewed recording portions), AC8 (integrated result), AC9. Final regression also confirms AC1–AC7 remain satisfied by their owning gates.
Depends on: Steps 2.1 and 2.2.
Review boundary: Approval-gated binary reference updates plus final integration; no new behavior or automatic rebaseline.

Expected files:

- `packages/audio-regression/references/pre-envelope-synth/{render.wav,metadata.json}` and `references/pre-envelope-sampler/{render.wav,metadata.json}` — new pairs, only after individual review.
- `packages/audio-regression/references/<individually-reviewed-affected-id>/{render.wav,metadata.json}` — only existing cases identified by actual evidence. This notation denotes the measured case set, not a new literal directory or permission to rewrite all references.
- Gate evidence; optional `evidence/2.3.md` for a concise per-case attribution/listening summary if needed, linked to approval state. No harness or comparison-tolerance changes.

Tasks:

- [ ] Run full read-only verification to enumerate changed/missing-reference cases; distinguish expected old-reference mismatches from rendering/diagnostic/shape failures. Preserve baseline before/current/difference material needed for review before a subsequent command clears disposable artifacts.
- [ ] Provide a human listener the exact new/changed recordings, settings, and attribution. On macOS, playback can use `afplay packages/audio-regression/artifacts/render/<id>.wav` for new diagnostics and the existing `artifacts/verify/<id>/{reference,current,difference}.wav` for changed cases. The listener must hear attacks/releases, no abnormal clicks or unbounded ringing, and judge the resulting sound acceptable. Command success is not approval; pending access or approval leaves this step Blocked.
- [ ] After each case is individually approved, update exactly that case with the existing explicit command, then reverify it. Inspect the freshly generated reference; if it differs from the reviewed output or cannot be attributed, stop and review again. Do not update unaffected references, loosen limits, or rewrite sketches to disguise differences.
- [ ] Compare accepted-reference changes to the Phase 0 inventory, including both WAV and metadata. Confirm no unrelated assets, original sample bytes, API/schema, or harness safeguards changed.
- [ ] Run final workspace gates after the last accepted update; inspect the final diff and acceptance mapping. Record skipped checks or unresolved failures honestly rather than marking the feature complete.

Verification:

Before review, use `pnpm --filter @web-audio/audio-regression audio:verify` and selected `audio:render --case <id>` as needed. `<id>` is one observed case, never an all-cases selector. Per-case update, after approval:

```sh
pnpm --filter @web-audio/audio-regression audio:update --case <id>
pnpm --filter @web-audio/audio-regression audio:verify --case <id>
```

Final integration, after all individual updates and their checks:

```sh
pnpm check
pnpm lint
pnpm test
pnpm exec prettier --check plans/analog-engine/pre-envelope-effects/{spec,plan}.md
git diff --check
```

`pnpm test` runs workspace `test:ci`, builds dependency artifacts, runs native tooling tests, and freshly verifies all registered recordings; this is the final full-registry gate, not a substitute for human review. Also check Prettier on each modified code/doc file (explicit paths from the final diff, excluding binary assets). All commands use the repository root.

Expected result: Workspace checks and the complete recording suite pass with unchanged tolerances; only individually accepted cases have new reference bytes. Previous gate evidence remains applicable to the final revision or is rerun where subsequent changes affected it.

Completion gate: All spec criteria have proof at the final revision, every required new/changed recording has individual human approval, and the full integration gate passes. If a root failure is demonstrably pre-existing, resolution or an explicitly accepted deviation is required; it is not a passing result.
Evidence: Not run.

Phase exit gate: Assess Step 2.3's final integration and approval evidence after its last checks. Confirm no missing references, unexplained audio differences, pending listening reviews, unsupported documentation, or unowned cleanup remain before calling the feature accepted or requesting supervised approval to advance. Publication/deployment is not part of this gate.
Evidence: Not run.

## Final acceptance

This table points to owning gates; their evidence/status entries remain the single execution record.

| Spec acceptance ID | Owning step / gate                     | Verification and expected result                                                                                        | Evidence / status                  |
| ------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| AC1                | Step 1.1                               | Real instrument scheduling creates the exact ordered pre-envelope path with no bypass.                                  | Step 1.1 evidence; Pending         |
| AC2                | Steps 1.1 and 1.2                      | Overlapping synth/sample voices have distinct paths and independent cleanup.                                            | Steps 1.1/1.2 evidence; Pending    |
| AC3                | Steps 0.1, 1.1, 2.1; final gate in 2.3 | Empty-chain topology and existing no-effects native controls retain their baseline output.                              | Owning step evidence; Pending      |
| AC4                | Steps 2.1 and 2.3                      | Native output matches the intended graph, rejects the old placement, and focused recordings receive listening approval. | Steps 2.1/2.3 evidence; Pending    |
| AC5                | Steps 1.1 and 1.2                      | Source/envelope schedules, nonzero floors, parameter automation, and bindings retain their contracts.                   | Steps 1.1/1.2 evidence; Pending    |
| AC6                | Step 1.2                               | Cancellation, natural end, active Stop, replacement/retirement, and destruction retain ownership/lifetime rules.        | Step 1.2 evidence; Pending         |
| AC7                | Step 1.2                               | Effect-bearing composition preserves routing, send taps, mute, duck/MIDI timing, and bus behavior.                      | Step 1.2 evidence; Pending         |
| AC8                | Steps 1.2 and 2.2; final gate in 2.3   | Existing authoring/schema contracts pass and delivered documentation accurately explains the sonic break.               | Owning step evidence; Pending      |
| AC9                | Step 2.3 / Phase 2 exit                | Attributed, individually approved references and the complete native suite pass without weakened safeguards.            | Step 2.3/Phase 2 evidence; Pending |

## Rollback and recovery

- No persisted schema/data migration is involved. Revert the feature's production wiring together with topology-sensitive tests, documentation, new cases, and approved changed/new reference pairs; preserve unrelated work. Do not revert unrelated baseline fixes or another contributor's files.
- Production and unit-test increments are locally reversible, but merging only the wiring or only its rebaseline creates an inconsistent release. The feature-complete delivery boundary governs rollback.
- Reference generation replaces a selected WAV/metadata pair. The existing updater validates rendering before writes, but a later filesystem error can leave a partial pair. Preserve the Phase 0 byte inventory/original pairs and restore only the affected pair from its known pre-update version if needed; never use a blanket reset. Investigate a partial write before retrying.
- Before approval/update, a failed render or comparison is diagnostic evidence, not authorization to replace recordings. Correct the cause, rerun the owning check, and obtain renewed review when the audible candidate changes.
- Disposable diagnostic artifacts may be overwritten by later runner invocations. Retain consequential review material in a distinct local directory outside the accepted-reference tree; do not treat artifact existence as durable approval evidence.

## Deferred checks and accepted deviations

- None accepted. Every implementation, baseline, and acceptance check above is future work, not a skipped passing gate.
- Browser installation or dependency repair requires separate approval if needed; human listening requires access to a listener and audio playback. Missing prerequisites block their gates rather than reducing coverage.
- Supersaw, source-layer gain/sub/noise APIs, saturation/compression, shared time-based effects, and generalized tail management remain deferred exactly as in the spec.
