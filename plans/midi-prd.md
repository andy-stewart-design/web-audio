# MIDI Library PRD

## Overview

Add a dependency-free `@web-audio/midi` package that wraps the Web MIDI API, plus a first integration slice through Fluid, Schema, AudioEngine, and `apps/web`.

This work is deliberately split:

- **V1:** standalone MIDI access, device management, CC input, note signals, and clock-driven MIDI output from Fluid patterns.
- **Follow-up:** MIDI note input driving AudioEngine voices. This requires held-note ADSR, live-voice lifecycle, and automation semantics that do not fit the current bar-scheduled engine.

`@web-audio/midi` has no dependency on other `@web-audio/*` packages. Schema describes MIDI bindings; Fluid produces those descriptions; AudioEngine consumes a connected runtime `Midi` instance.

## V1 goals

- Hide Web MIDI permission, device changes, message parsing, and output encoding behind a small API.
- Provide readable/subscribable signals with no external signal library.
- Support CC as a real-time source for direct AudioParams.
- Send existing clock/pattern-driven instrument notes to hardware MIDI outputs.
- Keep local Web Audio playback additive; MIDI output is not a replacement audio path.
- Make MIDI opt-in in the web app through an explicit Enable MIDI action.

## Non-goals for V1

- MIDI note input driving synths or samplers in AudioEngine.
- Quantization of MIDI input.
- SysEx.
- Multiple MIDI output targets per instrument.
- User-defined persistent device aliases.
- MIDI control of primary gain envelopes or ADSR fields.

## `@web-audio/midi`

### Construction and lifecycle

```ts
const midi = new Midi();
```

Construction immediately calls `navigator.requestMIDIAccess()`. Applications that want to control prompt timing should construct it only from an explicit user action.

```ts
await midi.ready;
midi.destroy();
```

The package must be safe to import and construct outside browsers. When Web MIDI is unavailable, `status` becomes `"unavailable"`, `ready` rejects, and device lists are empty.

`destroy()` detaches MIDIAccess, port, and message listeners and clears internal signal state. Later input/output operations are no-ops with a warning.

### Signals

```ts
interface Signal<T> {
  readonly value: T;
  subscribe(fn: (value: T) => void): () => void;
}
```

`subscribe()` calls its listener immediately with the current value and again for every later emission. Signals emit immutable snapshots; consumers must not mutate them.

```ts
interface MidiDevice {
  id: string;
  name: string | null;
}

type MidiStatus = "pending" | "connected" | "denied" | "unavailable";
```

```ts
midi.status: Signal<MidiStatus>;
midi.inputs: Signal<readonly MidiDevice[]>;
midi.outputs: Signal<readonly MidiDevice[]>;
```

`status` describes Web MIDI API access, not whether a physical device is currently present. After access is granted it remains `"connected"`; `inputs` and `outputs` represent currently available devices.

### Device selectors

A device selector is a string. At runtime it resolves in this order:

1. exact, case-sensitive port ID;
2. exact, case-sensitive port name.

A duplicate name warns once and selects the first currently available matching port. Device IDs remain the precise option. An unavailable selector causes input to receive no messages or output to skip sends with a warning.

### Input

```ts
midi.in.cc(74);
midi.in.cc("Launchkey Mini", 74);
midi.in.cc("<device-id>", 74).channel(1);

midi.in.notes();
midi.in.notes("Launchkey Mini").channel(1);
```

Public channels are always **1–16**. Inputs merge all devices/channels unless scoped.

```ts
type MidiNote = {
  note: number;
  velocity: number;
  deviceId: string;
  channel: number;
};

interface CcSignal extends Signal<number> {
  readonly raw: number;
  readonly hasValue: boolean;
  readonly deviceId: string | null;
  readonly channel: number | null;
}

interface NoteSignal extends Signal<ReadonlySet<MidiNote>> {}
```

- CC `value` is normalized `0–1`; `raw` is `0–127`.
- CC signals preserve their last value when a device disconnects.
- Note state is internally keyed by `deviceId:channel:note`; this correctly handles identical notes from multiple sources.
- A repeated note-on for an already-held key updates velocity and emits a new snapshot.
- Disconnecting an input removes its held notes and emits a new snapshot.

### Output

```ts
midi.out.noteOn(device, { note, velocity, channel, time? });
midi.out.noteOff(device, { note, channel, time? });
midi.out.cc(device, { cc, value, channel, time? });
midi.out.send(device, data, time?);
```

`time` is a `performance.now()` timestamp. Methods are fire-and-forget.

All protocol values are validated and throw descriptive errors when invalid:

- notes, CC numbers, and velocities: `0–127`;
- channels: `1–16`.

Channel 1 encodes as status-byte nibble 0:

```ts
0x90 | (channel - 1);
```

Unknown/unavailable output devices never throw during scheduled playback; they warn once per instrument/schema and skip events.

## Fluid and Schema V1

### MIDI output

All Fluid instruments receive:

```ts
d.synth().out(d.midi.out());
d.synth().out(d.midi.out("Launchkey Mini").channel(2));
d.sample("bd").out(d.midi.out().channel(10));
```

`d.midi.out()` defaults to channel 1 and the first available runtime output. A second `.out()` replaces the first.

Schema uses an optional `notesOut` field on `InstrumentSchema`:

```ts
interface MidiOutSchema {
  type: "midi-out";
  device?: string;
  channel: number;
}
```

MIDI output is additive: the instrument keeps producing local Web Audio. Velocity is derived only from the resolved primary gain-envelope peak:

```ts
Math.round(gainPeak * 127);
```

A resolved velocity of 0 skips the MIDI note. Local effects, internal engine balancing gain, and mute do not change MIDI velocity. MIDI note-off is sent at the pattern note `endTime`, where local audio begins its release phase.

### Mute

All Fluid instruments receive:

```ts
d.synth().mute();
d.synth().mute(false);
```

This serializes `muted: boolean` on `InstrumentSchema`. It mutes only the local audio output node, without changing MIDI output or primary gain semantics.

### MIDI CC

Fluid describes MIDI CC sources; it never imports the runtime MIDI package.

```ts
d.lpf(d.midi.cc(74));
d.lpf(d.midi.cc(74).expRange(100, 8_000).default(440));
d.synth().detune(d.midi.cc("Launchkey Mini", 1).range(-1200, 1200));
```

Builder methods are order-independent:

```ts
d.midi.cc(74).range(0, 100).default(50);
d.midi.cc(74).default(50).range(0, 100);
```

Schema representation:

```ts
interface MidiCcSchema {
  type: "midi-cc";
  cc: number;
  device?: string;
  channel?: number;
  range: { min: number; max: number; curve: "linear" | "exponential" };
  default: number;
}
```

`range()` is linear and `expRange()` is exponential. Explicit defaults outside explicit ranges are clamped with a development warning. Invalid MIDI protocol fields still throw.

When range/default are omitted, Fluid applies contextual values and warns in development:

| Destination              | Range                    | Default  |
| ------------------------ | ------------------------ | -------- |
| gain effect              | linear 0–1               | 1        |
| filter frequency         | exponential 20–20,000 Hz | 1,000 Hz |
| filter Q                 | linear 0–30              | 1        |
| instrument/filter detune | linear -1200–1200 cents  | 0        |
| filter gain              | linear -24–24 dB         | 0        |

V1 permits CC only in direct AudioParam slots: filter frequency/Q/detune/gain, gain-effect gain, and instrument detune. It excludes primary gain envelopes and ADSR/envelope fields.

## AudioEngine V1

```ts
engine.connectMidi(midi);
```

`connectMidi()` can be called before or after a MIDI-referencing schema becomes active. It binds immediately to active MIDI schemas, replaces bindings when given a different instance, and is a no-op for the same instance.

For CC bindings:

- initialize a newly created voice from its current CC value, or schema default when `hasValue` is false;
- update active direct AudioParams with `setTargetAtTime(value, currentTime, 0.01)`;
- remove per-voice subscriptions when a voice ends;
- unsubscribe bindings as soon as an instrument is retired on schema replacement.

For MIDI output:

- existing pattern scheduling computes AudioContext timestamps;
- convert them through `clock.audioTimeToMIDITime()` before calling MIDI output;
- a no-device `notesOut` resolves `midi.outputs.value[0]` at every send;
- output is sent for muted instruments too.

On transport stop, each active MIDI-output channel receives All Notes Off (CC 123) immediately and again after the clock scheduling horizon. This prevents queued note-ons from leaving hardware notes stuck. It assumes this engine owns its output/channel; sharing that channel with another application is an uncommon unsupported edge case.

## Web-app integration

`d.midi.*` remains worker-safe because it creates schema only. The runtime `Midi` instance belongs on the main thread in `AudioPlayer`, which already owns `AudioContext`, `AudioClock`, and `AudioEngine`.

Add `audio.enableMidi()` to lazily create `Midi`, call `engine.connectMidi(midi)`, and retain the instance. Add a header Enable MIDI control that shows status and connected device names/IDs, with copy-ID support.

## Follow-up: MIDI note input

A separate SOW will add `MidiInSchema`, `d.midi.notes()`, and MIDI-driven synth voices. It must decide and implement:

- transport-independent versus transport-bound note triggering;
- held-note attack/decay/sustain and note-off release;
- polyphony and source-aware duplicate-note behavior;
- live-voice teardown on stop, schema update, and destroy;
- automation semantics for pattern/random values, LFOs, and envelopes;
- MIDI-controlled primary gain and ADSR/envelope fields;
- MIDI input for samplers;
- valid endpoint handling in `midiToFrequency()` (MIDI note 0 is valid; the current `<= 0` guard must become `< 0`).
