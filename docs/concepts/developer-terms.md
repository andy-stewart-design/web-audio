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

An engine-side object that turns a compiled schema into concrete timing, values, events, or resources. `RandomResolver` generates values from a `RandomNumberPattern`; `ValuePatternResolver` selects static or random values by bar and final hit index.

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

### Timing Schema

The compiled candidate-event geometry. Each timing entry has a normalized bar offset and a positive duration. Timing may include one chance condition. It contains no values, masks, source positions, or serialized step indices.

### Timing Step

One candidate event in a timing schema. Its offset is normalized within the bar, while its duration may extend beyond one bar.

### Hit

A timing candidate that survives its optional chance condition. A hit exists before downstream sample lookup, source-window validation, or voice creation succeeds. A fixed rest is not serialized as a candidate, and a random miss is not a hit.

### Hit Index

The zero-based ordinal assigned to a surviving hit within one scheduled bar. Hit indices restart at `0` each bar. Every voice in one event shares its hit index.

### Event

One surviving timing hit combined with instrument-specific event values. A synth event contains notes. A sampler event contains one or more complete sample voices.

### Voice

One simultaneous sound within an event. Chord notes and sampler layers are voices; they share event timing and hit-addressed processing values.

### Event Value Pattern

A note, sample-name, or variation pattern resolved with `(barIndex, hitIndex)`. Static event values may contain simultaneous voice arrays. Random numeric event values resolve one scalar per hit.

### Processing Value Pattern

A gain, detune, envelope, effect, region, or other numeric pattern resolved for an event. Processing patterns never contribute event timing.

### Pattern Modifier

A Fluid rhythm function (`.euclid()`, `.xox()`, `.hex()`, etc.) applied during authoring. Fixed masks and rests are compiled away before the playback schema reaches the engine.

### Value Pattern

A static or random pattern containing values only. Static patterns store raw values by bar. Random numeric patterns store `valuesPerBar` and deterministic generation metadata. Neither shape contains timing geometry.

### ValueCycle

A Fluid authoring cycle of plain numbers, used for MIDI values and processing parameters.

### ChordCycle

A Fluid authoring cycle of nullable number arrays where one authored hit may contain multiple simultaneous MIDI note values.

### BinaryCycle

A Fluid authoring cycle of `0`/`1` values used to construct rhythm timing.

### RandomCycle

A Fluid authoring cycle whose values are generated deterministically from seed and ribbon metadata. It compiles either to a random numeric value pattern or, for binary rhythm, a timing chance condition.

## Instruments

### Audio Buffer

The in-memory decoded audio data used to play a sample. Can be derived from an audio file or created from raw data (e.g. white noise).

## Automations

### Envelope mode

Controls how ADSR stages map onto note duration: `bleed` (default) or `bounded`.
