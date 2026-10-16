# Pre-envelope effects specification

## Status

- Readiness: Ready for planning.
- Blocking decisions: None.
- Source: The agreed discussion of per-voice signal placement and the explicit decision to ship it as a breaking change without a compatibility mode; [analog-inspired synthesis roadmap](../roadmap.md).
- Delivery state: Specification only. No implementation, native rendering, regression verification, or listening approval has been performed for this change.

## Problem and intended outcome

Drome currently applies each note's amplitude envelope before its instrument-authored effects. This makes filters process an already-enveloped source and permits their stored energy to ring downstream of that envelope. It also puts the amplitude envelope before future nonlinear tone shaping, where changing note loudness would change how hard the effect is driven.

The intended model is that each voice first shapes its source through the user's ordered `.fx()` chain and then applies its amplitude envelope. The envelope controls the processed voice's final loudness before it joins the instrument mix. This creates the foundation for richer synthesis without introducing any new effects or source types in this feature.

This is an intentional sonic breaking change for existing sketches, not an attempt to preserve the old sound under a different implementation.

## Scope

Included:

- Relocate existing per-voice gain/filter effects before the amplitude envelope for both synths and samplers.
- Preserve authored effect order, parameter scheduling, source scheduling, voice isolation, downstream routing, and lifecycle ownership.
- Update signal-flow documentation and explain the breaking behavior.
- Add focused topology and native rendered-audio coverage; investigate existing audio regression differences and individually review/update affected references where justified.

Non-goals:

- A legacy routing mode, a position selector, new `.fx()` arguments, or schema migration.
- Saturation, compression, reverb, delay, supersaw, sub/noise layers, or a new synth gain argument.
- Changes to ADSR curves, durations, floors, defaults, or effect-parameter automation semantics.
- Shared instrument inserts, new bus topology, main-bus effects support, or new sends.
- Generalized multi-source voices, effect-tail-aware retirement, or extending sampler lifetime beyond its current source-end behavior.

**Central invariant:** Every voice has its own ordered effects and final amplitude envelope. No voice can bypass that envelope, and no shared sum of different voices is processed and then split into purportedly independent voice envelopes.

## Current behavior and evidence

The following are static source observations, not results of executing tests or listening:

- `packages/audio-engine/src/instruments/instrument.ts`, `_scheduleVoice()`, creates one envelope gain and an effect node for each item in `effects`, then connects `source → envelope gain → effects → balancing gain`. `_buildEffectNode()` currently supports only filters and gain.
- `packages/audio-engine/src/instruments/synthesizer.ts` creates an oscillator for each resolved note, including separate chord voices, and delegates processing to `_scheduleVoice()`.
- `packages/audio-engine/src/instruments/sampler.ts` creates a buffer source for each resolved sample voice and delegates to the same method. It determines source offset, playback rate, loop points, and event duration before that call; unavailable resources skip their voice.
- The shared instrument schedules amplitude/effect envelopes against the resolved event, resolves static/random values by bar and hit, connects LFOs to parameter targets, and registers MIDI CC bindings. `packages/audio-engine/src/utils/compute-envelope.ts` owns envelope duration calculation.
- Source stop is scheduled at an explicit override or `event.endTime + releaseDur + 0.05`. Natural buffer completion can end a sampler earlier. Source `onended` disconnects the voice and its parameter bindings. Transport Stop cancels future voices rather than stopping voices that have already started.
- Instrument output is `voice mix → balancing gain → mute`, branching to the primary destination and owned send gains. `packages/audio-engine/src/buses/runtime-bus.ts` separately owns persistent named-bus effects, duck gain, and output gain. `packages/audio-engine/src/index.ts` retains retiring graphs until their instruments finish.
- `packages/schema/src/index.ts` represents ordered `effects: EffectSchema[]` separately from `gain: EnvelopeSchema`; it contains no per-voice effect-position field.
- `packages/audio-engine/src/instruments/instrument.test.ts` provides fake-node coverage of output connections, parameter values/bindings, cancellation, destruction, and retirement. Such assertions do not establish native filter response.
- `packages/audio-regression/README.md` documents native Chromium `OfflineAudioContext` rendering, reviewed references, fixed numerical tolerances, and explicit one-case reference updates. Existing `lfo-filter` and `bends` sketches contain synth filters and are candidates for investigation, not confirmed failures. The inspected sampler sketches do not supply a focused pre-/post-envelope filter discriminator.
- `plans/effects-chain/signal-processing.md` currently illustrates envelope-before-effects voice processing. That explanation must change with delivery; its broader bus-design proposals are not authority to expand this feature.

## Requirements and invariants

- **R1 — Placement and isolation:** Every scheduled synth or sampler voice processes its source through its own effects before its own amplitude envelope. Voices remain independent until the instrument mix; there is exactly one intended audio path from each source through its envelope to that mix.
- **R2 — Ordered and empty chains:** Preserve the authored effects array order without reordering, grouping, duplication, or omission. An empty effects array connects the source directly to its envelope and preserves no-effects playback behavior.
- **R3 — Authoring and schema stability:** Existing builders, effect types, parameter values/defaults, ordered serialization, and validation remain unchanged. Existing valid graphs use the new placement universally. Do not add a compatibility branch, routing flag, or automatic gain compensation.
- **R4 — Scheduling and automation parity:** Relocation must not change resolved note/hit identity, source start/offset/stop scheduling, sampler selection/playback settings, amplitude-envelope schedules, or effect/detune parameter schedules and bindings. Modulation remains attached to the same kind of per-voice parameter with the existing timing and value semantics.
- **R5 — Lifecycle parity:** Natural end, cancellation of future voices, Stop behavior for active voices, retirement, graph replacement, and destruction retain their current ownership and completion semantics. All relocated nodes and voice-owned parameter connections/subscriptions are released with their voice. No new effect-tail lifetime policy is introduced.
- **R6 — Downstream invariance:** Balancing, mute, primary routes, post-mute sends, bus effects/automation, ducking, master output, and MIDI note output retain their current contracts. Only the audio entering the existing downstream path changes where that follows from R1.
- **R7 — Deliberate compatibility break:** Document effects-before-amplitude-ADSR for both instrument types and identify the potential audible change for existing sketches. Do not promise that old filter attacks/releases or loudness are preserved, or that every sketch must sound different.
- **R8 — Rendered regression integrity:** Native audio coverage must distinguish the new topology from the old one and cover both source families. Existing audio regression differences must be attributed, not accepted wholesale. Preserve the current harness safeguards and comparison tolerances; approve new/changed recordings individually through human listening review before treating them as accepted references.

## Behavior and contracts

### Voice signal flow

For an authored effects list `[effect A, effect B]`:

```text
Before:
source → amplitude envelope → A → B → instrument mix

After:
source → A → B → amplitude envelope → instrument mix
```

With no effects:

```text
source → amplitude envelope → instrument mix
```

Multiple notes, chord tones, sample-name layers, and sample-variation layers each retain separate processing paths. Sharing an LFO signal does not imply sharing effect audio nodes or amplitude envelopes.

The amplitude stage is the existing voice gain envelope, including its configured maximum, sustain, floor, and release. It is not a newly added second envelope. Effect-parameter envelopes remain independent modulation of their effect parameters. The persistent instrument balancing/mute stages do not move.

### Audible boundary

A filter now receives the un-enveloped source, and its processed output is multiplied by the voice envelope. Consequently, its attack and release response can differ from the former topology. When the amplitude envelope is zero, upstream filter memory cannot produce output through that voice's final gain. A configured nonzero envelope floor must not be silently forced to zero.

The user still decides filter/gain order inside `.fx()`. Gain-only chains can be mathematically equivalent across this move and are not sufficient by themselves to prove the routing change. No-effects cases are expected to retain their output; differences there require investigation rather than automatic reference replacement.

### Timing and state transitions

| Condition / action                                    | Required behavior                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A voice is scheduled                                  | Use the existing resolved event and source settings; connect its effects before its amplitude envelope.                                        |
| Voices overlap                                        | Each source passes through only its own effect audio path and envelope. One voice ending does not disconnect another's nodes or bindings.      |
| A sample/resource/region is unavailable or invalid    | Preserve current validation/skip behavior; do not create an alternate bypass path or renumber later hit values.                                |
| Transport stops before a voice starts                 | Cancel and clean up that future voice as today, including its effects and parameter edges/subscriptions.                                       |
| Transport stops after a voice starts                  | Preserve the current active-voice continuation behavior; do not add an immediate mute or forced stop.                                          |
| A source ends naturally or reaches its scheduled stop | Clean up the voice through existing completion handling, even if a filter could otherwise keep ringing.                                        |
| A graph is replaced / instrument retires              | Already-started old voices retain their old graph and follow existing retirement behavior; MIDI binding retirement semantics remain unchanged. |
| The instrument/engine is destroyed                    | Disconnect owned nodes and parameter bindings without affecting separately owned graphs.                                                       |

This feature does not retime effect envelopes to account for a filter's internal response, extend source lifetimes to preserve tails, or change transport semantics.

### Regression review and compatibility communication

Use the existing reference workflow. Review native output and, for changed cases, before/after/difference artifacts to determine whether a discrepancy is explained by the relocation. Unexplained changes block reference acceptance. New and intentionally changed recordings need individual listening approval; successful generation or numerical comparison is not that approval.

Do not widen tolerances, normalize/trim output, rewrite every reference, or alter unrelated sketches to hide the routing change. Include targeted resonant-filter attack/release material with enough audible duration and render tail to expose the difference without relying on a sample having already ended.

Documentation must show the final topology, identify this as a breaking sound change, and distinguish per-voice effects from shared bus effects. No user code migration is required to select the new behavior; adjusting a sketch to recover its former sound is a sound-design decision, not a guaranteed automatic conversion.

## Ownership and boundaries

- Fluid and shared schema continue to own authoring, ordered effect serialization, and graph validation. This feature needs no new public data shape or position setting.
- The shared audio-engine instrument voice path owns effect/envelope placement and voice cleanup; synth and sampler code continue to own their existing source creation and resolved scheduling inputs.
- Instrument output, runtime buses, and engine graph retirement retain their existing boundaries. Do not move per-voice effects into a bus or create a new shared insert system to implement this relocation.
- Audio regression tooling owns deterministic rendering/comparison and safe reference updates; a human owns listening approval. Verification evidence belongs in the subsequent work's progress record, not in this specification as an unperformed result.

## Acceptance criteria

| ID  | Requirement(s) | Starting condition / action                                                                                                                                            | Expected outcome                                                                                                                                                                                                                                      | Verification approach                                                                                      |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| AC1 | R1, R2         | Schedule a synth note and a cached sampler voice, each with two distinguishable effects.                                                                               | Each source connects through its effects in authored order, then its amplitude envelope, then the existing output; no old envelope-first edge or parallel bypass remains.                                                                             | Focused connection assertions through the real voice scheduling path.                                      |
| AC2 | R1, R2, R5     | Schedule overlapping notes/layered sample voices and end one while another remains active.                                                                             | Effect/envelope audio nodes are voice-local; completing one voice releases only its owned path and bindings, leaving the other path intact.                                                                                                           | Topology and lifecycle assertions with overlap.                                                            |
| AC3 | R2, R3, R8     | Render representative synth and sampler sketches with empty effects arrays using unchanged settings.                                                                   | Playback retains the previous signal path and existing reviewed output within the harness's fixed tolerances; no added gain or bypass route appears.                                                                                                  | Connection assertions and existing native regression comparisons.                                          |
| AC4 | R1, R7, R8     | Render focused synth and sampler cases with a resonant filter and a nonconstant amplitude envelope whose floor is zero.                                                | Attacks/releases follow filter-before-envelope behavior and differ meaningfully from envelope-before-filter behavior; once the final gain is zero, upstream filter ringing cannot escape it.                                                          | Native offline rendering with an explicit topology discriminator, plus reviewed case recordings/listening. |
| AC5 | R3, R4         | Schedule static/hit-patterned/random effect values, parameter envelopes, LFOs, and MIDI CC bindings, including overlapping hits.                                       | Values, event origins, phases, targets, and binding cleanup follow existing contracts; amplitude-envelope and source start/stop/offset schedules are unchanged. A nonzero configured envelope floor is preserved.                                     | Parameter/scheduling assertions and relevant existing integration coverage; rendering where applicable.    |
| AC6 | R4, R5         | Exercise scheduled stop, natural sampler end, future cancellation, Stop during an active voice, retirement/replacement, and repeated destruction with effects present. | Existing continuation/completion rules remain intact; all relocated nodes are owned and cleaned up, with no new tail extension, premature retirement, or leaked modulation subscriptions.                                                             | Lifecycle integration tests, including naturally short samples and future voices.                          |
| AC7 | R4, R6         | Play effected voices through a named primary route and sends; exercise mute, duck triggers, and MIDI output.                                                           | Balancing/mute and send tap positions remain unchanged; buses receive the newly processed voice output exactly through existing routes. Duck event timing, bus processing/Stop behavior, and MIDI note timing/velocity are not changed by relocation. | Existing integration coverage plus focused connection/event assertions where gaps remain.                  |
| AC8 | R3, R7         | Evaluate/validate existing valid authored and direct-schema graphs and inspect the delivered signal-flow documentation.                                                | The same API/data shapes and validation rules apply without a legacy toggle. Documentation describes both source families' new topology and its intentional sonic break without changing unrelated routing claims.                                    | Schema/authoring regression coverage and documentation review.                                             |
| AC9 | R7, R8         | Run the native regression suite after implementation and review each new or changed recording.                                                                         | Unaffected references remain unchanged; discrepancies are explained or fixed. Only individually reviewed intended changes/new cases receive accepted references, with original harness safeguards/tolerances intact.                                  | Native regression evidence and explicit human listening approval; no blanket rebaseline.                   |

## Assumptions

- No additional product assumptions are required to plan the placement change. Both source families, the breaking-change policy, and inclusion of audio regression updates are settled.
- Static inspection suggests the shared voice scheduler provides a contained implementation seam. Whether existing mocks exercise that seam adequately must be validated during planning/implementation; it is not a reason to expand the feature into a generalized voice rewrite.
- `lfo-filter` and `bends` are likely candidates for audible/reference changes, but their actual numerical differences and the full set of affected cases are unverified. Establish these through native rendering rather than declaring expected failures from their names alone.

## Risks and open decisions

- **Blocking:** None. Ready for planning does not authorize implementation or reference approval.
- **Non-blocking — acoustic expectations:** Filter-before-envelope is not universally louder, softer, or better; native output and listening must establish the intended result for representative material.
- **Non-blocking — verification sensitivity:** Gain multiplication can commute with the envelope and some filter cases may produce differences too small to discriminate. Select a resonant, time-sensitive fixture/reference comparison that actually detects the old placement; fake connection tests alone do not establish the acoustic behavior.
- **Non-blocking — sampler completion:** Natural source completion still triggers current cleanup and can truncate filter memory. That is an existing lifecycle boundary retained here, not a promise of complete physical filter tails.
- **Non-blocking — regression approval:** A pending human listening review is a delivery acceptance gate, not a blocker to authoring the implementation plan. Numerical tolerance or browser differences must not be used to bypass it.

## Deferred work

- The other features in the [roadmap](../roadmap.md): supersaw, main-source gain, sub/noise layers, saturation, and compression.
- Delay/reverb and tail-aware retirement; revisit when adding persistent stateful effects that need independent lifetimes.
- More flexible effect placement, independent source-layer envelopes, new ADSR curves/timing modes, and arbitrary multi-source voice abstractions. None is needed to deliver the agreed fixed pre-envelope chain.
