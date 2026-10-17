# Saw-only unison specification

## Status

- Readiness: Ready for planning.
- Blocking decisions: None.
- Source: The supersaw scope interview, agreement on engine-specific builders/minimal validation, and subsequent decision to expose a saw-only `"unison"` engine (`"uni"` alias) with other waveforms deferred; [analog-inspired synthesis roadmap](../roadmap.md).
- Delivery state: Phases 0–1, the original supersaw Step 2.1, the revised saw-only unison Step 2.1a, and native Step 2.2 have recorded evidence in [plan.md](plan.md). The original supersaw evidence is historical; the revised unison path and native playback proof are complete, while listening/performance acceptance remains pending.
- Public engine names, saw-only `.type()` behavior, and separation of engine identity from waveform are agreed decisions. Remaining working defaults, normalization details, and the proposed serialized field layout are assumptions, not separately user-approved decisions.
- Keep the existing `supersaw/` planning directory and historical evidence paths. Existing internal saw processor/source names may remain; no mechanical rename of verified Phase 1 code is required.

## Problem and intended outcome

Drome's synth currently provides one native oscillator per note. It cannot directly produce a controllable stack of detuned saws with stereo width. The earlier Drome supersaw supplies a useful starting point, but its unnormalized sum, nondeterministic phase initialization, and block-level start handling should not be copied unchanged.

Users should be able to select a unison engine, control its oscillator count, detuning, and width, and modulate its sound through the existing parameter system. This SOW supports sawtooth only: it produces the supersaw sound, while naming the engine for its mechanism and keeping waveform identity separate. Its output must participate in the existing per-voice effects, amplitude envelope, scheduling, and cleanup rather than becoming a separate playback subsystem.

This also establishes a small, typed boundary for future synthesis engines: the builder returned by `d.synth()` exposes only controls supported by the selected engine. It does not implement future engines or a plugin framework.

## Scope

Included:

- `d.synth("unison")` and the `"uni"` alias, backed by the existing AudioWorklet saw stack with oscillator-count compensation.
- Engine-specific basic-oscillator and unison builders, with shared fluent synth behavior and discriminated schema variants.
- Unison defaults to sawtooth and accepts `.type("saw")` / `.type("sawtooth")` only. Engine identity and oscillator waveform are separate settings; no other unison waveform is enabled in this SOW.
- Independent oscillator count, cents-based detune spread, and stereo width controls.
- Existing pattern/random inputs for count; full existing AudioParam inputs for spread and width.
- Common pitch/detune, sample-aligned scheduling, shared voice processing, and lifecycle integration in both real-time and offline contexts.
- Small extensions to existing validation, focused tests, documentation, and reviewed native saw-only unison recordings.

Non-goals:

- FM or other future engines, placeholder engine classes, plugin registries, dynamic engine loading, or a generalized synthesis framework.
- Non-saw waveforms inside the unison engine; their DSP, API/type expansion, validation, and listening acceptance belong to a separate SOW. Also excluded: adding unison controls to basic builders, sub/noise layers, a second synth gain argument, independent layer envelopes, or new effects.
- Cross-engine mutation through `.type()`, live oscillator-count modulation within a note, new phase/seed controls, or a new public scheduling API.
- A new validation library, parallel runtime type system, generalized schema walker, new renderer, or broad duplicate tests of unchanged behavior.
- Exact reproduction of the old supersaw's levels, stereo algorithm, phase randomness, or API units; default compression, limiting, automatic gain control, or voice stealing.

**Central invariant:** Engine-specific source generation feeds one shared voice pipeline. Every note retains independent source state, effects, amplitude envelope, and completion ownership; engine selection must not expose or silently ignore another engine's controls.

## Current behavior and evidence

The following observations describe the original pre-implementation baseline, not the current uncommitted worktree. Preserve them as context for Phases 0–1; implementation evidence is in the plan. The original supersaw-named Step 2.1 is not evidence that the revised unison surface below has passed.

- `packages/fluid/src/drome.ts` always returns the current `Synthesizer` builder from `synth(type?: WaveformAlias)`. `packages/fluid/src/instruments/synthesizer.ts` owns basic waveform selection, `.type()`, synth event compilation, and MIDI-output configuration. Shared instrument methods already return `this`.
- `packages/schema/src/index.ts`, `constants.ts`, and `packages/fluid/src/inputs/waveform.ts` use the same basic waveform vocabulary for synths and LFOs. Adding supersaw to that shared vocabulary indiscriminately would incorrectly make it an LFO waveform.
- `packages/schema/src/validate-graph.ts` already validates synth identity/waveform, number patterns, envelopes, LFOs, and MIDI CC parameters through ordinary functions. `Drome.getSchema()` and `AudioEngine.update()` use this boundary. No new validation system is needed.
- `packages/audio-engine/src/instruments/synthesizer.ts` creates a native oscillator per resolved note and delegates to the common voice scheduler. `instrument.ts` connects `source → ordered effects → amplitude envelope → balancing/mute → routing/sends` and owns parameter bindings and cleanup. `types.ts` currently tracks native scheduled sources, so a worklet needs a narrow integration seam rather than an unsafe cast to a native source.
- The common modulation code handles static/random values, event envelopes, shared LFOs, and MIDI CC. Its LFO discovery currently visits detune/effects only; new source parameters must participate deliberately.
- `packages/worklets` already bundles processor sources for registration, with an LFO implementation and package declaration surface. Engine readiness uses `registerWorklets()` with `BaseAudioContext`.
- Reference: `/Users/andy/Documents/Development/web-audio-examples/drome/packages/audio-worklets/src/worklets/worklet-supersaw.ts`. It defaults to seven saws, total detune span `0.2` semitones, and pan spread `0.4`; actually clamps count to at least two; starts phases with `Math.random()`; alternates pan sides; sums without count compensation; and skips a whole render block when its block start is at/before scheduled start. These are reference-code observations, not behavior to preserve wholesale.
- `packages/audio-regression/README.md` documents the existing native offline renderer and individual listening-approved references. Keep those safeguards and its default comparison tolerances.

## Requirements and invariants

- **R1 — Typed engine selection:** `d.synth()` and basic aliases return a basic-oscillator builder; `d.synth("unison")` and `d.synth("uni")` return the same unison builder type. Its `.type()` accepts only saw aliases in this SOW. Shared fluent calls retain the specific builder type. Unsupported shapes/engine controls are rejected rather than ignored, and unsupported engine names fail rather than selecting a fallback.
- **R2 — Thin extension boundary:** Share notes/timing, gain/ADSR, detune, effects, routing, and MIDI behavior. Implement only the two current engines. Use small discriminated schemas and engine-specific source creation feeding shared playback; do not duplicate schedulers or build speculative registries/validation infrastructure.
- **R3 — Control semantics:** Count is resolved by the existing final-hit value model at note-on and fixed for that note. Spread is maximum deviation in cents around common pitch; width is a separate stereo dimension. Support the inputs and bounded resolved values specified below.
- **R4 — Modulation integration:** Spread and width accept static/pattern/random values, envelopes, LFOs, and MIDI CC with the same event origins, phase/value semantics, initialization, and cleanup as existing AudioParams. Common detune moves the whole stack without replacing spread. Shared LFOs are registered once and do not acquire an accidental intrinsic-value offset.
- **R5 — DSP and levels:** Produce a band-limited saw stack with independent per-note state, symmetric detuning, useful stereo width, finite output, and deterministic count compensation. Count primarily changes texture rather than yielding the old unscaled sum. No claim of exact perceived-loudness equality, alias-free synthesis, or brick-wall peak protection is made.
- **R6 — Audio-time scheduling and lifecycle:** Start/stop within render quanta at the scheduled audio sample, emit silence outside source lifetime, and terminate processing/owned resources. Future cancellation, active-voice Stop behavior, graph replacement/retirement, and destruction retain existing semantics; late worklet messages cannot complete or disconnect another voice.
- **R7 — Minimal validation and failure behavior:** Extend existing graph/parameter validation with small engine-specific checks. Reject invalid engine configurations and nonfinite/malformed parameter inputs before accepting playback configuration, without mutating the active graph. Handle permitted finite out-of-range values through the documented bounded resolution policy. No silent engine substitution or ignored known engine-specific fields.
- **R8 — Existing behavior preserved:** Basic synth and sampler authoring, event semantics, native waveforms/LFOs, audio output, effect order, amplitude timing, routing/sends, duck triggers, and MIDI note output keep their current contracts. `.type()` selects a supported waveform within the chosen builder, never another engine. Basic builders retain their existing waveforms; unison is saw-only for now.
- **R9 — Repeatability and bounded verification:** Identical authored inputs and scheduling reproduce unison audio in fresh offline renders without relying on wall-clock timing or ambient randomness. Add focused proof of new behavior and human-reviewed native recordings using existing infrastructure; retain existing references/tolerances and avoid duplicate testing machinery. Documentation must distinguish implemented behavior from future engines and source layers.

## Behavior and contracts

### Builders and public API

The engine selectors and saw-only shape restriction below are agreed; other control defaults remain A1:

```ts
d.synth(); // OscillatorSynth, sine by default
d.synth("saw").type("square"); // OscillatorSynth

d.synth("unison"); // UnisonSynth, sawtooth by default
d.synth("uni") // same engine and builder
  .type("saw") // optional; also accepts "sawtooth"
  .notes([60, 64, 67])
  .gain(0.5)
  .voices(7)
  .spread(12) // endpoints at -12 and +12 cents
  .width(0.4)
  .fx(d.lpf(2_000))
  .push();
```

Conceptual overloads return the appropriate builder for basic aliases versus `"unison"` / `"uni"`. A variable typed as a union of engine selectors returns the corresponding builder union, not `any` or a falsely specific type. Preserve the existing optional basic selector, including omitted/undefined input. Internal class names do not need new public package exports.

- Basic builders retain `.type()` for their existing basic waveform aliases. The unison builder exposes `.type("saw" | "sawtooth")`, serializing the canonical shape `"sawtooth"`. Both are waveform setters, not engine switches.
- `.type("square")`, `.type("sine")`, and `.type("triangle")` on unison are compile-time errors and runtime rejections in this SOW. Do not accept, coerce, or silently ignore unsupported shape requests. Future waveform support is a separate SOW, not a stub branch in this one.
- `.voices()`, `.spread()`, and `.width()` belong only to unison. Shared calls such as `.notes().gain().fx()` must not erase those capabilities from its return type.
- Invalid calls such as `d.synth("sine").spread(12)` are type errors and are not supported JavaScript authoring. Ordinary missing-method errors are sufficient; no proxy or custom method-interception system is required.
- `d.synth("fm")` remains unsupported. The unshipped `"supersaw"` public selector is replaced, not retained as a compatibility alias. Do not add fake engine builders or compatibility shims to demonstrate extensibility.
- `.gain()` still controls the existing final voice amplitude envelope, not a new source-layer gain. Count compensation is internal to unison.

### Controls and defaults

Defaults and finite-value normalization are the working baselines A1/A4, not additional interview approvals:

| Control            | Input model                                                 | Default  | Resolved behavior                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `voices(...input)` | Existing `CycleInput<number>`: static, patterned, or random | 7        | Round to nearest integer, then clamp to 1–8 at note-on. Hold for the whole note. Envelopes/LFOs/MIDI CC are unsupported.                                                                          |
| `spread(...input)` | Existing `AudioParamInput`                                  | 10 cents | Clamp finite negative values to 0. For N > 1 distribute detuning evenly from minus spread to plus spread. No separate public upper range is introduced; protect frequency calculation internally. |
| `width(...input)`  | Existing `AudioParamInput`                                  | 0.4      | Clamp resolved finite values to [0, 1]. Zero centers the stack; one spans the stereo field.                                                                                                       |

Existing variadic bar/hit pattern syntax and deterministic randomness apply; do not introduce another pattern representation. Repeated setter calls replace that parameter configuration. Count zero is not a rest: it resolves to one oscillator; use existing rhythm/gain controls for silence.

All chord tones at one event receive the same hit-addressed parameter values but own independent audio state. One oscillator is centered, has zero detune offset, and has no division-by-zero special-case leak; spread/width do not create extra oscillators. Width zero produces equal left/right source output, not two unrelated mono renders.

For common frequency `f`, detune `d` cents, and per-oscillator offset `s_i` cents, the intended pitch is `f × 2^((d + s_i) / 1200)` within the processor's safe frequency range. Extreme finite modulation must not overflow into NaNs or wrap a frequency above Nyquist down to an unrelated audible pitch.

### Sound, normalization, and phases

Adopt a deterministic count-only gain law. The working DSP baseline is `1 / sqrt(N)` per oscillator before stereo panning (A2), compensating nominal power rather than guaranteeing equal peaks or identical perceived loudness. Do not dynamically normalize each note's waveform, add a compressor/limiter, or change the shared instrument balancing gain to hide stack growth.

Use a band-limiting technique such as the old processor's polyBLEP, with safe phase increments and no naive saw discontinuity as the only implementation. Pitch, detune, spread, and width automation must work for both constant and audio-rate parameter arrays. Steady controls should not require avoidable per-sample allocation.

The stereo baseline is symmetric positions around center with equal-power panning (A3), rather than the old alternating-side algorithm with an odd-count bias. Distinct left/right samples are expected when width is nonzero; exact instantaneous channel equality/energy balance is not required for different detuned partials.

Use varied but deterministically initialized phases per scheduled voice (A3). Do not seed from worklet construction time, wall-clock time, `Math.random()`, or unrelated global pattern RNG consumption. Repeated notes may have different initial phases while remaining reproducible for identical event identities and authored inputs. No public seed or phase API is required.

### Schemas and validation

Use engine-specific variants built on existing common synth fields, with distinct engine identity and oscillator waveform. The revised minimal proposal A5 preserves existing basic schemas without an `engine` field and gives unison schemas `engine: "unison"`, `waveform: "sawtooth"`, `voices: NumberPattern`, `spread: AudioParamSchema`, and `width: AudioParamSchema`. A basic variant can declare `engine?: never` in its TypeScript shape so the explicit tag discriminates unison without migrating basic schemas. These two fields now represent different choices, not redundant tags.

Fluid canonicalizes `"uni"` to the engine identity `"unison"` and saw aliases to `"sawtooth"`. Default and explicit saw selection serialize equivalently. Basic synths must not serialize unison controls. Validate required unison parameters and its saw-only shape; reject unknown engine tags, an unison tag paired with another waveform, and the old `waveform: "supersaw"` variant. No dual-format parser is needed for the unshipped 2.1 shape. Keep the basic/LFO waveform vocabulary unchanged: neither `"unison"` nor `"uni"` is an oscillator/LFO waveform.

Extend `validateDromeGraph()` and reuse its existing number-pattern/AudioParam validators. Add only small checks for the selected variant, required controls, unsupported count modulation, and known mismatched engine settings. This does not require making every existing schema object globally strict against every unknown key.

Nonfinite literals, malformed patterns/automation, and unsupported engine identities are invalid. Permitted finite out-of-range values are bounded according to the table at resolution/rendering rather than requiring a new static range-analysis system for arbitrary LFOs/envelopes/random patterns. Count allocation must remain bounded regardless of input. Defensive processor handling must prevent unexpected bad arithmetic from contaminating output with nonfinite samples.

Schema rejection through `AudioEngine.update()` leaves the last valid pending/active configuration intact under the existing validation-before-assignment contract. Module-registration errors propagate through engine readiness; do not silently substitute a native oscillator. A generalized processor-failure recovery system is not included.

### Source lifecycle and shared processing

```text
saw-only unison stack → existing ordered .fx() → existing amplitude ADSR
    → instrument balancing/mute → existing routes/sends/buses
```

The worklet generates the source; it does not duplicate the voice's amplitude envelope. Stereo must survive the existing voice chain and use normal Web Audio downmixing when the destination is mono.

- Scheduling remains audio-time based, not a main-thread timer. Use the first sample whose audio time is at/after scheduled start and suppress samples at/after scheduled stop, including boundaries inside a render quantum. Do not reproduce the reference's whole-block start skip.
- Keep existing source-stop timing after envelope release. A worklet can report completion asynchronously, but it cannot keep sounding because its message has not yet reached the main thread.
- Stop cancels not-yet-started voices while already-started voices follow current behavior. Cancelling before start must clean up even if the processor has not run or will never send completion.
- Voice completion releases its worklet, effects, envelope, message handlers, and modulation bindings without disconnecting another voice. Duplicate/late messages and repeated destruction must be harmless to ownership/completion.
- Retiring graph voices stay on their old graph until finished; replacement graphs cannot claim their completion. No new voice-stealing or effect-tail policy.
- Existing MIDI output and ducking remain musical-event based: seven internal saws are still one note, not seven MIDI notes or duck triggers.

## Ownership and boundaries

- Fluid owns the engine-specific builders and shared fluent authoring behavior. Schema owns the small typed variants and existing graph-validation boundary.
- The audio engine owns event resolution, source selection, parameter binding, and shared voice lifecycle. Introduce only the source seam needed to accommodate a native scheduled source and this worklet; a small wrapper/adapter is acceptable, a duplicate runtime inheritance hierarchy or generic plugin system is not required.
- The worklet package owns bundled processor code and its declarations. The processor owns oscillator phases, source-time gating, count compensation, panning, and termination; it does not own musical sequencing or downstream effects.
- Existing native rendering/reference tooling remains the verification owner. Reuse existing parameter/lifecycle tests for unchanged contracts. No new general renderer, validation infrastructure, or large fake-node framework.

## Acceptance criteria

| ID   | Requirement(s) | Starting condition / action                                                                                                                                                                            | Expected outcome                                                                                                                                                                                                                                                            | Verification approach                                                                                                                 |
| ---- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | R1, R2, R8     | Construct default/basic and both unison aliases; chain shared methods before controls/`.type()`; attempt unsupported engine controls and non-saw unison shapes.                                        | Both unison aliases retain the same builder type; default/explicit saw agree. Native `.type("square")` remains valid; unison `.type("square")` and unsupported selectors are rejected, not ignored.                                                                         | A few compile-time assertions and representative authoring tests.                                                                     |
| AC2  | R2, R7, R8     | Serialize both variants/aliases; validate a direct unison schema, unsupported unison shapes, malformed/nonfinite controls, wrong-engine settings, old supersaw tags, and invalid LFO engine selectors. | Engine and waveform remain distinct; only unison/saw validates for this engine. Invalid configurations fail before replacement playback. Existing basic schemas/LFOs remain valid and engine selectors do not leak into LFO waveforms.                                      | Small additions to existing schema/builder suites; no new validation harness.                                                         |
| AC3  | R3, R4         | Author count patterns/randomness and continuous spread/width modulation; schedule multiple hits and a chord.                                                                                           | Count follows final hit identity and stays fixed per note. Spread/width use existing envelope/LFO/MIDI semantics and correct targets without offsets; controls bound as documented.                                                                                         | Focused resolution/binding assertions, reusing existing parameter coverage rather than repeating its full matrix.                     |
| AC4  | R3, R5         | Render one oscillator and a two-oscillator stack with spread 12, then zero/nonzero width and odd/even counts.                                                                                          | One oscillator is centered; two detune offsets are ±12 cents; width is independent of tuning; zero width yields equal source channels; odd counts have no systematic panning assignment bias.                                                                               | Small processor/DSP tests with controlled phases and selected native listening coverage.                                              |
| AC5  | R5             | Render identical controlled configurations at counts 1, 2, 7, and 8, including high notes and extreme finite modulation.                                                                               | Documented count compensation is applied rather than unscaled summation. Output stays finite and oscillator allocation bounded; no above-Nyquist frequency wrap or unprotected naive saw fallback.                                                                          | Focused numerical/DSP tests and listening to level/quality changes; not a promise of identical RMS for every phase/pitch combination. |
| AC6  | R6             | Start/stop at a non-quantum-aligned sample; cancel another voice before start; stop transport with an active voice.                                                                                    | No full-block start delay or source output outside the scheduled interval. Future cancellation does not wait for a worklet message; active Stop behavior stays unchanged.                                                                                                   | Processor boundary tests and targeted native/engine integration at 44.1/48 kHz.                                                       |
| AC7  | R2, R4, R6, R8 | Overlap two unison notes with effects/modulation; complete one, replace its graph, and destroy repeatedly.                                                                                             | Each source uses its own effects → ADSR path, retains stereo, and cleans up once without affecting a surviving/new voice. Existing retirement and binding ownership remain intact.                                                                                          | One focused lifecycle/composition test at the new source seam plus existing lifecycle suites.                                         |
| AC8  | R6, R7, R8     | Register/render the new source in real-time/offline paths; exercise readiness failure, named routes/sends, MIDI output, and ducking through existing contracts.                                        | Registration errors surface without fallback. Existing downstream placement/semantics hold; internal oscillator count does not multiply musical events.                                                                                                                     | Targeted registration/source tests and existing downstream/MIDI/duck integration coverage; no wholesale duplicate suite.              |
| AC9  | R5, R9         | Render the same saw-only unison sketches in fresh contexts/processes with static and modulated settings.                                                                                               | Repeatable finite output meets unchanged comparison limits; reviewed recordings demonstrate useful spread/width and acceptable compensated levels without abnormal clicks/ringing.                                                                                          | Existing native harness and individual human listening approval.                                                                      |
| AC10 | R2, R8, R9     | Run existing basic synth/sampler/audio references after the structural change and inspect delivered documentation.                                                                                     | Existing authored audio remains within its accepted tolerances without unrelated reference rewrites. Documentation states unison/uni aliases, saw-only `.type()`, builder boundaries, defaults/units, input modes, normalization limits, and separate future waveform work. | Existing regression suite and documentation review; no blanket rebaseline.                                                            |

## Assumptions

These are working design baselines, not additional user-approved decisions. They make planning concrete; validate them in the named manner rather than reopening the settled feature scope.

- **A1 — Control defaults:** `.voices()`, `.spread()`, `.width()`; count 1–8/default 7; spread default ±10 cents; width default 0.4. These control defaults preserve the old tuning/width intent while fixing its inability to use one oscillator; validate usefulness through listening. The `"unison"` / `"uni"` selectors and saw-only `.type()` restriction are now agreed decisions, not naming assumptions.
- **A2 — Count gain law:** Start with `1 / sqrt(N)` plus stereo panning, not the old unscaled sum. The agreement is compensation, not a particular formula. Validate nominal levels/headroom with controlled DSP tests and listening; if this law is unsuitable, document the alternative deterministic count-only law and evidence before recording acceptance. No compressor/AGC is authorized by this assumption.
- **A3 — Stereo and phases:** Symmetric equal-power pan positions and deterministic varied phase initialization replace the old alternating pan/random phases. Validate stereo/mono behavior, absence of odd-count bias, repeatability, and musical quality. An internal event-derived seed is sufficient; no public seed setting is implied.
- **A4 — Value bounds:** Finite count values round/clamp; width clamps to [0, 1]; spread has a zero floor with frequency-domain protection rather than a new public maximum. This follows existing numeric pattern flexibility without adding static analysis. Cover representative boundaries and document it; malformed/nonfinite input remains invalid.
- **A5 — Minimal schema evolution:** The proposed `engine: "unison"` plus `waveform: "sawtooth"` variant separates engine from shape while leaving existing basic schemas untagged and valid. Exact field layout is a planning baseline, not a separately selected wire format; equivalent small variants must preserve this distinction and document compatibility consequences. Do not retain the unshipped supersaw variant through dual-format parsing or add a migration framework.

## Risks and open decisions

- **Blocking:** None. Ready for planning is not permission to implement or approve recordings.
- **Non-blocking — source seam:** Native `AudioScheduledSourceNode` lifecycle is not provided by `AudioWorkletNode`. The adapter must be small but real; casting away this difference or using wall-clock completion timers is not acceptable.
- **Non-blocking — sound:** Compensation reduces incidental level growth but cannot equalize every correlated phase arrangement or guarantee clipping-free output. The precise law, deterministic phase choices, and stereo mapping require numerical checks and listening before acceptance.
- **Non-blocking — performance:** Up to eight oscillators per note multiplies work with polyphony. Avoid hot-loop allocation and profile representative overlapping notes on a recorded browser/device. No cross-device latency/CPU guarantee or new global voice budget has been agreed.
- **Non-blocking — verification scope:** Unit tests cannot establish audible quality or real worklet scheduling alone. Native tests should exercise the new seam, but must not expand into a second renderer or repeat unchanged contracts already covered elsewhere. All observation windows must be nonempty and lie inside the rendered audio, including post-release checks.
- **Non-blocking — documentation drift:** The roadmap and original 2.1 evidence use supersaw naming. This agreed saw-only unison revision supersedes those public API details, not the verified saw DSP or historical evidence. Reconcile current roadmap/descriptions during delivery; preserve historical results and internal names where renaming adds no value.

## Deferred work

- Non-saw unison waveforms, including square, sine, and triangle. Their alias/type/schema expansion, band-limited DSP, validation, and listening tests require a separate SOW.
- FM and other engine implementations, unison controls on basic builders, public engine plugins, and cross-engine builder mutation.
- Main-source gain argument, sub/noise layers, independent oscillator-layer builders/envelopes, PWM/hard sync, and new effects from the broader roadmap.
- Continuous oscillator-count modulation, public phase/seed controls, automatic dynamics/limiting, voice stealing, and generalized processor-failure recovery.
- A larger abstraction should be reconsidered only when another concrete engine demonstrates a repeated need that this two-engine boundary cannot handle cleanly.
