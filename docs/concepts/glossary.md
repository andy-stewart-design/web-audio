---
title: Glossary
description: A friendly overview of Drome’s core concepts
---

# Glossary

This glossary defines core concepts behind Drome's live-coding model, focusing on evaluation, timing, sequencing, and sound design. It explains how the system works as a whole, serving as a high-level overview before diving into API documentation.

## Lifecycle

Drome organizes sound production into three phases: pushing, evaluation, and committing. First you define instruments for playback, then build the configuration, and finally commit changes to the timeline.

### Push

To push an instrument is to mark it as ready playback. While you can define a sound without pushing it, calling `.push()` ensures that instrument is included in the next update. In practice, this is usually the final method of your instrument chain: it signals Drome to include the instrument in the upcoming commit.

### Evaluate

Evaluation prepares your code for playback. When you submit code, Drome processes your instructions and constructs the audio graph that will soon become audible in time with the clock. While you can evaluate code at any moment, changes only take effect when the clock hits the next bar.

### Commit

The Commit phase converts an evaluated graph into actual Audio Nodes. This is the point at which the logic of your code comes to life as sound. This happens automatically at bar boundaries, ensuring edits land exactly on the beat without interrupting playback.

## Timing & Rhythm

Rhythm defines the structure of a composition. A clock drives tempo, while a grid of beats and bars allows you to precisely place a musical idea in time.

### Beats per minute

Beats per minute (BPM) sets the tempo of performance. Higher values speed up the clock; lower values slow it down. Drome defaults to 120 BPM.

### Beat

A beat is the basic pulse of musical time. At 120 BPM, one beat lasts half a second. While beats divide the global clock, steps divide an individual pattern.

### Bar

A bar is a group of beats that defines a standard musical segment. In Drome, a bar has four beats by default. It serves as the container for a pattern: each pattern lasts exactly one bar, and live-coded changes commit at these boundaries.

### Metronome

The metronome tracks Drome’s current position in musical time as a beat and bar count. It provides the reference point for any sound or event that must stay synchronized with the clock.

## Sequencing

Sequencing maps your musical ideas onto the clock’s grid. It determines how content repeats and evolves across multiple bars, ensuring every change lands with precision.

### Step

A step is a subdivision of a pattern that holds one value. While beats divide time globally, steps define where values sit inside the pattern's duration. A step can contain parameter values, notes, chords, or silence.

### Pattern

Pattern defines an instrument or effects' behavior for one bar. It consists of steps and maps to the clock’s grid. By default, a single pattern repeats every bar, but multiple patterns can be sequenced to create complex loops.

### Cycle

A cycle is the full repeating sequence of patterns for an instrument. Since each pattern lasts one bar, a cycle’s length depends on how many patterns it contains. A one-pattern cycle loops every bar; a four-pattern cycle takes four bars to complete before repeating.

### Playback rate

Playback rate controls the speed and perceived pitch of a sample. A value of 1 is normal; higher values increase both speed and pitch, while lower values decrease them. In Drome, samplers map note values to playback rates, allowing the same sample to function as different pitches within a pattern.

### Quantization

Quantization snaps values to a defined grid. In Drome, that grid is dynamic: it adapts to the number of steps in the current pattern. A four-step pattern divides the bar into 4 positions; a seven-step pattern divides it into 7. Drome uses this step grid to place and resolve values musically within the pattern.

## Pitch & Harmony

Harmony shapes how pitches relate within a composition. Scales establish a palette of allowed notes, while roots anchor these relationships in a specific key, ensuring a piece of music remains coherent.

### Root

The root is the base pitch used to resolve scale degrees into actual notes. Changing the root transposes every note in your pattern while keeping the intervals between them the same.

### Scale

A scale is an ordered set of pitch intervals that constrains the spectrum of available notes for a composition. It allows you to write patterns as relative positions rather than absolute frequencies.

### Scale degree

A scale degree is a relative position within a scale rather than an absolute pitch. It determines the note based on its distance from the current root, wrapping into octaves as needed to keep your melody inside a singular harmonic framework.

### Octave

An octave is a span of 12 semitones where note names repeat at double or half the frequency. Moving up or down an octave shifts pitch while preserving the note's identity.

### Semitone

A semitone is the smallest unit of pitch distance in a chromatic system, dividing an octave into 12 steps. It serves as the basis for scales and detuning adjustments.

### Note

A note is a single value assigned to a pattern step. In synthesizers, they represent pitch; in samplers, they control playback rate and perceived speed, which can be used to pitch a sample up and down. It serves as the core unit for melody and rhythm.

### Chord

A chord is a group of two or more notes scheduled within a single pattern step to play simultaneously. They function as one musical event, defining the harmony at that moment.

## Instruments

Drome offers two ways to generate sound: synthesis from oscillators or playback of recorded samples. Each instrument manages its own signal chain, responding to parameters, envelopes, or randomization.

### Synthesizer

A synthesizer generates sound electronically from an oscillator and shapes it using gain, envelopes, effects, and modulation. It is used for pitched material such as basslines, melodies, drones, and chords.

### Oscillator

An oscillator generates the base signal for a synthesizer’s sound. It produces a periodic waveform at a specific frequency, defining pitch and timbre before effects or modulation are applied.

### Waveform

A waveform describes the shape of a synthesizer’s oscillator that defines its tone. Drome supports sine (smooth and pure), triangle (soft harmonic), square (bright hollow), and sawtooth (buzzy) waveforms.

### Sampler

Sampler is an instrument that plays recorded audio instead of generating sound internally. It maps note values to audio files and schedules playback within pattern steps. Ideal for drums, loops, impacts, and textures.

### Sample

A sample is a recorded audio asset identified by its bank, name, and variation index. When a sampler schedules a note, it reads the corresponding sample from the bank to determine what sound should play.

### Sample bank

A sample bank is a named collection of recorded sounds. It groups categories of sounds, like drum machines or synth presets, using short identifiers so you can reference files by a concise name instead of a full path or URL. Drome includes a collection of built-in banks, such as `tr808` and `tr909`, and also supports loading custom, user-generated banks.

### Sample name

A sample name identifies a logical group of audio files within a bank, such as all kick drum samples (`bd`) or snare hits (`sd`). It serves as the base identifier for playback before a specific variation is selected.

### Sample variation

A sample variation is a zero-based integer, or a sequence of integers, used to select an audio file from a given sample name and bank. It allows you to trigger one or multiple alternate recordings of the same sound without altering its harmonic role.

### Fit

Fit is a sampler mode where playback duration is adjusted to span a fixed number of bars. This allows loops to stay in sync with the musical timeline, regardless of sample length or BPM changes.

### Clip mode

Clip mode controls whether a sample stops at its scheduled step boundary or plays until it finishes naturally (i.e. until the audio file ends).

### Loop mode

Loop mode determines whether a sample wraps around internally or stops once it reaches the end of its duration. The mode affects the playback behavior of an individual sample, distinct from the instrument cycle that repeats patterns over bars.

### Detune

Detune is a pitch offset applied to an oscillator or sample playback that enables tone manipulation independent of note values.

## Effects

Effects are chained onto instruments and process audio after the sound source is created, shaping tone and texture in real time.

### Gain

A gain effect controls volume by adjusting signal amplitude. A value of 1 maintains original level; 0 is silence; 2 doubles the original level. Used to shape overall loudness within an instrument or effect chain.

### Filter

A filter effect shapes a sound’s frequency spectrum by reducing or emphasizing certain ranges. Common types include low-pass, high-pass, and band-pass. Changing the cutoff adds motion or texture without altering pitch.

## Automation

Automation changes parameter values over time instead of fixing them to static settings, enabling dynamic sound shaping beyond the initial pattern structure.

### Parameter

Parameter is a value used to control an aspect of an instrument or effect’s sound, such as gain, frequency, or pitch. It can be set to a fixed value or pattern of values, or automated to change over time.

### Envelope

Envelope shapes a parameter over a period of time defined by the pattern's step duration. It controls how a sound swells, holds, and fades.

### Attack, Decay, Sustain, Release

Attack, Decay, Sustain, and Release are the four stages that control the contour of an envelope. An envelope begins with an attack rising to its peak, decaying to a sustain level, holding for the step's duration, and fading out on release.

### Low Frequency Oscillator

A low frequency oscillator, or LFO, is an oscillator used for modulation rather than direct sound generation. Because it runs slowly, it can create repeating changes like vibrato, tremolo, or filter sweeps. In Drome, LFOs are modulation sources that control parameters over time.

### LFO phase

LFO Phase sets the starting point on the LFO’s waveform within a bar, aligning modulation timing relative to the musical clock.

## Randomness

Drome uses controlled randomness to generate values that behave musically, ensuring that results are reproducible yet unpredictable.

### Random values

Random values are generated rather than explicitly defined step by step. They behave deterministically, ensuring that your musical choices remain reproducible across evaluations while still providing unexpected variation in notes, rhythms, or modulation.

### Seed

A seed is a starting point for random generation. Using the same seed produces identical results across evaluations, making randomness repeatable and reproducible. This allows you to explore various generations and return to patterns that best suit your composition.

### Ribbon

A ribbon is a way of organizing seeded random material into structured, repeating segments. Instead of an endless stream, you create sections that loop over time.

### Ribbon segment

Ribbon Segment is one section of a ribbon. Each segment has its own seed and can have its own length. Segments allow you to build larger random compositions from smaller, repeatable sets of random values.

### Range

Range sets the minimum and maximum values that random generation can produce. It keeps pitch within a useful register or modulation inside a musically sensible area.

---

## Document Notes

### Style & Tone:

- Tone: Friendly, clear, direct, technical but accessible, clear but not over-explained, plain language
- Structure: Each definition starts with "<Term> is..." or similar active structure. Avoids jargon where possible but keeps specific API-relevant terminology (like "Audio Nodes", "Pattern", etc.).
- Consistency: Short, punchy sentences. No excessive filler words ("especially important", "in practice"). Connects back to other sections when relevant (e.g., linking Gain to volume levels or instruments).

### Notes

- Code update: should we rename durationMode to clipMode in the code?
- We will in the near future be adding a Supersaw waveform/worklet option for synths, as well as the following effects: Pan (left/right positioning), Delay (echo with feedback), Reverb (algorithmic/convolution space), and Distortion (harmonic saturation), Bitcrusher
