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

An engine-side object that generates concrete values from a `RandomSchema` for a given bar and value index. The caller decides whether that index represents grid selection, hit-addressed event resolution, or a bar-level lookup.

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

### Grid Step

A position in onset geometry. A grid step carries serialized timing metadata such as `offset`, `duration`, and `stepIndex`, whether or not it ultimately becomes active.

### Grid `stepIndex`

The zero-based position attached to a serialized grid step. It describes rhythmic geometry and is used during mask evaluation, visualization, and pattern transforms. It is not the index for downstream event-addressed value lanes.

### Grid Step Offset

A grid step's fractional start time within a bar, normalized from 0 to 1 (where 1 = one full bar).

### Hit

An active onset that survives final rhythm and mask evaluation. A hit exists before downstream sample lookup, source-window validation, or voice creation succeeds. A rest or random-mask miss is not a hit.

### Hit Index

The zero-based ordinal assigned to a surviving hit within one scheduled bar. Hit indices restart at `0` each bar. Every voice in a chord shares one hit index.

### Onset Geometry

The offsets, durations, and grid positions that determine where candidate events occur. Rhythms and masks finalize this geometry before the engine derives hit indices.

### Event-Addressed Value Lane

A note, variation, region, gain, detune, envelope, effect, or other pattern resolved once for an intended event. These lanes resolve with `(barIndex, hitIndex)`, so rests do not consume values. Continuous LFOs, MIDI CC input, routing, sends, and bar-level bus updates are not event-addressed lanes.

### Pattern Modifier

A rhythm function (`.euclid()`, `.xox()`, `.hex()`, etc.) applied to a cycle to gate which steps fire.

### Pattern Mask

The static or random grid derived from rhythm modifiers. Mask eligibility is evaluated by grid position; surviving positions are then assigned consecutive hit indices.

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
