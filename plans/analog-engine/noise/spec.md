# Per-voice Noise Layers Specification

## Status

- Readiness: Ready for planning
- Blocking decisions: None for planning.
- Delivery: Not implemented; specification readiness is not permission to implement or release.
- Source: The noise feature in the [analog-engine roadmap](../roadmap.md) and the design interview in this conversation. The interview explicitly agreed to sampler release continuation, full gain automation including envelopes, the shared voice lifetime boundary, and worklet-generated sustained noise.
- The [implementation plan](plan.md) records reviewable changes, verification gates, and execution status separately. Its existence is not evidence of delivery or permission to execute.

## Problem and intended outcome

Drome users need to blend noise into pitched synths and sampled sounds to add
transients, texture, and sustained broadband energy. The current instrument API
has no noise layer. Users should be able to add white or pink noise, shape its
level using familiar automation, and hear the combined voice pass through the
same effects and amplitude envelope.

A held noise layer must not reveal a short repeating buffer. A sampler's noise
must not be abruptly cut merely because its sample ends before the voice release.
Adding noise must not silently rebalance the main source or change instruments
that do not request it.

## Scope

Included:

- One optional noise layer per emitted voice in basic synths, unison synths, and samplers.
- White and pink noise, including notes held for tens of seconds.
- Existing constants, numeric/random patterns, LFO, MIDI CC, and envelope inputs for noise gain.
- Shared per-voice effects/amplitude routing and complete multi-source ownership through completion, cancellation, destruction, and graph retirement.
- Reproducible source behavior for offline regression coverage, under the planning assumptions below.

Non-goals:

- A standalone `d.noise()` instrument/configuration builder or noise as a fallback for missing samples.
- Main-source gain, sub layers, additional oscillator stacks, or new effects.
- Independent noise sequencing, sustain duration, or tails beyond the shared voice lifetime.
- Brown noise, color modulation, stereo-width controls, or public seed controls.
- Voice stealing, automatic limiting/compression, or a generalized worklet recovery system.

## Current behavior and evidence

These are findings from static source/test inspection, not newly observed runtime
results. No feature tests, audio renders, benchmarks, or listening checks have
been performed for this specification.

- `packages/fluid/src/instruments/instrument.ts` supplies shared builder methods; `synth-base.ts` and `sampler.ts` separately serialize common instrument fields. Neither currently exposes noise.
- `packages/fluid/src/parameters/parameter.ts` already defines `AudioParamInput` as numeric cycles/random cycles or a single envelope, LFO, or MIDI CC builder. `packages/schema/src/index.ts` provides the corresponding `AudioParamSchema` union, but no noise field.
- `packages/audio-engine/src/instruments/instrument.ts` connects a single source through ordered effects and the shared amplitude envelope. `_applyParamSchema()` already supports the required gain inputs; `_initLfos()` discovers instrument LFOs. `_track()` currently disconnects the shared graph when the single tracked source ends.
- Engine `sampler.ts` derives event duration from scheduled duration, playback duration, loop, clip mode, and fitted-chop state. Live detune can change actual source completion without revising that calculated duration.
- `utils/compute-envelope.ts` and `utils/normalize.ts` define duration-relative envelope behavior. Voice stop currently includes the amplitude release and 0.05 seconds of cleanup padding. These semantics are retained.
- `packages/audio-engine/src/index.ts` retains retiring graphs/buses until instrument completion. Multi-source completion must integrate with this boundary.
- `sources/supersaw-source.ts` and its `__tests__/supersaw-source.test.ts` provide an existing scheduled-worklet/port lifecycle and frame-rounding precedent. Their presence does not demonstrate that noise or noise failure handling works.
- `packages/audio-regression/README.md` describes real Chromium offline comparison against human-reviewed references. Passing numerical comparisons and listening approval are distinct forms of evidence.

The deliberate change is optional additional source ownership and noise-gain
control. Existing scheduling, source levels, effects order, and no-noise
source-end cleanup behavior are intended parity boundaries.

## Requirements and invariants

- **R1 — Availability and configuration:** Basic synths, unison synths, and samplers expose one optional white/pink noise layer with the defaults and replacement semantics below.
- **R2 — Gain input parity:** Noise gain supports the complete existing audio-parameter input model and its established pattern, envelope, LFO, and MIDI semantics; it must not introduce a restricted envelope-free variant.
- **R3 — Voice identity and mixing:** Each emitted musical voice owns its noise. Noise mixes additively with that voice's main source before user-ordered effects and the shared amplitude envelope. It must not rescale the main source, collapse stereo main audio, or add independent sequencing/MIDI/duck events.
- **R4 — Shared lifetime boundary:** Noise-gain envelopes cannot change voice duration. Noise continues through the existing shared amplitude release even when a sampler's main source ends first, without extending sustain or changing sampler duration rules.
- **R5 — Continuous color:** Worklet-generated white/pink noise supports sustained notes without a short buffer loop, maintains color/state across processing blocks, and produces finite output at supported sample rates. The two colors have documented, stable level conventions rather than per-note normalization.
- **R6 — Repeatability and variation:** Under the deterministic planning default, identical graph/event inputs reproduce a stream while distinct hits, musical voices, and instruments are not intentionally assigned coherent copies. Results must not depend on wall-clock time or render-block partitioning.
- **R7 — Scheduling and ownership:** Noise observes voice start/stop timing, is silent outside its scheduled interval, and cannot retain resources after completion, cancellation, destruction, or failed-source termination. Early completion of one source must not tear down still-active siblings or their shared processing.
- **R8 — Validation and failure isolation:** Invalid noise configuration is rejected before a graph becomes active. Skipped sampler voices also skip noise. Partial construction failures and noise processor errors remain observable and cannot leak sibling sources/resources or indefinitely prevent graph retirement.
- **R9 — Unchanged instruments:** With noise absent, old schemas remain valid and current sound, main gain, topology, scheduling, source-end cleanup timing, routing, and other instruments' voices remain unchanged.
- **R10 — Bounded integration:** Noise reuses existing schema/parameter, voice, and graph-lifecycle boundaries. It does not own an independent clock, bus, amplitude gate, or autonomous release tail.

## Behavior and contracts

### Configuration and input/output contract

The roadmap establishes white/pink selectors, white as default, gain `1` when
omitted, off unless requested, and replacement rather than accumulation.
Zero-argument enabling and the exact overload/schema forms below are inferred
compatible API defaults, not additional interview-approved decisions (A1).

```ts
noise(...gainInput: AudioParamInput): this;
noise(color: NoiseColor, ...gainInput: AudioParamInput): this;

type NoiseColor = "white" | "pink";

interface NoiseLayerSchema {
  color: NoiseColor;
  gain: AudioParamSchema;
}

// Optional field on the common instrument schema:
// noise?: NoiseLayerSchema
```

`AudioParamInput` and `AudioParamSchema` mean the existing project types, not new
value systems. The fluent return preserves the concrete instrument builder.

| Input/state                                                         | Result                                                                        |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| No `.noise()` call / omitted schema field                           | Off; no noise source or gain nodes.                                           |
| `.noise()`                                                          | White, gain `1`.                                                              |
| `.noise(0.3)`                                                       | White, gain `0.3`.                                                            |
| `.noise("pink")`                                                    | Pink, gain `1`.                                                               |
| `.noise("pink", gainInput)`                                         | Pink with the supplied existing gain input.                                   |
| Repeated `.noise()` calls                                           | Last call replaces the whole layer, including defaults for omitted arguments. |
| `.noise(0)`                                                         | Zero-level layer; no separate boolean/removal API is introduced.              |
| Unsupported color, boolean, malformed layer, or invalid gain schema | Rejected with an actionable error; not silently replaced by white or ignored. |

Numeric varargs/arrays retain established parameter-cycle semantics; they do not
create additional layers. Strings select color, not numeric shorthand. Color is
static under A2. Gain uses existing gain-effect semantics under A3, including MIDI
`gain` defaults/range and no automatic clamp at one. A dynamically controlled
layer must not disappear because its initial gain is zero.

For example, the intended API supports:

```js
d.synth("saw").noise(0.3);
d.synth("uni").noise("pink", d.lfo(0.05, 0.3));
d.sample("hh").noise("white", d.env(0, 0.3).adsr(0.01, 0.2, 0, 0));
d.synth("saw").noise(d.midi.cc(74));
```

### Signal and automation contract

```text
main source ──────────────────────┐
noise → noise gain automation ────┴→ ordered voice effects
                                      → shared voice amplitude ADSR
                                      → existing balancing/mute/routing/sends
```

The interview explicitly brings envelopes into scope **for noise gain only**.
The noise envelope starts with the voice and uses its existing event duration,
hit-index resolution, envelope modes, and timing units. Its result is still shaped
by the shared amplitude envelope. A longer noise-gain release therefore cannot
make the voice outlive that shared envelope/stop boundary.

Patterns resolve as existing numeric parameters do; LFOs retain instrument-scoped
phase; MIDI retains existing defaults, smoothing, and subscription behavior.
Noise does not produce another MIDI note or velocity value, nor another duck
trigger. A unison oscillator count does not multiply noise sources: each musical
voice, including each chord or layered sampler voice, owns one layer.

Under A2, noise is mono/centered and unpitched. Main-source pitch/detune, sampler
playback/fit/reverse/region, and unison spread/width do not retune or widen the
noise. They may still affect the existing voice event duration. Mixing noise
must preserve stereo main-source identity. Added energy may exceed unity; no
limiter, automatic main-gain reduction, or hidden normalization is introduced.

### Sampler duration contract

Preserve the existing event-duration calculation:

| Sampler case                  | Duration used by the shared voice envelope             |
| ----------------------------- | ------------------------------------------------------ |
| Looping sample or fitted chop | Scheduled duration.                                    |
| Non-looping one-shot          | Existing calculated playback duration.                 |
| Other clipped sample          | Minimum of scheduled and calculated playback duration. |

Noise follows that envelope through release and existing cleanup padding. Natural
sample completion disconnects that source, not the still-active noise/shared
voice processing. It does not restart an envelope or extend sustain. Long held
sampler noise requires a voice whose existing duration rules permit it, such as
a looping sample; a short one-shot is not turned into a long gate by adding noise.

This feature does not fix or replace existing playback-duration estimation under
live detune modulation. Under A5, missing sample data, an unresolved variation,
or an invalid source window skips the entire accompanying noise voice too.

### Sustained generation and reproducibility

The interview explicitly chose a per-voice worklet for sustained, non-looping
noise. White has approximately flat power spectral density; pink approximates
`1/f` power spectral density. There must be no deterministic short buffer repeat
or audible process-block seam during notes held for tens of seconds.

PRNG/filter state persists across active blocks. Equal active frame sequences
must give equal results regardless of block partitioning; output is zero before
start and after stop. Initial scheduling must also work in offline rendering
without depending on timely main-thread message delivery.

Deterministic event-derived randomness is an inferred default (A4), not an agreed
public seed API. Identical event identity and sample rate reproduce a stream;
different hits, musical voice indices, and instruments vary it. Cross-revision
and cross-sample-rate bit identity are not promised. Exact seed hashing, PRNG,
pink algorithm, coefficients, and control-message protocol are implementation
choices, subject to these behaviors and appropriate source licensing.

### Lifecycle, cancellation, and failures

These describe required ownership outcomes, not a mandated source-wrapper design.

| State/event                                 | Required outcome                                                                                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduled but not started                   | Silent; future-note cancellation can release the entire voice without audible output.                                                                                                                             |
| Active voice; main source ends early        | That source may disconnect; noise and shared processing remain through their scheduled lifetime.                                                                                                                  |
| Normal completion                           | All owned sources end; shared processing/bindings release once, allowing graph retirement.                                                                                                                        |
| Duplicate, delayed, or reordered completion | No double cleanup and no effect on another voice or a still-active sibling.                                                                                                                                       |
| Future-note cancellation                    | Every source/binding/node of that future voice is cancelled/released; already-active voices retain current stop semantics.                                                                                        |
| Instrument/engine destruction               | Every owned source, port, connection, and binding releases; late messages cannot revive the voice.                                                                                                                |
| Graph retirement after a live edit          | Old voices retain their original routing/buses until complete; a new graph does not inherit their noise resources.                                                                                                |
| Partial voice construction fails            | Already-created resources for that voice are released and the failure remains observable; no orphan sibling runs.                                                                                                 |
| Noise processor fails                       | Failure is surfaced through engine/browser diagnostics; failed-source ownership completes so retirement cannot hang. Unfailed siblings retain their scheduled lifetime. No silent retry/substitution is required. |

Noise configuration validation follows the existing engine boundary: invalid input
must not replace the active graph. This does not promise rollback of all engine
state after arbitrary runtime failures or automatic worklet recovery.

## Ownership and boundaries

- **Fluid builders** own authored configuration and conversion to existing parameter/schema forms, not runtime nodes or a second scheduler.
- **Schema validation/engine update** own rejection of malformed configuration before activation; omitted noise must remain backwards compatible.
- **Each musical voice** owns its main/noise sources, local gain/effects/envelope nodes, and completion state. Parameter bindings/connections used by that voice must detach when it releases them.
- **The instrument** retains existing scheduling and shared LFO/MIDI ownership. Releasing one voice must not stop shared modulation or another voice's noise.
- **The noise worklet** owns source-generation state and scheduled silence/completion, not graph routing, note triggering, or shared amplitude lifetime.
- **The engine graph** owns instrument/bus retirement. Noise must participate in that existing completion boundary, not independently hold or destroy shared buses.

No authorization or persistence migration is involved. Offline regression
reference approval remains a separate human-review boundary; writing this spec
or generating a recording does not approve a reference.

## Acceptance criteria

The following are proposed verification obligations, not checks already performed.
Every requirement has coverage; planning may split cases without changing these
IDs or outcomes.

| ID   | Requirement(s) | Starting condition / action                                                                                                               | Expected outcome                                                                                                                                                                              | Verification approach                                                                                                  |
| ---- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| AC1  | R1, R9         | Use each instrument variant with no noise, default noise, and explicit white/pink/gain forms; serialize old schemas.                      | Concrete fluent types are retained; defaults match the table; omitted noise remains valid/off.                                                                                                | Type/API and schema tests.                                                                                             |
| AC2  | R1             | Apply pink/gain configuration followed by `.noise(0.2)` or `.noise()`; include zero gain.                                                 | Exactly one layer remains with the last call's color/gain defaults; zero gain is silent.                                                                                                      | Builder/schema and native audio checks.                                                                                |
| AC3  | R2, R4         | Supply constant, static/random pattern, envelope, LFO, and MIDI gain inputs to otherwise equivalent voices.                               | Existing resolution/phase/timing/default/smoothing semantics hold; a zero-initialized dynamic gain can later sound; a long noise release does not extend the voice.                           | Unit/integration tests; real offline envelope/LFO audio.                                                               |
| AC4  | R3, R10        | Add noise to chords, unison, layered sampler voices, and a stereo sample with ordered effects.                                            | One layer per musical voice, not per unison oscillator; separate voice identity; noise precedes effects/shared ADSR; stereo main and main gain are preserved; no additional MIDI/duck events. | Topology/event assertions plus native stereo rendering.                                                                |
| AC5  | R4, R7         | Play a short sample with nonzero amplitude release and audible noise; allow the buffer to end first.                                      | Noise remains audible for the intended shared release and becomes silent by the existing voice stop; shared nodes are not disconnected on sample completion.                                  | Lifecycle assertions and real offline audio/listening.                                                                 |
| AC6  | R4, R9         | Compare noise-enabled looping, fitted-chop, clipped, and one-shot voices, including reverse/region/fit and early completion under detune. | Existing duration rules and modulation behavior are unchanged; noise neither restarts sustain nor outlives the shared voice.                                                                  | Focused scheduling/lifecycle tests and representative native renders.                                                  |
| AC7  | R5             | Generate long seeded white/pink runs at the rates selected for validation under A6.                                                       | Finite output, approximately zero mean, expected flat versus `1/f` spectrum, documented stable levels, and no short repeat/block seam.                                                        | Averaged spectral/statistical analysis and sustained listening; measurement bands/tolerances recorded during planning. |
| AC8  | R6             | Render identical graph/events in fresh contexts, change hit/voice/instrument identity, and vary block partitions/start offset.            | Same identity/rate reproduces its active stream; changed identities do not systematically share identical streams; block partition or preroll offset does not alter active samples.           | Processor tests and repeated fresh native offline renders.                                                             |
| AC9  | R7             | Schedule non-block-aligned starts/stops and cancel before start.                                                                          | No samples before start or at/after stop; a cancelled future voice is silent; completion/cleanup occurs once.                                                                                 | Processor/adapter tests and native timing checks.                                                                      |
| AC10 | R7, R10        | End siblings in either order; deliver duplicate/stale completions while another voice is active.                                          | Shared resources release only when no owned source remains active; unrelated voices/shared modulation are unaffected.                                                                         | Lifecycle and binding tests.                                                                                           |
| AC11 | R7, R9, R10    | Cancel future voices, destroy active instruments, and replace a graph while old voices release.                                           | All relevant sources/ports/bindings release once; late messages have no effect; retirement waits for whole voices and preserves their original routing.                                       | Instrument/engine lifecycle tests.                                                                                     |
| AC12 | R8             | Submit unsupported colors, null/malformed layers, invalid gain data, and malformed argument forms.                                        | Clear rejection before activation; no silently substituted color and no replacement of the active graph.                                                                                      | Builder/schema/engine failure tests.                                                                                   |
| AC13 | R8             | Skip a sampler voice for missing data/variation or invalid region; inject construction and processor failures.                            | Skipped voices emit no noise; failed setup leaves no orphan resources; runtime errors remain visible and cannot indefinitely retain the graph.                                                | Failure injection plus real browser error-path coverage where practical.                                               |
| AC14 | R9             | Render and retire existing instruments with noise omitted.                                                                                | Existing source levels, topology, timing, source-end cleanup, and reviewed audio references remain unchanged.                                                                                 | Existing regression coverage plus focused no-noise lifecycle assertions.                                               |

## Assumptions

These are inferred planning defaults, not additional explicit user agreements.
They are part of the working direction unless evidence exposes a consequential
tradeoff; do not describe them as empirically verified.

- **A1 — API/schema form:** Zero-argument enabling, optional-color-prefixed existing gain tuples, and an omitted optional `noise` schema field follow builder/schema conventions. Validate through type/serialization/compatibility review; there is no negotiated external wire-format migration.
- **A2 — Source behavior:** Static color and mono, centered, unpitched noise keep the initial API bounded. Validate stereo-main preservation and listening; adding width or color automation is separate scope.
- **A3 — Gain parity:** Signed linear gain without an upper clamp and the existing MIDI `gain` context avoid inventing different gain semantics. Validate with existing gain helpers and negative/above-one inputs; no hard peak or perceived-loudness guarantee is intended.
- **A4 — Randomness:** Deterministic event-derived streams suit the existing offline regression model. Instrument/bar/hit/voice identity is a proposed seed basis, not a mandated hash or public seed-stability promise. Reordering instruments may change their streams. Validate fresh-render reproducibility and practical stream separation.
- **A5 — Missing samples:** Noise accompanies successfully emitted sampler voices only; it does not replace unavailable main audio. Validate against existing skip paths.
- **A6 — Levels and engineering characterization:** Roughly RMS-matched colors are a proposed usability default. The earlier draft proposed uniform white over `[-1, 1)` (nominal RMS `1 / sqrt(3)`), fixed pink calibration within 1.5 dB, pink measurement over 100 Hz–8 kHz, rates of 44.1/48/96 kHz, a 60-second diagnostic, and a 32-layer profile. These are retained as **candidate planning targets**, not interview-approved loudness, sample-rate-support, or performance guarantees. Planning should choose/document measurements and tolerances, validate startup and sustained sound, and bring back a material level/quality/performance compromise rather than silently changing product behavior.

## Risks and open decisions

- **Blocking:** None for planning. There is no authorization to start implementation implied by this status.
- **Non-blocking — Multi-source lifetime:** Early sampler completion, cancellation, processor failure, and retiring buses create the largest correctness risk. Acceptance must exercise whole-voice ownership and late notifications, not only audible happy paths.
- **Non-blocking — Pink DSP and levels:** Exact algorithm, sample-rate response, startup behavior, calibration, and measurement tolerances need engineering characterization and listening. Known limits must be documented before reference approval; proposed targets are not measured evidence.
- **Non-blocking — Worklet cost:** Sustained per-voice processors require representative polyphony profiling. No cross-browser CPU budget or SLA was agreed. An infeasible result warrants an explicit tradeoff discussion, not an unannounced return to looping buffers.
- **Non-blocking — Determinism:** Seed identity and exact cross-revision behavior remain internal design choices. Avoid accidentally reusing short-period sequencing randomness or coherent streams for simultaneous voices.
- **Non-blocking — Failure observability:** Use existing engine/browser diagnostics; the plan must identify how a failed noise source completes ownership without swallowing the error. Generalized restart/recovery is not required.

## Deferred work

- Brown or additional colors and color modulation, if a later sound-design need justifies the DSP/API expansion.
- Stereo noise/width and public seed controls, if mono deterministic defaults prove insufficient.
- Standalone noise instruments/configuration builders and independent layer scheduling/gates/tails; these require a separate lifetime/API design.
- Independent sub envelopes, main-source gain, sub layers, and new effects remain separate roadmap features. The noise envelope decision does not implicitly expand those features.
- Automatic limiting, voice stealing, retries, or generalized DSP failure recovery remain separate work; none is a prerequisite for this bounded noise layer.
