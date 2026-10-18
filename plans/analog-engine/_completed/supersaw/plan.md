# Saw-only unison implementation plan

## Status and governing source

- Governing spec: [spec.md](spec.md), amended for the agreed saw-only `"unison"` / `"uni"` direction; stable R1–R9 and AC1–AC10 govern this work.
- Delivery state: In progress. Phases 0–1 and the revised saw-only unison Step 2.1a are verified. The original supersaw-named Step 2.1 remains historical under its prior contract; its evidence is preserved, not treated as proof of the revised API/schema.
- Acceptance or release still pending: Native engine playback, real-time/performance review, individual recording approval, and final integration. Publication/deployment is not included.
- Blockers: No unresolved product decision. Browser/setup availability and access to a human listener are execution prerequisites, not assumed passing gates.

Step statuses are the authoritative execution record. A phase completes only after its step completion gates and integration exit gate pass. Task checkboxes are not verification. `Verified` means the scoped gate and required implementation review passed, not unrelated live acceptance or release. In supervised execution, manual approvals belong to extension state; concise evidence can link to them.

## Execution constraints

- Run commands from `/Users/andy/Documents/Development/web-audio`. Paths below are relative to that repository. The older worklet under `/Users/andy/Documents/Development/web-audio-examples/drome/` is read-only reference material.
- Preserve unrelated work, including the existing uncommitted original 2.1 implementation and evidence. Expected files describe scope, not permission for unrelated cleanup. No application changes are authorized by authoring this plan.
- No dependency installation, lockfile changes, app `dev` process, commits, pushes, publication, or deployment as an implicit step. If needed, obtain approval before the existing `pnpm --filter @web-audio/audio-regression browser:install` setup command; run installation and browser tests sequentially.
- Adopt spec assumptions A1–A5 as the execution baselines below, not newly invented user approvals. If evidence makes a baseline unsuitable, record the change and its reason before accepting recordings; escalate a material spec conflict rather than hiding it behind tests.
- Keep validation ordinary and local: reuse `validateDromeGraph()` and existing parameter validators. No new validation library, generic walker, engine registry, placeholder FM engine, or duplicated scheduler.
- Reuse existing tests for retained contracts. New proof is limited to processor behavior, the scheduled-source seam, typed/validated engine selection, source-parameter binding, and native integration. Do not reconstruct the removed broad pre-envelope parity/composition suites or introduce a large fake graph framework.
- Use the existing native renderer and reference updater. Preserve maximum error `1e-6`, RMS error `1e-7`, diagnostics, deadlines, and individual update safeguards. No bulk rebaseline or inferred listening approval.
- Keep evidence brief at each owning gate; add `evidence/<step-id>.md` only for material baseline/decision/reproducibility or approval details. Do not create empty reports, inline transcripts, or a second progress checklist.

### Agreed direction amendment and execution history

- Public API: `d.synth("unison")` / `d.synth("uni")` return a unison-specific builder, defaulting to sawtooth. Its `.type()` accepts only `"saw"` / `"sawtooth"`; other shapes are type errors and runtime rejections, never silently ignored settings. No public `"supersaw"` compatibility alias is required for this unshipped work.
- Additional unison waveforms are a separate SOW, including their DSP, type/schema expansion, validation, and listening acceptance. This revision adds no square/sine/triangle DSP, generic oscillator registry, or unused processor waveform switch.
- Keep this planning directory and the original Phase 0–1/Step 2.1 evidence paths. Those historical sections retain the names, tasks, commands, and then-current assumptions used for execution; in particular, their waveform-only A5 predates the revised engine/shape A5. Current public API/schema acceptance requires Step 2.1a; Step 2.2 must not start on the strength of the old 2.1 result alone.
- The verified saw processor/source implementation, source string export, and native adapter regression may keep their internal `Supersaw*` names. Rename public builder/schema symbols and current authoring tests where necessary, not every historical or DSP file mechanically. Do not discard the uncommitted 2.1 implementation or restart completed phases.

### Inspected seams and planning baselines

- **Builders:** Retain `packages/fluid/src/instruments/synthesizer.ts` as the concrete basic builder and the already-extracted shared synth base. Revise the uncommitted supersaw builder into a unison builder with saw-only `.type()`. Preserve fluent subtype returns; no compatibility re-export or placeholder engine class.
- **Schema:** Revised A5 baseline: preserve existing basic schemas without an `engine` field; use `engine: "unison"`, `waveform: "sawtooth"`, and the existing count/spread/width shapes for unison. A basic TypeScript variant may declare `engine?: never` for narrowing. Engine identity and waveform are distinct; `"uni"` canonicalizes to `"unison"`, and saw aliases canonicalize to `"sawtooth"`. Reject unknown engines, unsupported unison shapes, and the unshipped old `waveform: "supersaw"` variant rather than adding dual-format parsing. Keep the native/LFO waveform vocabulary unchanged.
- **Controls:** A1/A4: `.voices()` resolves rounded/clamped counts 1–8/default 7 at note-on; `.spread()` is ±cents/default 10 with a zero floor; `.width()` is 0–1/default 0.4. Full automation applies only to spread/width. No second gain argument or legacy semitone-span API.
- **MIDI contexts:** `MidiCc.getSchema()` requires a contextual range/default when a controller is not explicitly configured. Add two entries to its existing context table: spread `[0, 100]` cents/default 10, width `[0, 1]`/default 0.4, both linear. The CC preset is not a public cap on spread; explicit `.range()`/`.default()` continues to override it. This is a low-risk planning default, not a new mapping framework.
- **DSP:** Start with A2's `1 / sqrt(N)` compensation and A3's symmetric equal-power panning/deterministic varied phases. Use local deterministic phase initialization from stable musical event/voice identity, not LFO UUIDs, construction time, or shared pattern RNG. Protect frequency arithmetic before phase conversion; never use `frac(frequency / sampleRate)` to wrap out-of-band frequencies.
- **Source seam:** Phase 1's structural scheduled-source capability and saw worklet wrapper are retained. Native sources remain usable without wrappers, including buffer offsets. Preserve actual initial start/stop frames through `processorOptions`, derived from shared resolved envelope timing with aligned-frame conversion; do not regress to placeholders repaired through ports or duplicate ADSR calculations during the unison revision.
- **Modulation:** Reuse `_applyParamSchema()` and existing binding cleanups. Pass an explicit small list of source parameter bindings/LFO candidates rather than recursively discovering arbitrary engine configuration. Count remains a construction option, not a continuously connected AudioParam.
- **Packaging:** `packages/worklets` already bundles `?worklet` sources; `src/types/index.d.mts` is manually copied by its build. Runtime source and declaration exports must change together. Engine builds always bundle this package, so rebuild dependencies before native checks.
- **Existing fault injection:** Original Step 2.1 narrowed `audio-regression/src/__tests__/support/worklet-failures.ts` to the intended LFO registration instead of replacing every module. Preserve that fix while revising the engine surface; do not weaken production diagnostics or create another injector framework.
- Prior pre-envelope acceptance evidence is historical only. A fresh baseline is still required. Native tests use the current `withRenderer()` browser/origin/resource ownership; fake-node tests cannot establish audible quality or sample alignment.

## Phase overview and delivery boundary

| Phase | Outcome                                                                      | Dependencies                   | Exit gate                                                                                        |
| ----- | ---------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| 0     | Recorded unchanged baseline and concrete execution assumptions               | Existing checkout/toolchain    | Existing recordings unchanged; no unexplained baseline failure                                   |
| 1     | Tested processor/package surface and a narrow source lifecycle seam          | Phase 0                        | Processor and adapter proof; native/basic paths remain unchanged                                 |
| 2     | Revise the typed engine surface to saw-only unison and prove native playback | Phase 1 plus revised 2.1a gate | Both aliases/saw shape and all controls integrate; native proof passes; old recordings unchanged |
| 3     | Documented, auditioned, individually accepted delivery                       | Phase 2                        | Real-time review, approved new references, and final workspace/native gates                      |

Delivery boundary: One feature-complete PR. Steps are review boundaries, not separately promised releases; do not ship a builder/schema that the runtime cannot implement.

Atomic groups: Step 1.1's processor and worklet exports/declarations land together. Step 1.2's source contract and all current consumers land together. Original Step 2.1 and its completed Step 2.1a revision formed one uncommitted vertical slice: schema, builder aliases/shape setter, runtime dispatch/modulation, declarations, and affected tests were revised together. Revert schema/consumer changes together, never just their tag or fixtures. Final delivery keeps new cases/references and documentation consistent with the chosen DSP/API.

## Phase 0 — Establish the baseline

Outcome: Known existing behavior, protected reference bytes, and recorded execution assumptions.
Depends on: Existing checkout and approved local tooling.
Review boundary: Read-only inspection plus normal build/test artifacts; no production or accepted-reference edits.

### Step 0.1 — Record baseline and implementation assumptions

Status: Verified
Requirements / acceptance: R8–R9; baseline support for AC10, not supersaw acceptance.
Depends on: None.
Review boundary: Current revision/tooling/reference inventory and baseline checks only.

Expected files:

- No production or reference changes.
- Gate evidence here; optional `evidence/0.1.md` for the reference byte inventory, relevant environment details, or a consequential failure.

Tasks:

- [ ] Record the starting revision/worktree and protect unrelated changes; inventory existing case/reference WAV and metadata identities for final comparison.
- [ ] Confirm existing Node/pnpm/Chromium availability without installing anything. Record browser/version and any existing failures separately from feature regressions.
- [ ] Adopt the listed A1–A5/MIDI/seed baselines for execution; record any concrete incompatibility before affected code changes. Do not reopen the agreed feature scope.
- [ ] Build current dependency artifacts and run the existing relevant suites/reference verification without accepting new audio.

Verification:

```sh
pnpm --filter @web-audio/audio-regression build:deps
pnpm --filter @web-audio/worklets test:ci
pnpm --filter @web-audio/schema test:ci
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/audio-regression audio:verify
```

Automated proof: Existing code/tests build and existing authored recordings match their reviewed references at unchanged limits. Check the reference inventory and worktree again afterward; no reference update occurs.
Manual: Review assumptions against the current source and record blockers honestly. An unavailable browser/setup prerequisite blocks the relevant gate; it is not a waived test. No new listening approval is needed for numerically unchanged baseline recordings.

Completion gate: Reproducible baseline with untouched reference bytes and no unexplained failures affecting this work.
Evidence: [evidence/0.1.md](evidence/0.1.md).

Phase exit gate: After Step 0.1, review the baseline and assumption record before production work or supervised advancement. A pre-existing failure is not automatically an accepted deviation.
Evidence: [evidence/0.1.md](evidence/0.1.md).

## Phase 1 — Deliver the processor and lifecycle seam

Outcome: A bounded processor with verified DSP/time behavior and a worklet source that fits current voice ownership without changing native playback.
Depends on: Phase 0 exit gate.
Review boundary: Internal processor/package/source capabilities only; no supersaw builder or schema exposed yet.

### Step 1.1 — Implement and bundle the supersaw processor

Status: Verified
Requirements / acceptance: R3, R5–R6, R9; AC4/AC5 (processor portion), AC6 (source-time gating portion), AC9 (deterministic DSP portion). Actual engine/native/listening proof remains Steps 2.1–3.1.
Depends on: Step 0.1 and Phase 0 exit gate.
Review boundary: Saw stack, bounded controls, deterministic phases, sample-frame gating, and bundled package surface; not engine scheduling or new authoring APIs.

Expected files (new paths are proposed, not existing):

- `packages/worklets/src/processors/supersaw-processor.ts` — processor.
- `packages/worklets/src/processors/__tests__/supersaw-processor.test.ts` — focused processor tests; tiny local support only if needed.
- `packages/worklets/src/index.ts`, `src/types/index.d.mts` — paired `supersawProcessorSource` exports.
- Optional small production DSP helper under `src/utils/` if it simplifies actual processor math; do not expose internals solely for testing or rewrite the LFO processor/test framework.

Tasks:

- [x] Implement 1–8 fixed-count saws with symmetric cents offsets, one-oscillator centering, symmetric equal-power pan positions, count compensation, and deterministic varied phases. Include safe phase/frequency arithmetic and bounded allocation.
- [x] Handle constant/audio-rate frequency, common detune, spread, and width values; apply their resolved bounds. Avoid hot-loop allocation and unnecessary repeated scalar work without introducing a general DSP optimizer.
- [x] Implement audio-frame start/stop gates and one terminal completion notification. Preserve full-precision scheduled frame boundaries rather than relying on Float32 timestamp rounding; gate silence independently of main-thread notification delivery. No timers or whole-block start skip.
- [x] Test a small discriminating set: counts 1/2/7/8, ±12-cent endpoints, zero width, odd/even pan symmetry, gain-law application, finite extreme values, band-limited wrap correction, deterministic phases, and intra-quantum start/stop/termination. Reuse the current worklet stub approach with a small per-test port/global capture, not a general fake renderer.
- [x] Export the bundled source and copied declaration together; preserve existing LFO exports and verify the built package entry point. Do not register/use supersaw in production engine readiness until Step 2.1.

Verification (new test becomes runnable only when this step creates it):

```sh
pnpm --filter @web-audio/worklets exec vitest run src/processors/__tests__/supersaw-processor.test.ts
pnpm --filter @web-audio/worklets test:ci
pnpm --filter @web-audio/worklets check
pnpm --filter @web-audio/worklets lint
pnpm --filter @web-audio/worklets build
pnpm --filter @web-audio/worklets exec node --input-type=module -e 'import { lfoProcessorSource, supersawProcessorSource } from "@web-audio/worklets"; if (![lfoProcessorSource, supersawProcessorSource].every(s => typeof s === "string" && s.length > 0)) throw new Error("Missing processor source export");'
```

Automated proof: The real processor math/gates behave under controlled worklet globals; the built root exports both strings. Import/string checks alone do not prove DSP or browser registration.
Manual: Review numerical bounds, compensation/pan math, local phase seed use, terminal notification, and absence of per-sample allocation. Acoustic acceptance is deferred, not inferred.

Completion gate: Processor tests, type/lint/build, and built-entry checks pass together with no unsupported public API or changed LFO behavior.
Evidence: [evidence/1.1.md](evidence/1.1.md).

### Step 1.2 — Fit worklet completion into shared voice ownership

Status: Verified
Requirements / acceptance: R2, R6, R8; AC6/AC7 (adapter ownership portion). Actual supersaw dispatch and engine composition remain Step 2.1; native timing remains Step 2.2.
Depends on: Step 1.1.
Review boundary: Narrow source capability and its consumers; keep native synth/sampler behavior and public schema unchanged.

Expected files:

- `packages/audio-engine/src/types.ts`, `src/instruments/instrument.ts` — minimal scheduled-source capability, retaining buffer offset handling.
- `packages/audio-engine/src/instruments/sources/supersaw-source.ts` — proposed small wrapper around a real `AudioWorkletNode`, constructed only when used.
- `packages/audio-engine/src/instruments/sources/__tests__/supersaw-source.test.ts` — proposed focused adapter tests with a tiny local node/port fake.
- `packages/audio-regression/src/__tests__/supersaw-source.test.ts` — small native initial-schedule regression using the actual adapter and bundled processor.
- Existing instrument/source tests only where their type assertions directly consume the revised capability; no broad fixture/framework rewrite.

Tasks:

- [x] Replace the native-only source assumption with just the operations the common voice path uses. Native oscillators/buffer sources remain usable without a new wrapper per existing source type; buffer `.start(when, offset)` must retain its current path.
- [x] Add a supersaw source wrapper exposing frequency/detune/spread/width parameter targets and translating start/stop into the processor's audio-frame schedule. Count/seed are fixed construction data; no continuously modulated count parameter.
- [x] Adapt completion to the existing voice callback/cleanup path without pretending the node is an `AudioScheduledSourceNode`. No top-level inheritance from a browser-only constructor, wall-clock lifecycle timer, or general event/engine registry.
- [x] Cover completion, stop rescheduling, immediate/future cancellation before processing, ignored duplicate/late notifications, idempotent disconnect/destruction, and port/listener cleanup in the small adapter test. Preserve active Stop and retirement semantics in shared code; use existing suites for their broader contract.

Verification:

```sh
pnpm --filter @web-audio/audio-engine exec vitest run src/instruments/sources/__tests__/supersaw-source.test.ts src/instruments/instrument.test.ts src/instruments/synthesizer.test.ts src/instruments/sampler.test.ts src/instruments/__tests__/pre-envelope-effects.test.ts
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
```

Automated proof: Adapter ownership and scheduled-source compatibility, not native worklet execution. Existing source timing/output/lifecycle assertions continue to pass without unsafe casts to the native scheduled-source class.
Manual: Review every `sourceNode`, `_scheduleVoice`, cancellation/destruction, and offset consumer of the changed capability. Ensure the wrapper's callback cannot complete another voice and import-time behavior remains safe in the existing Node tests.

Completion gate: The new seam and all current consumers remain buildable, with focused adapter tests and existing native-source tests passing. Supersaw remains internal until its vertical slice is complete.
Evidence: [evidence/1.2.md](evidence/1.2.md).

Phase exit gate: After Step 1.2 checks, run the full audio-engine suite, rebuild native dependencies, and run `audio:verify`. All existing recordings must retain their Phase 0 bytes and match at unchanged limits. No supersaw references or expanded schema are needed to pass this gate.

```sh
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/audio-regression build:deps
pnpm --filter @web-audio/audio-regression audio:verify
```

Evidence: [evidence/1.2.md](evidence/1.2.md).

## Phase 2 — Integrate typed authoring and prove native playback

Outcome: The complete saw-only unison authoring/schema/runtime path works, including both aliases, explicit supported shape selection, automation, and voice ownership, while existing audio remains unchanged.
Depends on: Phase 1 exit gate.
Review boundary: Revise the existing uncommitted two-engine slice atomically, then perform focused native integration; no other unison waveforms or new validation infrastructure.

Step 2.1 below records the original verified supersaw slice. Its old public names, discriminator choice, and commands are historical; Step 2.1a supplies the current revision work and must be verified before Step 2.2.

### Step 2.1 — Deliver the original two-engine vertical slice

Status: Verified (historical supersaw direction; revised acceptance requires Step 2.1a)
Requirements / acceptance: R1–R4, R6–R8; AC1/AC2, AC3 (binding/resolution portion), AC7 (shared-path composition portion), AC8 (registration/event portion). Acoustic portions remain Step 2.2 and final listening is Step 3.1.
Depends on: Step 1.2 and Phase 1 exit gate.
Review boundary: Schema, builder overloads, source selection, modulation, readiness, and affected consumers change together. Do not finish this step with accepted-but-ignored automation.

Expected files:

- `packages/schema/src/index.ts`, `validate-graph.ts`, `validate-graph.test.ts` — small variants/validation; basic waveform constants remain basic.
- `packages/fluid/src/drome.ts`, `instruments/synthesizer.ts`, proposed `instruments/synth-base.ts` and `instruments/supersaw-synthesizer.ts`, `midi/builders.ts` — shared behavior, typed factory, controls and existing CC contexts.
- Proposed `packages/fluid/src/instruments/__tests__/supersaw.test.ts` — compact authoring/type assertions. Existing MIDI/builder/schema tests may host representative additions instead of another large suite.
- `packages/audio-engine/src/instruments/synthesizer.ts`, `instrument.ts`, `index.ts` — explicit source selection, source parameter bindings/LFO candidates, and module readiness.
- Existing `packages/audio-engine/src/instruments/synthesizer.test.ts` and `src/test-utils/schema-fixtures.ts` — focused supersaw scheduling/binding/event assertions and narrowly typed native fixtures as needed. Reuse current fakes; do not duplicate an entire graph harness.
- `packages/audio-regression/src/__tests__/support/worklet-failures.ts` — target its existing LFO fault injection instead of replacing both modules; retain its existing failure/recovery test.
- Other existing consumers only when required to keep this discriminated union/build surface valid; inspect before editing. No mass source renaming or compatibility barrels.

Tasks:

- [x] Define basic/supersaw schema variants under the existing `waveform` tag and retain existing basic shapes. Reuse validators for count/AudioParam structures; add small checks for missing controls, invalid engine/count modulation, nonfinite inputs, and known wrong-engine settings. Do not add a global unknown-key policy or static range analyzer.
- [x] Extract only common synth event/MIDI/schema behavior, preserve the existing concrete basic builder/import path and `.type()` restriction, and add the supersaw builder. Overloads cover default/basic/supersaw and selector unions; shared fluent calls retain the subtype. Keep supersaw out of LFO aliases and reject unsupported runtime selectors before playback.
- [x] Implement controls/default serialization through current `Parameter`/automation builders, including the two CC contexts above. Add a few positive/negative type assertions, schema examples, and finite-bound/count-modulation cases rather than a new validation test framework.
- [x] Select native versus wrapped supersaw sources inside the existing synth scheduler. Resolve count by final hit once per note; derive a stable local phase seed from musical event/voice identity. Before constructing the worklet, obtain its actual initial start/stop frames from the shared resolved voice/envelope schedule, including release and the existing stop margin or explicit override. Supply those bounds through `processorOptions`, using consistent aligned-frame conversion—not placeholder bounds later repaired through MessagePort messages. Reuse the shared envelope/timing calculation rather than duplicating ADSR math in the supersaw branch. Keep base frequency, common detune, shared effects → ADSR, MIDI velocity/note count, and duck trigger count unchanged.
- [x] Feed explicit spread/width bindings and LFO candidates into the existing parameter/lifecycle helpers, sharing repeated LFO identities and neutralizing intrinsic offsets. Cover representative patterned/random count, shared LFO/envelope/CC source controls, chord isolation, and independent cleanup. Retire an effected supersaw instrument while another remains active and confirm completion waits only for its own voices; reuse existing engine replacement tests rather than recreating the routing suite.
- [x] Register the new bundled module through engine readiness and update the narrow fault-injection consumer to target only LFO module bytes. Test readiness rejection and invalid-update preservation without silent fallback. Update all union/declaration/mock consumers atomically and build both public packages.

Verification (proposed new test path is available only after this step adds it):

```sh
pnpm --filter @web-audio/schema test:ci
pnpm --filter @web-audio/schema check
pnpm --filter @web-audio/schema lint
pnpm --filter @web-audio/fluid exec vitest run src/instruments/__tests__/supersaw.test.ts src/__tests__/midi-integration.test.ts
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-regression build:deps
pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/worklets.test.ts
pnpm check
```

Automated proof: Supported authoring is correctly typed/serialized/validated, runtime binding/ownership uses the real scheduling path, package consumers/declarations build, and existing native diagnostic failure/recovery still works with multiple modules. Fake source assertions do not prove supersaw sound or sample alignment.
Manual: Inspect the atomic diff for ignored settings, duplicated scheduling/ADSR, expanded LFO waveform vocabulary, extra event emissions, or validation/framework growth. Verify the focused scheduling assertions check constructor frame bounds against the shared resolved envelope/source-stop schedule, not merely that later port messages contain matching timestamps. Inspect the built public Fluid declarations for engine-specific overloads/return types; negative type assertions must be type-checked without accidentally executing unsupported calls. Search remaining imports/consumers before removing any superseded code; the old external repository is not a migration target.

Completion gate: Complete—not placeholder—authoring/schema/runtime support for all agreed input modes, preserved basic consumers, passing scoped checks, and no hidden fallback or unsupported setting. The new control path must not depend on Step 2.2 to implement missing behavior.
Evidence: [evidence/2.1.md](evidence/2.1.md).

### Step 2.1a — Revise the uncommitted slice to saw-only unison

Status: Verified
Requirements / acceptance: R1–R4, R7–R9; AC1/AC2 (revised API/schema), AC3/AC7/AC8 (retained binding/dispatch ownership), AC10 (compatibility portion). Full native engine proof and listening remain Steps 2.2/3.1.
Depends on: Verified original Step 2.1 and the agreed unison amendment.
Review boundary: Adapt existing uncommitted code and its tests; retain the verified saw DSP/source seam. No application changes have been made merely by updating these planning documents.

Expected files:

- `packages/fluid/src/drome.ts`, `inputs/waveform.ts`, proposed `instruments/unison-synthesizer.ts` — unison/uni overloads and saw-only shape setter. Replace the uncommitted `instruments/supersaw-synthesizer.ts` after its revised consumer path is validated; retain shared/basic builders.
- Proposed `packages/fluid/src/instruments/__tests__/unison.test.ts` — revise/rename the existing uncommitted supersaw authoring/type test rather than adding a parallel suite.
- `packages/schema/src/index.ts`, `validate-graph.ts`, `validate-graph.test.ts` — small unison discriminator/shape variant and targeted validation.
- `packages/audio-engine/src/instruments/synthesizer.ts`, related fixture/type consumers and existing scheduling assertions — dispatch by engine identity rather than treating the shape as an engine name.
- Existing readiness/module-fault handling and MIDI contexts only if the revised symbols require an adjustment; no processor rename or extra source factory framework is required.

Tasks:

- [x] Revise factory selectors to `"unison"` / `"uni"` and expose a unison builder. Add `.type()` restricted to saw aliases with immediate runtime rejection of unsupported shapes. Preserve shared-method subtype returns and all existing basic `.type()` behavior. Do not keep a public `"supersaw"` alias or a forwarding builder shim.
- [x] Separate engine and shape in the canonical schema using the revised A5 baseline. Default/explicit saw and both aliases serialize equivalently. Validate only `engine: "unison"` plus `waveform: "sawtooth"` for this engine; reject square/sine/triangle, unknown tags, and old supersaw-shaped direct schemas. Existing basic schemas remain valid without a migration/parser layer.
- [x] Adapt runtime narrowing/source dispatch and source-parameter discovery to the new engine tag. Reuse the same saw worklet, count/spread/width implementation, shared effects/ADSR, MIDI/duck behavior, and deterministic phase identity. Retain the actual constructor schedule from shared envelope timing; no unsupported waveform DSP or ignored generic waveform option.
- [x] Revise the focused existing type/authoring/schema/scheduling assertions: both selectors, default versus explicit saw, rejection of other shapes/old selectors, unchanged basic builders/LFOs, and retained constructor bounds/automation. Rename or remove obsolete uncommitted public-name consumers after the revised path is proven; do not duplicate tests or rename historical/internal saw artifacts mechanically.
- [x] Rebuild public declarations and rerun the slice's relevant gates below. Record current results at this gate (optional `evidence/2.1a.md` for material revision details), preserving original `evidence/2.1.md` as prior-contract evidence. Do not mark this revision verified from the old supersaw results.

Verification (new test path replaces the uncommitted supersaw authoring test only when revised):

```sh
pnpm --filter @web-audio/schema test:ci
pnpm --filter @web-audio/schema check
pnpm --filter @web-audio/schema lint
pnpm --filter @web-audio/fluid exec vitest run src/instruments/__tests__/unison.test.ts src/__tests__/midi-integration.test.ts
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-regression build:deps
pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/worklets.test.ts src/__tests__/supersaw-source.test.ts
pnpm check
```

Automated proof: Both aliases yield the same properly typed/validated saw-only unison configuration, unsupported shapes fail, and existing binding/source scheduling tests remain valid under the new discriminator. The retained native adapter test protects initial scheduling; it is not the full engine-native proof owned by Step 2.2.
Manual: Inspect generated declarations, JS error paths, schema dispatch, and remaining old public-name consumers. Internal `SupersawSource`/processor exports and historical evidence are allowed; no compatibility registry or other-waveform fallback is introduced.

Completion gate: The revised uncommitted slice is coherent/buildable and its fresh checks pass, with unchanged basic authoring, source scheduling, automation, and lifecycle. Only then may Step 2.2 advance under the amended spec.
Evidence: [evidence/2.1a.md](evidence/2.1a.md).

### Step 2.2 — Prove actual worklet timing, stereo, and repeatability

Status: Verified
Requirements / acceptance: R3–R6, R8–R9; AC3–AC8 (native portions), AC9 (automated portion), AC10 (unchanged recording portion). Human approval/documentation remain Step 3.1.
Depends on: Steps 2.1 and 2.1a, both verified for their stated scopes.
Review boundary: Existing native harness with a small saw-only unison test module and musical review material; no new rendering framework or accepted-reference writes.

Expected files:

- `packages/audio-regression/src/__tests__/unison.test.ts` — real Fluid/AudioEngine native tests using `withRenderer()` and the revised unison/uni API.
- No additional test-local helper was needed.
- `packages/audio-regression/cases/unison/{sketch.js,metadata.json}` — one short saw-only diagnostic case with static/modulated passages; no accepted reference pair.
- No accepted reference pairs yet and no harness/default-tolerance changes.

Tasks:

- [x] Render real saw-only unison output at 44.1/48 kHz with non-quantum-aligned timing, using both aliases and default/explicit saw selection in focused fixtures. Extend the focused native proof to confirm the integrated engine supplies the correct constructor schedule and initial start/stop behavior does not depend on delivery of port schedule messages; reuse the existing adapter regression rather than creating another harness. Show audio begins in the intended partial quantum rather than the following block, finite output and zero source-outside-lifetime behavior, and a nonempty post-release observation window before scheduled cleanup. Processor unit tests own exact source gating; the voice envelope must not be mistaken for proof that a processor terminated.
- [x] Exercise centered/nonzero stereo width and native mono downmix, count/detune effects, and evolving spread/width through existing automation. Use DSP unit expectations plus a few native signal properties; do not build a second supersaw renderer just to duplicate its algorithm or require equality to native saw DSP.
- [x] Check repeatable fresh renders with stable phase identity and no ambient randomness. Retain existing browser/resource diagnostics/deadlines and close any additional owned contexts on success/failure. Reuse the existing real-time/native browser seams for a small `AudioContext` smoke when practical; no production test hooks or new public engine exports.
- [x] Add diagnostic musical material for default and two-saw sounds, count compensation, spread/width movement, and high notes. Give it adequate attack/release/tail coverage and render it twice before asking for listening approval. Keep temporary synthetic tooling fixtures separate from authored cases.
- [x] Reverify all Phase 0 recording IDs unchanged. New cases intentionally have no accepted references yet; missing-new-reference failures are expected and must not hide any existing-case mismatch or native diagnostic failure.

Verification:

```sh
pnpm --filter @web-audio/audio-regression build:deps
pnpm --filter @web-audio/audio-regression exec vitest run src/__tests__/unison.test.ts
pnpm --filter @web-audio/audio-regression test
pnpm --filter @web-audio/audio-regression check
pnpm --filter @web-audio/audio-regression lint
pnpm --filter @web-audio/audio-regression audio:render --case unison
```

Repeat the focused native command and diagnostic render in fresh processes. For existing references use the current `audio:verify --case <existing-id>` selector against the Phase 0 ID inventory; alternatively run full read-only verification and explicitly classify only missing new references. The new native tests and diagnostic case are intentionally reference-free.

Automated proof: Both unison selectors and the saw-only shape reach the real processor through the engine; default/explicit saw agree, deterministic settings reproduce, stereo/mono paths remain finite, and existing recordings are unchanged. A copied signal algorithm or fake-node graph is not native acoustic proof.
Manual: Review the native assertions' sample windows and actual compared data. Timing/suppression checks must reject empty or truncated windows, not reduce an empty slice to a passing zero. Musical and device-performance approval remain pending.

Completion gate: Native saw-only unison proof passes in fresh runs, existing references retain their bytes/output, diagnostic material is reproducible, and all resources close without weakened safeguards. No new reference is accepted yet.
Evidence: [evidence/2.2.md](evidence/2.2.md).

Phase exit gate: After Step 2.2 checks, rebuild dependency artifacts and run relevant package checks/tests together; review the atomic schema/consumer/source path plus native diagnostics. No existing recording may differ unexplained. New missing references are explicitly pending Step 3.1, not a green full-registry claim.

```sh
pnpm --filter @web-audio/worklets test:ci
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/audio-regression test
pnpm check
```

Evidence: [evidence/2.2.md](evidence/2.2.md).

## Phase 3 — Document, audition, and accept delivery

Outcome: User-facing engine/control boundaries are documented, real-time behavior and performance are reviewed, and individually accepted saw-only unison references integrate without changing old audio.
Depends on: Phase 2 exit gate.
Review boundary: Documentation, explicit human/device review, approval-gated new reference pairs, and final integration only.

### Step 3.1 — Accept the sound and integrate the complete feature

Status: Verified
Requirements / acceptance: R1–R9; AC9 (human/reference portion), AC10 (documentation/final integration), AC5/AC8 (real-time quality/performance portion). Earlier gates own core/type/DSP/lifecycle proof.
Depends on: Step 2.2 and Phase 2 exit gate.
Review boundary: No feature expansion or automatic rebaseline. A sound/DSP change discovered here returns to its owning implementation/native checks before approval.

Expected files:

- `packages/fluid/README.md`, `plans/analog-engine/roadmap.md` — engine-specific builder behavior, supported inputs/defaults, units/bounds/normalization caveats, and relevant links. Repair the moved pre-envelope link only as part of these touched feature links.
- `packages/worklets/README.md` only if a concise package-level explanation is needed; it is not a prerequisite to create a new documentation hierarchy.
- `packages/audio-regression/references/unison/{render.wav,metadata.json}` — individually approved reference pair.
- Concise gate evidence; optional `evidence/3.1.md` for device/profile settings, per-recording attribution/approval linkage, or consequential DSP choices. No raw WAV logs attached to the plan.

Tasks:

- [x] Document basic versus unison overloads, canonical `"unison"` / `"uni"` alias, default/explicit saw-only `.type()`, and engine versus waveform identity. Include `.voices()` versus musical polyphony, cents spread versus width, modulation versus frozen count, MIDI contexts, bounds, phase intent, and normalization limits. Other unison waveforms require a separate SOW; do not imply FM, sub/noise, new gain arguments, a supersaw compatibility alias, or a plugin API exist.
- [x] Audition the reproducible diagnostic recordings and real-time engine playback on a recorded browser/device. Compare default, one/two/eight oscillators, mono/stereo, modulation, attacks/releases, and high notes; inspect representative overlapping notes (for example eight notes × eight saws) for obvious glitches or unacceptable CPU cost. Record workload and limitations; no cross-device performance guarantee is claimed. The user reported manual testing was satisfactory; no cross-device guarantee is claimed.
- [x] Complete the real-time/manual check using the existing project context; no new demo or harness was created. The user supplied the human manual-testing approval, and musical WAV review used the existing diagnostic artifact; no cross-device guarantee is claimed.
- [x] Record individual listener approval for each exact candidate; command success is not approval. The user reported feeling good about manual testing and approved the exact unison candidate. No compensation, panning, or phase adjustment was requested.
- [x] After approval, update exactly the approved case with the existing updater and reverify it. Confirm the freshly generated output matches the reviewed candidate. Existing WAV/metadata identities were left unchanged; no structural regression was hidden by rebaselining.
- [x] Run final integration/format/diff checks after the last approved reference update, inspect the feature-complete diff, and close the acceptance map. Keep requirements/assumptions/evidence honest; the roadmap is marked delivered only after the required gates.

Verification:

After each individual approval:

```sh
pnpm --filter @web-audio/audio-regression audio:update --case unison
pnpm --filter @web-audio/audio-regression audio:verify --case unison
```

Final integration:

```sh
pnpm check
pnpm lint
pnpm test
pnpm exec prettier --check plans/analog-engine/supersaw/{spec,plan}.md
git diff --check
```

Also check Prettier on every modified code/document/metadata file using explicit final-diff paths, excluding WAV binaries. `pnpm test` builds dependency artifacts and runs a fresh full native registry via uncached audio-regression `test:ci`; other workspace tasks may use valid Turbo caches. This does not replace human review or real-time profiling.

Completion gate: Earlier proofs remain green, required real-time/listening evidence is present, every new reference is individually approved, old reference bytes are untouched, the full registry passes with unchanged limits, and final documentation/API claims match delivery. No publication/deployment is implied.
Evidence: [evidence/3.1.md](evidence/3.1.md).

Phase exit gate: After Step 3.1's final checks, review acceptance evidence against the final revision. No pending human gate, missing reference, unexplained acoustic change, unowned worklet, or stale scope claim may be hidden by successful unit tests.
Evidence: [evidence/3.1.md](evidence/3.1.md).

## Final acceptance

This table points to the owning gates; it is not a second execution checklist. Saw-only unison acceptance is complete. Step 2.1's original evidence remains historical; the revised surface and retained dispatch/binding behavior are covered by Step 2.1a evidence.

| Spec acceptance ID | Owning step / gate            | Verification and expected result                                                                                                                 | Evidence / status      |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| AC1                | Step 2.1a                     | Unison/uni yield the same fluent builder; saw-only shape selection and unsupported-method/selector rejection are correctly typed.                | Step 2.1a; Verified    |
| AC2                | Step 2.1a                     | Engine/shape variants validate without broadening LFO waveforms or invalidating basic schemas; unsupported unison shapes/old supersaw tags fail. | Step 2.1a; Verified    |
| AC3                | Steps 2.1a and 2.2            | Final-hit count resolution, frozen count, and source automation retain their semantics under the revised discriminator and native output.        | Owning steps; Verified |
| AC4                | Steps 1.1 and 2.2             | Saw DSP offsets/panning/count edge cases and native stereo/mono behavior agree with the contract.                                                | Owning steps; Verified |
| AC5                | Steps 1.1, 2.2, and 3.1       | Bounded finite saw DSP, applied compensation, and reviewed levels/high-note quality/performance.                                                 | Owning steps; Verified |
| AC6                | Steps 1.1, 1.2, and 2.2       | Frame gates, constructor scheduling, cancellation/completion ownership, and non-quantum-aligned native onset/stop behave correctly.              | Owning steps; Verified |
| AC7                | Steps 1.2, 2.1a, and 2.2      | Independent shared-pipeline ownership, parameter cleanup, stereo preservation, and retirement compose after the revision.                        | Owning steps; Verified |
| AC8                | Steps 2.1a, 2.2, and 3.1      | Module readiness/failure behavior, musical event counts, native registration, and real-time unison playback are proven.                          | Owning steps; Verified |
| AC9                | Steps 1.1, 2.2, and 3.1       | Deterministic native saw-only unison output plus individually approved recordings at unchanged limits.                                           | Owning steps; Verified |
| AC10               | Steps 0.1, 2.1a, 2.2, and 3.1 | Existing audio/reference bytes remain unchanged; documentation explains aliases, saw-only shape selection, and the separate future waveform SOW. | Owning steps; Verified |

## Rollback and recovery

- There is no external persisted-data migration or irreversible publication step. Keep the existing basic schema shape as planned; no dual-format compatibility parser is needed.
- Revert the combined Steps 2.1/2.1a schema/builders/runtime/fault-injection consumers together. Do not leave a union variant accepted by authoring/validation but unsupported in playback. The internal processor/source capability increments may be reverted independently only when no consumer remains.
- Before deleting/replacing existing builder/source code, verify the new consumer path and search remaining imports. Preserve native test fixtures and default behavior; do not replace legitimate runtime tests with mocks that bypass the new seam.
- Revert new cases/references and documentation with the corresponding delivered DSP/API. Never rewrite or remove unrelated reviewed recordings. If a selected reference update partially writes its WAV/metadata pair, restore only that pair from its known prior state, investigate, and retry through the existing updater.
- A failed render, lost browser prerequisite, unacceptable sound, or missing listener leaves its gate Blocked. Fix the cause and rerun the owning gate; obtain renewed approval whenever the candidate sound changes. Do not call an unperformed check a passing or accepted-deviation gate.

## Deferred checks and accepted deviations

- No accepted deviations. Completed evidence is recorded at the owning step.
- Browser installation, app startup, and human/device access require separate approval/access when unavailable. These are execution prerequisites, not silent waivers or permission to launch workflows during planning.
- Non-saw unison waveforms (including their DSP/type/schema/validation/listening work) require a separate SOW. Engines beyond basic/unison, sub/noise/gain APIs, new effects, live count modulation, public seed controls, automatic dynamics/voice stealing, generalized failure recovery, and bigger validation/testing frameworks remain deferred as specified.
