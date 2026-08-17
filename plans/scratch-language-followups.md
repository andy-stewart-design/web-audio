# Scratch Language Follow-ups

## Context

This document tracks all remaining work from [`scratch-language-plan.md`](scratch-language-plan.md) that was not implemented in the current pass.

The completed work includes patterned random bars and chance, binary random-note semantics, dynamic `xox()` masks, relative sampler duration, sampler direction, reversed-buffer preparation, alternate-direction state, click-free sampler gating, transport-stop cleanup, and non-mono click-regression coverage.

The remaining work is grouped here so the original implementation plan can remain an architectural and historical reference.

## Remaining-work summary

- [ ] Design and implement monophony for samplers and synthesizers together.
- [ ] Add patternable instrument nudge.
- [ ] Add conventional bar-level swing.
- [ ] Add the revised scratch-language integration fixture without monophony.
- [ ] Update public documentation and examples.
- [ ] Align the raw Web Audio scratch demo and explanatory page.
- [ ] Run complete repository verification.
- [ ] Complete manual browser and audio verification.
- [ ] Reconcile the final implementation with the PRD.

---

## 1. Unified instrument monophony

Monophony was removed from the current implementation scope. It should be designed as a coherent capability across samplers and synthesizers rather than adding a sampler-only public API first.

### Shared public semantics to decide

- Whether `.mono()` belongs on the base instrument API or is exposed separately with equivalent syntax on each instrument.
- Default behavior; existing instruments must remain polyphonic unless explicitly configured otherwise.
- `.mono()` and `.mono(false)` serialization and call-order behavior.
- Whether monophony applies per instrument instance only.
- Retrigger behavior when consecutive events resolve to the same pitch or source.
- Note-priority behavior when multiple notes occur at the same grid position.
- How active voices behave across bars, transport stop/restart, retirement, and destruction.
- How random-mask misses, unavailable samples, rests, and zero-duration events affect active voices.
- Whether release behavior is fixed to the resolved gain envelope or eventually configurable.

### Sampler implementation questions

- Fade and stop the previous `AudioBufferSourceNode` without introducing clicks.
- Define replacement behavior for one-shots, clipped samples, fitted chops, and loops.
- Preserve polyphonic overlap when monophony is disabled.
- Do not choke an active voice for suppressed, unavailable, or zero-duration events.
- Keep alternate direction hit-aware: only a newly emitted voice advances direction.
- Ensure source gain reaches exact zero before the source is stopped and disconnected.

### Synthesizer implementation questions

- Define note-priority and voice-stealing rules.
- Decide whether repeated notes retrigger oscillators, envelopes, or both.
- Define legato versus full-retrigger behavior.
- Handle polyphonic note inputs that resolve at one grid position.
- Release or replace oscillator voices without corrupting MIDI bindings, effects, or instrument completion.
- Specify how monophony interacts with externally controlled or sustained notes.

### Shared internal architecture

Sampler and synthesizer monophony will probably require separate replacement logic:

- samplers fade and stop buffer-source voices, including looped sources;
- synthesizers release or steal oscillator voices according to note semantics.

Extract shared tracked-voice or idempotent-cleanup utilities only after both implementations demonstrate genuinely common requirements. Do not force instrument-specific behavior into one abstraction merely to share code.

### Required coverage

- Public schema and Fluid API tests for both instrument types.
- Polyphonic-by-default compatibility tests.
- Same-pitch and different-pitch retrigger tests.
- Simultaneous-note priority tests for synthesizers.
- One-shot, clipped, fitted, and looped sampler replacement tests.
- Chance gaps, rests, unavailable buffers, and zero-duration sampler events.
- Replacement across bars and after transport restart.
- Exact-zero gain before sampler source stop.
- Automation hold/cancellation before replacement ramps.
- Retirement, cancellation, destruction, MIDI cleanup, and `finished` behavior.
- Focused browser listening tests; unit tests should enforce scheduling invariants without claiming perceptual quality.

### Integration work deferred with monophony

When unified monophony is implemented:

- add `.mono()` back to the complete scratch-language expression;
- add schema integration assertions for monophony;
- document defaults, scope, and retrigger semantics;
- add demo terminology and examples;
- restore mono-specific manual verification;
- add mono-replacement coverage to the click-regression suite.

---

## 2. Patternable nudge

Add a step-addressed onset offset to all instruments.

### Public API and schema

Expose on the base Fluid instrument:

```ts
nudge(...input: CycleInput)
```

Requirements:

- Store nudge as a `ParameterSchema` on `InstrumentSchema`.
- Default to static `0`.
- Accept static patterns and `RandomCycle`.
- Measure values as fractions of the final rhythmic step duration.
- Validate static values as finite and within `-0.5–0.5`.
- Validate configured random ranges where statically knowable and clamp defensively in the engine.
- Expose the same semantics on samplers and synthesizers.
- Keep onset nudge distinct from sampler source offset.

### Engine timing

Introduce a shared onset-timing resolver using:

- absolute bar index and bar start time;
- original grid offset and step index;
- final note duration after rhythmic transforms;
- resolved nudge and, later, swing.

For nudge-only scheduling:

```text
nudgeSeconds = resolvedNudge * finalStepDurationSeconds
startTime = clamp(gridTime + nudgeSeconds, barStart, barEnd)
```

Requirements:

- Resolve nudge at the original `barIndex` and `stepIndex`.
- Apply it after `fast`, `slow`, and `stretch` have established final step duration.
- Shift onset without changing event duration.
- Clamp onset to its originating bar while allowing tails beyond the bar.
- Permit coincident events without sorting or re-indexing them.
- Use the shifted note context consistently for envelopes, detune, effects, MIDI, and source scheduling.
- Ensure chance gaps do not compress nudge indexing.

### Required coverage

- Positive and negative nudge.
- First-step negative and last-step positive bar clamps.
- Static and random nudge schemas.
- Multi-step parameter alignment through chance gaps.
- Interaction with `fast`, `slow`, and `stretch`.
- Unchanged event duration after onset movement.
- Equivalent sampler and synthesizer timing behavior.

---

## 3. Conventional swing

Add coherent bar-level swing after the shared timing resolver exists.

### Public API and schema

Expose on the base Fluid instrument:

```ts
swing(...amounts: number[])
```

Requirements:

- One number applies to every bar; multiple numbers cycle by bar.
- Do not accept `RandomCycle`, nested step patterns, or empty arguments.
- Validate finite values within `0–1`.
- Default to `0`.
- Represent swing as a bar-level numeric cycle that cannot be confused with a step-addressed `ParameterSchema`.
- Expose the same semantics on samplers and synthesizers.

### Engine timing

Extend the shared onset resolver:

```text
swingDelay = odd(stepIndex) ? swingAmount * finalStepDuration : 0
nudgeOffset = resolvedNudge * finalStepDuration
startTime = clamp(gridTime + swingDelay + nudgeOffset, barStart, barEnd)
```

Requirements:

- Delay zero-based odd grid positions `1`, `3`, `5`, and so on.
- Determine swing from grid position rather than emitted-hit count.
- Resolve one swing value by absolute bar index.
- Use the same final unswung step duration for swing and nudge.
- Combine swing and nudge additively before clamping.
- Preserve event duration and permit tails beyond the bar.
- Do not re-index after chance gaps.
- Ensure `.swing(1 / 3)` produces conventional 2:1 triplet timing on an even grid.

### Required coverage

- Straight even positions and delayed odd positions.
- Bar-varying swing cycles.
- Chance gaps and original grid indexing.
- Additive swing and nudge composition.
- Interaction with final transformed step duration.
- Bar-end clamping without shortened events.
- Equivalent sampler and synthesizer timing behavior.

---

## 4. Scratch-language integration

Add a focused Fluid integration fixture using the implemented feature set. Until unified monophony ships, use:

```ts
d.sample("tay")
  .bank("user")
  .xox(d.rand().bin().chance(0.6).steps(16, 0))
  .duration(d.rand().range(0.065, 0.15).steps(16))
  .direction("alternate")
  .nudge(d.rand().range(-0.1, 0.1).steps(16))
  .detune(d.lfo(0, 700).speed(7.66))
  .push();
```

Requirements:

- Compile through the public API without casts or internal schema construction.
- Assert structural fields rather than one brittle full snapshot.
- Verify the 16-step active bar and empty rest bar.
- Verify mask, duration, direction, nudge, and detune alignment.
- Keep the release expression as a separate composition example using existing `end` and detune-envelope APIs.
- Add monophony to this fixture only after the unified monophony follow-up is complete.

---

## 5. Documentation and examples

Update relevant package READMEs, API documentation, examples, and optionally `notes/snippets.js` after reviewing local edits.

Document:

- `steps(...counts)` per-bar semantics and `0` as an empty bar;
- binary-only `chance()` and independent-probability semantics;
- random trigger masks in `xox()`;
- absolute `end` versus relative `duration`;
- sampler direction versus rhythmic `reverse()`;
- nudge units, range, indexing, and distinction from source offset;
- swing units, bar-level cycling, and odd-step behavior;
- the distinction between nudge and swing;
- cycles-per-bar LFO speed, including that `7.66` approximates 3 Hz only at 94 BPM;
- click-free sampler gating as an engine behavior rather than a user-facing duration mode.

Do not document `.mono()` until unified sampler and synthesizer semantics are implemented.

Every new public method should include syntax, units, defaults, validation, and an example.

---

## 6. Scratch demo alignment

Update:

- `apps/demos/src/components/scratch.ts`
- `apps/demos/src/pages/scratching.astro`

Requirements:

- Explain that random timing variation maps to `nudge`, not `swing`.
- Display the revised Fluid expression without `.mono()`.
- Keep explicit source loading and the raw Web Audio node graph visible.
- Preserve no-third-duration source start and gain-gated cleanup.
- Do not make the demos app depend on the production engine solely for the explanation.
- Retest loading, forward/reverse playback, cleanup, and explanatory controls.

---

## 7. Automated verification

After completing the remaining implementation and documentation work, run:

```sh
pnpm --filter @web-audio/schema check
pnpm --filter @web-audio/schema lint
pnpm --filter @web-audio/patterns check
pnpm --filter @web-audio/patterns lint
pnpm --filter @web-audio/patterns test:ci
pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter demos check
pnpm --filter demos lint
pnpm --filter demos build
pnpm check
pnpm lint
pnpm test
pnpm format
```

Also verify:

- `git diff --check` passes;
- unrelated pre-existing failures are recorded;
- generated build output is not committed unintentionally;
- no development server is started without approval.

---

## 8. Manual browser and audio verification

Use the Tay sample in a current Chromium-based browser and compare the engine result with the raw scratch demo.

### Random rhythm

- Confirm a 16-position active bar at 60% independent chance followed by an empty bar.
- Confirm deterministic restart behavior and ribbon repetition semantics.

### Duration, direction, and gating

- Confirm varying normalized source lengths.
- Confirm relative duration remains relative when start moves.
- Confirm forward and reverse use matching source material.
- Confirm alternate direction advances only on emitted hits and resets on transport restart.
- Confirm rapid forward/reverse retriggers remain click-free with static and LFO detune.
- Confirm loops stop cleanly on transport stop, retirement, and destruction.

### Timing

- Confirm nudge moves individual positions early and late.
- Confirm negative first-step nudge does not schedule before the bar.
- Confirm swing delays odd positions conventionally.
- Confirm swing and nudge compose without shortening hits.
- Confirm chance gaps do not change later timing alignment.

### Lifecycle and performance

- Confirm reverse preparation does not block the first reverse hit.
- Confirm forward-only samplers do not allocate reversed buffers.
- Confirm reversed buffers are reused.
- Confirm stop/restart and engine replacement clean up voices and reset alternate state.
- Confirm no audio continues after destruction.

Mono-specific listening checks remain deferred with unified monophony.

---

## 9. Closeout

Review [`scratch-language-prd.md`](scratch-language-prd.md) after the remaining implementation work.

Requirements:

- Update implementation-detail sections where final architecture differs.
- Do not change public semantics merely to match implementation shortcuts.
- Record deferred acceptance items explicitly.
- Ensure the PRD and implementation plan accurately describe shipped behavior.
- Give every deviation an explicit rationale and follow-up.
- Ensure no click-free, determinism, or alignment requirement is silently deferred.

---

## 10. Optional future ideas

These remain outside the committed follow-up work unless a separate product decision promotes them:

- `"alternate-reverse"` sample direction;
- independently configurable mono fade or choke duration;
- cross-instrument choke groups;
- exact-density random masks instead of independent probability;
- additional sampler-duration or timing units;
- richer groove templates beyond conventional swing;
- reversed-buffer memory and cache instrumentation.

## Guardrails

- Do not partially add monophony to only one public instrument API before shared semantics are agreed.
- Do not make instruments monophonic by default.
- Do not conflate per-instrument monophony with cross-instrument choke groups.
- Do not add a fade/choke argument until replacement semantics are settled for both instrument types.
- Keep completed click-free sampler gating independently useful; monophony should build on it rather than redefine ordinary sampler teardown.
- Preserve original step indexing through chance gaps for duration, nudge, swing, and other patterned parameters.
- Keep onset timing separate from sampler source-region coordinates.
