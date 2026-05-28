# Drome: minimalist live coding platform

Drome is a live coding language and platform for making and distributing music in the browser

---

## Foundation

### Schema

A plain, serialisable snapshot of a fully resolved configuration, passed from Fluid to Engine.

- **User facing**: No

### DromeSchema

The top-level schema containing all instrument schemas and banks.

- **User facing**: No

### Fluid

The authoring layer — a builder API that constructs schemas via a fluent interface and resolves all defaults.

- **Aliases to avoid**: DSL, Config layer
- **User facing**: No

### Engine

The playback layer — consumes schemas and schedules Web Audio nodes; never applies defaults.

- **Aliases to avoid**: Runtime, Audio layer
- **User facing**: No

### Resolver

An engine-side object that generates concrete values from a `RandomSchema` for a given bar and step index.

- **User facing**: No

---

## Lifecycle

Note: Evaluate and Push are Fluid-side concepts; Queue, Prebar, Prebeat, Commit, Retiring, Done, and Stop are Engine-side lifecycle concepts/events.

### Evaluate

The act of running code in Drome's live environment. This creates or replaces the current schema.

- **User facing**: Yes

### Push

Marks an instrument to be included in the next commit at the next bar boundary.

- **User facing**: Yes

### Queue

The set of pushed instruments waiting to be committed.

- **User facing**: No

### Commit

The moment when the pending schema becomes live at a bar boundary.

- **User facing**: Yes

### Prebar

The clock event fired immediately before a bar begins. The engine uses it to commit the pending schema and swap instruments in sync.

- **User facing**: No

### Prebeat

The clock event fired immediately before a beat boundary. The engine can use this as a scheduling hook for beat-aligned work.

- **User facing**: No

### Stop

The clock event fired when playback stops; used to cancel future notes.

- **User facing**: No

### Pending

The most recent schema update waiting for the next `prebar`.

- **User facing**: No

### Retiring

The state of old players after a hot swap, while they finish scheduled audio and release tails.

- **User facing**: No

### Done

The signal that a player has finished retiring and can be removed.

- **User facing**: No

---

## Timing & Rhythm

### Clock

The scheduler that emits beat and bar events against the Web Audio AudioContext timeline.

- **Aliases to avoid**: Timer
- **User facing**: No

### Beats per minute (BPM)

The tempo of the clock. Higher values play faster. Defaults to 120 BPM.

- **Aliases to avoid**: Tempo (as a variable name)
- **User facing**: Yes

### Beat

The smallest unit of musical time; at 120 BPM a beat lasts half a second. Parallel to `Step` in sequencing, but not equivalent.

- **Aliases to avoid**: Tick, Step (in timing context)
- **User facing**: Yes

### Bar

A group of beats (4 by default); the anchor between timing and sequencing — each bar, every instrument advances by one pattern.

- **Aliases to avoid**: Measure
- **User facing**: Yes

### Metronome

A snapshot of the current `{ beat, bar }` position passed to every clock callback.

- **User facing**: Yes

### Bar start time

The `AudioContext` timestamp at which a bar begins; used as the scheduling anchor for all notes in that bar.

- **User facing**: No

### Bar duration

The wall-clock length of one bar in seconds (`beatDuration × beatsPerBar`).

- **User facing**: No

### Lookahead

The polling interval (milliseconds) used to keep the JavaScript scheduler aligned with the AudioContext timeline.

- **User facing**: No

### Schedule-ahead time

How far into the future (seconds) the clock pre-schedules audio events; this is the scheduling horizon.

- **User facing**: No

---

## Sequencing

Drome's sequencing model has three levels: steps, patterns, and cycles. Each level has a direct counterpart in the timing model — a step is to a pattern what a beat is to a bar. They are parallel concepts, not equivalent ones.

### Step

A single subdivision of a pattern, carrying a `value`, `offset`, `duration`, and `stepIndex`. A step can hold one note, one chord, or silence. Steps divide a pattern evenly — a 3-step pattern in a 4-beat bar means each step lasts 1.33 beats.

- **Aliases to avoid**: Tick, Beat (in sequencing context)
- **User facing**: Yes

### Step index

The zero-based position of a step within its pattern; used to look up per-step parameter values.

- **User facing**: No

### Step Offset

A step's fractional start time within a bar, normalized from 0 to 1 (where 1 = one full bar).

- **User facing**: No

### Note

A single pitched value within a step. In a synthesizer, notes are MIDI note numbers; in a sampler, notes control playback rate, which enables pitching a sample up or down.

- **Aliases to avoid**: Pitch
- **User facing**: Yes

### Playback Rate

The speed at which an audio buffer plays back. In a sampler, note values are used to set playback rate.

- **User facing**: Yes

### Chord

Two or more notes played simultaneously within a single step.

- **User facing**: Yes

### Pattern

A sequence of steps that plays over exactly one bar. It is the fundamental sequencing unit.

- **Aliases to avoid**: Loop
- **User facing**: Yes

### Pattern Modifier

A rhythm function (`.euclid()`, `.xox()`, `.hex()`, etc.) applied to a cycle to gate which steps fire.

- **User facing**: No

### Pattern Mask

The binary grid derived from rhythm modifiers; `1` = active step, `0` = silent.

- **User facing**: No

### Cycle

The full, repeating loop of an instrument's patterns. Each pattern spans one bar, so N patterns = N bars before the cycle repeats.

- **Aliases to avoid**: Loop
- **User facing**: Yes

### ValueCycle

A cycle of plain numbers (integers or floats). Used for MIDI note values and parameter values, including LFO frequency, gain amplitude, and envelope attack duration.

- **User facing**: No

### ChordCycle

A cycle of nullable number arrays where each step may hold multiple simultaneous MIDI note values.

- **User facing**: No

### BinaryCycle

A cycle of `0`/`1` values used as a rhythmic mask.

- **User facing**: No

### RandomCycle

A cycle whose values are generated deterministically from a seed rather than stored explicitly.

- **User facing**: No

### Ribbon

A RandomCycle's seed configuration, optionally segmented into looping sub-sequences.

- **User facing**: No

### Ribbon segment

One named range within a ribbon: `{ seed, len }`.

- **User facing**: No

---

## Instruments

### Instrument

An abstract sound source that owns a note cycle and schedules audio per bar.

- **Aliases to avoid**: Track, Voice, Player
- **User facing**: No

### Synthesizer

A concrete instrument that generates audio by shaping an oscillator with envelopes and effects.

- **Aliases to avoid**: Synth
- **User facing**: Yes

### Oscillator

The raw sound generator inside a synthesizer; produces a continuous waveform at a given frequency.

- **Aliases to avoid**: Synth (when the oscillator specifically is meant)
- **User facing**: No

### Waveform

The shape of an oscillator's output: `sine`, `square`, `sawtooth`, `triangle`, or `supersaw`.

- **Aliases to avoid**: Wave type, Oscillator type
- **User facing**: Yes

### Sampler

A concrete instrument that plays back pre-recorded audio buffers; notes control playback rate.

- **Aliases to avoid**: Sample player, Audio buffer references
- **User facing**: Yes

### Sample

The Drome-level term for an audio asset, Which is identified by a bank, a name, and a variation.

- **User facing**: Yes

### Sample Bank

A named collection of audio samples (e.g. `tr808`), accessible by short names (`bd`, `sd`, `hh`).

- **Aliases to avoid**: Sample library, Kit
- **User facing**: Yes

### Sample Variation

The numeric index used to select among alternate recordings of the same sample name within a bank.

- **User facing**: Yes

### Audio Buffer

The in-memory decoded audio data used to play a sample. Can be derived from an audio file or created from raw data (e.g. white noise).

- **User facing**: No

### Detune

A pitch offset applied to an oscillator or audio buffer playback.

- **User facing**: Yes

---

## Effects

Effects are signal processors applied serially to the audio chain after the oscillator.

### Gain

Controls the output volume of an instrument; unity is `1`, silence is `0`.

- **User facing**: Yes

### Pan

Positions the sound in the stereo field; `-1` is hard left, `0` center, `1` hard right.

- **User facing**: Yes
- **Status**: planned

### Filter

A biquad filter effect attenuating frequencies above or below a cutoff; parameterised by `frequency`, `Q`, `detune`, and `gain`.

- **Aliases to avoid**: EQ, Biquad
- **User facing**: Yes

### Delay

An echo effect that plays back a copy of the signal after a set time; `feedback` controls repeat decay.

- **User facing**: Yes
- **Status**: planned

### Reverb

Simulates acoustic space reflections; can be algorithmic or convolution-based (impulse response).

- **User facing**: Yes
- **Status**: planned

### Distortion

Adds harmonic saturation by clipping or reshaping the waveform.

- **User facing**: Yes
- **Status**: planned

### Bitcrusher

Degrades audio by reducing bit depth and sample rate, producing lo-fi digital crunch.

- **User facing**: Yes
- **Status**: planned

---

## Automations

### Parameter

A single automatable value backed by a `ValueCycle` or `RandomCycle`.

- **User facing**: No

### Envelope

An ADSR automation curve applied to a parameter over the duration of a note.

- **User facing**: Yes

### Attack, Decay, Sustain, Release (ADSR)

The four phases of an envelope.

- **User facing**: Yes

### Envelope mode

Controls how ADSR stages map onto note duration: `bleed` (default) or `clip`.

- **User facing**: No

### Low Frequency Oscillator (LFO)

A slow oscillator used as a modulation source rather than a sound source; cycles continuously at sub-audio rate to create vibrato, tremolo, or filter sweeps.

- **User facing**: Yes
