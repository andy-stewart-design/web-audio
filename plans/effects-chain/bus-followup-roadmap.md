# Bus and Routing Follow-up Roadmap

## Purpose

This roadmap divides features excluded from [`completed/bus-mvp-plan.md`](completed/bus-mvp-plan.md) into focused follow-up statements of work.

The sequence is intentionally incremental. Lifecycle infrastructure should be introduced alongside the first user-facing feature that requires it, not built speculatively in advance.

Each SOW should:

- deliver an independently useful capability;
- preserve behavior outside its stated scope;
- avoid broad refactors unless the feature cannot be implemented safely without one;
- define audible behavior before generalizing abstractions;
- include focused tests for the new behavior;
- document limitations rather than partially implementing deferred features.

---

## SOW 1 — Schema hardening and canonicalization

Detailed implementation plan: [`completed/bus-schema-hardening-plan.md`](completed/bus-schema-hardening-plan.md)

### Goal

Harden the proven MVP graph format after its API and runtime behavior have stabilized.

### Scope

- Make `buses`, `route`, and `sends` canonical required fields.
- Migrate repository fixtures in one mechanical change.
- Add shared Fluid and AudioEngine graph validation.
- Validate names, references, numeric ranges, and supported bus effects.
- Clone accepted AudioEngine updates so caller mutation cannot alter pending state.
- Preserve last-valid-write behavior for invalid updates.

### Non-goals

- Runtime topology changes
- Transactional graph construction
- Bus automation
- Ducking
- Tail-aware retirement

### Completion signal

Fluid and direct AudioEngine schemas share one canonical, validated graph representation without changing audible routing behavior.

---

## SOW 2 — Patterned bus parameters

Detailed implementation plan: [`completed/patterned-bus-parameters-plan.md`](completed/patterned-bus-parameters-plan.md)

### Goal

Allow persistent bus effects to change values at bar boundaries without introducing continuous automation infrastructure.

### Scope

- Support multi-bar static parameter cycles on named bus effects.
- Support deterministic random parameter resolution by bar.
- Resolve bus parameters with `stepIndex = 0`.
- Apply resolved values at exact bar boundaries.
- Keep effect nodes persistent for the runtime graph lifetime.
- Reset or cancel future scheduled bus values on stop.

### Non-goals

- Envelopes
- LFOs
- MIDI CC
- Parameter-manager extraction
- Patterned sends

### Completion signal

Named bus gain/filter parameters can evolve deterministically by bar while instrument parameter behavior remains untouched.

---

## SOW 3 — Bus MIDI automation

Detailed implementation plan: [`bus-midi-automation-plan.md`](bus-midi-automation-plan.md)

### Goal

Allow MIDI CC to control persistent named-bus effect parameters.

### Scope

- Extend named-bus output gain to static, deterministic random, and MIDI CC parameter schemas while keeping main gain constant.
- Initialize MIDI-controlled parameters from configured defaults or matching cached controller values.
- Bind and map MIDI CC values in real time.
- Support device and channel scoping.
- Connect MIDI to newly active runtime graphs.
- Disconnect bindings from retiring and destroyed graphs.
- Define replacement behavior when a different MIDI instance is connected.

### Non-goals

- LFO automation
- Envelopes
- General parameter-host abstraction
- MIDI-controlled sends

### Completion signal

MIDI CC updates named-bus parameters without leaking subscriptions across stop, replacement, or destruction.

---

## SOW 4 — Bus LFO automation

### Goal

Add persistent LFO modulation to named-bus effect parameters without changing instrument sound semantics accidentally.

### Required design decisions

Define and approve before implementation:

- absolute versus additive LFO parameter semantics;
- target `AudioParam` intrinsic values;
- bar-origin and starting-bar phase behavior;
- LFO output-bound updates across bars;
- parameter-edge ownership;
- stop, retirement, and destruction cleanup.

### Scope

- Create persistent bus LFO nodes once per runtime graph.
- Connect each LFO parameter edge explicitly.
- Update patterned LFO bounds at bar boundaries.
- Disconnect every edge and node during graph destruction.
- Add focused effective-value tests for gain, frequency, Q, and detune.
- Conduct a focused audible compatibility review.

### Non-goals

- Refactoring instrument LFO ownership unless separately approved
- Bus envelopes
- Ducking
- Generalized automation inheritance

### Regression requirement

Transport stop must not disconnect modulation from a currently audible voice. Active-voice completion cleanup and future-note cancellation must remain distinct.

### Completion signal

Persistent bus LFOs behave predictably and clean up safely without introducing an audible regression in instrument LFO behavior.

---

## SOW 5 — Bounded bus envelopes

### Goal

Add repeatable one-bar envelopes to persistent bus parameters.

### Scope

Implement:

```text
bar start → attack → decay → sustain → release → next bar
```

Define and test:

- attack, decay, and release as bar-duration proportions;
- proportional normalization when ADR exceeds one bar;
- sustain placement in remaining time;
- minimum-ramp behavior;
- bars too short to fit all minimum ramps;
- cancellation and replacement at repeated bar boundaries;
- stop/reset behavior;
- BPM changes across graph replacement.

### Non-goals

- Changing per-voice envelope semantics
- Envelopes that bleed across bars
- Duck automation
- General timeline infrastructure

### Manual gate

Review repeated envelopes at multiple BPMs for boundary clicks and expected attack/release feel before closeout.

### Completion signal

Bus envelopes remain wholly bounded by each bar and retrigger without stale or out-of-order automation.

---

## SOW 6 — Basic event-triggered ducking

### Goal

Deliver a musically useful first version of event-triggered named-bus ducking before implementing an advanced analytical timeline.

### Scope

- Add static duck depth, onset, and recovery configuration.
- Permit named bus targets only.
- Emit trigger events from synth and sampler pattern onsets.
- Keep muted instruments capable of triggering ducks.
- Use scheduled pattern duration for proportional timing.
- Add one dedicated duck gain per named bus after bus effects and before output gain.
- Order events within the currently scheduled bar.
- Reset duck gains to unity on stop.
- Isolate duck state between old and new runtime graphs.

### Initially acceptable limitations

- Simple retrigger behavior
- No analytical reconstruction of truncated exponential ramps
- No global sample-frame merge contract
- No long-running timeline compaction requirement

These limitations must be explicit in documentation and tests.

### Non-goals

- Audio-reactive sidechain compression
- Main ducking
- Patterned duck parameters
- Cross-generation target lookup

### Completion signal

Synth and sampler events can audibly duck named buses with predictable basic timing and safe stop/replacement behavior.

---

## SOW 7 — Duck retrigger correctness and determinism

### Goal

Harden basic ducking for dense, overlapping, cross-instrument scheduling.

### Scope

- Normalize trigger precision to audio sample frames.
- Deduplicate polyphonic instrument events at one frame.
- Preserve maximum event duration before resolving target timing.
- Group and sort requests globally by target and frame.
- Merge equal-frame requests deterministically.
- Resolve onset/recovery proportions to absolute durations before merging.
- Model constant and exponential timeline segments in software.
- Evaluate current gain analytically at retrigger time.
- Reconstruct truncated exponential ramps without changing their preceding shape.
- Prevent retrigger stacking.
- Compact completed timeline segments so storage remains bounded.
- Cover cross-bar retriggers and generation isolation.

### Non-goals

- Audio-reactive compression
- Main ducking
- Patterned duck parameters

### Completion signal

Duck output is independent of instrument order, stable under retriggers, sample-frame deterministic, and bounded during long-running playback.

---

## SOW 8 — Engine update safety

### Goal

Strengthen update and commit failure behavior after the graph system is functionally proven.

### Scope

- Defensively validate direct schemas at the engine boundary.
- Clone accepted pending schemas.
- Preserve earlier pending and active state after invalid updates or clone failures.
- Define last-valid-write behavior.
- Contain commit errors so clock scheduling continues.
- Preserve the active graph if construction of a replacement fails.
- Destroy successfully created replacement resources through straightforward ownership cleanup.
- Add observable error reporting.
- Add bar-scheduling rollback only for resources with practical rollback semantics.

### Non-goals

- Guaranteeing recovery from every possible internal Web Audio allocation failure
- Rewriting all constructors around a universal resource ledger
- Tail-aware retirement
- Atomic BPM installation unless a demonstrated failure requires it

### Completion signal

Malformed updates and ordinary graph-construction failures cannot replace or disrupt the last valid active graph or halt the clock.

---

## SOW 9 — Reverb and tail-aware retirement

### Goal

Introduce meaningful effect tails and the retirement policy they actually require.

### Scope

Implement reverb together with explicit lifecycle contracts:

- wet/dry semantics;
- impulse or algorithmic resource ownership;
- effect tail-duration or completion reporting;
- maximum graph retirement duration;
- whether stop preserves or truncates tails;
- behavior while `AudioContext` is suspended;
- final fade behavior if listening tests show one is necessary;
- cleanup after replacement and engine destruction.

### Design rule

Tail-aware retirement belongs to the first processor with meaningful tails. Do not add a generic scheduler or retirement gain until this SOW defines the audible need.

### Non-goals

- Delay feedback networks unless explicitly included
- Infinite retirement
- Bus graph cycles

### Completion signal

Reverb tails survive graph replacement according to a bounded, documented policy and never leak graph resources indefinitely.

---

## SOW 10 — Main effects

### Goal

Support processing on main after evaluating the practical constraints of a persistent final output.

### Required design decision

Choose one architecture based on real use cases and listening tests:

1. persistent main with a replaceable internal effect chain;
2. generation-owned main processing feeding a persistent final output;
3. crossfaded main-processing generations.

Evaluate:

- active and retiring voice overlap;
- effect parameter replacement;
- tails;
- analyser placement;
- main gain semantics;
- BPM-dependent automation;
- failure behavior.

### Non-goals

- Assuming the most general generation model by default
- Combining main effects with expanded routing topology

### Completion signal

Main processing can be replaced without duplicate dry paths, abrupt unintended truncation, or bypassing the persistent destination/analyser path.

---

## SOW 11 — Expanded routing topology

### Goal

Expand beyond the intentionally acyclic MVP topology only in response to demonstrated workflows.

Potential capabilities should be scoped separately where possible:

- bus-to-bus sends;
- named bus destinations;
- graph cycle detection;
- pre-fader sends;
- pre-mute sends;
- per-voice sends;
- wet-only auxiliary-return conventions;
- feedback routing with explicit safety limits.

### Design requirement

Any topology expansion must define graph validation, ownership, replacement, and destruction behavior before enabling feedback-capable connections.

### Completion signal

Each added route type has explicit signal-tap semantics and cannot create accidental duplication, unbounded feedback, or leaked graph ownership.

---

## Recommended order

1. Bus/routing MVP
2. Schema hardening and canonicalization
3. Patterned bus parameters
4. Basic event-triggered ducking
5. Duck retrigger correctness and determinism
6. Reverb and tail-aware retirement
7. Bus MIDI, LFO, and envelope automation as demand emerges
8. Engine update safety
9. Main effects
10. Expanded routing topology

The exact order of bus MIDI, LFO, and envelope work should follow actual user demand. They should remain separate SOWs even if scheduled consecutively.

## Guiding rule

> Introduce lifecycle infrastructure only alongside the first user-facing feature that requires it.

A follow-up SOW should be split or reconsidered if implementation begins changing unrelated voice, transport, sampler, MIDI, LFO, or engine commit behavior merely to prepare for a later feature.
