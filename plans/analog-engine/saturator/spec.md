# Saturator Specification

## Status

- Readiness: Ready for implementation planning; this is not implementation acceptance.
- Blocking decisions: None for planning; working defaults are identified under Assumptions.
- Source: The [analog-engine roadmap](../roadmap.md) and the approved AudioWorklet, voice, and named-bus scope. Compression and main-output effects are separate work.
- Delivery: Step 1.1, Step 1.2, the Phase 1 implementation exit, and the scoped Step 2.1 gate are verified. Step 2.1 has one repeatable unregistered synth/sampler/named-bus candidate, focused checks, and completed parent review. The historical native evidence records an unresolved intermittent `bends` limitation, while current read-only verification passed all 15 existing references. The remaining work is user listening approval, registration, the saved reference, and final existing checks. See the [implementation plan](plan.md), [Step 1.2 evidence](evidence/step-1.2-minimal.md), and [native evidence](evidence/native.md). The Phase 2 exit and final feature acceptance remain pending; no user listening or reference approval is claimed.
- Integration boundary: Clean up saturator-owned resources through existing common voice/bus lifecycle seams. Universal rollback for existing MIDI subscriptions, constructors, or every native graph operation is outside this contract. This specification does not itself constitute final acceptance or authorize reference updates.

## Problem and intended outcome

Drome users need to add harmonics and round peaks on individual sounds or a
shared bus, with independent control over distortion intensity and output level.
This work delivers saturation through the existing effect, voice, bus, and
lifecycle boundaries without requiring compression or main-output effects.

The intended result is a compact effect that works in existing ordered `.fx()`
chains, respects each voice's amplitude envelope and lifetime, and offers familiar
parameter automation without hidden loudness management.

## Scope

Included:

- Saturation on basic/unison synth and sampler voices and existing named buses.
- One AudioWorkletNode per authored saturator instance in a runtime chain.
- Drive and independent postgain; fixed tanh with first-order antiderivative antialiasing (ADAA) as working DSP default A2.
- Existing per-voice parameter inputs and existing restricted shared-bus scheduling.
- Focused DSP unit coverage, API/schema/automation/ownership integration coverage, saturator-owned lifecycle cleanup, and one approved native regression case covering representative synth, sampler, and named-bus musical behavior.

Non-goals:

- Compressor implementation, main-output effects, or changes to main routing.
- Native WaveShaper fallback, selectable curves, oversampling modes, wet/dry, or a separate bypass control.
- Normalization, automatic gain compensation, makeup gain, safety limiting, or latency compensation.
- Shared-bus envelope/LFO/MIDI expansion, new pattern syntax, independent effect tails, or voice-lifetime changes.
- A generalized multi-node effect host, DSP framework, or unrelated effect refactoring.

**Central invariant:** A saturator changes only the signal at its authored place
in an existing effect chain. It does not combine distinct voice ownership,
change routing or note lifetime, or alter another effect's state or controls.

## Current behavior and evidence

These are static-inspection findings, not new runtime verification:

- `packages/fluid/src/drome.ts` and `effects/{gain,filter}.ts` expose gain/filter effects. There is no saturator factory. `inputs/types.ts` and `parameters/resolve-audio-param.ts` provide reusable single-slot and setter parameter contracts.
- `packages/schema/src/index.ts` defines filter/gain effect variants; `validate-graph.ts` validates those variants and rejects effects on `main`.
- `packages/audio-engine/src/instruments/instrument.ts` constructs ordered effects before each voice's amplitude ADSR, applies static/random/envelope/LFO/MIDI parameters, and owns voice cleanup. Additional LFO targets require explicit discovery.
- `packages/audio-engine/src/buses/runtime-bus.ts` owns persistent serial effects, resolves static/random patterns per bar at step zero, smooths scheduled changes, and holds scheduled parameter values on stop. Its binding function rejects envelope/LFO/MIDI even though shared schema parameter types are broader. This feature must not imply those forms are supported.
- `packages/audio-engine/src/audio-engine.ts`, `packages/worklets/src/index.ts`, and `packages/worklets/src/register-worklets.ts` provide worklet readiness and registration. Existing noise/unison wrappers demonstrate error handling and explicit port/listener cleanup.
- Graph validation precedes pending-update acceptance. Existing commit construction has cleanup boundaries; this is not evidence of complete graph-update transactionality or rollback of every engine field.
- `packages/audio-regression/README.md` separates native numerical comparisons from human listening approval and prohibits hiding differences through normalization or widened tolerances.

Parity means leaving existing sound and behavior unchanged when no saturator is
authored. Adding an effect deliberately changes the waveform, including at unity
drive; native WaveShaper waveform equivalence is not a requirement.

## Requirements and invariants

- **R1 — Authoring:** A typed saturator builder exposes drive and postgain using the API/defaults in A1. It serializes as a distinct effect accepted by synth/sampler voices and named buses, but not `main`. Repeated postgain configuration replaces that control rather than adding stages.
- **R2 — Placement and isolation:** Effects retain authored order. Each voice saturates its mixed source layers before its amplitude ADSR; a named bus saturates its summed input through one shared instance per authored effect. Neither channel, another voice, nor another saturator shares nonlinear history accidentally.
- **R3 — DSP boundary:** Each runtime saturator uses one AudioWorkletNode containing drive multiplication, nonlinear processing, and postgain. With working default A2, processing follows the ADAA contract below, maintains history across render blocks, preserves mono/stereo without crossfeed or normalization, and starts with zero history.
- **R4 — Level semantics:** Working default A1 uses independent signed linear drive/postgain multipliers. Omission is bypass, unity drive is not bypass, zero drive is not a reset, and zero postgain mutes output without freezing history. No hidden dry path, level compensation, or output protection is added.
- **R5 — Parameter parity:** Both controls retain existing voice literals, patterns, deterministic random, envelopes, LFOs, and MIDI behavior. Named buses retain only existing static/per-bar/random behavior, transitions, and stop semantics. Initial silence cannot permanently disable a dynamically controlled effect.
- **R6 — Validation and failure:** Malformed authoring, invalid parameter schemas, nonfinite authored numbers, unsupported locations, and unsupported bus modulation are rejected through the relevant existing authoring/validation/construction boundary, not silently reinterpreted. Invalid schema updates do not replace a previously accepted pending configuration. Saturator setup errors remain observable and release newly acquired resources without tearing down unrelated active audio. No native fallback or automatic retry is introduced.
- **R7 — Ownership and lifetime:** Cancellation, normal voice completion, graph retirement, partial construction, processor failure, and destruction release owned worklet resources and modulation bindings at existing lifecycle boundaries. Cleanup is idempotent and stops DSP rather than merely disconnecting output. Saturation adds no tail or lifetime extension, and stale notifications cannot affect another owner.
- **R8 — Compatibility and evidence:** Unchanged graphs retain existing levels, timing, routing, MIDI, ducking, and effect behavior. Verification distinguishes mathematical correctness, existing integration coverage, one representative native regression case, and listening approval; none substitutes for another. No CPU or capacity guarantee is part of acceptance.

## Behavior and contracts

### API, inputs, and serialized shape

Working defaults A1 apply to this contract and remain subject to implementation
validation and the stated listening gate:

```js
d.saturator(); // drive 1, postgain 1; not a clean bypass
d.saturator(2).postgain(0.5);
d.synth("saw").fx(d.saturator(2).postgain(0.5), d.lpf(2000)).push();
d.sample("bd").fx(d.saturator(1.25)).push();
d.bus("drums").fx(d.saturator(1.5));
```

The factory accepts zero or one drive argument using the existing
`SingleSlotAudioParamInput` contract: number, numeric shorthand or `d.sh()`,
numeric `d.str()` / `d.structured()`, or direct random/envelope/LFO/MIDI builder.
Omitted or `undefined` drive defaults to `1`; extra positional arguments and raw
arrays are invalid. Postgain defaults to `1`; `.postgain(...input)` uses the
existing variadic `AudioParamInput` setter contract, like filter gain/Q setters.
Calling that setter without a value is invalid. Reusable input objects are not
mutated. No separate fluent drive setter is required for this slice.

The worklet exposes AudioParams named `drive` and `postgain`, each defaulting to
`1` with `a-rate` automation. Scheduled initial values must apply by the first
audible sample, not after a render-block or message-port delay. Constant parameter
arrays and sample-varying arrays must both be handled correctly.

Both controls use existing gain-context parameter resolution, modulation timing,
MIDI defaults, LFO phase, and smoothing; do not introduce another pattern clock.
On buses, static/random patterns resolve once per bar at the existing step-zero
address, including when a structured pattern contains multiple values. Unsupported
bus automation must fail before the new bus becomes active; this does not require
redesigning validation for every existing effect.

The serialized effect is:

```ts
{
  type: "saturator";
  drive: AudioParamSchema;
  postgain: AudioParamSchema;
}
```

Fluid emits both fields, including defaults. Direct graph input requires both
valid fields; an absent effect is the backward-compatible omitted-feature form.
No alternate legacy encoding or migration is needed. Negative finite values
remain signed rather than receiving the nonnegative coercion used by synth
source-layer static gains. Values above one are valid. Nonfinite authored values
remain invalid; native AudioParam representability limits still apply. This is
not a promise of finite output for arbitrary near-overflow audio/control inputs.

### Nonlinear processing and state

Working DSP default A2 is first-order ADAA of a fixed tanh function. For each
channel and sample, let `z = drive * input` and use the stable antiderivative:

```text
F(z) = abs(z) + log1p(exp(-2 * abs(z))) - ln(2)
shaped = (F(z) - F(previousZ)) / (z - previousZ)
output = postgain * shaped
```

Near-equal consecutive values use the limiting midpoint form
`tanh((z + previousZ) / 2)` to avoid division instability. The numerical switching
tolerance is an internal implementation choice to validate, not a public control.
History records the driven input and its antiderivative independently per channel
and persists across blocks and changes to either control. Audio-rate control
changes must not be quantized to one manually read value per render block.

| Condition                  | Observable result                                                      |
| -------------------------- | ---------------------------------------------------------------------- |
| Effect omitted             | Existing signal path; no saturator node or nonlinear processing.       |
| Drive `1`, postgain `1`    | Nonlinear tanh-derived response, not unity passthrough.                |
| Drive `0` from fresh state | Silence.                                                               |
| Drive changes to `0`       | No history reset; a history-dependent transition may precede silence.  |
| Postgain `0`               | Silent output while driven-input history continues updating.           |
| Negative drive or postgain | Signed polarity behavior according to the same processing equations.   |
| Input becomes silent       | Process history normally; input silence is not disposal or completion. |

ADAA reduces some aliasing but is not alias-free. Its half-sample phase response
and high-frequency softening are accepted working tradeoffs, not zero-latency or
native-oversampling equivalence claims. Do not compensate by delaying envelopes
or altering scheduling.

### Lifecycle and failures

A voice instance lives only within its existing voice owner; a bus instance lives
within its existing runtime bus owner. Live edits retain existing graph-retirement
semantics rather than moving old voices into newly created saturation state.

Disposal must terminate processor work, disconnect owned signal/modulation
connections, close owned ports, and remove listeners. The saturator adapter is
registered with the existing voice completion cleanup list; bus ownership uses
only the narrow saturator dispose hook needed to terminate a worklet. Cancellation
before start, normal completion, graph retirement, repeated disposal, and late
processor notifications must not leave saturator-owned processors or bindings
active. A processor error leaves its affected series path silent, not
dry/bypassed, while existing voice/bus lifecycle boundaries remain unchanged.
Partial cleanup is required for newly created saturators when their setup path
fails; this is not a universal rollback guarantee for existing MIDI, constructors,
or native graph operations. There is no automatic recovery or seamless-audio claim.

Worklet registration participates in existing engine readiness. Registration
failure rejects readiness; a chain must not activate with an unregistered
processor or silently substitute another backend. Construction failure before
activation leaves unrelated active audio alone.

Preserve existing validation and active-graph failure boundaries. Pending-update
preservation in R6 applies to schema validation in `AudioEngine.update()` before
assignment, not rollback of all state after a later runtime commit failure. Do
not expand this into general engine transactionality; targeted cleanup of
partially created saturator resources is required even if surrounding
constructors fail.

## Ownership and boundaries

- Fluid owns authoring, defaults, and serialization, reusing existing parameter decoding rather than introducing another parser.
- Schema owns the effect discriminator, parameter shape, and applicable location/validation rules.
- The processor owns only local DSP/history. It does not own transport, note scheduling, routing, or voice completion.
- Voice and bus owners own their worklet instances and local bindings. Shared instrument modulation retains its existing owner; disposing one effect must not dispose another consumer's modulation source.
- The engine owns readiness and graph retirement. One-node saturation must not depend on a generalized multi-node effect host, compressor implementation, or main-chain redesign.
- Reference implementations are conceptual material, not a new runtime or source-code dependency; any direct source reuse requires license review.

## Acceptance criteria

These are verification outcomes for this contract, not checks already performed. Reuse
existing parameter and lifecycle coverage where possible rather than repeating
unchanged helper coverage. Behavioral criteria and user listening
approval in AC11 gate feature acceptance and new saved references. No performance
threshold, supported-polyphony claim, workload framework, or benchmark is
required; ordinary audition may still expose an obvious issue that must remain
visible.

| ID   | Requirement(s) | Starting condition / action                                                                                                                                                        | Expected outcome                                                                                                                                                                                                                                | Verification approach                                                            |
| ---- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| AC1  | R1, R4         | Construct default/explicit saturators, replace postgain, serialize, and attach to synths, samplers, and a named bus.                                                               | A distinct effect has the documented defaults and parameter schemas; replacement changes only postgain; valid chains retain their typed APIs.                                                                                                   | Type/API, builder, and schema tests.                                             |
| AC2  | R1, R6         | Supply extra factory arguments, a raw factory array, empty/invalid postgain input, malformed schemas, nonfinite authored numbers, main effects, or bus envelope/LFO/MIDI controls. | Rejection at the applicable boundary with no silent fallback or activation of the invalid bus; invalid schema updates preserve the last accepted pending configuration.                                                                         | Negative authoring/schema and targeted runtime tests.                            |
| AC3  | R3, R4         | Process known mono sequences, including repeated/near-equal values, signed values, and useful high-drive cases, from fresh state.                                                  | Finite output for the tested supported cases matches an independent ADAA reference or explicit expected samples; near-equal inputs are stable.                                                                                                  | Focused DSP unit tests; no native WaveShaper identity requirement.               |
| AC4  | R2, R3         | Process different left/right signals and compare continuous input with the same samples partitioned across render blocks.                                                          | No crossfeed or channel-state sharing; block boundaries do not change output or reset history.                                                                                                                                                  | Focused DSP unit tests, with the approved native case as applicable.             |
| AC5  | R3, R4, R5     | Use unity/zero/signed drive, mute and unmute postgain, and change drive to zero after nonzero input.                                                                               | Results match the documented state table; unmuting continues evolved history; automated controls can become audible after initial silence.                                                                                                      | Focused DSP and binding tests, with the approved native case as applicable.      |
| AC6  | R2, R8         | Build two differently ordered chains and overlapping synth/sampler voices with source layers; compare separate voice saturation with saturation of their bus sum.                  | Authored order and pre-ADSR placement hold; one node exists per voice/effect or shared bus/effect; voice nonlinear history is independent and bus processing acts on the sum.                                                                   | Existing topology/integration coverage and one representative native case.       |
| AC7  | R5             | Target both controls with voice patterns/random/envelope/LFO/MIDI and bus static/random patterns; change bars, transition values, and stop mid-transition.                         | Existing addressing, phase, smoothing, and cancellation semantics apply to the correct AudioParams; buses use step zero and hold stopped transitions. Sample-varying worklet parameter data is respected.                                       | Focused binding, scheduling, and worklet tests; native case only where distinct. |
| AC8  | R6, R7         | Cancel or finish a voice, retire a graph, destroy a bus repeatedly, and deliver stale saturator callbacks.                                                                         | Existing common lifecycle boundaries hold; saturator-owned DSP and bindings terminate once; unrelated owners continue unaffected.                                                                                                               | Focused lifecycle and ownership integration tests.                               |
| AC9  | R6, R7         | Fail registration/readiness or inject saturator worklet construction/binding failure after resource acquisition, including a later bus-effect failure.                             | Readiness rejects; invalid chains do not activate. Failed saturator paths stay silent and newly acquired saturator resources release without fallback/retry. Universal rollback of existing MIDI/constructor/native graph state is not claimed. | Registration, adapter, and narrow owner-boundary tests.                          |
| AC10 | R8             | Run existing no-saturator reference cases and inspect scheduling/routing/event behavior.                                                                                           | Existing audio remains within unchanged regression tolerances; timing, routing, MIDI, ducking, and existing effect semantics remain unchanged.                                                                                                  | Existing regressions and focused integration assertions.                         |
| AC11 | R2, R3, R4, R8 | Render one representative candidate containing synth, sampler, and named-bus musical behavior, obtain user listening approval, then create/check its saved reference.              | Repeatable finite audio has the intended harmonic shaping and useful independent level control without unexplained onset artifacts; explicit user approval is recorded before feature acceptance and reference creation/update.                 | Existing native renderer, raw fixed-tolerance comparison, and human listening.   |

## Assumptions

The approved scope covers the AudioWorklet implementation and voice/named-bus
support, with compression and main effects separate. The following are working
assumptions for this scope:

- **A1 — API and controls:** `d.saturator(drive = 1).postgain(...)`, default postgain `1`, the input/serialized forms above, and signed linear multipliers provide the documented effect contract. Validate through API review and representative listening. No external saturator wire format is required.
- **A2 — DSP:** Fixed tanh with first-order ADAA is the working DSP approach. Current implementation math, modulation behavior, and onset quality require verification. CPU cost may be observed incidentally but is not an acceptance gate. Materially inadequate results require an explicit decision rather than another backend or compensation policy being added implicitly.
- **A3 — Verification scale:** Focused unit/integration coverage plus one approved native regression case is sufficient for this slice. Existing unit rate checks remain useful, and a selected 48 kHz recording may be included; no universal cross-rate, CPU, or supported-polyphony guarantee is agreed.

## Risks and open decisions

- **Blocking:** None for planning. Readiness is not implementation, listening, or publication approval.
- **Non-blocking — Quality:** ADAA trades residual aliasing and high-frequency softening against its current implementation approach. Listen to the completed integration; candidate and saved-reference approval remain explicit gates.
- **Non-blocking — Modulated drive:** Time-varying drive participates in nonlinear history. Validate transitions and fast modulation against the stated equations rather than assuming a memoryless tanh response.
- **Non-blocking — CPU:** Per-voice worklets and nonlinear math add cost with overlapping voices. This feature makes no maximum-CPU or supported-polyphony guarantee; ordinary use may expose an obvious issue, which would require an explicit follow-up rather than a new benchmark obligation.
- **Non-blocking — Cleanup:** Current bus construction and worklet ownership need targeted failure coverage. Stop and resolve leaks before acceptance rather than broadening the project into effect-host or engine-transaction refactoring.
- **Non-blocking — Headroom:** Postgain and subsequent mixing can exceed unity; this effect is not output protection.

## Deferred work

- Opt-in compressor, primarily on shared buses, with its own timing/defaults contract.
- Main-output effects and their routing/retirement design, separate from saturation delivery.
- Additional curves/quality modes, wet/dry/bypass controls, bus modulation expansion, limiting, and tail-aware processing only when separately justified; none is a prerequisite for this feature.
