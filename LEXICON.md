---
title: Lexicon
description: A comprehensive overview of key terms and concepts in Drome
---

## Timing & Rhythm

The clock is the heartbeat of a Drome performance. All sequencing is measured relative to it.

#### Beat

The smallest unit of musical time in Drome. At 120 BPM, a beat lasts half a second. Drome fires a `beat` event on each beat, which you can use to for sync visuals or trigger custom behavior.

#### Bar

A group of beats — 4 by default. The bar is the anchor between timing and sequencing: each bar, every instrument advances by one pattern. A bar and a pattern always share the same duration.

#### Beats per Minute (BPM)

The tempo of your performance. Higher values play faster. Drome defaults to 120 BPM.

## Sequencing

Drome's sequencing model has three levels: steps, patterns, and cycles. Each level has a direct counterpart in the timing model — a step is to a pattern what a beat is to a bar.

#### Step

A single subdivision of a pattern. Each step holds one note, one chord, or silence. Steps divide a pattern's duration evenly — a 4-step pattern in a 4-beat bar means each step lasts one beat, but a 3-step pattern in the same bar means each step lasts 1.33 beats. Steps and beats are parallel concepts, not equivalent ones.

#### Pattern

A sequence of steps that plays over exactly one bar. `.note([0, 3, 5])` defines one pattern with three steps. Patterns can contain note values, chords, or silence, and can be written directly or via shorthand methods like `.euclid()`, `.xox()`, and `.hex()`.

Patterns can be expressed as either an array of numbers or a string. In Drome, `[0, 3, 5]` and `"[0, 3, 5]"` are functionally equivalent. The string form is most useful when a method accepts multiple arguments, one of which can be a pattern. This allows the pattern definition to be self-contained and unambiguous.

#### Cycle

The full, repeating loop of an instrument's patterns. A cycle is one bar long if the instrument has one pattern, two bars long if it has two patterns, and so on. Once all patterns have played, the cycle starts over. When you call `.note([0, 3, 5], [7, 5, 3])`, you're defining a two-pattern, two-bar cycle.

#### Note

A single pitched value within a step. In a synthesizer, notes are expressed as MIDI values — numerical representations of pitches or frequencies. In a sampler, notes control the playback start position of the sample (a float between 0.0 and 1.0).

#### Chord

Two or more notes played simultaneously within a single step. Defined by passing an array as a step value: `.note([[0, 4, 7]])` plays a triad on the first step.

## Lifecycle

Drome synchronizes changes to the music at bar boundaries, so that edits take effect cleanly in time. This is managed through a queue-and-commit cycle.

#### Evaluate

The act of running code in Drome's live environment. When you execute a block of code, Drome evaluates it and makes the `drome` (or `d`) object available. Any instruments defined during evaluation are queued for the next bar.

#### Push

Queues an instrument for playback on the next bar boundary. Until you call `.push()`, an instrument is defined but won't play. It's typically the last call in a chain: `synth.note([0, 3, 5]).push()`.

#### Queue

The holding area for instruments waiting to be activated. When you call `.push()`, the instrument enters the queue. On the next bar, everything in the queue is committed and begins playing.

#### Commit

The moment when queued instruments go live. Commit happens automatically at each bar boundary — the previous set of instruments is stopped, and the queued instruments start playing. This ensures changes always take effect in sync with the music.

## Instruments

An instrument is a sound source. Drome has two types: synthesizers, which generate sound from oscillators, and samplers, which play back pre-recorded audio.

#### Synthesizer

A sound source that generates audio from oscillators. Create one with `drome.synth()`. You can configure its waveform, voices, scale, and note pattern.

#### Oscillator

The raw sound generator inside a synthesizer. An oscillator produces a continuous waveform at a given frequency, which the synth then shapes with envelopes and effects.

#### Waveform

The shape of an oscillator's output, which determines its tonal character. Drome supports:

- `sine` — pure, smooth, no overtones
- `triangle` — soft, slightly hollow
- `square` — bright, hollow, strong odd harmonics
- `sawtooth` — bright, buzzy, rich in harmonics
- `supersaw` — multiple detuned sawtooth oscillators layered together for a thick, wide sound

#### Sampler

A sound source that plays back pre-recorded audio clips. Create one with `drome.sample()`. The sampler draws from a sample bank and can be sequenced, chopped, pitched, and processed with effects just like a synth.

#### Sample Bank

A named collection of audio samples. Drome includes banks like `tr808` and `tr909` (classic drum machines). Each bank contains samples accessible by name — `bd` for bass drum, `sd` for snare, `hh` for hi-hat, and so on.

## Automation

Automation modulates an instrument's parameters continuously over time. Any automatable parameter — volume, filter cutoff, pan, and more — can be driven by an envelope, an LFO, or an incoming MIDI signal.

#### Envelope

A shape that controls how a parameter changes over the duration of a note. Most commonly used to control amplitude (volume), but can automate any parameter — filter cutoff, pan, distortion amount, and more.

#### Attack, Decay, Sustain, Release (ADSR)

The four stages of an envelope:

- **Attack** — how long it takes to rise from zero to peak when a note starts
- **Decay** — how long it takes to fall from the peak down to the sustain level
- **Sustain** — the level held for as long as the note is active
- **Release** — how long it takes to fade to zero after the note ends

ADSR Mode controls how these stages map onto the note's duration in the pattern:

- `bleed` (default) — attack and decay fit within the note duration; release extends after it ends
- `clip` — all stages are proportionally scaled to fit entirely within the note duration

#### Low Frequency Oscillator (LFO)

A slow oscillator used as a modulation source rather than a sound source. An LFO cycles continuously through a waveform at a sub-audio rate, automatically varying any parameter it's applied to — creating vibrato, tremolo, filter sweeps, and rhythmic motion.

#### MIDI

Musical Instrument Digital Interface — a protocol for communicating musical data between devices. Drome can send note and control data to external MIDI hardware or software, and receive Control Change (CC) messages from MIDI controllers to automate parameters in real time.

## Effects

Effects process an instrument's audio output. They can be chained together in sequence, and most parameters can be automated with an envelope, LFO, or MIDI.

#### Gain

Controls the output volume of an instrument. A value of `1` is unity (unchanged), `0` is silence.

#### Pan

Positions the sound in the stereo field. `-1` is hard left, `0` is center, `1` is hard right.

#### Filter

Attenuates frequencies above or below a cutoff frequency. Drome supports three modes: `lowpass` (lets low frequencies through, cuts highs), `highpass` (lets highs through, cuts lows), and `bandpass` (passes a band of frequencies around the cutoff). The `q` parameter controls the sharpness and resonance at the cutoff point.

#### Delay

An echo effect that plays back a copy of the signal after a set time. The `feedback` parameter controls how many times the echo repeats and how quickly it fades.

#### Reverb

Simulates the acoustic reflections of a physical space, adding depth and ambience to a sound. Drome can generate synthetic reverb algorithmically or use an impulse response — a recording of a real space used as a convolution kernel.

#### Distortion

Adds harmonic saturation by clipping or reshaping the audio waveform. Ranges from subtle warmth to aggressive grit depending on the algorithm and intensity.

#### Bitcrusher

Degrades the audio signal by reducing its bit depth and sample rate, producing a characteristically lo-fi, digital crunch. The `bitDepth` parameter controls how coarsely the signal is quantized; lower values produce a grittier, more aliased sound.
