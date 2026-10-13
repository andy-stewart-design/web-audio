# Basic Event-Triggered Ducking Implementation Plan

## Status and governing source

- Governing spec: [spec.md](spec.md), SOW 6 of the [bus follow-up roadmap](../bus-followup-roadmap.md).
- Delivery boundary: One feature-complete PR; this plan is a checklist, not an execution log.
- Blockers: None identified for planning. API defaults, input clamping, depth mapping, and browser ramp behavior are **spec assumptions**, not interview-approved decisions; the audible gate may require a spec revision before closeout.

During execution, **check off task and gate boxes only**. Keep command results, baseline findings, decisions, failures, and manual listening notes in a separate `progress.md` (create it when there is something to record), not here. Change this plan only if the direction or scope materially changes. A checked task is not a passed gate; check a gate only after its specified verification and review. Manual approval/release remains separate.

## Execution constraints

- Paths and commands are relative to repository root. Do not run `dev` without permission. No package installation or code change is authorized by this plan.
- Preserve `spec.md` as authority: hold-and-retrigger (never drop nonzero overlaps), recovery immediately after reaching target, pattern duration rather than audible sample length, graph-local ownership, and named bus only.
- Preserve the shared expression/event model: schema stores only canonical static duck configuration; the engine consumes resolved timing, not shorthand or event-cycle notation. Do not introduce SOW 7's analytical timeline, MIDI work, bus envelopes, or a generic scheduler.
- The proposed **required** `ducks` field is a cross-package schema/consumer/fixture migration. It must be changed and reverted as one unit (Step 1.1), not left half-applied. No compatibility branch for old direct schemas. Search remaining direct-schema writers beyond listed examples before marking that step done.
- `AudioEngine.update()` already clones/validates before replacing `_pending`; retain that last-valid-write behavior. Current static inspection also shows generic bus-effect validation accepts unsupported automation that `RuntimeBus` rejects; this pre-existing mismatch belongs to the separate bus MIDI plan unless it directly prevents duck acceptance. Record, do not silently expand this SOW.
- Existing fake AudioParam tests prove scheduled calls and owned connections, **not** browser audible curves. The manual gate is required for audible acceptance; test-only simulation must not be presented as proof of native Web Audio interpolation.
- At plan authoring, source inspection had not established a green test/build baseline. Record baseline results and distinguish existing failures from regressions in `progress.md`, not this plan.

## Phase overview and delivery boundary

| Phase | Outcome                                                            | Dependencies | Exit gate                                               |
| ----- | ------------------------------------------------------------------ | ------------ | ------------------------------------------------------- |
| 0     | Document baseline and lock non-blocking implementation assumptions | None         | Inventory and focused existing checks recorded          |
| 1     | Canonical duck authoring/validation, atomically migrated           | 0            | Schema + Fluid behavior and changed-package checks pass |
| 2     | Dedicated bus ducking and event/lifecycle dispatch                 | 1            | Engine unit and graph integration tests pass            |
| 3     | User-facing docs, end-to-end regression, and audible review        | 2            | Workspace checks plus manual sparse/retrigger review    |

Delivery boundary: **one feature-complete PR** containing all four phases; Phases 1–2 are review increments, not separately releasable duck features. Atomic group: schema `InstrumentSchema.ducks`, Fluid serializers, all typed/direct graph producers, and fixture migration in Step 1.1. If that group must be reverted, revert it together, then rerun the schema/Fluid/engine type checks; do not ship readers/writers on different contracts.

## Phase 0 — Baseline and design constraints

Outcome: Reproducible tests/seams and candidate audible settings are established without declaring existing work complete.
Depends on: Governing spec.
Review boundary: Read-only inventory and baseline; no product implementation.

### Step 0.1 — Baseline and assumption review

Requirements / acceptance: R1–R8 (precondition only; no AC claimed yet).
Depends on: None.
Review boundary: Establish current failures, affected schema writers, and a minimum design consistent with the spec; no implementation.

Expected files:

- `plans/effects-chain/simple-ducking/progress.md` — create on first execution for baseline findings, results, and consequential decisions; do not add a running log to this plan.

Tasks:

- [x] Inventory direct synth/sampler schema writers, fixtures, and tests using `sends`/`route`; note every producer requiring `ducks: {}`.
- [x] Inspect existing fake AudioParam support, clock/manual engine tests, and the Fluid bus example; identify the smallest reusable trigger/duck test seams.
- [x] Review candidate assumed API/defaults, depth mapping, positive floor/minimum ramp, and whether Fluid clamps finite out-of-range values. Put findings in `progress.md`; if any conflict with the spec or product intent is material, revise the spec with the user **before** dependent work rather than silently changing behavior.
- [x] Run existing focused schema, Fluid, and engine tests; put results in `progress.md`, distinguishing existing failures from regressions.

Verification:

- Automated (repository root): `pnpm --filter @web-audio/schema exec vitest run src/validate-graph.test.ts`; `pnpm --filter @web-audio/fluid exec vitest run src/__tests__/drome.test.ts`; `pnpm --filter @web-audio/audio-engine exec vitest run src/buses/runtime-bus.test.ts src/engine.test.ts`. These establish existing local baselines, not duck behavior.
- Manual: Not needed; no audible behavior exists yet.

- [x] Completion gate: Inventory/assumption review and baseline checks completed, results kept in `progress.md`, with no unaddressed spec contradiction.

- [x] Phase exit gate: Confirm dependent phases are not premised on an unexamined blocker; if an assumption becomes a material product decision, stop for spec resolution before Phase 1.

## Phase 1 — Canonical duck contract and Fluid authoring

Outcome: Complete Fluid/direct graphs represent and validate the same static per-instrument duck settings; old direct schemas are rejected intentionally.
Depends on: Phase 0 exit.
Review boundary: Data/authoring contract only. No claim of audible ducking until Phase 2.

### Step 1.1 — Atomic schema, authoring, and fixture migration

Requirements / acceptance: R1, R2; AC1, AC2 (schema/Fluid portions; engine last-valid-write proof remains with Step 2.3).
Depends on: Step 0.1.
Review boundary: One required-field migration: shared schema + all affected writers/tests together; do not split into separately buildable PRs.

Expected files:

- `packages/schema/src/index.ts`, `packages/schema/src/validate-graph.ts`, `packages/schema/src/validate-graph.test.ts` — duck type and focused contextual validation tests.
- `packages/fluid/src/instruments/instrument.ts`, `packages/fluid/src/instruments/{synthesizer,sampler}.ts`, `packages/fluid/src/__tests__/drome.test.ts` — `.duck()` authoring, canonical serialization and forward-reference/invalid-target tests.
- `packages/audio-engine/src/test-utils/schema-fixtures.ts` and other **discovered** direct-schema constructors/tests/apps — required empty record migration; inspect all graph authors before completing the step.

Tasks:

- [x] Add `DuckSchema` and required `ducks: Record<string, DuckSchema>` to the shared instrument type; validate record shape, canonical target names, declared named targets only, finite canonical values, and useful indexed paths.
- [x] Implement instrument-owned `.duck(target | targets, depth?, onset?, recovery?)`; normalize names, apply recorded defaults/input policy, and replace earlier entries for the same target without changing route/send/mute.
- [x] Serialize `{}` for instruments with no duck; migrate all typed/direct fixtures and consumers atomically without silently normalizing direct schemas.
- [x] Test Fluid/direct equivalence, arrays/chained calls, forward references, main/unresolved/noncanonical targets, malformed records, non-finite and out-of-domain settings, and unchanged authoring without ducks.

Verification:

- Automated (root): `pnpm --filter @web-audio/schema exec vitest run src/validate-graph.test.ts`; `pnpm --filter @web-audio/fluid exec vitest run src/__tests__/drome.test.ts`; `pnpm --filter @web-audio/schema check`; `pnpm --filter @web-audio/fluid check`; `pnpm --filter @web-audio/audio-engine check`; `pnpm check`. The workspace check catches other direct schema producers affected by the required field; valid/invalid graphs meet AC1/AC2 (except runtime state).
- Manual: Not needed; authoring/validation are covered by deterministic tests at this boundary.

- [x] Completion gate: No remaining legacy graph producers (search before review); tests exercise accepted and rejected canonical forms, all three affected packages type-check, and reviewers approve the _whole_ schema migration as one unit. A required-field break without its consumers/fixtures is not complete.

- [x] Phase exit gate: Run `pnpm --filter @web-audio/schema test:ci`, `pnpm --filter @web-audio/fluid test:ci`, `pnpm --filter @web-audio/schema lint`, `pnpm --filter @web-audio/fluid lint`, plus Step 1.1 checks after its final changes. Verify the accepted Fluid graph survives shared validation and unsupported targets fail before engine commit; no runtime ducking claim yet.

## Phase 2 — Bus automation and pattern-trigger dispatch

Outcome: Named buses audibly capable of ducking in principle; synth and sampler timing, retriggering, Stop, and graph isolation have deterministic test evidence.
Depends on: Phase 1 exit.
Review boundary: Audio engine runtime only; do not generalize instrument scheduling or build SOW 7's software timeline.

### Step 2.1 — Bus-local duck gain and simple retrigger

Requirements / acceptance: R4–R6; AC5 (bus timing portion), AC6 (bus portion), AC7 (node ordering portion). End-to-end trigger/duration proof remains Steps 2.2–2.3.
Depends on: Step 1.1.
Review boundary: A `RuntimeBus` owns its single dedicated duck gain and future automation; no instrument callbacks yet.

Expected files:

- `packages/audio-engine/src/buses/runtime-bus.ts`, `packages/audio-engine/src/buses/runtime-bus.test.ts` — dedicated post-effects duck node, Stop/destroy, unchanged output gain/topology proof.
- `packages/audio-engine/src/buses/duck-automation.ts` and `packages/audio-engine/src/buses/__tests__/duck-automation.test.ts` (new) — focused basic timing/retrigger behavior; any test-only fake AudioParam belongs in that suite's `support/`.

Tasks:

- [x] Insert one unity duck gain between effects and the existing output gain; preserve output identity and routing, including self-inclusive routes/sends.
- [x] Convert validated static depth/onset/recovery plus resolved event duration to target and times; zero depth does nothing, recovery begins immediately after onset, and a positive minimum ramp prevents discontinuity.
- [x] Process requests in chronological order on the bus, holding the native AudioParam value at each retrigger rather than dropping or resetting to unity; track only enough previous target/recovery state to avoid a shallower request lifting the bus during onset.
- [x] On Stop cancel pending duck automation and restore unity safely, separately from existing effect-parameter Stop behavior; disconnect duck node idempotently on destroy.
- [x] Test initial unity, node connection order, 0.5-second timing example, zero depth, early/onset/recovery/cross-bar retriggers, no shallower lift, Stop, and destruction using recorded AudioParam calls. Do not infer native rendered values solely from spies.

Verification:

- Automated (root): `pnpm --filter @web-audio/audio-engine exec vitest run src/buses/runtime-bus.test.ts src/buses/__tests__/duck-automation.test.ts` (second suite will be added by this step); `pnpm --filter @web-audio/audio-engine check`. Assertions cover the dedicated path and scheduled call timing, not live interpolation.
- Manual: Deferred to Phase 3's audible gate, which tests real browser behavior and the assumed curve/floor.

- [x] Completion gate: The bus seam handles ordered requests in isolation with focused invariant tests; output gain and pre-existing bus scheduling tests remain unchanged, and code type-checks.

### Step 2.2 — Emit one trigger per resolved pattern onset

Requirements / acceptance: R3, R4; AC3, AC4, AC5 (sampler duration portion). Engine dispatch and graph isolation remain with Step 2.3.
Depends on: Steps 1.1 and 2.1.
Review boundary: Instrument scheduling produces graph-local timed requests; no bus-name lookup or Web Audio duck writes inside instruments.

Expected files:

- `packages/audio-engine/src/instruments/{synthesizer,sampler}.ts`, `packages/audio-engine/src/instruments/instrument.ts` — narrow shared trigger result/callback seam, emitted before per-voice playback early exits.
- `packages/audio-engine/src/types.ts` (if shared runtime request typing is needed), existing instrument tests or new domain-local `__tests__/` suites — focused synth/sampler trigger proof.

Tasks:

- [ ] Derive one duck request per target from each resolved, unmasked synth/sampler onset, before expanding polyphonic voices or checking sample audio availability; skip silent or chance-masked onsets.
- [ ] Use the resolved timing event's duration times the **scheduled** bar duration; do not substitute loop/one-shot/clip/buffer/region playback duration or MIDI events.
- [ ] Keep muted triggers but leave muted audio/route/send behavior and sampler alternate-direction advancement unchanged when audio cannot play.
- [ ] Return/collect requests through a narrow engine-facing seam rather than mutating a global bus or requiring a general event manager; include synth/sampler, muted/unavailable, polyphonic, chance and empty-bar tests.

Verification:

- Automated (root): `pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/synthesizer.test.ts src/instruments/sampler.test.ts` (plus any new domain-local test paths added here); `pnpm --filter @web-audio/audio-engine check`. Assert requests precede sampler audio-only exits, use pattern duration, and do not change source scheduling/mute or alternation.
- Manual: Not needed for the request seam; audio rendering still awaits integration.

- [ ] Completion gate: Both instrument classes expose testable trigger requests without needing live samples, a bus reference, or duplicated per-voice triggers; existing instrument tests pass.

### Step 2.3 — Graph-local dispatch, lifecycle, and integration

Requirements / acceptance: R2, R5–R8; AC2 (engine state portion), AC5–AC9 (composed runtime portions). Documentation and audible acceptance remain in Phase 3.
Depends on: Steps 2.1 and 2.2.
Review boundary: Active graph bar collection/ordering, named-bus dispatch, Stop and retirement; no cross-generation name lookup.

Expected files:

- `packages/audio-engine/src/index.ts` — collect bar requests from active graph instruments, order by onset within bar, dispatch to buses in that same graph; Stop all active/retiring duck gains.
- `packages/audio-engine/src/__tests__/ducking.test.ts` (new), `packages/audio-engine/src/__tests__/support/manual-clock.ts` (only if a narrow helper extension is needed), `packages/audio-engine/src/engine.test.ts` — graph/engine composition, failure and lifecycle tests.

Tasks:

- [ ] Collect requests after instrument onset resolution and before submitting duck automation, order chronologically within the scheduled bar, and route only to validated named bus objects in the active graph; retain deterministic iteration order for equal-time requests without promising SOW 7 equivalence.
- [ ] Keep new graph ducks at unity and prevent old graph requests from touching new same-named buses; preserve already-scheduled retiring-graph duck behavior until Stop or graph destruction.
- [ ] Apply Stop to active and still-audible retiring buses, cancelling future ducks and restoring unity; resume cleanly without resetting bus output gain or ending voices.
- [ ] Test Fluid/direct canonical graph behavior through the engine, mixed synth/sampler timing across instruments, self-inclusive route/send topology, invalid update retaining pending/active state, cross-bar retrigger, nonzero-bar replacement, and destruction; do not hide pre-existing bus-effect validation failures as duck regressions.

Verification:

- Automated (root): `pnpm --filter @web-audio/audio-engine exec vitest run src/__tests__/ducking.test.ts src/engine.test.ts src/buses/runtime-bus.test.ts`; `pnpm --filter @web-audio/audio-engine check`. Tests must inspect both graph connection ownership and timed AudioParam calls using the existing manual-clock/fake-node style.
- Manual: Deferred to Phase 3; mock calls cannot prove acoustic smoothness or native `cancelAndHoldAtTime()` behavior.

- [ ] Completion gate: From validated instrument schemas, same-graph bus ducks occur in time order; Stop/restart/retirement/replacement and last-valid-write invariants hold in engine integration tests, with type checks passing.

- [ ] Phase exit gate: Run `pnpm --filter @web-audio/audio-engine test:ci`, `pnpm --filter @web-audio/audio-engine check`, `pnpm --filter @web-audio/audio-engine lint`, and `pnpm --filter @web-audio/audio-engine build` after Step 2.3 checks. Review that the implementation did not add a cross-generation registry, audio-reactive detection, or an analytical timeline. No claim of audible acceptance yet.

## Phase 3 — Documentation and acceptance

Outcome: Users can understand and reproduce simple ducking; automated workspace behavior and real-browser audible feel are checked.
Depends on: Phase 2 exit.
Review boundary: Docs, integration/regression proof, and audible sign-off; no deferred SOW 7 work.

### Step 3.1 — Public examples and final verification

Requirements / acceptance: R1–R8; AC1–AC10 (final composition, with individual proofs owned by Steps 1.1 and 2.1–2.3).
Depends on: Step 2.3.
Review boundary: Documentation and acceptance only; if the assumed public contract or curve changes, update the spec and revisit earlier owning gates rather than patching docs alone.

Expected files:

- `packages/fluid/README.md`, `packages/audio-engine/README.md` (as relevant) — kick-to-music example, defaults, validation, Stop, and explicitly limited dense retriggers.
- `packages/audio-engine/src/__tests__/ducking.test.ts`, `packages/fluid/src/__tests__/drome.test.ts` — any missing cross-package or public-authoring regression found during final review.

Tasks:

- [ ] Document the pattern-triggered (not audio-reactive) API, named-bus restrictions, timing example, immediate recovery, mute/unavailable-sample semantics, hold-and-retrigger, and SOW 7 limitations.
- [ ] Review AC1–AC10 evidence against the spec, adding only uncovered public integration cases rather than duplicating every unit matrix.
- [ ] Run changed-package and workspace checks, formatting, lint, builds and tests; distinguish existing failures from regressions and document any accepted deviation in `progress.md`.
- [ ] In a supported browser with audio enabled and a prepared short kick/music example, listen to single and closely spaced kicks, then a longer recovery and Stop/restart/replacement; confirm dips, immediate swell, retriggers instead of skips, no pops/stuck attenuation, and old/new isolation. Keep browser, BPM/settings, listener, and observations in `progress.md`. If the assumed defaults, curve, or `cancelAndHoldAtTime()` behavior fail, revisit spec and the responsible runtime step; do not declare completion on mocks alone.

Verification:

- Automated (root): `pnpm --filter @web-audio/schema test:ci`, `pnpm --filter @web-audio/fluid test:ci`, `pnpm --filter @web-audio/audio-engine test:ci`, `pnpm --filter @web-audio/fluid build`, `pnpm --filter @web-audio/audio-engine build`, `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm exec prettier --check plans/effects-chain/simple-ducking/{spec,plan}.md packages/{schema,fluid,audio-engine}/src`, `git diff --check`. Expect all new duck cases and unchanged routing/sampler/synth cases to pass; format only modified files if the whole-tree check finds unrelated drift.
- Manual: Human-access/browser audio gate described above. Do **not** run `dev` to set it up without the user's permission; a pre-existing preview or approved launch method is required. Automated fake nodes cannot replace this gate.

- [ ] Completion gate: AC1–AC10 all have test/manual proof (outside this plan), doc examples match the delivered API, workspace verification is green or material deviations are documented without claiming a pass, and audible acceptance is recorded before declaring the feature complete.

- [ ] Phase exit gate: After Step 3.1 checks, review the final acceptance mapping against the actual revision in `progress.md`. Do not call the PR ready for release while the human audible gate is pending.

## Final acceptance

| Spec acceptance ID | Owning step / gate | Verification and expected result                                                         |
| ------------------ | ------------------ | ---------------------------------------------------------------------------------------- |
| AC1                | 1.1, Phase 1 exit  | Fluid/direct schema equivalence, forward references, required `{}`.                      |
| AC2                | 1.1, 2.3           | Path-specific rejection and engine last-valid-write.                                     |
| AC3                | 2.2, 2.3           | One trigger per resolved synth/sampler onset even when muted/unavailable.                |
| AC4                | 2.2, 2.3           | Chance-masked and empty bars emit none and dispatch none.                                |
| AC5                | 2.1, 2.2, 3.1      | Proportional immediate recovery and sampler pattern duration; audible spot check.        |
| AC6                | 2.1, 2.3, 3.1      | Zero depth no-op, overlapping/cross-bar hold-and-retrigger, no lift; audible spot check. |
| AC7                | 2.1, 2.3           | Post-effect duck node without output-gain/mute/send/destination changes.                 |
| AC8                | 2.3                | Within-bar chronological submission across instruments, not equal-time equivalence.      |
| AC9                | 2.1, 2.3, 3.1      | Stop/restart, retiring graph and new graph isolation; audible spot check.                |
| AC10               | 2.1, 2.3, 3.1      | Destruction ownership and honest user-facing limitations.                                |

## Rollback and recovery

- The required `ducks` schema field, Fluid serializers and all migrated graph writers/fixtures are one rollback unit (Step 1.1). Reverting just a serializer or schema type breaks the contract; revert together and recheck typed consumers.
- Runtime increments can be reverted in reverse dependency order (engine dispatch → trigger emission → bus automation) while retaining the canonical no-duck `{}` schema only if the feature has **not** been delivered to users. Revert the entire feature PR if public schemas already rely on ducking; no compatibility guarantee for partially shipped duck configs.
- Invalid `AudioEngine.update()` calls must preserve prior pending/active state; if commit or bar scheduling fails in a way the existing engine cannot roll back, do not claim transactional recovery. Reproduce, contain scope, and escalate a separate safety change rather than silently introducing a global graph-generation rewrite.

## Deferred checks and accepted deviations

- No deviations are pre-authorized; record any future accepted deviation and its rationale in `progress.md`. Browser audible verification requires permission for any new preview launch. SOW 7 analytical/sample-frame guarantees are explicitly out of scope, not test waivers.
