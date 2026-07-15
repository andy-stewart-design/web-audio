# MIDI Library PRD

## Overview

Add a dependency-free `@web-audio/midi` package that wraps the Web MIDI API, plus a first integration slice through Fluid, Schema, AudioEngine, and `apps/web`.

V1 is intentionally limited to:

- standalone MIDI access, port management, CC input, note-state signals, and typed output;
- MIDI CC mapped to direct Web Audio parameters;
- clock/pattern-driven **synth** MIDI output;
- an explicit web-app Enable MIDI flow.

MIDI note input driving AudioEngine voices, MIDI-controlled envelopes, and sampler MIDI output are separate follow-up scopes.

## Goals

- Hide Web MIDI permission, port management, raw parsing, and output encoding behind a small API.
- Keep `@web-audio/midi` independently usable, with no external or monorepo-package dependencies.
- Keep Fluid as a pure schema producer; Fluid never imports runtime MIDI.
- Make MIDI output additive to local Web Audio playback.
- Avoid stuck hardware notes during stop, replacement, or destruction.
- Establish explicit lifecycle boundaries for MIDI bindings and engine instruments.

## Non-goals for V1

- MIDI note input → synth/sampler voices.
- Quantization.
- SysEx.
- Sampler MIDI output.
- Multiple output targets per synth.
- Persistent device aliases.
- MIDI control of primary gain envelopes, ADSR values, or envelope effect values.
- A MIDI-specific diagnostics/logging subsystem; see [`error-handling.md`](error-handling.md).

## `@web-audio/midi`

### Construction and status

```ts
const midi = new Midi();
await midi.ready;
```

Construction immediately calls `navigator.requestMIDIAccess()`. An application controls permission-prompt timing by constructing `Midi` only from an explicit user action.

```ts
type MidiStatus =
  | "pending"
  | "connected"
  | "denied"
  | "unavailable"
  | "error"
  | "destroyed";
```

- `pending`: access request has not settled.
- `connected`: browser access is granted, whether or not any ports are physically connected.
- `denied`: access failed with `NotAllowedError`.
- `unavailable`: Web MIDI is absent.
- `error`: another access failure occurred.
- `destroyed`: the instance has been permanently torn down.

The package is safe to import and construct outside a browser: it never reads `navigator` at module scope.

### Signals and devices

```ts
interface Signal<T> {
  readonly value: T;
  subscribe(fn: (value: T) => void): () => void;
}

type MidiDevice = {
  id: string;
  name: string | null;
};
```

Subscriptions receive the current value immediately and every later update. `inputs` and `outputs` contain only currently connected ports; they are the source of truth for port availability.

```ts
midi.status: Signal<MidiStatus>;
midi.inputs: Signal<readonly MidiDevice[]>;
midi.outputs: Signal<readonly MidiDevice[]>;
```

Collection values are fresh snapshots and typed readonly. This is not a promise of runtime-enforced immutability until the project has a shared immutable-collection abstraction.

### Device selectors

Input/output selector strings resolve as:

1. exact, case-sensitive port ID;
2. exact, case-sensitive port name.

```ts
midi.in.cc("Launchkey Mini", 74);
midi.out.noteOn("<port-id>", { note: 60, velocity: 100, channel: 1 });
```

An ambiguous name selects the first currently available match. Device IDs are the precise/stable choice. Future structured diagnostics should report ambiguity and unavailable targets; do not add MIDI-only console logging infrastructure.

### Input

```ts
midi.in.cc(74);
midi.in.cc("Launchkey Mini", 74).channel(1);

midi.in.notes();
midi.in.notes("<port-id>").channel(1);
```

Public channels are 1–16. Unscoped input merges matching messages from all connected ports/channels.

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
  readonly receivedChannel: number | null;
}

interface NoteSignal extends Signal<ReadonlySet<MidiNote>> {}
```

- CC initial state is `value: 0`, `raw: 0`, `hasValue: false`, `deviceId: null`, and `receivedChannel: null`.
- For merged signals, CC metadata identifies the latest accepted message source; scoped signals retain `null` metadata until their first matching message.
- CC `value` is normalized 0–1; `raw` is 0–127.
- Note state is keyed internally by `deviceId:channel:note`.
- Note-on velocity 0 is note-off.
- Repeated same-source note-on updates velocity.
- Disconnect clears that port’s held notes but retains its last CC value.
- Input uses one central message listener per connected port; signals are routed from that dispatcher.
- Input builders are immutable and canonical: `.channel()` does not mutate an existing signal. Cache identity is the requested selector string (or unscoped), input kind, CC number where applicable, and channel—not a currently resolved physical port.

### Output

```ts
midi.out.noteOn(device, { note, velocity, channel, time? });
midi.out.noteOff(device, { note, channel, time? });
midi.out.cc(device, { cc, value, channel, time? });
midi.out.send(device, data, time?);
```

Typed protocol values validate and throw on invalid programmer input:

- note, CC, and velocity: integer 0–127;
- channel: integer 1–16.

Channel 1 uses MIDI status-byte nibble 0:

```ts
0x90 | (channel - 1);
```

`time` is a `performance.now()` timestamp. Raw `send()` accepts non-empty `Uint8Array` or readonly byte arrays with integer 0–255 bytes. It rejects any sequence containing SysEx framing bytes `0xf0` or `0xf7` in V1. It permits ordinary raw messages, including system realtime bytes such as `0xf8`; it does not validate complete MIDI framing because it is the escape hatch.

The package exposes an opaque engine-facing handle rather than native `MIDIOutput`:

```ts
interface ResolvedMidiOutput {
  readonly id: string;
}

midi.out.resolve(selector?: string): ResolvedMidiOutput | null;
midi.out.noteOn(output: ResolvedMidiOutput, options): MidiSendResult;
midi.out.noteOff(output: ResolvedMidiOutput, options): MidiSendResult;
midi.out.clear(output: ResolvedMidiOutput): void;
```

```ts
type MidiSendResult =
  | { sent: true }
  | { sent: false; reason: "unavailable" | "destroyed" | "send-error" };
```

Invalid programmer input still throws. Valid sends to unavailable/destroyed ports and browser `send()` failures return a failure result; AudioEngine consumes those results without destabilizing scheduled playback. `resolve()` lets AudioEngine retain a concrete target from note-on through note-off and `clear()` safely removes its queued sends.

### Destruction

```ts
midi.destroy();
```

Destruction detaches MIDIAccess, port, and message listeners. If access is still pending, a later resolution must do nothing. An unsettled `ready` rejects with a destruction error. Destruction emits `status: "destroyed"` and empty input/output snapshots; existing subscribers remain subscribed so they can observe that terminal state. Applications can create a fresh `Midi` instance to retry after denial/failure.

Protocol validation still throws after destruction. Valid runtime operations after destruction return their documented no-op/failure result.

## Fluid and Schema V1

### Synth MIDI output

```ts
d.synth("sawtooth")
  .out(d.midi.out().channel(1))
  .notes([0, 3, 5])
  .gain(0.5)
  .push();
```

Only synths expose `.out()` in V1. Calling it again replaces the previous target.

```ts
interface MidiOutSchema {
  type: "midi-out";
  device?: string;
  channel: number;
}

interface SynthesizerSchema extends InstrumentSchema {
  notesOut?: MidiOutSchema;
}
```

`d.midi.out()` defaults to channel 1 and resolves the first currently available output at logical note-on. The engine retains the concrete resolved port for that note’s note-off.

MIDI output is additive: local Web Audio still plays. MIDI velocity comes from the resolved primary gain-envelope `max` for that pattern note:

```ts
velocity = clamp(Math.round(resolvedEnvelope.max * 127), 0, 127);
```

Velocity zero skips the event. The engine resolves the envelope once and reuses it for local scheduling and MIDI velocity. Local effects, internal balancing gain, and mute do not affect MIDI velocity.

### Mute

All Fluid instruments expose:

```ts
d.synth().mute();
d.sample("break").mute(false);
```

`muted` is a general `InstrumentSchema` flag. AudioEngine applies it through a dedicated local-audio mute gain after its internal balancing stage. It never changes primary gain or MIDI velocity.

### MIDI CC

Fluid builds serializable descriptors only:

```ts
d.lpf(d.midi.cc(74));
d.lpf(d.midi.cc(74).expRange(100, 8_000).default(440));
d.synth().detune(d.midi.cc("Launchkey Mini", 1).range(-1200, 1200));
```

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

`.range()`, `.expRange()`, and `.default()` are order-independent.

- Range/default values must be finite.
- Exponential endpoints must be positive.
- Reversed ranges support inverted controllers.
- Equal endpoints create a constant mapping.
- Explicit defaults outside their range clamp to the nearest endpoint.
- Invalid MIDI protocol values throw rather than clamp.

Omitted values receive contextual defaults:

| Destination              | Range                    | Default  |
| ------------------------ | ------------------------ | -------- |
| gain effect              | linear 0–1               | 1        |
| filter frequency         | exponential 20–20,000 Hz | 1,000 Hz |
| filter Q                 | linear 0–30              | 1        |
| instrument/filter detune | linear -1200–1200 cents  | 0        |
| filter gain              | linear -24–24 dB         | 0        |

Contextual values are silent and documented in V1. The future structured diagnostics system can report them in the REPL once per evaluation.

V1 supports CC only for direct AudioParam slots: filter frequency/Q/detune/gain, gain-effect gain, and instrument detune. Primary gain and all envelope/ADSR fields are follow-up work.

## AudioEngine V1

### Connection and lifecycle

```ts
engine.connectMidi(midi);
engine.disconnectMidi();
```

- Connecting the same instance is a no-op.
- Replacing/disconnecting a MIDI instance removes bindings and clears engine-owned queued output safely.
- Connecting after a MIDI CC schema is active binds current relevant voice parameters immediately.
- Engine tracks active voices, MIDI-controlled AudioParams/subscriptions, and logical MIDI-output notes explicitly.
- Instruments provide retirement and destruction lifecycle hooks. Retirement removes real-time bindings while local release tails continue; destruction fully disconnects nodes/subscriptions.

### CC behavior

For each newly created direct AudioParam target, engine:

1. uses current CC state or schema default if `hasValue` is false;
2. maps linearly or exponentially;
3. initializes the parameter immediately when its voice node is created, never with a future event at `note.startTime`;
4. smooths later updates with `setTargetAtTime(mapped, currentTime, 0.01)`;
5. unsubscribes when the voice ends, retires, stops, or is destroyed.

This ensures a controller change received after a voice is constructed but before it starts is not overwritten by stale initialization automation.

### Synth MIDI output behavior

For each logical synth note, engine:

- resolves the output to a concrete port at note-on and keeps it for note-off;
- sends timestamps converted by `clock.audioTimeToMIDITime()`;
- sends note-off at pattern `endTime`;
- creates logical note-on/off events, sorts them by event timestamp, and processes note-off before note-on at equal timestamps;
- reference-counts same `outputId:channel:note` overlap in that event-time order: every logical onset retriggers, while only the final logical end sends physical note-off;
- tracks concrete outputs with queued sends and used channels separately from active-note counts.

On transport stop, MIDI replacement/disconnection, and engine destruction, engine clears pending sends with `MIDIOutput.clear()` and sends CC123 All Notes Off on used channels. Queue clearing is port-wide and assumes exclusive engine ownership of the entire configured output port queue.

Schema retirement does not automatically clear a port queue merely because a local instrument is retiring: current-bar events may still be valid under the engine’s bar-boundary replacement model.

## Web-app integration

`d.midi.*` executes in the evaluation worker only as schema construction. Runtime `Midi` remains on the main thread in `AudioPlayer`.

```ts
audio.enableMidi(): Midi;
audio.disableMidi(): void;
```

- `enableMidi()` returns a pending instance immediately, connects it to AudioEngine, and handles `ready` rejection so no unhandled promise occurs.
- `disableMidi()` disconnects the engine, destroys the instance, and clears app state.
- `AudioPlayer` adapts external MIDI signals into Svelte `$state`; reading `signal.value` directly in a component is not reactive.
- Header UI enables MIDI from a user gesture, displays all status states, lists reactive port names/IDs, copies IDs, and permits disable.

## Follow-up scopes

### Structured diagnostics

See [`error-handling.md`](error-handling.md). Future diagnostics should cover contextual CC defaults, ambiguous selectors, unavailable output, and engine warnings in the frontend REPL rather than only browser developer tools.

### MIDI note input → synth voices

This needs a dedicated live-voice design covering `MidiInSchema`, `d.midi.notes()`, transport behavior, held-note ADSR/release, source-aware polyphony, cleanup, and dynamic parameter semantics. MIDI note 0 must be fixed in `midiToFrequency()` (`< 0`, not `<= 0`).

### MIDI-controlled envelopes

Primary gain and ADSR/envelope MIDI control are valuable but require explicit semantics for changing scheduled envelope ramps and are deferred.

### Sampler MIDI output/input

Sampler MIDI output is deferred pending a concrete product workflow. It must keep original resolved MIDI pitch separate from sample playback rate and decide whether output remains independent of sample-buffer availability. Sampler MIDI input follows live synth-note design and needs source-key/release semantics.
