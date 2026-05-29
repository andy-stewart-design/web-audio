---
title: Glossary
description: A friendly overview of Drome’s core concepts
---

# Glossary

Drome is built around a small set of musical ideas: code is evaluated, instruments are pushed, and patterns change in time with the clock. This glossary explains those ideas in plain language. It is not meant to be a complete API reference; other guides cover methods and examples in more detail.

## Lifecycle

### Evaluate

To evaluate code is to run it in Drome’s live environment. In the browser REPL, this is what happens when you submit a block of code.

Evaluation is where you describe what you want the music to become. Drome reads that code, builds the current musical configuration, and prepares any instruments you have pushed. Evaluation itself does not mean every sound starts immediately; Drome still waits for the right musical moment to make changes audible.

### Push

Push is how an instrument joins the performance. You can create and configure an instrument without pushing it, but it will not be included in playback until you push it.

In practice, pushing is usually the last step in an instrument chain. It tells Drome, “include this instrument in the next synchronized update.”

### Commit

A commit is the moment when pushed changes become live. Drome commits changes at bar boundaries so edits land in time with the music rather than interrupting a bar partway through.

This is what makes live coding feel stable: you can evaluate new code at any moment, but Drome waits until the next bar to swap the performance cleanly.

## Timing & Rhythm

### Beats per minute

Beats per minute, or BPM, is the tempo of the performance. Higher BPM values make the clock run faster; lower values make it run slower. Drome defaults to 120 BPM.

BPM controls the length of beats and bars, which in turn controls how quickly patterns play.

### Beat

A beat is the basic pulse of musical time. At 120 BPM, one beat lasts half a second.

Beats are part of Drome’s timing system. They are related to steps, but they are not the same thing: beats divide time according to the clock, while steps divide a pattern.

### Bar

A bar is a group of beats. In Drome, a bar has 4 beats by default.

Bars are especially important because they connect timing and sequencing. A pattern always lasts exactly one bar, and Drome commits live-coded changes at bar boundaries.

### Metronome

The metronome is Drome’s current position in musical time, represented as a beat and bar count. It answers questions like “which beat are we on?” and “which bar are we in?”

Most users do not need to manage the metronome directly, but it is the conceptual reference point for anything that needs to stay synchronized with playback.

## Sequencing

Drome’s sequencing model has three main levels: steps, patterns, and cycles. A step is a subdivision of a pattern. A pattern lasts one bar. A cycle is one or more patterns repeating.

### Step

A step is one subdivision of a pattern. Each step can contain a note, a chord, or silence.

Steps divide the pattern evenly, no matter how many there are. If a pattern has 4 steps in a 4-beat bar, each step lasts one beat. If a pattern has 3 steps in that same bar, each step lasts one third of the bar, or about 1.33 beats.

This is why steps and beats are related but not identical. Beats come from the clock; steps come from the pattern.

### Playback rate

Playback rate is the speed at which a sample plays back. A playback rate of `1` means the sample plays at its original speed. Higher values play it faster and higher in pitch; lower values play it slower and lower in pitch.

In samplers, Drome maps note values to playback rates. This lets the same sample be pitched up or down as part of a pattern.

### Pattern

A pattern is one bar of musical information. It is made of steps, and each step can hold a note, a chord, or silence.

If you define one pattern for an instrument, that pattern repeats every bar. If you define multiple patterns, Drome plays one pattern per bar before looping back to the beginning.

For example, a two-pattern note sequence plays the first pattern for one bar, the second pattern for the next bar, and then repeats.

### Cycle

A cycle is the full repeating sequence for an instrument. Since each pattern lasts one bar, the length of a cycle depends on how many patterns it contains.

A one-pattern cycle repeats every bar. A four-pattern cycle takes four bars to complete. Once the final pattern has played, the cycle starts again.

### Quantization

Quantization means snapping values to a defined grid. In Drome, that grid can be dynamic: it is shaped by the number of steps in the current pattern.

A pattern with 4 steps divides the bar into 4 possible positions; a pattern with 7 steps divides the same bar into 7. Drome uses that step grid to place and resolve values musically within the pattern, so changing the number of steps also changes the rhythmic grid those values snap to.

## Pitch & Harmony

### Root

The root is the base pitch used when Drome resolves scale degrees into actual notes.

If you are working with a scale, the root tells Drome where that scale begins. Changing the root transposes the musical material while preserving the same scale relationships.

### Scale

A scale is a collection of pitch intervals. It describes which notes are available when Drome turns scale degrees into pitches.

Scales are useful because they let you write melodic patterns as relative positions rather than fixed note numbers. The same pattern can then be moved to a different root or interpreted through a different scale.

### Scale degree

A scale degree is a position inside a scale. Instead of saying “play this exact pitch,” a scale degree says “play this position relative to the current root and scale.”

Degrees can continue past the end of the scale and wrap into higher or lower octaves. This makes it easy to write melodic shapes that stay inside a harmonic world.

### Octave

An octave is a 12-semitone span where note names repeat at double or half the frequency. Moving up an octave makes a note sound higher while preserving its basic identity; moving down an octave makes it lower.

Octaves matter whenever Drome maps scale degrees, note names, or numeric note values to pitch.

### Semitone

A semitone is the smallest step in the standard chromatic pitch system. There are 12 semitones in an octave.

Semitones are the unit behind scales, detuning, and note-to-frequency conversion.

### Note

A note is a single pitched value inside a step.

For synthesizers, notes represent pitches. For samplers, notes control playback rate, which changes the perceived pitch and speed of the sample. In both cases, notes are the basic values that make a pattern melodic or rhythmic.

### Chord

A chord is two or more notes played at the same time within a single step.

In Drome, a step can hold one note or a group of notes. When a step holds multiple notes, the instrument schedules them together as a chord.

## Instruments

### Synthesizer

A synthesizer is an instrument that generates sound electronically. In Drome, a synthesizer starts with an oscillator waveform and then shapes that sound with gain, envelopes, detune, filters, and other modulation.

Synthesizers are useful for pitched material like basslines, melodies, drones, and chords.

### Waveform

A waveform is the shape of a synthesizer’s oscillator. The waveform has a big effect on the tone of the sound.

Drome currently supports these waveforms:

- `sine` — smooth and pure
- `triangle` — soft, with a little more harmonic content than sine
- `square` — bright and hollow
- `sawtooth` — buzzy and harmonically rich

### Sampler

A sampler is an instrument that plays recorded audio. Instead of generating a tone from an oscillator, it loads a sample and schedules playback of that audio.

Samplers are useful for drums, one-shots, loops, textures, and any sound you want to trigger rhythmically.

### Fit

Fit is a sampler mode where Drome adjusts playback so a sample spans a fixed number of bars.

This is especially useful for loops. Rather than thinking in terms of pitch or playback rate, you can tell a sample to fit the musical timeline.

### Sampler duration mode

Sampler duration mode controls whether a sample is cut to the length of its scheduled step or allowed to keep playing.

In `clip` mode, the sample is limited by the step duration. In `one-shot` mode, the sample can continue until the audio file ends. Clip mode is useful for tight rhythmic sequencing; one-shot mode is useful for drums, impacts, and sounds with natural tails.

### Sample loop mode

Sample loop mode controls whether sampler playback wraps around inside the sample instead of stopping at the end.

This is different from a Drome cycle. A cycle is the repetition of musical patterns over bars; sample loop mode is about what happens inside the audio file while a sample is playing.

### Sample

A sample is an audio asset that a sampler can play. In Drome, a sample is identified by its bank, name, and variation.

For example, a drum machine bank might contain a bass drum sample, a snare sample, and several hi-hat samples.

### Sample bank

A sample bank is a named collection of samples. Banks make it possible to refer to sounds by short names rather than full file paths.

Drome includes built-in banks such as classic drum machine collections, and user-provided banks can be loaded as well.

### Sample variation

A sample variation is an alternate recording of the same sample name within a bank.

Variations are useful when a bank contains several versions of a sound, such as multiple bass drums or hi-hats. Choosing different variations can make a pattern feel less static while keeping the same basic role in the music.

### Detune

Detune is a pitch offset applied to a synthesizer oscillator or sampler playback.

Small detune amounts can create thickness, movement, or slight imperfection. Larger detune amounts can shift a sound into a noticeably different pitch area.

## Effects

Effects process an instrument’s audio after the sound source has been created. In Drome, effects are chained onto instruments and can often be controlled by fixed values, patterns, envelopes, or LFOs.

### Gain

Gain controls volume. A gain value of `1` means unity gain, or unchanged volume. A value of `0` means silence.

Drome uses gain both as part of an instrument’s basic amplitude shape and as an effect that can be placed in an effect chain.

### Filter

A filter changes a sound by reducing or emphasizing parts of the frequency spectrum.

Drome’s most common filter types are low-pass, high-pass, and band-pass. A low-pass filter lets lower frequencies through and reduces higher ones. A high-pass filter does the opposite. A band-pass filter focuses on a region around the cutoff frequency.

Filter movement is one of the most common ways to add motion to a sound, especially when the cutoff frequency is controlled by an envelope or LFO.

## Automation

Automation means changing a value over time. Instead of setting a parameter once and leaving it still, Drome can move that parameter with envelopes, LFOs, or patterns.

### Parameter

A parameter is a value that can control some part of a sound, such as gain, filter frequency, detune, or envelope timing.

In Drome, parameters are often pattern-like: they can be a single value, a sequence of values, or a generated stream of values. This lets musical structure control sound design.

### Envelope

An envelope is a shape that changes a parameter over the life of a note.

The most familiar use is amplitude: a note fades in, holds, and fades out. But envelopes can also shape other parameters, such as filter frequency, to make each note move in a consistent way.

### Attack, Decay, Sustain, Release

Attack, decay, sustain, and release are the four stages of an ADSR envelope.

- **Attack** is how long the value takes to rise from its starting level to its peak.
- **Decay** is how long it takes to fall from the peak to the sustain level.
- **Sustain** is the level held while the note continues.
- **Release** is how long it takes to fade after the note ends.

Together, these stages describe the contour of a note or modulation shape.

### Low Frequency Oscillator

A low frequency oscillator, or LFO, is an oscillator used for movement rather than direct sound generation.

Because it runs slowly, an LFO can create repeating changes: vibrato, tremolo, pulsing filter sweeps, or other cyclic motion. In Drome, LFOs are modulation sources that can control parameters over time.

### LFO phase

LFO phase is the starting position of an LFO’s cycle.

Changing the phase shifts where the LFO begins. This is useful when two modulations should have the same speed but start at different points in their movement.

## Randomness

Randomness in Drome is for generating values that still behave musically. Random values can be seeded, ranged, stepped, and snapped to the pattern’s grid so they are unpredictable without becoming uncontrolled.

### Random values

Random values are generated rather than written out step by step. They can be used for notes, rhythms, filter movement, gain changes, variation selection, and other parameters.

The important idea is that random does not have to mean chaotic. By choosing a range and a number of pattern steps, you can make randomness feel intentional: it still surprises you, but it lands in places that belong to the pattern.

### Seed

A seed is the starting point for a random sequence.

Using the same seed gives the same generated results, which makes randomness repeatable. This is useful in live coding because you can explore variation without losing the ability to return to a pattern you like.

### Ribbon

A ribbon is a way of organizing seeded random material into repeating segments.

Conceptually, a ribbon lets randomness have structure. Instead of one endless stream, you can create sections that loop, contrast, or return over time.

### Ribbon segment

A ribbon segment is one section of a ribbon. Each segment has its own seed and can have its own length.

Segments make it possible to build larger random forms out of smaller repeatable parts.

### Range

Range sets the minimum and maximum values that random generation can produce.

For pitch, a range can keep notes within a useful register. For parameters like filter frequency or gain, a range keeps modulation inside a musically sensible area.
