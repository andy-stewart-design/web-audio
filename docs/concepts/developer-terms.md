---
title: Developer Terminology
description: A technical breakdown of Drome’s core concepts
---

## Foundation

### Schema

A plain, serialisable snapshot of a fully resolved configuration, passed from Fluid to Engine.

### DromeSchema

The top-level schema containing all instrument schemas and banks.

### Fluid

The authoring layer — a builder API that constructs schemas via a fluent interface and resolves all defaults.

### Engine

The playback layer — consumes schemas and schedules Web Audio nodes; never applies defaults.

### Resolver

An engine-side object that generates concrete values from a `RandomSchema` for a given bar and step index.

### Worklet

Small javascript workers that continuously process audio parameters in a background thread, providing stable, low-latency modulation independent of the main JavaScript schedule.

## Lifecycle

Note: Evaluate and Push are Fluid-side concepts; Queue, Prebar, Prebeat, Commit, Retiring, Done, and Stop are Engine-side lifecycle concepts/events.

### Queue

The set of pushed instruments waiting to be committed. No user code touches this — it's purely an engine-side concern.

### Prebar

The clock event fired immediately before a bar begins. The engine uses it to commit the pending schema and swap instruments in sync.

### Prebeat

The clock event fired immediately before a beat boundary. The engine can use this as a scheduling hook for beat-aligned work.

### Stop

The clock event fired when playback stops; used to cancel future notes.

### Pending

The most recent schema update waiting for the next `prebar`.

### Retiring

The state of old instruments after a hot swap, while they finish scheduled audio and release tails.

### Done

The signal that an instrument has finished retiring and can be removed.

## Timing & Rhythm

### Clock

The scheduler that emits beat and bar events against the Web Audio AudioContext timeline.

### Bar start time

The `AudioContext` timestamp at which a bar begins; used as the scheduling anchor for all notes in that bar.

### Bar duration

The wall-clock length of one bar in seconds (`beatDuration × beatsPerBar`).

### Lookahead

The polling interval (milliseconds) used to keep the JavaScript scheduler aligned with the AudioContext timeline.

### Schedule-ahead time

How far into the future (seconds) the clock pre-schedules audio events; this is the scheduling horizon.

## Sequencing

### Step index

The zero-based position of a step within its pattern; used to look up per-step parameter values.

### Step Offset

A step's fractional start time within a bar, normalized from 0 to 1 (where 1 = one full bar).

### Pattern Modifier

A rhythm function (`.euclid()`, `.xox()`, `.hex()`, etc.) applied to a cycle to gate which steps fire.

### Pattern Mask

The binary grid derived from rhythm modifiers; `1` = active step, `0` = silent.

### ValueCycle

A cycle of plain numbers (integers or floats). Used for MIDI note values and parameter values, including LFO frequency, gain amplitude, and envelope attack duration.

### ChordCycle

A cycle of nullable number arrays where each step may hold multiple simultaneous MIDI note values.

### BinaryCycle

A cycle of `0`/`1` values used as a rhythmic mask.

### RandomCycle

A cycle whose values are generated deterministically from a seed rather than stored explicitly.

## Instruments

### Audio Buffer

The in-memory decoded audio data used to play a sample. Can be derived from an audio file or created from raw data (e.g. white noise).

## Automations

### Envelope mode

Controls how ADSR stages map onto note duration: `bleed` (default) or `bounded`.
