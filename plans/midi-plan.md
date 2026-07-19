# MIDI Implementation Plan

## Context

This plan implements [`midi-prd.md`](midi-prd.md) as tracer-bullet vertical slices. Each phase crosses package API, schema/Fluid, AudioEngine lifecycle, tests, and manual verification where applicable.

V1 deliberately includes:

- a standalone `@web-audio/midi` package;
- CC input as a real-time source for direct Web Audio parameters;
- pattern-driven **synth** MIDI output;
- opt-in MIDI setup in `apps/web`.

MIDI note input driving AudioEngine voices, MIDI-controlled envelope values, and sampler MIDI output are deferred. They need separate live-voice and sampler-semantics design work.

## Key design decisions

- `@web-audio/midi` has no external or `@web-audio/*` dependencies.
- Public MIDI channels are 1–16; MIDI status-byte encoding uses `channel - 1`.
- A port selector string resolves as an exact, case-sensitive ID first, then an exact name.
- Runtime `Midi` construction immediately requests access; applications control prompt timing by constructing it only after a user gesture.
- `Midi.status` represents API access and terminal destruction; connected input/output lists represent physical port availability.
- Signals deliver their current value immediately on subscription and future updates thereafter.
- Input dispatch is centralized: one message listener per connected input port, never one DOM listener per signal.
- CC values are normalized 0–1. Fluid supplies contextual range/default values when authors omit them; the future diagnostics system, not MIDI-local `console.warn`, will report implicit defaults.
- CC v1 applies only to direct AudioParam slots: filter frequency/Q/detune/gain, gain-effect gain, and instrument detune.
- MIDI output is additive, but V1 supports it on synthesizers only. `.mute()` remains general to all instruments.
- MIDI output resolves an opaque concrete port handle for each logical note-on and retains it for the paired note-off.
- Logical MIDI output events are sorted by timestamp before overlap accounting; note-off precedes note-on at equal timestamps.
- Transport stop, MIDI replacement, and engine destruction clear queued output sends and send All Notes Off. This assumes the engine exclusively owns each configured output port’s queue.
- A dedicated AudioEngine-internal `MidiOutputScheduler` owns rolling MIDI dispatch, concrete-port resolution, overlap accounting, and output cleanup; synths only submit logical notes to it.
- Instrument lifecycle gains explicit `retire()` and `destroy()` hooks so real-time bindings can end immediately while audio release tails continue.

---

## Phase 1: Standalone MIDI package

Tracer bullet: a browser application can request MIDI access, inspect changing ports, receive CC/note state, send validated MIDI, and cleanly tear everything down without importing the rest of the monorepo.

### Step 1.1 — Package, signals, and public types

**Files:** `packages/midi/package.json`, `packages/midi/tsconfig.json`, `packages/midi/src/index.ts`, `packages/midi/src/signal.ts`, `packages/midi/src/types.ts`

Create an ESM `tsdown` library following `clock`/`fluid` conventions. `pnpm-workspace.yaml` already includes `packages/*`.

```ts
interface Signal<T> {
  readonly value: T;
  subscribe(fn: (value: T) => void): () => void;
}

type MidiStatus =
  | "pending"
  | "connected"
  | "denied"
  | "unavailable"
  | "error"
  | "destroyed";

type MidiDevice = { id: string; name: string | null };

type MidiNote = {
  note: number;
  velocity: number;
  deviceId: string;
  channel: number;
};
```

Requirements:

- subscriptions receive the current value immediately, then later emissions;
- unsubscription is idempotent;
- emitted collection state is a new snapshot on each change; do not promise runtime immutability beyond the TypeScript `ReadonlySet` API unless a later shared collection abstraction is introduced;
- `CcSignal` initial state is `value: 0`, `raw: 0`, `hasValue: false`, `deviceId: null`, and `receivedChannel: null`; metadata identifies the latest accepted matching message after one arrives; `_channel` remains the internal matching scope so `.channel(1)` remains the public immutable builder;
- input-builder methods are immutable: `.channel(1)` returns a distinct canonical scoped signal and never mutates the unscoped signal;
- cache identity is the requested selector string (or unscoped), input kind, CC number where applicable, and channel—not a currently resolved physical port.

**Acceptance criteria:**

- [x] `pnpm --filter @web-audio/midi build` succeeds.
- [x] `pnpm --filter @web-audio/midi check` passes.
- [x] Signal subscriptions, immediate delivery, unsubscription, and canonical input-signal identity are tested.

### Step 1.2 — Access, ports, and destruction

**Files:** `packages/midi/src/midi.ts`, `packages/midi/src/inputs.ts`, `packages/midi/src/outputs.ts`

```ts
const midi = new Midi();
await midi.ready;
midi.destroy();
```

Requirements:

- no `navigator` access at module scope;
- absent `requestMIDIAccess` sets `unavailable`, rejects `ready`, and exposes empty lists;
- `NotAllowedError` sets `denied`; other access failures set `error`; both retain the original thrown value as `midi.error: unknown | null` so callers can inspect DOMException names, stacks, and other context rather than receiving a lossy normalized string;
- successful access sets `connected`, including when no physical ports are connected;
- expose only currently connected ports in `inputs` and `outputs`;
- `MIDIAccess.onstatechange` refreshes lists, attaches one central listener to each connected input, and detaches disconnected listeners;
- input disconnect removes that port’s held notes but retains prior CC values;
- if destruction occurs before access resolves, the later resolution must not attach listeners or update a destroyed instance;
- define `ready` destruction behavior: reject it with a destruction error if unsettled; retain its settled result otherwise;
- destruction emits `status: "destroyed"` and empty input/output snapshots while retaining subscribers long enough to observe the terminal state;
- protocol validation still throws after destruction; valid runtime operations return their documented no-op/failure result.

**Acceptance criteria:**

- [x] Port lists update for connect, disconnect, and reconnect.
- [x] Central dispatch does not add listeners as signals are created.
- [x] Destroy while pending, after granted access, and after denied/error access is tested.
- [x] No listener is attached after destruction.

### Step 1.3 — Input API

**Files:** `packages/midi/src/inputs.ts`, `packages/midi/src/inputs.test.ts`

```ts
midi.in.cc(74);
midi.in.cc("Launchkey Mini", 74).channel(1);
midi.in.notes();
midi.in.notes("<port-id>").channel(1);
```

Selector resolution:

1. exact case-sensitive ID;
2. exact case-sensitive name;
3. duplicate names select the first available port; future diagnostics should report ambiguity once per relevant operation.

Requirements:

- validate public CC numbers as 0–127 and channels as 1–16;
- decode incoming channels as `(status & 0x0f) + 1`;
- unscoped signals merge matching messages from connected ports/channels;
- note state uses `deviceId:channel:note` keys;
- note-on velocity 0 is note-off;
- a repeated same-source note-on updates velocity and emits a new snapshot;
- note disconnect removes all notes from that port;
- CC disconnect preserves the most recently received state.

**Acceptance criteria:**

- [x] Device/name/channel filtering works.
- [x] Multiple devices holding the same pitch remain distinct in note state.
- [x] Note-off, velocity-zero note-on, repeated note-on, and disconnect behavior are tested.
- [x] Repeated builder calls and `.channel()` calls return canonical signals without mutating others.

### Step 1.4 — Output API

**Files:** `packages/midi/src/outputs.ts`, `packages/midi/src/outputs.test.ts`

```ts
midi.out.noteOn(device, { note, velocity, channel, time? });
midi.out.noteOff(device, { note, channel, time? });
midi.out.cc(device, { cc, value, channel, time? });
midi.out.send(device, data, time?);
```

Requirements:

- typed note-on defaults velocity to 127; all typed sends default channel to 1; supplied note/CC/velocity fields validate as integers 0–127 and supplied channels as 1–16;
- encode channel 1 as nibble 0, e.g. `0x90 | (channel - 1)`;
- accept non-empty `Uint8Array` and readonly byte arrays for raw sends; validate bytes are integers 0–255;
- raw send is for ordinary non-SysEx messages such as pitch bend/program change; reject any sequence containing SysEx bytes (`0xf0`/`0xf7`) in V1, but permit system realtime bytes such as `0xf8`;
- do not validate complete MIDI framing for raw send; return `MidiSendResult` for valid runtime send failures rather than silently swallowing them;
- expose an opaque engine-facing output handle and result API:

  ```ts
  interface ResolvedMidiOutput {
    readonly id: string;
  }

  type MidiSendResult =
    | { sent: true }
    | { sent: false; reason: "unavailable" | "destroyed" | "send-error" };

  midi.out.resolve(selector?: string): ResolvedMidiOutput | null;
  midi.out.noteOn(output: ResolvedMidiOutput, options): MidiSendResult;
  midi.out.noteOff(output: ResolvedMidiOutput, options): MidiSendResult;
  midi.out.clear(output: ResolvedMidiOutput): void;
  ```

- invalid programmer input throws; unavailable/destroyed target and native `send()` failure return `MidiSendResult` failure;
- expose clearing of a concrete output queue for engine lifecycle handling without exposing native `MIDIOutput`.

**Acceptance criteria:**

- [x] Typed message bytes, timestamps, validation, raw byte validation, and SysEx rejection are tested.
- [x] Channel 1 tests encode `0x90`, `0x80`, and `0xb0` correctly.
- [x] Resolution by ID/name and unavailable output behavior are tested.

### Step 1.5 — Demo app

**Files:** `apps/midi-demo/`

Create a small Vite/vanilla TypeScript manual-test application.

**Acceptance criteria:**

- [x] MIDI is enabled only from a user action.
- [x] Status and currently connected port names/IDs update reactively.
- [x] CC 1, 7, and 74 values/metadata are shown.
- [x] Source-aware held notes update correctly.
- [x] Test note, note-off, and CC sends work on a selected output.
- [x] Connect/disconnect is manually verifiable.

---

## Phase 2: Schema and Fluid surface

Tracer bullet: a sketch can describe a muted instrument, synth MIDI output, and contextually mapped MIDI CC without importing the runtime MIDI package.

### Step 2.1 — Schema extensions

**Files:** `packages/schema/src/index.ts`

```ts
interface MidiOutSchema {
  type: "midi-out";
  device?: string;
  channel: number;
}

interface MidiCcSchema {
  type: "midi-cc";
  cc: number;
  device?: string;
  channel?: number;
  range: { min: number; max: number; curve: "linear" | "exponential" };
  default: number;
}
```

- Add `muted: boolean` to `InstrumentSchema`.
- Add optional `notesOut?: MidiOutSchema` to **`SynthesizerSchema` only** in V1.
- Extend only direct AudioParam unions with `MidiCcSchema`: filter frequency/Q/detune/gain, gain-effect gain, and instrument detune.
- Do not permit MIDI CC in primary gain envelopes, ADSR values, or envelope effect fields in V1.

**Acceptance criteria:**

- [x] Schema exports all MIDI types.
- [x] Only synthesizers accept `notesOut`.
- [x] Allowed direct parameter slots accept `MidiCcSchema`; envelope slots do not.
- [x] Schema package type-checks.

### Step 2.2 — Fluid MIDI builders

**Files:** `packages/fluid/src/midi.ts`, `packages/fluid/src/index.ts`

```ts
d.midi.out();
d.midi.out("Launchkey Mini").channel(10);

d.midi.cc(74);
d.midi.cc("Launchkey Mini", 74).channel(1);
d.midi.cc(74).range(0, 1).default(0.5);
d.midi.cc(74).default(0.5).expRange(20, 20_000);
```

Requirements:

- output channel defaults to 1; CC listens to every channel unless scoped;
- range/default builder calls are order-independent;
- `range()` is linear and `expRange()` is exponential;
- all range/default values must be finite;
- exponential endpoints must both be positive;
- reversed linear/exponential ranges are supported for inverted controllers;
- equal range endpoints are valid constant mappings;
- explicit defaults outside their range clamp to the nearest endpoint;
- invalid protocol values throw rather than clamp;
- contextual range/default values are silent and documented in V1; the shared diagnostics system can emit authoring diagnostics once per evaluation later.

**Acceptance criteria:**

- [x] ID/name selector, channel, explicit range/default, reversed range, equal range, and invalid-value tests pass.
- [x] Exponential zero/negative/non-finite endpoints fail clearly.
- [x] Builder call ordering serializes identical schemas.

### Step 2.3 — Instrument methods and contextual CC serialization

**Files:** `packages/fluid/src/instruments/instrument.ts`, `packages/fluid/src/instruments/synthesizer.ts`, direct parameter/effect builders, `packages/fluid/src/index.test.ts`

Add:

```ts
d.synth().out(d.midi.out());
d.synth().mute();
d.sample("break").mute(false);
```

- `.out()` exists only on `Synthesizer` and replaces an earlier output target.
- `.mute(enabled = true)` exists on the base Fluid Instrument and serializes `muted` for synths and samplers.
- Apply contextual mappings when a CC builder reaches a supported destination:

| Destination              | Range                    | Default  |
| ------------------------ | ------------------------ | -------- |
| gain effect              | linear 0–1               | 1        |
| filter frequency         | exponential 20–20,000 Hz | 1,000 Hz |
| filter Q                 | linear 0–30              | 1        |
| instrument/filter detune | linear -1200–1200 cents  | 0        |
| filter gain              | linear -24–24 dB         | 0        |

**Acceptance criteria:**

- [x] Synth output schema defaults to channel 1 and supports device selectors.
- [x] Samplers do not expose `.out()` in V1.
- [x] Mute serializes for both synths and samplers.
- [x] Explicit configuration overrides contextual values.
- [x] Contextual CC schemas are deterministic and do not use MIDI-specific `console.warn` calls.

---

## Phase 3: Engine lifecycle and MIDI CC

Tracer bullet: active audio voices can bind/unbind CC safely, mute has a dedicated local-audio stage, and schema replacement has explicit retirement semantics.

### Step 3.1 — Dependencies and engine MIDI lifecycle

**Files:** `packages/audio-engine/package.json`, `apps/web/package.json`, `packages/audio-engine/src/index.ts`

Add workspace dependencies with package-manager commands, not manual manifest edits:

```sh
pnpm --filter @web-audio/audio-engine add @web-audio/midi@workspace:*
pnpm --filter web add @web-audio/midi@workspace:*
```

Add:

```ts
engine.connectMidi(midi: Midi): void;
engine.disconnectMidi(): void;
```

Requirements:

- same instance is a no-op;
- replacement/disconnection tears down current bindings and clears engine-owned queued MIDI output safely;
- connecting after a MIDI CC schema is active binds all currently active relevant voice parameters;
- immediate V1 behavior is defined without a diagnostics hook: invalid API input throws, unavailable/destroyed sends return `MidiSendResult` failure, and scheduled engine playback consumes failures without throwing;
- schemas that need MIDI but have no connected instance report a structured/future diagnostic once per commit;
- engine owns explicit registries for active voices, MIDI-controlled AudioParams, subscriptions, and scheduled MIDI-output note state.

**Acceptance criteria:**

- [x] Connect after active voices exist binds them.
- [x] Replacing/disconnecting a MIDI instance removes old subscriptions and output state.
- [x] Engine destroy removes every MIDI binding.

### Step 3.2 — Explicit instrument lifecycle and mute stage

**Files:** `packages/audio-engine/src/instruments/instrument.ts`, `packages/audio-engine/src/instruments/synthesizer.ts`, `packages/audio-engine/src/instruments/sampler.ts`

Add lifecycle methods conceptually equivalent to:

```ts
retire(): void;
cancelFutureNotes(): void;
destroy(): void;
```

- `retire()` immediately removes real-time CC bindings but allows existing local release tails to finish.
- `cancelFutureNotes()` retains current transport-stop semantics for local scheduled audio.
- `destroy()` disconnects all voice nodes, mute/balancing nodes, and subscriptions.
- Introduce a dedicated mute gain stage after the existing balancing gain:

```text
voice/effects → balancing gain → mute gain → engine master
```

`muted` is applied at schema commit; it never changes primary gain-envelope or MIDI velocity behavior.

**Acceptance criteria:**

- [x] Retired instruments no longer react to CC while release tails remain audible.
- [x] Destroy has no remaining audio or MIDI subscriptions.
- [x] `.mute(false)` restores balancing behavior without needing to reconstruct its value.

### Step 3.3 — CC mapping and pre-scheduled voices

**Files:** `packages/audio-engine/src/instruments/instrument.ts`, relevant voice tracking/tests

For a direct AudioParam controlled by `MidiCcSchema`:

1. read current CC value, or use schema `default` while `hasValue` is false;
2. map normalized value using the schema’s linear or exponential interpolation;
3. initialize the node parameter immediately at voice creation, not at its future `note.startTime`;
4. subscribe for updates and use `setTargetAtTime(mapped, currentTime, 0.01)`;
5. remove that subscription when the voice ends, retires, stops, or is destroyed.

Do not leave a future initialization automation event that can overwrite a CC update received before the note starts. Resolve a gain envelope once per pattern note and reuse that resolved value wherever the engine needs it.

**Acceptance criteria:**

- [x] CC updates current voices and initializes future voices from the latest state.
- [x] A CC change between voice construction and note start is not overwritten at note start.
- [x] Linear/exponential/reversed/constant mappings are tested.
- [x] First real CC value of zero is distinguishable from no received CC value.
- [x] Retirement, stop, replacement, and destroy clean up subscriptions.

---

## Phase 4: Synth pattern-to-MIDI output

Tracer bullet: a clock-driven synth plays locally and sends synchronized, non-stuck MIDI notes to one external output.

### Step 4.1 — Clock lead-time invariant and isolated MIDI output scheduler

**Files:** `packages/clock/src/index.ts`, clock tests, `packages/audio-engine/src/midi-output-scheduler.ts`, `packages/audio-engine/src/midi-output-scheduler.test.ts`, `packages/audio-engine/src/index.ts`

Before implementing the scheduler, make AudioClock's scheduling lead explicit and consistent:

- expose the scheduling lead time needed to configure and validate downstream schedulers;
- schedule the first bar with `AudioClock.scheduleAheadTime`, rather than the current shorter hard-coded startup delay;
- preserve immediate dispatch as recovery for genuinely late MIDI events, not expected startup behavior;
- define the bounded timer delay used by deterministic tests and verify that `MIDI horizon + maximum expected timer delay < scheduling lead`.

Create a dedicated `MidiOutputScheduler`. It is the only AudioEngine module that knows about:

- the globally time-sorted logical MIDI event queue;
- short rolling lookahead dispatch;
- selector resolution to opaque `ResolvedMidiOutput` handles;
- mapping logical note IDs to their concrete output handles;
- same-pitch reference counts;
- output queue clearing and All Notes Off;
- scheduler timer/clock integration and output teardown.

It is an output delivery buffer, not a second musical sequencer. `AudioClock` remains the single source of BPM, bar/beat timing, schema commit boundaries, note start times, and note durations.

Construct the scheduler from the engine's `AudioClock`, which already owns the audio context, MIDI timestamp conversion, scheduling lead, and bounded scheduler interval:

```ts
new MidiOutputScheduler(clock);
```

The dispatch horizon is an internal scheduler constant rather than AudioEngine configuration. Validate it against `clock.schedulingLeadTime` and `clock.schedulingInterval` so AudioEngine does not duplicate clock timing constants.

For deterministic tests, allow one optional timer dependency:

```ts
new MidiOutputScheduler(clock, {
  scheduleTimer,
});
```

`scheduleTimer(callback, delayMs)` returns a cancellation callback. This avoids environment-specific timer-handle types and a separate clear function. Production uses an internal `setTimeout` wrapper; tests supply a fake clock and timer and do not require global timers.

A narrow internal API is sufficient:

```ts
scheduler.connect(midi: Midi): void;
scheduler.disconnect(): void;
scheduler.scheduleNote({ selector, channel, note, velocity, startTime, endTime }): void;
scheduler.stop(): void;
scheduler.destroy(): void;
```

The scheduler accepts AudioContext timestamps. It converts to MIDI timestamps only when events enter its short near-term dispatch horizon. This permits logical events from successive bars to be globally ordered before irreversible `MIDIOutput.send()` calls are queued.

**Timing invariant:** the dispatch horizon must be shorter than AudioClock’s minimum lead time for exposing the next bar’s logical notes. Tests must cover worst-case timer delay and next-bar submission timing.

**Acceptance criteria:**

- [x] AudioClock uses its scheduling lead for the first bar and exposes that lead without duplicating timing constants in AudioEngine.
- [x] Clock tests cover first-bar and normal-bar scheduling lead.
- [x] The configured MIDI horizon plus the bounded test timer delay is strictly less than the clock scheduling lead.
- [x] Scheduler is unit-testable with fake clock/time and fake MIDI adapter, without AudioContext nodes or synth instances.
- [x] Scheduler owns all MIDI output queues, concrete handles, counts, and teardown state.
- [x] Audio time and MIDI conversion come from the supplied clock; the timer remains optionally injectable, and tests require neither global timers nor an audio graph.
- [x] AudioEngine only owns one scheduler instance and forwards engine lifecycle calls.

### Step 4.2 — Synth submits logical notes

**Files:** `packages/audio-engine/src/instruments/synthesizer.ts`, synth tests

For each resolved synth pattern note:

- resolve gain-envelope values once;
- calculate `velocity = clamp(Math.round(resolvedEnvelope.max * 127), 0, 127)`;
- skip velocity-zero events;
- retain the resolved original MIDI note number;
- submit `{ selector, channel, note, velocity, startTime, endTime }` to `MidiOutputScheduler`;
- local effects, base balancing gain, and mute never alter velocity.

Synthesizer does not resolve ports, schedule MIDI timestamps, manage note-off, reference-count notes, clear queues, or send All Notes Off.

For unscoped output, the scheduler resolves `midi.outputs.value[0]` only when the logical note-on reaches its dispatch horizon. A missing target skips that logical note with a `MidiSendResult` failure; scheduled playback does not throw.

### Step 4.3 — Globally ordered overlap and queue safety

**Files:** `packages/audio-engine/src/midi-output-scheduler.ts`, `packages/audio-engine/src/midi-output-scheduler.test.ts`

Whole bars can be discovered independently while notes cross bar boundaries. The scheduler therefore retains logical events until they are within a short rolling horizon, rather than immediately queuing complete-bar MIDI sends.

When dispatching:

- sort the single global queue across every currently submitted bar by timestamp;
- for equal timestamps, process every note-off first, then every note-on, with stable sequence ordering within each group;
- resolve each note-on selector to a concrete `ResolvedMidiOutput` and retain that handle under a generated logical-note ID for its matching note-off;
- only increment concrete `outputId:channel:note` reference counts after a physical note-on succeeds; an unavailable/failed note-on makes its later logical note-off a no-op;
- remove internal logical-note state even if physical note-off fails, so bookkeeping cannot remain wedged;
- send a physical note-on for every successful logical onset, but send physical note-off only for the final successful logical end;
- handle an event discovered after its target time by deliberately sending it immediately with a current MIDI timestamp, never by passing an accidentally stale timestamp;
- track outputs with queued sends and used channels independently from active-note counts.

On transport stop, MIDI disconnect/replacement, and engine destruction, clear every tracked concrete output’s pending send queue with `MIDIOutput.clear()`, then send channel-scoped All Notes Off (CC 123) on every tracked used channel. Also clear undispatched logical events, logical-note-to-output mappings, overlap counts, tracked handles/channels, and the dispatcher timer. Do not derive ports to clear solely from active-note counts.

A disconnect/replacement starts a new scheduler generation: logical events submitted to the old generation are discarded and never replayed after reconnect. `stop()` clears the current generation and stops the timer; a later `scheduleNote()` lazily starts a new dispatcher. `destroy()` is terminal and ignores later scheduling.

Clearing is intentionally port-wide and assumes exclusive engine ownership of the entire output port queue. Schema retirement follows the existing bar-boundary behavior: do not indiscriminately clear a port queue merely because an old local instrument is retiring, since it could cancel valid current-bar output. Explicit output teardown paths do clear queues.

**Acceptance criteria:**

- [ ] Note-on and note-off always target the same concrete port despite port-list changes.
- [ ] Overlapping same-pitch notes do not cut each other off early.
- [ ] Stop after queued note-on, before queued note-off, and near bar end does not leave a hardware note stuck.
- [ ] MIDI replacement/disconnect/destroy clears engine-owned queued sends and active hardware notes.
- [ ] Local synth playback remains additive and works when MIDI is unavailable.

### Manual verification

```ts
d.synth("sawtooth")
  .out(d.midi.out().channel(1))
  .notes([0, 3, 5])
  .euclid(3, 8)
  .gain(0.5)
  .push();
```

Verify:

- [ ] Local audio and external MIDI hardware both play.
- [ ] MIDI timing follows the clock.
- [ ] `.mute()` silences only local audio.
- [ ] Stop leaves no external notes sounding.
- [ ] An explicit name/ID target remains consistent for note-on/note-off.

---

## Phase 5: Web-app integration

Tracer bullet: the web app enables MIDI from a user action and its UI remains reactive to external MIDI signals.

### Step 5.1 — AudioPlayer ownership and enable/disable flow

**Files:** `apps/web/src/lib/globals/audio-player.svelte.ts`

Add main-thread MIDI ownership:

```ts
audio.enableMidi(): Midi;
audio.disableMidi(): void;
```

- `enableMidi()` creates and retains `Midi`, connects it to AudioEngine, and returns the pending instance immediately.
- Subscribe internally to `midi.ready` to handle rejection and prevent unhandled promise rejections.
- `disableMidi()` disconnects the engine, destroys the instance, and clears app-owned MIDI state.
- Do not create `Midi` in `eval.worker.ts`; `d.midi.*` remains pure schema construction.

### Step 5.2 — Svelte reactive adapter and header UI

**Files:** `apps/web/src/lib/globals/audio-player.svelte.ts`, `apps/web/src/routes/+layout.svelte`, MIDI UI components as needed

External `Signal<T>` values are not Svelte runes/stores. `AudioPlayer` must subscribe and copy MIDI status/input/output state into `$state` values that the UI consumes.

The header control should:

- enable MIDI from a user gesture;
- display pending, connected, denied, unavailable, and error states;
- list currently connected input/output names and IDs;
- provide a copy-ID action;
- permit disabling MIDI.

**Acceptance criteria:**

- [ ] Permission denial/error is visible without an unhandled rejection.
- [ ] Device connect/disconnect updates the UI reactively.
- [ ] Enable/disable correctly creates/destroys engine bindings.
- [ ] Worker evaluation remains independent of Web MIDI browser APIs.

---

## Phase 6: Verification and hardening

### Automated verification

- [ ] `pnpm --filter @web-audio/midi build`
- [ ] `pnpm --filter @web-audio/midi check`
- [ ] `pnpm --filter @web-audio/midi lint`
- [ ] `pnpm --filter @web-audio/midi test:ci`
- [ ] `pnpm --filter @web-audio/schema check`
- [ ] `pnpm --filter @web-audio/fluid check`
- [ ] `pnpm --filter @web-audio/fluid lint`
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine check`
- [ ] `pnpm --filter @web-audio/audio-engine lint`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`
- [ ] `pnpm --filter web check`
- [ ] `pnpm --filter web lint`
- [ ] `pnpm test`

### Required focused tests

- [ ] Destroy while `requestMIDIAccess()` is pending.
- [ ] Port disconnect/reconnect with the same ID.
- [ ] Default-output change between note-on and note-off.
- [ ] Same output/channel/note overlap, including notes supplied out of chronological order and across independently discovered bars.
- [ ] Cross-bar note overlap where an earlier logical note-off is not physically queued before the later onset is known.
- [ ] Worst-case timer delay still preserves the horizon/next-bar discovery invariant.
- [ ] Failed note-on does not increment overlap counts; its note-off is a no-op.
- [ ] Late events deliberately send immediately rather than using stale timestamps.
- [ ] Stop with queued note-on near a bar end and queued note-off later.
- [ ] Replace MIDI instance while voices/output sends are active.
- [ ] CC update after voice creation but before scheduled note start.
- [ ] `connectMidi()` after active voices exist.
- [ ] Invalid/non-finite/exponential ranges.
- [ ] Svelte UI update after external port-state changes.

---

## Follow-up gaps

### Structured diagnostics

See [`error-handling.md`](error-handling.md). Do not add MIDI-specific console-warning/deduplication infrastructure. Once shared diagnostics exist, use it for implicit CC defaults, ambiguous names, unavailable MIDI targets, and engine lifecycle warnings.

### MIDI note input → synthesizer voices

A separate SOW must define and implement:

- `MidiInSchema` and `d.midi.notes()`;
- transport-independent versus transport-bound triggering;
- held-note attack/decay/sustain and note-off release;
- source-aware polyphony and duplicate-note semantics;
- live-voice teardown on stop, schema update, reconnect, and destroy;
- random/pattern/LFO/envelope semantics for live notes;
- MIDI-controlled primary gain and ADSR/envelope values;
- correct MIDI note endpoint handling in `midiToFrequency()` (`< 0`, not `<= 0`).

The current engine is bar-scheduled and calculates envelopes from known note durations. MIDI note input requires a dedicated live-voice runtime, not a small branch in the pattern scheduler.

### Sampler MIDI output

Sampler output is intentionally deferred. It needs a product decision around whether sample pitch, generated fit/chop timing, and local-buffer availability should drive external hardware. If added, carry the original resolved MIDI note separately from sample playback rate and schedule output independently of sample-buffer readiness.

### MIDI input → samplers

Sampler MIDI input follows the live synth-note work and needs separate decisions around source-key selection, held-note behavior, and sample release semantics.
