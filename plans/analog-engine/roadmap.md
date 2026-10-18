# Analog-inspired synthesis roadmap

## Purpose

Expand Drome's sound-design capabilities through richer source layers, per-voice tone shaping, and shared effects. Together these features should enable sounds such as a stable sine sub underneath detuned saws, shaped by saturation and a resonant filter.

This is a **feature roadmap, not a single-PR scope or a commitment to implement a complete analog engine**. Features can be designed and shipped separately. Native Web Audio nodes remain appropriate for most processing; custom worklets are useful where the source or DSP warrants them.

## Feature overview

- [x] Move per-instrument effects before each note's amplitude envelope ([implementation plan](pre-envelope-effects/plan.md)).
- [ ] Deliver the saw-only unison engine with canonical `"unison"` / `"uni"` selectors (implementation complete; listening/reference acceptance pending).
- [ ] Restore/adapt a separate public supersaw engine and waveform surface.
- [ ] Add an optional main-source gain argument to `d.synth()`.
- [ ] Add `.sub()` to synths.
- [ ] Add `.noise()` to both synths and samplers.
- [ ] Add a saturator effect.
- [ ] Add an opt-in compressor effect, primarily for buses.

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
.synth("saw") // saw wave, gain 1
.synth("saw", 0.8) // saw wave, gain 0.8

.noise(0.3) // white noise, gain 0.3
.noise("pink") // pink noise, gain 1
.noise("pink", 0.3) // pink noise, gain 0.3

.sub(0.3) // sine wave, -1 octave, gain 0.3
.sub("square") // square wave, -1 octave, gain 1
.sub("square", 0.3) // square wave, -1 octave, gain 0.3
.sub("square", 0.3, -2) // square wave, -2 octaves, gain 0.3
```

Example:

```js
d.synth("saw", 0.8).sub("square", 0.3).noise("pink", 0.3);
```

### Shared semantics

- These gains balance source layers **before mixing and `.fx()`**. The existing instrument gain/amplitude ADSR controls the complete voice afterward.
- The main-source gain is independent of oscillator type. Use a separate gain stage rather than making every source implementation provide its own mixing control.
- Default main-source gain is `1`, preserving the existing synth source level.
- Sub and noise are off unless explicitly enabled.
- Repeated `.sub()` or `.noise()` calls replace that layer's configuration rather than accumulating layers.
- Adding a layer must not silently reduce the main source's gain. Preserve predictable mixing and document headroom.
- Integrate layer gains with the existing numeric pattern/automation model rather than inventing a separate value system.
- Source layers share the voice's amplitude ADSR; independent layer envelopes are deferred.

### Sub behavior

- Default waveform: sine. Default octave offset: `-1`.
- Keep the initial octave choices bounded to `-1` and `-2`; sine, triangle, and square are the intended initial waveform choices.
- Follow the note's pitch and common pitch/detune modulation, but do not inherit supersaw detune spread or stereo spread.
- Keep the sub centered for a stable low end.
- No separate sequencing, ADSR, unison, or spread controls in this API.

### Noise behavior

- Default color: white; pink is explicitly supported by the planned API. Brown can follow separately.
- Noise is generated/played as a layer of each voice, not as an independently scheduled instrument.
- Avoid unintentionally replaying the exact same noise burst on every hit; sources can share noise data while using varying offsets or another suitable strategy.
- For samplers, define how noise ends when sample playback finishes relative to the voice's scheduled envelope/release. Do not leave noise running after voice cleanup.

## Supersaw and unison follow-up

The delivered saw-only unison engine uses the retained internal supersaw source
and worklet, but its public surface is `d.synth("unison")` / `d.synth("uni")`
with `waveform: "sawtooth"`. There is deliberately no public
`d.synth("supersaw")` compatibility alias. A separate public supersaw engine
or additional unison waveforms requires a new scope of work.

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
input → drive gain → nonlinear waveshaper → output gain
```

- Drive determines how hard the signal hits the nonlinear stage.
- Saturation adds harmonics and rounds waveform peaks.
- Output gain lets users balance loudness independently of drive.
- A fixed `tanh` curve with smoothly automated input gain is a useful starting point. Native `WaveShaperNode` oversampling can reduce aliasing.
- Users can place filters or gain before/after it through `.fx()`; do not hard-code one tonal recipe into every voice.
- Specify low-drive and bypass behavior explicitly. Minimum drive is not automatically equivalent to bypass.
- Public factory naming, parameter units/ranges, and defaults remain feature-level design work.

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

Deferred: `d.noise()` and `d.osc()` configuration builders, arbitrary additional oscillator layers, independent layer envelopes, PWM, hard sync, and default safety limiting. These are not prerequisites for the sound-design capabilities above.
