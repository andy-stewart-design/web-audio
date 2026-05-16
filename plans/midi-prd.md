# MIDI Library PRD

## Overview

A new `@web-audio/midi` package that wraps the Web MIDI API behind a clean, simple surface. The library is a deep module — substantial internal complexity hidden behind a minimal public API. No external dependencies. No dependency on other `@web-audio/*` packages.

## Goals

- Abstract the gnarly parts of the Web MIDI API (permission flow, device management, raw message parsing) entirely from consumers
- Provide a unified signal-based abstraction for MIDI input and typed fire-and-forget methods for MIDI output
- Plug into the existing Fluid → Schema → AudioEngine pipeline without breaking its contracts
- Keep `@web-audio/midi` independently usable outside this monorepo

## Non-goals

- Quantization (handled by AudioEngine, not the MIDI library)
- Clock dependency of any kind
- RxJS or any external observable/signal library
- SysEx support in the initial version

---

## Core Abstraction: Hybrid Signal

The library implements its own signal type — no external library. A signal is both readable (pull) and subscribable (push):

```typescript
interface Signal<T> {
  value: T                           // current value, readable at any time
  subscribe(fn: (value: T) => void): () => void  // returns unsubscribe
}

interface CcSignal extends Signal<number> {
  value: number   // normalized 0–1
  raw: number     // raw 0–127
}

interface NoteSignal extends Signal<Set<{ note: number; velocity: number }>> {
  value: Set<{ note: number; velocity: number }>  // currently held notes
}
```

---

## Public API

### Initialization

```typescript
const midi = new Midi()
```

- Constructor triggers `navigator.requestMIDIAccess()` internally. The consumer never touches the Web MIDI API directly.
- Subscriptions can be wired up immediately — the library buffers internally until access is granted.
- `midi.ready` — Promise that resolves when MIDI access is live.
- `midi.status` — Signal: `"pending" | "connected" | "denied" | "unavailable"`.
- `midi.inputs` — Signal: array of connected input devices (provides device IDs for scoped listening).
- `midi.outputs` — Signal: array of connected output devices.

### Input API (`midi.in`)

```typescript
// CC — all devices merged (default)
midi.in.cc(74)
midi.in.cc(74).channel(1)

// CC — scoped to one device
midi.in.cc("device-id", 74)
midi.in.cc("device-id", 74).channel(1)

// Notes — all devices merged
midi.in.notes()
midi.in.notes().channel(1)

// Notes — scoped to one device
midi.in.notes("device-id")
midi.in.notes("device-id").channel(1)
```

- All `midi.in` methods return signals.
- CC signals: `.value` is normalized `0–1`, `.raw` is `0–127`.
- Note signals: `.value` is a `Set` of currently-held `{ note, velocity }` objects.
- All devices are merged by default. Pass a device ID as the first argument to scope to a specific input.
- Channel filtering: optional fluent `.channel(n)` on all `midi.in` methods.

### Output API (`midi.out`)

```typescript
midi.out.noteOn("device-id", { note: 60, velocity: 80, channel: 1, time: 1234.5 })
midi.out.noteOff("device-id", { note: 60, channel: 1, time: 1235.5 })
midi.out.cc("device-id", { cc: 74, value: 64, channel: 1, time: 1234.5 })
midi.out.send("device-id", data: Uint8Array, time?: number)  // raw escape hatch
```

- All output methods are fire-and-forget.
- `time` is a `performance.now()` timestamp. Consumers (AudioEngine) are responsible for computing correct timestamps.
- `send()` provides a raw escape hatch for pitch bend, program change, and other message types not covered by the typed methods.

---

## Integration with Fluid and AudioEngine

### MIDI-driven synths (input → Fluid synth)

A synth is either clock-driven (pattern-based) or MIDI-driven — mutually exclusive. MIDI notes are passed to `.notes()` as a source, the same entry point as pattern-based notes.

```typescript
// MIDI-driven synth: pitch and timing come from controller, timbre from Fluid
d.synth("sawtooth")
  .notes(d.midi.notes().channel(1))
  .env(d.env().adsr(0.01, 0.1, 0.8, 0.3))
  .fx(d.lpf(800))

// Scoped to a specific device
d.synth("sawtooth")
  .notes(d.midi.notes("device-id").channel(1))
```

Produces schema: `{ noteSource: { type: "midi-in", channel: 1 } }`.

AudioEngine behavior:
- On note-on: starts attack → decay → holds at sustain level.
- On note-off: triggers release phase, schedules node cleanup after release completes.
- Velocity → gain: `velocity / 127` multiplied against the envelope's peak gain.

### Schema-driven MIDI output (Fluid pattern → external hardware)

```typescript
// Clock/pattern-driven synth that sends MIDI instead of producing audio
d.synth()
  .out(d.midi.out().channel(1))       // first available output device
  .out(d.midi.out("device-id").channel(1))  // specific device
  .notes([0, 3, 5])
  .euclid(3, 8)
```

Produces schema: `{ noteOutput: { type: "midi-out", deviceId: "device-id", channel: 1 } }`. When no device ID is provided, AudioEngine resolves to the first available MIDI output at runtime.

AudioEngine behavior:
- Schedules note-on at the pattern's timing using `midi.out.noteOn()`.
- Sends note-off at the end of the sustain phase (before the release phase would begin). The external synth owns its own release.
- Gain → velocity: `gain * 127` (symmetric with input mapping).
- The full Fluid pattern system (euclidean rhythms, note cycles, fast/slow, reverse, stretch) works identically for MIDI output synths.

### CC as a parameter source

```typescript
d.synth().filter(d.lpf(d.midi.cc(74)))
d.synth().filter(d.lpf(d.midi.cc(74).channel(1)))
d.synth().filter(d.lpf(d.midi.cc("device-id", 74).channel(1)))
```

Produces schema: `{ filter: { frequency: { type: "midi-cc", cc: 74, channel: 1 } } }`.

AudioEngine resolves `midi-cc` schema nodes by subscribing to `midi.in.cc(cc)` and updating the corresponding audio parameter in real time.

### AudioEngine connection

```typescript
const engine = new AudioEngine(ctx, clock)
engine.connectMidi(midi)  // optional, lazy — call anytime after construction
```

- MIDI is optional. AudioEngine functions normally without it.
- If a schema references MIDI nodes but no Midi instance is connected, or if permission has been denied, AudioEngine logs a console warning and skips those nodes.

---

## Failure Handling

| Scenario | Behavior |
|---|---|
| Permission denied | `midi.status` → `"denied"`, `midi.ready` rejects, subscriptions never fire |
| Web MIDI unavailable (non-supporting browser) | `midi.status` → `"unavailable"` |
| Schema has MIDI nodes, no `connectMidi()` called | Console warning, nodes skipped |
| Schema has MIDI nodes, status is `"denied"` | Console warning, nodes skipped |
| Device disconnected mid-session | `midi.status` → `"pending"`, reconnects automatically when device returns |

---

## Dependency Graph

```
@web-audio/midi        (no @web-audio/* dependencies)
    ↓
@web-audio/schema      (adds midi-cc, midi-in, midi-out schema node types)
    ↓
@web-audio/fluid       (adds .midi(), .midiOut(), d.midi.cc() to Drome)
    ↓
@web-audio/audio-engine (resolves MIDI schema nodes, exposes connectMidi())
```
