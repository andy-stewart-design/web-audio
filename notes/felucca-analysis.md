# Felucca analysis and Web Audio feature roadmap

## Summary

Felucca contains a substantial amount of useful synthesis and sound-design knowledge that can transfer to Drome without adopting its complete engine or requiring WASM.

The most useful lessons are:

1. Treat a voice as a small signal graph, not necessarily one oscillator.
2. Mix oscillator layers, shape their timbre, and then apply the voice's final amplitude envelope.
3. Distinguish per-voice processing from shared instrument/song processing.
4. Use saturation, filtering, independent timbre modulation, and characteristic transients together rather than expecting a waveform alone to create an instrument.
5. Use native Web Audio nodes for straightforward synthesis and effects; reserve custom worklets for sample-level algorithms that benefit from them.

The feature roadmap developed from this analysis is:

- Supersaw worklet.
- Optional second gain argument to `d.synth()` for the main source layer.
- Per-voice effects before each note's amplitude envelope.
- Sub-oscillator API on synths.
- Noise API on synths and samplers.
- Saturator effect.
- Opt-in compressor effect, primarily for buses.

These are related features, **not a proposed single PR**. Together they enable much richer sounds while preserving the existing event scheduling, parameter patterns, modulation, routing, and bus architecture.

## Scope and sources

This analysis is based on source inspection, not a listening comparison, browser compatibility study, or performance benchmark.

Repositories and examples inspected:

- Drome/Web Audio: `/Users/andy/Documents/Development/web-audio`
- Felucca: `/Users/andy/Documents/Development/web-audio-examples/Felucca`
- Subsonic demo: `/Users/andy/Downloads/subsonic.html`
- Earlier Drome supersaw: `/Users/andy/Documents/Development/web-audio-examples/drome/packages/audio-worklets/src/worklets/worklet-supersaw.ts`

The observations about the current engine describe the source inspected during this discussion. They should be checked against the implementation when work begins.

## 1. What WASM contributes—and what it does not

Felucca's browser emulator runs its firmware in WASM inside an AudioWorklet. The worklet asks the firmware to render audio and advances the simulated device's clock from that rendering. It also exchanges device input, display state, and persistent storage with the page.

This is useful for running the same firmware in the browser and on hardware, but WASM is not itself responsible for the synthesis character.

The sound comes from algorithms and choices such as:

- Oscillator combinations and tuning.
- Nonlinear processing and its position in the signal path.
- Resonant filters and their modulation.
- Physical resonators and excitation signals.
- Independent envelopes for different components of a sound.
- Instrument-specific attacks, noise, and performance behavior.
- Chorus, delay, reverb, and gain staging.

Many of these can be implemented using native nodes. Custom DSP can also run in JavaScript AudioWorklets; WASM is an option, not a prerequisite.

Felucca's fixed-point arithmetic, lookup tables, compressed-sample decoding, memory pools, and small control blocks primarily address embedded hardware constraints. Those details should not be copied automatically into a browser implementation.

Sources:

- [Felucca README](../../web-audio-examples/Felucca/README.md)
- [Browser worklet](../../web-audio-examples/Felucca/web/emu/worklet.js)
- [Engine submodule README](../../web-audio-examples/Felucca/firmware/engines/README.md)

## 2. Current Drome foundation

The inspected synth scheduler creates one native `OscillatorNode` per note. The shared instrument implementation creates a gain envelope and then connects the per-note effects after that gain.

Conceptually, the current synth voice is:

```text
oscillator → amplitude ADSR → effects → instrument output
```

Other existing foundations are already valuable:

- Explicit event scheduling.
- Numeric value patterns.
- Envelope and LFO parameter support.
- MIDI parameter bindings.
- Instrument routing and sends.
- Shared buses.
- Voice cleanup and graph retirement.
- Offline, listening-approved audio regression tooling.

The proposed features should extend these systems rather than create a separate scheduling or modulation model.

Relevant source:

- [Synth scheduler](../packages/audio-engine/src/instruments/synthesizer.ts)
- [Instrument runtime](../packages/audio-engine/src/instruments/instrument.ts)
- [Bus runtime](../packages/audio-engine/src/buses/runtime-bus.ts)
- [Engine graph lifecycle](../packages/audio-engine/src/index.ts)
- [Envelope timing](../packages/audio-engine/src/utils/compute-envelope.ts)
- [Audio regression tooling](../packages/audio-regression/README.md)

## 3. The most immediately transferable Felucca ideas

### 3.1 Richer subtractive synthesis

Felucca's ANALOG engine combines two band-limited oscillators, optional noise, drive, and a resonant multimode filter. Additional oscillator modes provide a sub or hard sync. Filter keyboard tracking and modulation help the same patch behave musically across the keyboard.

A useful simplified architecture is:

```text
oscillator layers + noise → drive/saturation → resonant filter → amplitude envelope
```

Native Web Audio equivalents include:

| Feature | Starting point |
| --- | --- |
| Layered oscillators | Multiple `OscillatorNode`s |
| Sub-oscillator | Oscillator at an octave-related frequency |
| Noise | Noise buffer and per-voice playback source, or a worklet |
| Drive/saturation | Gain into `WaveShaperNode` |
| Resonant filter | `BiquadFilterNode` |
| Keyboard tracking | Calculate filter settings from note pitch |
| Stereo spread | Panners or a stereo-generating worklet |

Native oscillators already provide band-limited standard waveforms. Porting Felucca's polyBLEP implementation is not necessary just to get a useful native saw or square.

A native biquad can approximate the musical role of Felucca's filter, but it should not be described as an exact reproduction of its trapezoidal state-variable filter and resonance saturation behavior.

Source: [ANALOG engine](../../web-audio-examples/Felucca/firmware/engines/src/eng_analog.c).

### 3.2 Distortion is more than a clipping curve

Felucca's shared track distortion uses approximately:

```text
low cut → drive → asymmetric soft clipping → tone low-pass → output compensation
```

The important design ideas are:

- Remove some low-frequency energy before clipping so the bass does not dominate the nonlinear stage.
- Use controlled asymmetry when even harmonics are desirable.
- Filter after distortion to tame harsh high-frequency content.
- Provide output compensation so changes in timbre can be evaluated separately from changes in loudness.

A minimal saturator need not include this complete pedal-style architecture. Users can compose filters and gain around a saturator in `.fx()`. The complete chain remains a useful future distortion design for buses or instruments.

Source: `track_dist()` in [effects implementation](../../web-audio-examples/Felucca/firmware/src/fx.c).

### 3.3 Envelope behavior affects the entire instrument library

The inspected Drome envelope runtime uses linear ramps and derives attack, decay, and release durations from note duration. That is useful for rhythmic live coding, but not the only useful behavior.

Potential later improvements:

- Exponential-style decay and release curves.
- Explicit absolute-time envelopes alongside proportional timing.
- Tempo-synchronized timing where useful.
- Independent brightness and amplitude envelopes.
- Instrument-specific transients rather than only a generic ADSR.

A fixed-duration pluck should be able to retain its characteristic decay when the rhythm changes. A bright transient should be able to decay faster than the body of the note.

These are recommendations for later exploration, not additions required by the agreed first noise/sub APIs. Existing proportional envelope semantics should not be silently replaced.

### 3.4 Physical modeling offers a genuinely new sound family

Felucca's PHYS engine includes modal bodies, strings, membranes, and sympathetic strings.

The modal model is an especially attractive starting point: a filtered strike excites a bank of resonant modes. Its musical controls include:

- Structure: harmonic versus inharmonic mode relationships.
- Brightness: excitation and behavior of upper modes.
- Damping: decay.
- Position: which modes the strike excites.

A first browser approximation could use a short excitation feeding parallel native band-pass filters. That could provide bells, mallets, metal, and resonant percussion without recorded samples.

The same resonator bank could become an effect: a sample or drum loop excites a pitched body.

String models are a stronger candidate for a custom worklet because accurate fractional delays and sample-level feedback are important. Native-node feedback graphs have render-quantum delay constraints and are not a straightforward substitute for a tuned short feedback loop.

Sources:

- [PHYS wrapper and musical controls](../../web-audio-examples/Felucca/firmware/src/eng_phys.c)
- [Physical-model DSP](../../web-audio-examples/Felucca/firmware/src/phys_dsp.c)
- [Sympathetic-string DSP](../../web-audio-examples/Felucca/firmware/src/phys_symp.c)

### 3.5 Additive organ: small details create an instrument

Felucca's WHEEL engine combines nine sine partials at these multiples of the note frequency:

```text
0.5, 1.5, 1, 2, 3, 4, 5, 6, 8
```

Its identity also comes from:

- Drawbar registrations and level compensation.
- A short high-passed noise key click.
- A decaying percussion harmonic.
- Single-trigger/legato behavior.
- Overdrive.
- Separate low/high rotary modulation with gradual speed changes.

Most of this can be approximated with native nodes. The broader lesson is that characteristic transients and performance behavior can contribute more identity than simply adding another waveform.

Source: [WHEEL engine](../../web-audio-examples/Felucca/firmware/engines/src/eng_wheel.c).

### 3.6 Formants, FM, and granular synthesis

Other worthwhile directions:

| Technique | Felucca approach | Drome starting point |
| --- | --- | --- |
| Formants | Glottal source and cascaded resonators with vowel morphing | Rich oscillator/noise source and automated resonant filters |
| FM | Six operators, independent envelopes, ratios, feedback, velocity scaling | Two native oscillators with modulator gain feeding carrier frequency |
| Granular | Windowed grains with size, density, position, pitch jitter, reverse probability | Short buffer sources through Hann-window gain envelopes |

Important qualifications:

- Native frequency modulation can produce useful FM sounds, but it is not automatically an exact implementation of DX-style phase modulation and feedback.
- A native formant approximation is not identical to Felucca's glottal excitation and resonator equations.
- Granular synthesis should bound simultaneous grains and manage overlap level. Felucca's compressed-source indexing machinery is unnecessary when using already decoded browser buffers.

Sources:

- [Formant engine](../../web-audio-examples/Felucca/firmware/src/eng_formant.c)
- [FM6 engine](../../web-audio-examples/Felucca/firmware/src/eng_fm6.c)
- [Granular engine](../../web-audio-examples/Felucca/firmware/src/eng_grain.c)

## 4. Signal routing: per voice versus shared

### A shared chain cannot preserve separate note identities

This does not provide independent envelopes:

```text
oscillator A ─┐                  ┌→ envelope A
              ├→ shared filter ──┤
oscillator B ─┘                  └→ envelope B
```

The filter receives the summed signal. Both envelope nodes then receive the same processed mixture. Envelope A would therefore affect both notes, not just oscillator A.

Ordinary audio connections do not retain source identity after mixing. For conventional mono/stereo processing, the solution is separate per-voice chains followed by shared processing.

### Proposed per-voice architecture

```text
main source → main-layer gain ─┐
sub source → sub gain ─────────┼→ user-ordered .fx() → voice amplitude ADSR
noise source → noise gain ─────┘
```

Each note owns this graph. For samplers, the main source is sample playback and there is no sub API.

The instrument output then participates in routing and sends:

```text
voice outputs → instrument output → primary route → main mix
                                  ├→ send → chorus bus → main mix
                                  ├→ send → delay bus → main mix
                                  └→ send → reverb bus → main mix
```

### What belongs where

| Processing | Typical location |
| --- | --- |
| Main/sub/noise mixing | Inside each voice |
| Synth resonant filter | Per voice, before final amplitude ADSR |
| Voice saturation | Per voice, before final amplitude ADSR |
| Pedal-style distortion | Often shared after voice mixing |
| EQ and compression | Usually shared |
| Delay and reverb | Usually shared after voice envelopes |

These are useful defaults, not universal laws. Per-voice and shared distortion are different sounds: shared distortion makes simultaneous notes interact nonlinearly.

Reverb before an independent voice envelope is technically possible with a separate instance per voice, but the envelope gates its tail. That is generally different from the desired natural shared reverb behavior.

### Meaning of `.fx()`

`.fx()` is authored per instrument but instantiated per note. The engine fixes the chain's position; the user controls order inside it.

The bounded per-voice effect set discussed was:

- Biquad filters.
- Saturation with drive.
- Gain.

There is no need to represent drive and saturation as two mandatory effects. Drive can be a parameter on the saturator.

Moving existing effects before ADSR is an intentional compatibility change, especially for nonlinear processing, filter ringing, and time-varying gain interactions. It should not be treated as an inaudible internal refactor.

## 5. Drive, saturation, and resonance terminology

- **Drive** controls how hard a signal enters a nonlinear stage, commonly using input gain.
- **Saturation** gently clips the signal and adds harmonics.
- **Resonance** emphasizes frequencies around a filter's cutoff.

A common ordering is:

```text
oscillators → drive/saturation → resonant filter → amplitude envelope
```

Saturation adds harmonic content; the filter shapes it. Saturation can also follow a filter to round off strong resonance peaks.

Gain placement matters:

- Gain before saturation changes the degree of nonlinear processing.
- Gain after saturation changes its output level without changing the preceding stage's drive.

The user can express these choices through effect ordering.

## 6. Subsonic: a concrete native-node reference

The inspected Subsonic demo uses **three oscillators**:

1. One sine at the low fundamental.
2. One saw in the harmonic layer, detuned upward.
3. One saw in the harmonic layer, detuned downward.

Default pitch relationships:

- Sine: 55 Hz.
- Saws: 110 Hz with detune of +12 and -12 cents.
- The octave toggle can move the saw pair down to the sine's nominal frequency.

Its graph is:

```text
sine → sub gain ──────────────────┐
saw (+detune) ─┬→ harmonic gain ───┼→ drive gain → waveshaper
saw (-detune) ─┘                  ┘
  → post-shaper gain → lowpass → amplitude envelope
  → master gain → compressor → analyser → output
```

### Harmonic mix

The harmonic mix slider controls the gain of both saws together before saturation. It does not change pitch, oscillator count, or detuning.

At zero, the saw layer is removed, but the remaining sine still goes through saturation and filtering. Raising harmonic mix adds saw content and changes how the combined signal drives the nonlinear stage.

Both saws feed the same gain node. A value of 0.4 applies to each saw's contribution, not to a pre-normalized two-saw stack. This matters when comparing levels to a normalized supersaw implementation.

### Unison width

The demo's width is detune spread, not stereo width. It has no panners. Its thickness and movement come from the slightly different saw frequencies beating against one another.

It does not implement PWM or hard sync.

### Saturation implementation

The demo creates a fixed normalized `tanh` waveshaping curve once and enables `4x` oversampling. Its drive slider changes an upstream gain node using smoothed automation rather than replacing the curve on every adjustment.

This is a useful implementation pattern for the proposed saturator:

- Stable curve.
- Automatable, smoothed input drive.
- Separate output gain.
- Oversampling to reduce aliasing.

Do not copy its minimum-drive semantics blindly: its zero-percent drive setting is not a true bypass. Oversampling also does not guarantee that all nonlinear aliasing disappears.

### Architecture and limitations

Subsonic is monophonic: its three oscillators run continuously and feed one envelope. Drome's polyphonic version would create the corresponding voice graph for each note and retain shared output processing separately.

The demo also smooths pitch changes. Its free-running phases and transitions mean that copying the broad graph does not guarantee sample-identical output from per-note sources.

Source: [Subsonic HTML](/Users/andy/Downloads/subsonic.html).

## 7. Supersaw, unison, and spread

The missing ingredient for the Subsonic recipe is not a more elaborate sub API. It is a main layer containing detuned saw oscillators, with its own gain.

A supersaw supplies that main layer. Keep the low sub stable beneath it.

### Earlier Drome worklet

The previous supersaw worklet already implements:

- Multiple saw oscillators.
- PolyBLEP discontinuity correction.
- Randomized starting phases.
- Stack detune spread (`freqspread`).
- Alternating left/right panning (`panspread`).
- Common tuning (`detune`).
- Start/stop handling.

Its default oscillator count is seven. Although its parameter descriptor suggests one is allowed, its render code clamps the count to at least two.

`freqspread` is the total span in semitones, not the outer offset in cents. For a two-oscillator stack:

```js
{
  voices: 2,
  freqspread: 0.24, // -0.12 to +0.12 semitones: -12 to +12 cents
  panspread: 0,
}
```

This provides the basic two-saw source used by Subsonic.

The old processor sums oscillators without normalization. Increasing the oscillator count therefore changes both output level and the intensity of downstream saturation.

Source: [Previous supersaw worklet](../../web-audio-examples/drome/packages/audio-worklets/src/worklets/worklet-supersaw.ts).

### Worklet responsibilities versus voice responsibilities

The supersaw generates the oscillator stack. An external gain node controls that layer's contribution:

```text
native oscillator OR supersaw worklet → main-layer gain
```

This is independent of oscillator type. There is no need for an `oscGain` parameter inside the supersaw worklet to provide the agreed main-layer gain API.

Stack normalization and user gain are separate decisions:

- Normalization manages level changes when oscillator count changes.
- Main-layer gain expresses the desired balance against sub and noise.

### Naming and scope

Earlier examples used hypothetical `.unison(2)`, `.spread(12)`, and `.oscGain(...)` methods to explain the model. Those were illustrative, not finalized public APIs.

The agreed direction is a supersaw source and a second gain argument to `d.synth()`. The public supersaw configuration syntax, defaults, normalization, and spread units still need definition.

Keep these concepts distinct:

- Oscillator count.
- Detune spread.
- Stereo spread.
- Common pitch/detune.

The sub should follow common note pitch and pitch modulation, but not each supersaw oscillator's detune spread or stereo position.

## 8. Agreed synth/noise/sub API direction

### Main source gain

```js
d.synth("saw")      // main saw layer, gain 1
d.synth("saw", 0.8) // main saw layer, gain 0.8
```

The second argument controls the main source layer before mixing and `.fx()`. It is not the complete instrument's final gain or ADSR maximum.

Default it to 1 to preserve existing behavior. The same mechanism should apply to native oscillators and the supersaw source.

### Noise

```js
.noise(0.3)         // white noise, gain 0.3
.noise("pink")      // pink noise, gain 1
.noise("pink", 0.3) // pink noise, gain 0.3
```

Noise is available on both synths and samplers. It is a component of each scheduled voice, not an independently sequenced instrument.

It mixes before `.fx()` and shares the final voice ADSR. Noise should avoid unintentionally producing the same short burst on every note; source generation or randomized buffer offsets can address that, while still allowing reproducible tests.

White and pink are represented in the agreed examples. Brown noise was discussed as useful, but the complete supported color set remains an implementation/specification choice.

### Sub

```js
.sub(0.3)               // sine, -1 octave, gain 0.3
.sub("square")          // square, -1 octave, gain 1
.sub("square", 0.3)     // square, -1 octave, gain 0.3
.sub("square", 0.3, -2) // square, -2 octaves, gain 0.3
```

The sub is synth-only. It follows the scheduled note and common pitch modulation, offset by the selected octave. It has no independent sequencing or ADSR in this initial design.

Sine, triangle, and square are useful candidate waveforms. Restricting octaves to -1 and -2 was recommended for bounded scope; the final supported waveform set and validation rules still need confirmation.

### Shared semantics

- Noise and sub are off unless enabled.
- Repeated calls replace the relevant layer's configuration rather than adding more layers.
- Adding a sub or noise layer should not silently turn down the main oscillator.
- Layer gains should integrate with existing numeric pattern/automation infrastructure where supported; exact accepted argument types should be specified before implementation.
- Headroom and supersaw normalization should be deliberate and documented.

Example:

```js
d.synth("saw", 0.8)
  .sub("square", 0.3)
  .noise("pink", 0.3);
```

### Deferred flexibility

These builder forms were explored but intentionally deferred:

```js
.noise(d.noise("pink").gain(0.3).adsr(0, 0.5, 0.2, 0.1))
```

Potential future `d.noise()` and `d.osc()` builders could provide independent layer envelopes, arbitrary tuning, or more complex layering.

If introduced, a layer envelope would shape that source before mixing, while the final voice ADSR would still shape the entire result. Without an explicit layer envelope, the layer should remain flat and rely on the voice ADSR.

## 9. Saturator effect

The saturator should expose at least:

- Drive.
- Output gain.

It belongs in the per-voice effects vocabulary, with ordering controlled by the user. Shared use is also musically useful if supported by the effects/bus design.

Implementation considerations:

- A fixed waveshaping curve plus automatable input gain is a useful starting point.
- Define whether zero drive means an exactly transparent state, a bypass, or a small amount of coloration. Do not leave this accidental.
- Consider `WaveShaperNode` oversampling and evaluate CPU cost at realistic polyphony.
- Preserve sensible behavior around parameter changes and voice onset/offset.
- Decide whether the initial effect is symmetric only; asymmetry introduces additional DC-management considerations.
- Do not add hidden automatic output compensation without clear semantics.

A saturator is not a compressor: it reshapes individual waveform peaks, whereas a compressor applies gain reduction based on a time-varying level detector.

## 10. Compression and output protection

### Opt-in compressor

A `d.compressor()`-style effect makes sense primarily for shared buses. Expose the standard controls:

- Threshold.
- Ratio.
- Knee.
- Attack.
- Release.

Possible uses include an instrument bus, drum bus, or main mix. Routing a signal through a compressor is conventional serial compression. Sending a copy to a compressor while retaining the dry signal creates parallel compression; that distinction should remain explicit.

The agreed recommendation is **not to insert audible compression by default**. Implicit compression can make unrelated instruments pump together and makes output behavior less predictable.

The compressor stays outside the bounded initial per-voice `.fx()` effect set.

### Optional output protection is a separate feature

A potential future output graph is:

```text
buses → main effects → master gain → optional safety limiter → destination
```

A limiter catches excessive peaks; a compressor intentionally shapes dynamics. A high-ratio `DynamicsCompressorNode` can approximate limiting, but it is not guaranteed brick-wall or true-peak protection and introduces lookahead latency.

Subsonic uses substantial compression: threshold -10 dB, ratio 14:1, knee 3 dB, attack 1 ms, release 150 ms. That contributes to its sound rather than acting as invisible protection.

Start with predictable gain staging and explicit compression. Treat output protection as its own product and DSP decision.

## 11. PWM and hard sync: useful later, not required here

**PWM (pulse-width modulation)** changes the proportion of a pulse wave's cycle spent high versus low. Modulating that proportion creates moving harmonic content without needing a detuned oscillator stack.

**Hard sync** uses one oscillator to reset another every cycle. Sweeping the reset oscillator's natural frequency changes timbre while the repeating cycle remains tied to the master oscillator.

Neither is directly exposed by a standard `OscillatorNode`; custom synthesis DSP is a practical route. They are distinct from unison detuning and are not required for the Subsonic recipe.

The agreed roadmap is not complete feature parity with Felucca ANALOG. Independent second-oscillator tuning, PWM, hard sync, and dedicated keyboard tracking remain separate possible extensions.

## 12. Implementation and lifecycle considerations

### Composite voices

The current scheduling abstraction centers on one scheduled source. A supersaw source, sub, and noise require the voice to own multiple sources and all supporting nodes.

The lifecycle should handle:

- Starting and stopping all sources at the correct audio times.
- Common pitch modulation reaching the relevant tonal layers.
- Worklet completion and failure handling.
- Disconnecting all nodes and parameter bindings.
- Cancelling future voices on updates/stops.
- Reporting completion once for the whole voice, not once per source.

A worklet is not an `AudioScheduledSourceNode`, so integrating it also requires a deliberate scheduling/lifecycle boundary rather than pretending it is a native oscillator.

### Sampler noise lifetime

Adding noise to samplers requires an explicit lifetime policy. Sample playback can end before a scheduled note's envelope does. Decide how that relates to the noise layer and to voice completion; do not accidentally let the buffer's `ended` event terminate an otherwise active composite voice, or leave noise running indefinitely.

### Shared effect tails

The inspected graph retirement code waits for instrument voices to finish, then destroys the graph's buses. That is sufficient for the current effects but needs extension when shared reverb or delay is introduced.

Effects with tails need an explicit retirement policy so live edits do not truncate them. Old graphs must eventually be released, including feedback effects that could otherwise remain active for a long time.

### Parameter semantics

Define these before implementation:

- Layer gain versus final instrument gain.
- Supersaw spread units and oscillator distribution.
- Supersaw normalization across oscillator counts.
- Common detune versus stack detune.
- Noise color support and reproducibility.
- Octave and waveform validation for sub.
- Saturator drive/output gain units and zero-drive behavior.
- Compressor placement and units.

### Testing

Use the existing offline audio regression tooling and add focused cases for:

- Backward-compatible default synth gain.
- Layer mixing and independent layer gains.
- Sub pitch and common pitch modulation.
- Supersaw count, spread, mono/stereo behavior, and level policy.
- Correct processing order around saturation and filters.
- Sampler/noise lifetime and composite cleanup.
- Worklet start/stop boundaries and errors.
- Shared tails surviving graph replacement when time-based effects arrive.
- Finite output, bounded resource use, and stable behavior at realistic polyphony.

Use deterministic randomness or controlled fixtures for regression tests. Randomized phases/noise need a test strategy rather than automatically widening audio-comparison tolerances.

Audio regression demonstrates repeatability, not that a new sound is musically better. Intentional changes still require listening review.

## 13. Licensing and reuse

Felucca is GPL-3.0-only as a whole, but several DSP components have separate permissive licenses.

| Component | License noted in repository |
| --- | --- |
| ANALOG, LOFI, TRIO, WHEEL, NOISE and shared engine DSP | MIT |
| `phys_dsp.c` | MIT, based on DaisySP |
| `phys_symp.c` | MIT, based on Rings |
| `fm6_core.c` | Apache-2.0, based on msfa |
| Much of the remaining firmware, effects, wrappers, browser emulator, and other engines | GPL-3.0-only |

Use the actual file headers and license documentation when deciding what to port. A permissive DSP core does not automatically make its surrounding GPL wrapper permissively licensed. Translated implementations derived from source also require license consideration; calling a change a TypeScript port does not remove those obligations.

For permissively licensed code, preserve the required notices and comply with its terms. For broader reuse questions, obtain appropriate license advice rather than treating this note as legal guidance.

Source: [Felucca licensing documentation](../../web-audio-examples/Felucca/LICENSING.md).

## 14. Roadmap conclusion

The agreed features form a coherent direction:

```text
richer main source + optional sub/noise
  → independently balanced layers
  → user-ordered voice shaping
  → final voice ADSR
  → shared routing, effects, and dynamics
```

The immediate payoff is not only a supersaw or a stronger bass. It is a reusable voice architecture that can support native oscillators, custom worklet sources, layered samples, better subtractive synthesis, and eventually physical or formant-based instruments.

A practical dependency-aware progression is to establish composite voice ownership and pre-envelope processing, then add source layers and the supersaw, with effects implemented in independently reviewable changes. This is an implementation suggestion, not an agreed PR sequence.

Beyond that roadmap, modal synthesis/resonator effects are the strongest candidate for a genuinely new instrument family. Organ, FM, granular synthesis, richer envelopes, PWM, and hard sync remain valuable follow-up directions.

The central recommendation remains: borrow Felucca's sound-design architecture selectively, keep straightforward processing in native nodes, and use worklets where custom DSP materially improves capability or control.
