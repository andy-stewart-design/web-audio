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
- `Midi.status` represents API access; connected input/output lists represent physical port availability.
- Signals deliver their current value immediately on subscription and future updates thereafter.
- Input dispatch is centralized: one message listener per connected input port, never one DOM listener per signal.
- CC values are normalized 0–1. Fluid supplies contextual range/default values when authors omit them; the future diagnostics system, not MIDI-local `console.warn`, will report implicit defaults.
- CC v1 applies only to direct AudioParam slots: filter frequency/Q/detune/gain, gain-effect gain, and instrument detune.
- MIDI output is additive, but V1 supports it on synthesizers only. `.mute()` remains general to all instruments.
- MIDI output resolves a concrete port for each logical note-on and retains it for the paired note-off.
- Transport stop, MIDI replacement, and engine destruction clear queued output sends and send All Notes Off. This assumes the engine owns its output port/channel.
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

type MidiStatus = "pending" | "connected" | "denied" | "unavailable" | "error";

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
- `CcSignal` exposes normalized `value`, `raw`, `hasValue`, `deviceId`, and `channel`;
- input-builder methods are immutable: `.channel(1)` returns a distinct canonical scoped signal and never mutates the unscoped signal;
- repeated calls with the same complete selector/CC/channel key return the same signal instance.

**Acceptance criteria:**

- [ ] `pnpm --filter @web-audio/midi build` succeeds.
- [ ] `pnpm --filter @web-audio/midi check` passes.
- [ ] Signal subscriptions, immediate delivery, unsubscription, and canonical input-signal identity are tested.

### Step 1.2 — Access, ports, and destruction

**Files:** `packages/midi/src/midi.ts`, `packages/midi/src/input.ts`, `packages/midi/src/output.ts`

```ts
const midi = new Midi();
await midi.ready;
midi.destroy();
```

Requirements:

- no `navigator` access at module scope;
- absent `requestMIDIAccess` sets `unavailable`, rejects `ready`, and exposes empty lists;
- `NotAllowedError` sets `denied`; other access failures set `error` and retain the underlying error for callers/logging;
- successful access sets `connected`, including when no physical ports are connected;
- expose only currently connected ports in `inputs` and `outputs`;
- `MIDIAccess.onstatechange` refreshes lists, attaches one central listener to each connected input, and detaches disconnected listeners;
- input disconnect removes that port’s held notes but retains prior CC values;
- if destruction occurs before access resolves, the later resolution must not attach listeners or update a destroyed instance;
- define `ready` destruction behavior: reject it with a destruction error if unsettled; retain its settled result otherwise;
- post-destroy operations are no-ops and report through the future diagnostics hook/temporary documented behavior, not uncaught exceptions.

**Acceptance criteria:**

- [ ] Port lists update for connect, disconnect, and reconnect.
- [ ] Central dispatch does not add listeners as signals are created.
- [ ] Destroy while pending, after granted access, and after denied/error access is tested.
- [ ] No listener is attached after destruction.

### Step 1.3 — Input API

**Files:** `packages/midi/src/input.ts`, `packages/midi/src/input.test.ts`

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

- [ ] Device/name/channel filtering works.
- [ ] Multiple devices holding the same pitch remain distinct in note state.
- [ ] Note-off, velocity-zero note-on, repeated note-on, and disconnect behavior are tested.
- [ ] Repeated builder calls and `.channel()` calls return canonical signals without mutating others.

### Step 1.4 — Output API

**Files:** `packages/midi/src/output.ts`, `packages/midi/src/output.test.ts`

```ts
midi.out.noteOn(device, { note, velocity, channel, time? });
midi.out.noteOff(device, { note, channel, time? });
midi.out.cc(device, { cc, value, channel, time? });
midi.out.send(device, data, time?);
```

Requirements:

- validate typed note/CC/velocity fields as integers 0–127 and channel as 1–16;
- encode channel 1 as nibble 0, e.g. `0x90 | (channel - 1)`;
- accept `Uint8Array` and readonly byte arrays for raw sends; validate bytes are integers 0–255;
- raw send is for ordinary non-SysEx messages such as pitch bend/program change; reject SysEx (`0xf0`/`0xf7`) in V1;
- surface browser `send()` failures predictably rather than silently swallowing them;
- expose an internal/output-resolution mechanism so AudioEngine can resolve a selector to a concrete connected port ID at note-on;
- expose clearing of a concrete output queue for engine lifecycle handling.

**Acceptance criteria:**

- [ ] Typed message bytes, timestamps, validation, raw byte validation, and SysEx rejection are tested.
- [ ] Channel 1 tests encode `0x90`, `0x80`, and `0xb0` correctly.
- [ ] Resolution by ID/name and unavailable output behavior are tested.

### Step 1.5 — Demo app

**Files:** `apps/midi-demo/`

Create a small Vite/vanilla TypeScript manual-test application.

**Acceptance criteria:**

- [ ] MIDI is enabled only from a user action.
- [ ] Status and currently connected port names/IDs update reactively.
- [ ] CC 1, 7, and 74 values/metadata are shown.
- [ ] Source-aware held notes update correctly.
- [ ] Test note, note-off, and CC sends work on a selected output.
- [ ] Connect/disconnect is manually verifiable.

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

- [ ] Schema exports all MIDI types.
- [ ] Only synthesizers accept `notesOut`.
- [ ] Allowed direct parameter slots accept `MidiCcSchema`; envelope slots do not.
- [ ] Schema package type-checks.

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
- contextual range/default values are silent and documented until the shared diagnostics system can emit authoring diagnostics once per evaluation.

**Acceptance criteria:**

- [ ] ID/name selector, channel, explicit range/default, reversed range, equal range, and invalid-value tests pass.
- [ ] Exponential zero/negative/non-finite endpoints fail clearly.
- [ ] Builder call ordering serializes identical schemas.

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

- [ ] Synth output schema defaults to channel 1 and supports device selectors.
- [ ] Samplers do not expose `.out()` in V1.
- [ ] Mute serializes for both synths and samplers.
- [ ] Explicit configuration overrides contextual values.
- [ ] Contextual CC schemas are deterministic and do not use MIDI-specific `console.warn` calls.

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
- schemas that need MIDI but have no connected instance report a structured/future diagnostic once per commit;
- engine owns explicit registries for active voices, MIDI-controlled AudioParams, subscriptions, and scheduled MIDI-output note state.

**Acceptance criteria:**

- [ ] Connect after active voices exist binds them.
- [ ] Replacing/disconnecting a MIDI instance removes old subscriptions and output state.
- [ ] Engine destroy removes every MIDI binding.

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

- [ ] Retired instruments no longer react to CC while release tails remain audible.
- [ ] Destroy has no remaining audio or MIDI subscriptions.
- [ ] `.mute(false)` restores balancing behavior without needing to reconstruct its value.

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

- [ ] CC updates current voices and initializes future voices from the latest state.
- [ ] A CC change between voice construction and note start is not overwritten at note start.
- [ ] Linear/exponential/reversed/constant mappings are tested.
- [ ] First real CC value of zero is distinguishable from no received CC value.
- [ ] Retirement, stop, replacement, and destroy clean up subscriptions.

---

## Phase 4: Synth pattern-to-MIDI output

Tracer bullet: a clock-driven synth plays locally and sends synchronized, non-stuck MIDI notes to one external output.

### Step 4.1 — Output scheduling and stable note targets

**Files:** `packages/audio-engine/src/instruments/synthesizer.ts`, `packages/audio-engine/src/index.ts`, MIDI-output helpers/tests

For each resolved synth pattern note:

- resolve gain-envelope values once;
- calculate `velocity = clamp(Math.round(resolvedEnvelope.max * 127), 0, 127)`;
- skip velocity-zero events;
- retain the resolved original MIDI note number;
- resolve the output selector to a concrete port at note-on and retain that port for its paired note-off;
- convert note start/end audio times using `clock.audioTimeToMIDITime()`;
- send note-off at the pattern note `endTime`, where local playback begins release;
- local effects, base balancing gain, and mute never alter velocity.

For unscoped output, resolution starts with `midi.outputs.value[0]` at note-on. A missing target skips the event and reports once per instrument/schema through the eventual diagnostics path.

### Step 4.2 — Overlap and queue safety

**Files:** `packages/audio-engine/src/index.ts`, MIDI-output scheduler/tests

Track logical MIDI notes by concrete `outputId:channel:note`.

- Define same-pitch overlap as retrigger-on-each-note-on with reference-counted physical note-off: every logical note-on sends a physical note-on; only the final logical note-off sends the physical note-off.
- On transport stop, MIDI disconnect/replacement, and engine destruction, clear the concrete output’s pending send queue with `MIDIOutput.clear()`, then send channel-scoped All Notes Off (CC 123) immediately.
- Clearing a port queue is intentionally broad and assumes engine ownership of that port; document this limitation.
- Schema retirement follows the existing bar-boundary behavior: do not indiscriminately clear a port queue merely because an old local instrument is retiring, since it could cancel valid current-bar output. Explicit output teardown paths do clear queues.

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
- [ ] Same output/channel/note overlap.
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
