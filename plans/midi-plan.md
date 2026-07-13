# MIDI Implementation Plan

See [`midi-prd.md`](midi-prd.md) for the agreed API and product decisions. This plan implements MIDI in two scopes:

- **V1:** standalone MIDI package, MIDI CC → AudioParam bindings, and pattern → MIDI hardware output.
- **Follow-up:** MIDI note input → AudioEngine voices, including samplers.

## V1

### Phase 1 — `@web-audio/midi` package

Create `packages/midi/` following the built-library conventions used by `clock` and `fluid`:

- `package.json`, `tsconfig.json`, `src/index.ts`;
- ESM package built by `tsdown` to `dist/index.mjs`;
- no external dependencies and no `@web-audio/*` dependencies;
- workspace inclusion is already covered by `pnpm-workspace.yaml`’s `packages/*` glob.

#### 1.1 Signals

Create `src/signal.ts`:

```ts
class Signal<T> {
  get value(): T;
  subscribe(fn: (value: T) => void): () => void;
}
```

Requirements:

- subscriptions are invoked immediately and on every later emission;
- unsubscribe is idempotent;
- emitted collection values are immutable snapshots;
- `CcSignal` exposes normalized `value`, `raw`, `hasValue`, `deviceId`, and `channel`;
- `NoteSignal` exposes `ReadonlySet<MidiNote>`.

Tests:

- immediate subscription delivery;
- unsubscribe behavior;
- value updates and immutable snapshots;
- CC raw/normalized/meta state.

#### 1.2 Access, status, and devices

Create `src/midi.ts`:

```ts
class Midi {
  readonly ready: Promise<void>;
  readonly status: Signal<"pending" | "connected" | "denied" | "unavailable">;
  readonly inputs: Signal<readonly MidiDevice[]>;
  readonly outputs: Signal<readonly MidiDevice[]>;
  readonly in: MidiInput;
  readonly out: MidiOutput;
  destroy(): void;
}
```

Requirements:

- constructor calls `navigator.requestMIDIAccess()` immediately;
- no `navigator` access at module scope;
- absent Web MIDI sets `unavailable`, rejects `ready`, and exposes empty device lists;
- denied access sets `denied` and rejects `ready`;
- granted access sets `connected`, even with no connected ports;
- `MIDIAccess.onstatechange` refreshes the device lists without changing granted status;
- input disconnect removes its held notes but retains its last CC values;
- destroy detaches all access/port/message listeners.

Tests mock `requestMIDIAccess`, port maps, state changes, denied access, absent navigator, and destroy.

#### 1.3 Device-selector resolution

Use one string selector API for input and output:

```ts
"<port-id>";
"Launchkey Mini";
```

Resolution order:

1. exact, case-sensitive ID;
2. exact, case-sensitive name;
3. duplicate names warn once and resolve to the first available port.

Tests cover ID precedence, exact-name lookup, duplicate-name warning, and unavailable selectors.

#### 1.4 CC and note input

Create `src/input.ts`.

```ts
midi.in.cc(74);
midi.in.cc("Launchkey Mini", 74).channel(1);
midi.in.notes();
midi.in.notes("Launchkey Mini").channel(1);
```

Requirements:

- public channels are 1–16; parse status-byte channels as `(status & 0x0f) + 1`;
- CC signals cache by complete selector/CC/channel identity;
- unscoped inputs merge sources;
- CC signals retain last value on disconnect;
- note state is keyed by `deviceId:channel:note`;
- note-on velocity 0 is note-off;
- repeated same-source note-on updates velocity and emits;
- device disconnect removes all notes from that source;
- invalid CC/channel arguments throw.

Tests include global/device/name/channel filtering, multiple devices holding the same pitch, note-off behavior, repeated note-on, and disconnect cleanup.

#### 1.5 Output

Create `src/output.ts`.

```ts
midi.out.noteOn(device, { note, velocity, channel, time? });
midi.out.noteOff(device, { note, channel, time? });
midi.out.cc(device, { cc, value, channel, time? });
midi.out.send(device, data, time?);
```

Requirements:

- validate note/CC/value/velocity as 0–127 and channels as 1–16;
- encode channel with `channel - 1`;
- pass timestamps through as `performance.now()` times;
- unavailable devices warn and skip without throwing during playback;
- raw `send()` is the unsupported-message escape hatch.

Tests verify bytes, especially channel 1 (`0x90`), timestamps, validation, selector resolution, and missing-port handling.

#### 1.6 Demo app

Create `apps/midi-demo/` as a small Vite/vanilla TypeScript app.

It should:

- enable MIDI from a user action;
- display access status and connected ports with names/IDs;
- display CC 1, 7, and 74 values and metadata;
- display held source-aware notes;
- send test note-on/off and CC messages to a selected output;
- exercise device connect/disconnect behavior.

### Phase 2 — Schema

Update `packages/schema/src/index.ts`.

#### 2.1 MIDI output and mute

```ts
interface MidiOutSchema {
  type: "midi-out";
  device?: string;
  channel: number;
}

interface InstrumentSchema {
  gain: EnvelopeSchema;
  effects: EffectSchema[];
  detune: ...;
  muted: boolean;
  notesOut?: MidiOutSchema;
}
```

All current instruments inherit `notesOut` and `muted`.

#### 2.2 MIDI CC source

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

Extend only the V1 direct-AudioParam schema unions:

- filter frequency, Q, detune, and gain;
- gain-effect gain;
- instrument detune.

Do not add MIDI CC to primary gain envelopes, ADSR fields, or other envelope fields in V1.

Add schema type tests and ensure all packages type-check.

### Phase 3 — Fluid

#### 3.1 MIDI namespace builders

Create `packages/fluid/src/midi.ts` and expose `d.midi` from `packages/fluid/src/index.ts`.

```ts
d.midi.out();
d.midi.out("Launchkey Mini").channel(10);

d.midi.cc(74);
d.midi.cc("Launchkey Mini", 74).channel(1);
d.midi.cc(74).range(0, 1).default(0.5);
d.midi.cc(74).default(0.5).expRange(20, 20_000);
```

Builder requirements:

- channel defaults to 1 for output; CC has no channel filter by default;
- range/default calls are order-independent;
- `range()` is linear; `expRange()` is exponential;
- explicit default outside explicit range is clamped with a development warning;
- invalid MIDI protocol fields throw;
- omitted range/default are completed at destination serialization using contextual defaults and development warnings.

#### 3.2 Instrument API

Update Fluid’s base `Instrument` class:

```ts
.out(target: MidiOutBuilder): this;
.mute(enabled = true): this;
```

- `.out()` replaces the previous target;
- `.mute()` is general to synths and samplers;
- `Synthesizer` and `Sampler` serialize `notesOut` and `muted`.

Update the actual current Fluid entry points (`src/index.ts`, base `instruments/instrument.ts`, synth and sampler classes), not the obsolete `src/drome.ts` path in the original draft.

#### 3.3 CC destination serialization

Update direct parameter builders/effects to recognize MIDI CC builders and apply contextual mapping/default values:

| Destination              | Range                    | Default  |
| ------------------------ | ------------------------ | -------- |
| gain effect              | linear 0–1               | 1        |
| filter frequency         | exponential 20–20,000 Hz | 1,000 Hz |
| filter Q                 | linear 0–30              | 1        |
| instrument/filter detune | linear -1200–1200 cents  | 0        |
| filter gain              | linear -24–24 dB         | 0        |

Add Fluid schema tests for synth and sampler MIDI output, mute, explicit CC configuration, contextual CC configuration, warning/clamping behavior, and every allowed direct parameter target.

### Phase 4 — AudioEngine

Add `@web-audio/midi` as an AudioEngine workspace dependency.

#### 4.1 MIDI connection and binding ownership

Add:

```ts
engine.connectMidi(midi: Midi): void;
```

Requirements:

- same instance is a no-op;
- a replacement instance cleans up old bindings and binds active MIDI schemas immediately;
- a schema containing MIDI nodes without a connected instance warns once per commit;
- bindings are owned by instruments/voices and are removed when voices end;
- retiring an instrument on schema replacement immediately removes its CC bindings, while its audio release tail continues;
- `destroy()` removes every MIDI binding.

#### 4.2 CC parameter resolution

Refactor direct AudioParam application so it recognizes `midi-cc`.

For every new voice:

1. resolve current normalized CC value, or use schema default when `hasValue` is false;
2. map linearly or exponentially to the schema range;
3. initialize the target AudioParam;
4. subscribe for later updates using `setTargetAtTime(mapped, currentTime, 0.01)`;
5. unsubscribe when that voice ends.

Add unit/integration tests for defaults, first received zero, linear/exponential mapping, smoothing calls, active-voice updates, future-voice initialization, retirement, and destroy.

#### 4.3 Pattern-to-MIDI output

Implement a shared MIDI-output scheduling path usable by synthesizer and sampler pattern events.

Requirements:

- local Web Audio remains scheduled normally;
- muted instruments still send MIDI;
- MIDI velocity is `clamp(round(resolvedPrimaryGainPeak * 127), 0, 127)`;
- velocity 0 skips the MIDI event;
- output note numbers are the already-resolved pattern MIDI notes;
- convert scheduled AudioContext time with `clock.audioTimeToMIDITime()`;
- send note-off at the pattern note `endTime`;
- no-device targets resolve `midi.outputs.value[0]` at each send;
- unavailable output warns once per instrument/schema and skips events.

On clock stop, send CC 123 (All Notes Off) immediately and again after the scheduling horizon for each active output/channel, then clear output bookkeeping. Document the output/channel-ownership assumption.

Tests cover synth and sampler output, default and explicit devices, timestamp conversion, velocity, mute independence, note-off time, missing output, and stop safety.

### Phase 5 — Web app integration

Update `apps/web/src/lib/globals/audio-player.svelte.ts`:

```ts
audio.enableMidi(): Midi;
```

It lazily constructs `Midi` on the main thread, connects it to the existing AudioEngine, and retains it. Do not instantiate runtime MIDI in `eval.worker.ts`; `d.midi.*` remains pure schema construction and is safe there.

Add a header Enable MIDI control that:

- invokes `audio.enableMidi()` from a user gesture;
- shows access status;
- lists connected input/output names and IDs;
- supports copy-ID for precise sketch selectors.

## Follow-up SOW — MIDI note input

Do not start this work as part of V1. It needs a dedicated design pass and implementation plan.

### Required scope

- `MidiInSchema` and `d.midi.notes()`;
- MIDI-driven synthesizer voices;
- later, MIDI-driven samplers;
- note-on attack/decay/sustain and note-off release;
- source-aware polyphony and duplicate-note behavior;
- transport-independent versus transport-bound triggering;
- active-voice behavior on stop, schema update, reconnect, and destroy;
- primary instrument gain controlled by MIDI CC;
- MIDI-controlled ADSR/envelope values;
- semantics for random/pattern parameters, LFOs, and envelope effects on live notes;
- fix `midiToFrequency()` so MIDI note 0 is accepted (`< 0`, not `<= 0`).

The existing AudioEngine is bar-scheduled and computes envelopes from known note durations. MIDI note input requires a separate held-note/live-voice runtime rather than a small branch in the existing pattern scheduler.

## Validation

After each phase, run the relevant package checks/tests. Before completing V1, run:

```sh
pnpm check
pnpm lint
pnpm test
```
