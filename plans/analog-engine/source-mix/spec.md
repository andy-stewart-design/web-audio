# Synth Source Mixing Specification

## Status

- Readiness: Ready for planning.
- Blocking decisions: None for planning.
- Source: The [analog-engine roadmap](../roadmap.md) and source-mixing design discussion.
- Delivery: Specification only; this feature is not implemented. Readiness is not permission to implement or approve audio references.

## Problem and intended outcome

Drome users need to balance a synth's primary oscillator against a stable pitched
sub without changing the level of the whole instrument. For example, detuned
stereo saws should blend with a centered sine one octave below, with both passing
through the same per-note effects and amplitude envelope.

Users should be able to select a main-source level when constructing a synth and
add one sub using compact positional arguments. Familiar automation should shape
either contribution without creating independent notes or extending their lives.

## Scope

Included in one PR:

- Optional main-source gain on `d.synth()` for basic and unison synths.
- One replaceable sub oscillator per emitted synth voice.
- Sine, triangle, square, and sawtooth subs, including existing waveform aliases.
- Static octave offsets of `-1` and `-2`.
- One gain argument per source control: number, numeric array, random-cycle builder, envelope, LFO, or MIDI CC.
- Existing gain automation, negative numeric-input coercion to zero, additive pre-effects mixing, common pitch/detune, shared voice lifetime, and existing ownership/cleanup integration.

Non-goals:

- Main-source gain or sub controls for samplers; changes to existing noise gain or automation semantics.
- Numeric gain shorthand strings, variadic gain patterns in these new argument positions, or a new pattern language.
- `d.osc()` builders, arbitrary additional oscillators, unison subs, or non-saw waveforms inside the main unison engine.
- Octave/waveform automation, independent sub sequencing/gates/sustain/tails, or public phase controls.
- New effects, automatic normalization, limiting, compression, voice stealing, or generalized processor recovery.

**Central invariant:** Each musical voice owns its sources and processing. Main,
sub, and existing noise contributions mix before that voice's ordered effects
and shared amplitude envelope; source-level control never creates another voice
or changes its lifetime.

## Current behavior and evidence

The following findings are from static source inspection, not newly performed
runtime tests, renders, benchmarks, or listening checks.

- `packages/fluid/src/drome.ts` selects typed basic/unison builders without a source-gain argument. `instruments/synth-base.ts` serializes shared synth configuration; neither builder exposes a sub.
- `packages/fluid/src/inputs/waveform.ts` already canonicalizes sine, triangle, square, and sawtooth aliases. The unison main source deliberately accepts saw aliases only.
- `packages/fluid/src/parameters/parameter.ts` supports numeric/random patterns and envelope/LFO/MIDI sources. Existing numeric methods use variadic bar patterns and arrays for within-bar values; numeric gain shorthand strings are not supported.
- `packages/schema/src/index.ts` distinguishes shared amplitude `gain` from optional `noise.gain`. It has no main-source gain or sub fields. `validate-graph.ts` provides existing parameter and graph validation boundaries.
- `packages/audio-engine/src/instruments/synthesizer.ts` resolves each note's common detune and amplitude envelope, creates its native or unison source, and delegates to the shared voice scheduler. MIDI velocity derives from the shared amplitude envelope.
- `packages/audio-engine/src/instruments/instrument.ts` already mixes noise before ordered effects and amplitude ADSR, tracks multiple sources, owns local nodes/bindings, and retains shared processing until all owned sources complete. Its parameter helpers handle envelopes, LFOs, and MIDI; additional LFO parameters must be registered deliberately.
- Existing gain automation permits signed values and already handles parameter timing, LFO phase, MIDI smoothing, and binding cleanup.
- `packages/audio-regression/README.md` documents native Chromium offline rendering, unchanged comparison tolerances, and separate human listening approval.

The parity boundary is existing audio and event/lifecycle behavior with main gain
omitted and no sub requested. Deliberate changes are the new source-level mix and
its authoring/validation contracts, not a redesign of amplitude, noise, or unison.

## Requirements and invariants

- **R1 — Typed availability:** Basic and unison synths accept optional main-source gain and expose `.sub()`. Gain-only `d.synth(gain)` selects the default sine basic synth and accepts the same gain inputs as `d.synth(selector, gain)`. Shared fluent calls retain their concrete builder type. Samplers do not acquire these controls.
- **R2 — Unambiguous authoring:** Sub arguments follow gain-only, octave-then-gain, or waveform-then-octave-then-gain forms. Octave and gain occupy distinct argument positions. Each form has exactly one gain argument; strings do not introduce gain shorthand in this PR.
- **R3 — Gain behavior:** Main/sub gains reuse existing gain parameter behavior. Finite negative numeric literals and static numeric-pattern entries resolve to zero, with no upper clamp at one. Random-cycle, envelope, LFO, and MIDI CC inputs retain existing resolution and automation semantics. Dynamic gain starting at zero must remain capable of sounding later.
- **R4 — Mixing and levels:** Main gain affects only the main source, including the complete compensated unison stack; sub gain affects only the sub. Contributions mix additively before effects and shared amplitude ADSR. Main stereo, existing balancing, noise levels, and unison count compensation are preserved. No hidden rebalancing or output protection is added.
- **R5 — Sub identity and pitch:** Each emitted musical synth voice owns at most one centered sub with a supported waveform and octave. It follows that note and the same common detune modulation, never unison spread/width or another chord tone's pitch. Repeated configuration replaces, not accumulates.
- **R6 — Shared lifetime and events:** Layer envelopes use the existing event timing but cannot extend shared voice lifetime. Subs do not add MIDI notes, change MIDI velocity, add duck triggers, or introduce another scheduler.
- **R7 — Complete ownership:** Main, sub, noise, gain/effect nodes, and local modulation bindings participate in existing completion, cancellation, destruction, and graph retirement. Completion/failure of one source cannot prematurely disconnect surviving siblings or retain the graph indefinitely.
- **R8 — Validation:** Malformed arguments, unsupported waveforms/octaves, nonfinite numeric input, invalid gain schemas, and synth-only fields on samplers are rejected through existing authoring/graph boundaries. Invalid graph updates must not replace the last valid configuration; no fallback waveform or silent argument dropping.
- **R9 — Compatibility and bounded delivery:** Existing schemas with new fields omitted remain valid. Existing basic/unison/sampler/noise sound, source timing, effects order, routing, MIDI, and lifecycle semantics remain unchanged unless the new controls are requested. Verification reuses existing infrastructure and distinguishes numerical checks from listening approval.

## Behavior and contracts

### Public API and defaults

Main-source gain can be supplied alone for the default sine synth or after an
explicit selector. Sub configuration supports three positional forms:

```js
d.synth(); // sine, gain 1
d.synth(0.5); // sine, gain 0.5
d.synth(d.lfo(0.2, 0.5)); // sine, automated gain
d.synth("saw"); // saw, gain 1
d.synth("saw", 0.8);
d.synth("unison", d.lfo(0.2, 0.8));

synth.sub(0.3); // sine, -1 octave, gain 0.3
synth.sub(-2, 0.3); // sine, -2 octaves, gain 0.3
synth.sub("square", -2, 0.3); // square, -2 octaves, gain 0.3
synth.sub("saw", -1, d.env(0, 0.3).adsr(0.01, 0.2, 0, 0.1));

d.synth("uni", 0.8).sub("sine", -1, 0.3).noise("pink", 0.1).gain(0.4).push();
```

Main gain defaults to `1`; existing `d.synth()` / `d.synth(selector)` calls retain
their behavior. `d.synth(gain)` returns the basic sine builder and accepts every
supported gain input: number, numeric array, random-cycle builder, envelope,
LFO, or MIDI CC. String arguments select the waveform/engine, not a gain pattern.
Explicit `undefined` selectors remain supported: `d.synth(undefined, gain)` is
equivalent to `d.synth(gain)`.

The sub is absent until configured. Gain-only sub configuration defaults to sine
and `-1`; octave-plus-gain defaults to sine. Each `.sub()` call replaces the whole
configuration, including defaults. Thus `.sub("square", -2, 0.4).sub(0.2)` ends
with one sine sub at `-1`, gain `0.2`. Zero gain is valid and does not imply a new
layer-removal API.

Gain is required in all three sub forms. Octave-only, waveform-only, and
zero-argument enabling forms are not supported.

The octave slot accepts only literal `-1` / `-2`, and the waveform slot accepts
`sin`/`sine`, `tri`/`triangle`, `sq`/`square`, and `saw`/`sawtooth`. Canonical
serialization uses full waveform names. These sub choices do not broaden the
main unison engine's `.type()` support.

### Gain inputs and automation

A gain argument is one number, one numeric array, or one existing random-cycle,
envelope, LFO, or MIDI CC builder. It is not the rest of the call's arguments:

```js
synth.sub("square", -2, [0.3, 0.5]); // within-bar gain values
synth.sub(-1, d.rand().range(0.2, 0.5));
synth.sub(-1, d.lfo(0, 0.3));
synth.sub(-1, d.midi.cc(74));

synth.sub("square", -2, 0.3, 0.5); // invalid: extra argument
synth.sub("square", -2, "<0.3 0.5>"); // deferred shorthand; invalid now
```

A numeric array retains its existing within-bar cycle semantics. Multiple
variadic gain bars and nested-array alternatives are not new supported forms.
Random/envelope/LFO/MIDI builders serialize to their existing schema variants;
no separate automation language is introduced. These new controls do not narrow
existing `.gain()`, `.noise()`, or effect-gain inputs.

Main-source and sub gains reuse the existing gain parameter machinery:

- Finite negative numeric gain literals and static numeric-pattern entries, including those in direct static gain schemas, resolve to `0`. Nonfinite or malformed data remains invalid under existing schema rules.
- Random-cycle, envelope, LFO, and MIDI CC inputs retain existing behavior, including signed outputs. No additional automation floor, clipping stage, or range-analysis system is introduced.
- Positive gain is not clamped at one. Above-one gain and additive mixes may exceed unity.

Coercion applies only after identifying argument roles; it does not change octave
selectors. For example, `.sub(-2, -0.3)` selects octave `-2` with gain `0`, while
`.sub(-0.3)` selects the default sine/-1 sub with gain `0`.

Numeric-input coercion applies only to the two new controls. Existing noise and
effect gains are unchanged. Gain-context MIDI defaults/ranges, smoothing,
instrument-scoped LFO phase, event/hit pattern addressing, and envelope timing
remain as established. Shared modulation sources are not modified.

`.gain()` and `.adsr()` continue to shape the whole voice after effects; they do
not edit either layer gain or the layer envelope's ADSR. Layer envelopes begin
with their musical voice and use its existing event duration and envelope modes.
Longer layer releases are bounded by shared voice stop; they cannot prolong
sustain, shared amplitude release, or cleanup padding.

### Signal and pitch

```text
main source → main gain ─┐
sub oscillator → sub gain ┼→ ordered voice .fx() → shared amplitude ADSR
existing noise → its gain ┘                         → existing output/routing
```

Main gain is an independent gain stage, not a different implementation of source
normalization. On unison it scales the existing compensated stereo stack as one
source; it neither changes oscillator count nor feeds back into compensation.
The sub uses the ordinary basic waveform level convention (A3), without extra
waveform-dependent loudness matching.

For MIDI note `n`, octave `o`, and common detune `d(t)` cents, intended sub pitch is
`midiToFrequency(n) × 2^o × 2^(d(t) / 1200)`, subject to existing native safe
parameter handling. The same resolved common detune trajectory drives main and
sub, including envelopes, LFO, and MIDI CC. Pattern/random detune is not rerolled
independently for the sub. Unison spread and stereo width affect only the main
stack. Noise remains unpitched.

A chord creates a sub for each emitted note, not a single shared bass oscillator.
Unison count does not multiply subs. The sub is centered before user effects;
main stereo must survive mixing. User effects may subsequently alter the result.
Native per-note oscillator phase behavior is the baseline (A3); free-running
phase, phase locking to the main oscillator, and a public phase parameter are not
promised.

Muting the main contribution with source gain `0` still permits audible sub/noise
under the same musical event and shared amplitude envelope. A dynamically muted
source must not be discarded merely because its initial value is zero.

### Schema and validation boundary

The proposed minimal serialized additions (A4) are optional synth-only fields:

```ts
sourceGain?: AudioParamSchema; // omitted means 1
sub?: {
  waveform: Waveform;
  octave: -1 | -2;
  gain: AudioParamSchema;
};
```

These fields belong to the common synth schema, not the shared sampler/synth
instrument schema. Existing `gain` remains the amplitude envelope. Omitted `sub`
means no sub resources; omitted source gain keeps existing levels. Validate
known synth-only fields on sampler input rather than silently ignoring them.
No legacy dual-format parser, persisted-data migration, or general strict-object
validation framework is required.

Reject invalid arity, unsupported/octave-pattern inputs,
unknown waveforms, shorthand strings in gain positions, and malformed automation
with actionable errors. Invalid authoring must not partially replace a previous
sub configuration. Preserve the existing validation-before-graph-acceptance
boundary. No fallback to sine for a misspelled waveform.

### Lifecycle and failures

| State or action                     | Required outcome                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Future voice cancelled before start | Every main/sub/noise source and local binding releases; no audible voice.                                   |
| Normal completion                   | All sources stop on the existing shared boundary; shared processing releases once ownership completes.      |
| One source completes or fails early | Disconnect that source without cutting surviving siblings; surface failures through existing diagnostics.   |
| Duplicate/late source completion    | No duplicate cleanup, no revived voice, and no effect on another voice.                                     |
| Partial voice setup fails           | Release all resources already owned by that voice and propagate the error; no orphan oscillator or binding. |
| Live-edit retirement                | Old active voices retain their original routing until finished; new graphs do not claim their resources.    |
| Instrument/engine destruction       | All owned sources, local nodes, and bindings release idempotently; late notifications are harmless.         |

Subs use the same scheduled start and shared stop semantics as the main voice,
including existing amplitude release and cleanup padding. Layer-level silence
is not source completion. No independent transport, wall-clock completion timer,
automatic retry, or new layer-tail policy is introduced.

## Ownership and boundaries

- Fluid owns typed authoring, overload validation, default resolution, and serialization; it does not own audio nodes or a second event scheduler.
- Schema owns the new optional synth fields and validation through existing graph/parameter boundaries. Existing noise and sampler contracts remain independent.
- Each emitted voice owns its main/sub/noise sources, local gain/effect nodes, and local automation connections/subscriptions. Early source completion must not destroy siblings or shared processing.
- The instrument retains existing common event resolution, shared LFO/MIDI ownership, and output balancing. Releasing one voice or configuring one gain must not alter shared modulation or another voice.
- The engine retains graph/bus retirement and readiness ownership. Native regression tooling and human reviewers retain separate numerical/listening acceptance roles.

## Acceptance criteria

Verification focuses on the new API, source targets, mixing, and voice ownership.
Reuse existing parameter coverage rather than duplicating tests of unchanged gain
helpers. The criteria below describe required outcomes, not checks already performed.

| ID   | Requirement(s) | Starting condition / action                                                                                                                                                                                                             | Expected outcome                                                                                                                                                                                                                        | Verification approach                                                                              |
| ---- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| AC1  | R1, R2, R9     | Construct default, gain-only, basic-selector, and both unison-alias forms; use each supported gain input in gain-only and selector-plus-gain calls; chain `.sub()` with common and engine-specific calls; inspect sampler availability. | Gain-only calls match explicit sine-plus-gain calls in schema and basic builder type; concrete builder types survive chaining; main gain defaults to 1; only synths expose the controls; explicit undefined selectors remain supported. | Focused type/API and serialization tests.                                                          |
| AC2  | R2, R5         | Use each of the three sub forms and all waveform aliases; replace a square/-2 configuration with gain-only input.                                                                                                                       | Defaults/canonical waveforms match the contract; exactly one sine/-1 sub remains after replacement.                                                                                                                                     | Builder/schema tests.                                                                              |
| AC3  | R2, R8         | Supply missing/extra arguments, wrong argument order, octave -3/0, patterned octave, unknown waveform, a gain string, or a nonfinite numeric gain.                                                                                      | Clear rejection without silent reinterpretation or partially replacing existing configuration.                                                                                                                                          | Negative authoring and schema tests.                                                               |
| AC4  | R3, R6         | Supply numeric-array/random/envelope/LFO/MIDI gains, including gain initially zero, above-one gain, and a layer release longer than shared release.                                                                                     | Existing addressing/phase/default/smoothing semantics hold; dynamic gain can become audible; above-one gain is preserved; shared voice stop is unchanged.                                                                               | Focused target/binding assertions using existing parameter coverage.                               |
| AC5  | R3, R8         | Supply negative gain literals, static array entries, and direct static gain schemas for the new main/sub controls.                                                                                                                      | Negative numeric gain values resolve to 0; positive values and octave selectors remain unchanged. Existing noise/effect gain behavior is unaffected.                                                                                    | Focused numeric-resolution and schema tests.                                                       |
| AC6  | R4, R9         | Compare main-only, sub-only, and mixed basic/unison voices with zero/unity main gain, noise, and ordered effects.                                                                                                                       | Gains affect only their respective contributions before effects/ADSR; unity main gain preserves baseline; unison compensation and noise levels are unchanged; no hidden normalization.                                                  | Topology assertions and native additive comparisons.                                               |
| AC7  | R4, R5         | Render stereo unison plus sub; vary main count/spread/width independently.                                                                                                                                                              | Main stereo is preserved; sub is centered and its count/pitch are independent of main unison controls.                                                                                                                                  | Native stereo/difference checks and listening.                                                     |
| AC8  | R5             | Schedule a chord and both octave choices with common static/pattern/random/envelope/LFO/MIDI detune.                                                                                                                                    | One correctly pitched sub per note; main/sub share the same resolved common detune trajectory rather than rerolling it.                                                                                                                 | Focused scheduling/parameter tests and native pitch checks.                                        |
| AC9  | R6             | Add main gain/sub to an instrument with MIDI output and ducking; mute only the main contribution.                                                                                                                                       | Existing note count, velocity, timing, and duck events are unchanged; audible sub/noise can remain under the same shared voice.                                                                                                         | Existing event/MIDI integration seams plus native render.                                          |
| AC10 | R6, R7         | Use non-aligned starts/stops, cancel a future voice, and complete sources in different orders with stale notifications.                                                                                                                 | No output outside scheduled source lifetime; future voices release fully; surviving siblings continue; cleanup is once-only.                                                                                                            | Focused lifecycle tests and native timing checks.                                                  |
| AC11 | R7             | Inject partial setup and main-worklet failure; retire with releasing voices; destroy repeatedly.                                                                                                                                        | Errors remain observable; no orphan resources or indefinitely retained graph; siblings finish normally; unrelated/new voices are unaffected.                                                                                            | Failure injection and existing retirement/binding tests.                                           |
| AC12 | R8, R9         | Validate omitted-field old schemas, malformed new fields, and sampler schemas carrying sourceGain/sub; attempt invalid graph updates.                                                                                                   | Old schemas remain valid; invalid configuration is rejected before replacing the last valid graph; samplers do not silently accept synth fields.                                                                                        | Schema and engine-update tests.                                                                    |
| AC13 | R4, R5, R9     | Freshly render representative basic/unison mixes with all sub waveforms and run existing no-feature references.                                                                                                                         | Repeatable finite audio, useful octave balance, no unintended clicks/level changes, and unchanged existing references within existing tolerances. New listening approval is recorded separately.                                        | Existing native harness at the sample rates selected during planning, plus human listening review. |

## Assumptions

The following implementation defaults leave the public behavior unchanged:

- **A3 — Source generation:** A native per-voice oscillator, ordinary basic-waveform levels, and existing per-note phase behavior are sufficient. Validate centered mixing, waveform quality, start/stop behavior, and useful levels through native renders/listening; no exact perceived-loudness equality is promised.
- **A4 — Schema shape:** Optional `sourceGain` and `sub` on the common synth schema are the minimal working layout. Exact internal names may change during planning if main versus amplitude gain remains clear and omitted-field compatibility is preserved. No existing external wire-format migration has been identified.

## Risks and open decisions

- **Blocking:** None for planning. No implementation or reference approval is implied.
- **Non-blocking — Ownership and detune fan-out:** Adding a sub adds a source and a common-detune target to each voice. Extend existing lifecycle/binding tests to cover those connections, sibling completion, and cancellation; do not duplicate the engine's gain-automation test matrix.
- **Non-blocking — Headroom and phase:** Correlated sources can increase peaks or cancel spectral components. Additive mixing does not guarantee loudness/peak safety; use listening review rather than hidden normalization or widened regression tolerances.
- **Non-blocking — Polyphony:** One extra oscillator and gain per note adds cost. Characterize representative overlapping basic/unison/noise voices during planning/delivery; no cross-device CPU budget has been agreed.

## Deferred work

- Numeric gain shorthand in a subsequent PR, including the intended `.sub("square", -2, "<0.3 0.5>")` form. Design it consistently across gain inputs rather than implementing a sub-only parser here.
- An oscillator configuration builder, illustratively `.sub(d.osc("square").octave(-2).gain(0.3, 0.5))`. Names and composition rules are not agreed; do not implement speculative builder hooks.
- More octave offsets, independently gated/sustained layers or tails, arbitrary oscillator layering, public phase controls, and waveform/octave modulation.
- Main unison waveform expansion, standalone noise instruments, saturation/compression, default safety limiting, and other roadmap features.
