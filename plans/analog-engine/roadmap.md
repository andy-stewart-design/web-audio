# Analog-inspired synthesis roadmap

## Purpose

Expand Drome's sound-design capabilities through richer source layers, per-voice tone shaping, and shared effects. Together these features should enable sounds such as a stable sine sub underneath detuned saws, shaped by saturation and a resonant filter.

This is a **feature roadmap, not a single-PR scope or a commitment to implement a complete analog engine**. Features can be designed and shipped separately. Native Web Audio nodes remain appropriate for most processing; custom worklets are useful where the source or DSP warrants them.

## Feature overview

- [x] Move per-instrument effects before each note's amplitude envelope ([implementation plan](pre-envelope-effects/plan.md)).
- [x] Deliver the saw-only unison engine with canonical `"unison"` / `"uni"` selectors.
- [x] Add an optional main-source gain argument to `d.synth()` and `.sub()` to synths in one PR ([source-mixing spec](source-mix/spec.md); [implementation plan](source-mix/plan.md)). Public forms, native verification, and final saved-reference listening are complete; reviewer `user` approved the saved reference with “Yep, sounds good.”
- [x] Add `.noise()` to both synths and samplers ([spec](noise/spec.md), [implementation plan](noise/plan.md)).
- [x] Add a saturator effect on voices and named buses ([spec](saturator/spec.md)); compressor and main-output effects follow separately.
- [ ] Add an opt-in compressor effect, primarily for buses.
- [ ] Add standalone `d.noise()` instruments as a separate follow-up to noise layers ([scope](#standalone-noise-instrument-follow-up)).
- [ ] Design/expose a public waveform API for the Unison engine

## Signal architecture

An instrument authors one configuration, but each note owns its sources and per-voice processing:

```text
main source → main gain ─┐
sub → sub gain ──────────┼→ user-ordered .fx() → voice amplitude ADSR
noise → noise gain ──────┘                              ↓
                                              routing / sends → buses → output
```

- The main source may be a native oscillator, a supersaw worklet, or sample playback.
- Sub is synth-only. Noise can accompany synths or samplers.
- Every voice gets its own effects chain and amplitude envelope. Mixing notes through one shared chain would lose their individual signal identity; they cannot then be separated into their respective envelopes.
- Shared instrument/bus processing happens after voices mix. Delay and reverb belong here when added, allowing their tails to outlive individual notes.
- Users choose the order inside `.fx()`. The engine fixes the chain's position before the voice ADSR.
- Moving existing effects changes behavior, especially filter ringing, gain automation, and interaction with saturation. Treat this as an intentional compatibility change.

The bounded per-voice effects set is biquad filters, gain, and saturation with drive control. Shared bus distortion is also valid, but sounds different: simultaneous notes interact through the nonlinear stage.

## Source-layer APIs

```js
.synth(0.5) // sine wave, gain 0.5
.synth("saw") // saw wave, gain 1
.synth("saw", 0.8) // saw wave, gain 0.8
.synth("<0.3 0.5>") // sine wave, alternating gain across bars

.noise(0.3) // white noise, gain 0.3
.noise("pink", 0.3) // pink noise, gain 0.3

.sub(0.3) // sine wave, -1 octave, gain 0.3
.sub(-2, 0.3) // sine wave, -2 octaves, gain 0.3
.sub("square", -2, 0.3) // square wave, -2 octaves, gain 0.3
.sub("square", -2, "<0.3 0.5>") // patterned gain across bars
.sub("square", -2, d.str([0.3, 0.5])) // gain values within one bar
```

Example:

```js
d.synth("saw", 0.8).sub("square", -1, 0.3).noise("pink", 0.3);
```

Main-source and sub gains each use the existing single-slot parameter contract:
a number, shorthand string or `d.sh()` value, numeric `d.str()` / `d.structured()`
value, or direct random-cycle, envelope, LFO, or MIDI CC builder. Raw gain arrays
and extra pattern arguments are rejected. `d.str(0.3, 0.5)` expresses successive
bars; `d.str([0.3, 0.5])` expresses within-bar values. See the
[source-mixing implementation plan](source-mix/plan.md) for the delivery and
acceptance boundary; native/listening acceptance is not claimed here.

Known sole synth-selector strings select the source; other sole strings are gain
shorthand for the default sine synth. Octave precedes sub gain. Finite negative
static gains resolve to `0` consistently across scalar, shorthand, structured,
and direct static-schema inputs without mutating reusable patterns. Automation
retains its existing behavior, including signed outputs; octave selectors and
existing noise gain behavior are unchanged. `d.osc()` configuration builders
remain a separate follow-up. See the [source-mixing spec](source-mix/spec.md)
and [implementation plan](source-mix/plan.md) for the exact contract and scope.

### Shared semantics

- These gains balance source layers **before mixing and `.fx()`**. The existing instrument gain/amplitude ADSR controls the complete voice afterward.
- The main-source gain is independent of oscillator type. Use a separate gain stage rather than making every source implementation provide its own mixing control.
- Default main-source gain is `1`, preserving the existing synth source level.
- Sub and noise are off unless explicitly enabled.
- Repeated `.sub()` or `.noise()` calls replace that layer's configuration rather than accumulating layers.
- Adding a layer must not silently reduce the main source's gain. Preserve predictable mixing and document headroom.
- Integrate layer gains with the existing numeric pattern/automation model rather than inventing a separate value system.
- Source layers share the voice's amplitude ADSR. Main-source, sub, and noise gains additionally accept the existing envelope input before mixing/effects; layer envelopes cannot extend voice lifetime. Independently gated/sustained layers and tails remain deferred.

### Sub behavior

- Default waveform: sine. Default octave offset: `-1`.
- Keep the initial octave choices bounded to `-1` and `-2`; support sine, triangle, square, and sawtooth with existing waveform aliases.
- Follow the note's pitch and common pitch/detune modulation, but do not inherit supersaw detune spread or stereo spread.
- Keep the sub centered for a stable low end.
- No separate sequencing, lifetime/ADSR setter, unison, or spread controls in this API. A gain envelope can independently shape the sub within the shared voice lifetime.

### Noise behavior

- Default color: white; pink is explicitly supported by the planned API. Brown can follow separately.
- In the noise-layer feature, noise accompanies each voice rather than being independently scheduled. Standalone `d.noise()` is a separate follow-up below.
- Use a per-voice worklet for continuous noise without a short buffer loop, including sustained notes held for tens of seconds. Deterministic event-derived streams vary across hits and voices while remaining reproducible for regression testing.
- Noise gain supports the existing numeric patterns, LFO, MIDI CC, and envelope inputs. A noise-gain envelope shapes the layer before mixing/effects; the shared voice ADSR still bounds the complete result and its lifetime.
- For samplers, preserve existing voice-duration rules. Noise continues through the shared amplitude release even if the sample ends first, without extending sustain. Cleanup must own all voice sources rather than tear down the graph on sample completion alone.
- See the [noise spec](noise/spec.md) for API, DSP, lifecycle, assumptions, and acceptance details.

## Standalone noise instrument follow-up

Add `d.noise().push()` so users can create noise-only hats, snares, wind, risers,
and filtered textures without an unwanted oscillator or sample. Deliver this as
a separate slice after noise layers, reusing their noise source/worklet and the
existing voice scheduling, effects, amplitude envelope, routing, and cleanup.

Illustrative API, subject to a dedicated feature spec:

```js
d.noise("pink")
  .xox("xooo")
  .gain(0.3)
  .adsr(0.01, 0.2, 0, 0.1)
  .fx(d.lpf(2000))
  .push();
```

- `instrument.noise(...)` adds an accompanying layer; `d.noise(...)` creates an
  instrument whose main source is noise. Its `.gain()` / `.adsr()` control the
  complete voice normally.
- Reuse white/pink generation rather than implementing a fake synth with a muted
  oscillator. No main-source gain API is required for noise-only sounds.
- Treat standalone noise as a first-class instrument through builder, schema
  validation, engine dispatch, and tests. Define its sequencing and duration
  defaults and which shared methods are meaningful; do not accidentally promise
  pitch behavior through `.notes()`, `.root()`, or `.detune()`.
- This item does not expand the current [noise-layer spec](noise/spec.md) or
  [implementation plan](noise/plan.md), where standalone noise remains explicitly
  out of scope. Detailed API/type and acceptance design belongs to the follow-up.

## Supersaw and unison follow-up

The delivered saw-only unison engine uses the retained internal supersaw source
and worklet, but its public surface is `d.synth("unison")` / `d.synth("uni")`
with `waveform: "sawtooth"`. There is deliberately no public
`d.synth("supersaw")` compatibility alias. A separate public supersaw engine
or additional unison waveforms requires a new scope of work.

The remaining roadmap item is future scope: it would decide whether to expose a
separate public `supersaw` selector and/or additional waveform controls. The
capabilities below are historical/reference notes for that future design, not
part of the current public API.

The retained source was adapted from:

`/Users/andy/Documents/Development/web-audio-examples/drome/packages/audio-worklets/src/worklets/worklet-supersaw.ts`

Its relevant capabilities are:

- Multiple saw oscillators per note.
- Detune spread across the oscillator stack.
- Stereo spread, separate from detune spread.
- Common frequency and detune for the stack.
- PolyBLEP waveforms to reduce aliasing.

Expose oscillator count, detune spread, and stereo spread independently. Exact public control names and units still need feature-level design; `.unison()` and `.spread()` were illustrative, not finalized APIs. A separate general-purpose unison mechanism is not required just to restore supersaw.

Implementation details to revisit:

- The old worklet defaults to seven oscillators and clamps the actual count to at least two, despite declaring a minimum of one.
- Its `freqspread` is the **total span in semitones**: `0.24` means endpoints at ±12 cents.
- Its `panspread` alternates oscillators left/right; it is not the same as detuning.
- It sums oscillators without count-based level normalization. Decide and document normalization separately from the user's main-source gain, since count changes otherwise also change saturation intensity.
- Keep worklet scheduling, lifecycle, parameter validation, and randomness compatible with the current engine and regression tooling rather than copying the old implementation unchanged.

## Saturator

Provide one effect with **drive and output gain**, rather than requiring separate conceptual drive and saturation effects:

```text
input → one AudioWorkletNode [drive → nonlinear processing → output gain]
```

- Drive determines how hard the signal hits the nonlinear stage.
- Saturation adds harmonics and rounds waveform peaks.
- Output gain lets users balance loudness independently of drive.
- Use one AudioWorkletNode per saturator, not a chain of native nodes. The [saturator spec](saturator/spec.md) carries forward fixed `tanh` with first-order ADAA as the working DSP default, informed by earlier listening.
- Users can place filters or gain before/after it through `.fx()`; do not hard-code one tonal recipe into every voice.
- The [saturator spec](saturator/spec.md) defines low-drive/bypass behavior, the proposed public API, parameter defaults, and verification boundaries, distinguishing working assumptions from explicit agreement.
- Deliver voice and named-bus saturation independently; compressor and main-output routing are not prerequisites.

## Compressor

Add an explicit, opt-in compressor, primarily for shared instrument buses, drum buses, and the main mix.

- Expose threshold, ratio, knee, attack, and release.
- Route through it for conventional compression. A send mixed with the dry path creates parallel compression, a distinct use case.
- Do not enable compression by default or silently add it to every voice.
- Keep it outside the initial bounded per-voice effects set.
- Native `DynamicsCompressorNode` is a reasonable starting point, but its lookahead introduces latency and it is not a guaranteed brick-wall/true-peak limiter.
- Default output protection is a separate, deferred decision; it should not be conflated with creative compression.

Ensure the main mix actually supports the chosen effect path rather than treating its configuration as gain-only. Public builder details remain to be designed.

## Reference sound: Subsonic

Reference: `/Users/andy/Downloads/subsonic.html`.

The demo uses **three oscillators**, not two:

```text
sine at 55 Hz → sub gain ────────────────────────┐
saw at 110 Hz, +12 cents ─┬→ harmonic gain ──────┼→ drive → saturation
saw at 110 Hz, -12 cents ─┘                      ┘
    → lowpass → amplitude ADSR → master gain → compressor → output
```

- Harmonic mix controls both saws together, before saturation.
- Unison width is detuning, not stereo width; the demo's signal is mono.
- The low sine stays steady while the upper saws beat against each other.
- There is no PWM or hard sync.
- The demo is monophonic with continuously running oscillators. Drome needs a separate source/shaping graph for each polyphonic voice, with shared output processing.

With the restored supersaw, the recipe is a main note at 110 Hz, two saws spread ±12 cents, no stereo spread, and a sine sub one octave below. The planned main-source gain supplies the equivalent of its harmonic mix control.

## Delivery considerations and deferred work

- Voice ownership/cleanup must accommodate multiple sources, not just one scheduled oscillator or buffer source.
- Future delay/reverb effects need tail-aware bus/graph retirement so live edits do not truncate their output.
- Extend the existing offline audio regression suite with reviewed examples as features land; include unchanged default behavior and the intended pre-ADSR routing change.
- Preserve per-voice gain/headroom predictability and test at supported sample rates.
- Consult source licenses before directly porting reference code. Felucca's ANALOG engine/shared DSP are MIT, but much of its surrounding firmware and effects is GPL-3.0-only.

Deferred: `d.osc()` configuration builders, arbitrary additional oscillator layers, independently gated/sustained layers or layer tails beyond the shared voice envelope, PWM, hard sync, and default safety limiting. Standalone `d.noise()` is tracked as a separate follow-up above, not a prerequisite for noise layers. Existing envelope input for noise gain is included in the noise-layer feature; main-source and sub gain envelopes are included in the source-mixing feature. The deferred items are not prerequisites for the sound-design capabilities above.
