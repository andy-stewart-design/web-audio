# MIDI Implementation Plan

## Context

This plan implements `@web-audio/midi`, a Web MIDI API wrapper, and integrates it into the Fluid → Schema → AudioEngine pipeline. See `plans/midi-prd.md` for the full design rationale and API specification.

**Key design decisions:**

- `@web-audio/midi` has no external dependencies and no dependency on other `@web-audio/*` packages. It is independently usable.
- The library uses a self-implemented hybrid signal type — readable (`.value`) and subscribable (`.subscribe()`). No RxJS.
- Initialization is lazy: `new Midi()` triggers `requestMIDIAccess()` internally. Consumers never touch the Web MIDI API.
- All devices are merged by default. Device scoping is opt-in at the call site: `midi.in.cc("device-id", 74)`.
- Quantization (free-form vs. beat-snapped note triggering) is AudioEngine's responsibility, not the library's. **Not implemented in this plan** — MIDI-driven synths fire free-form only. Quantization is a future addition to AudioEngine.
- CC values are normalized `0–1` by default; `.raw` exposes `0–127`.
- Note signals hold a `Set` of currently-pressed `{ note, velocity }` objects as `.value`.
- MIDI-driven synths and clock-driven synths are mutually exclusive.
- Gain ↔ velocity mapping is symmetric: `velocity / 127 = gain`, `gain * 127 = velocity`.
- MIDI output sends note-off at end of sustain (before release). External synth owns its release.

---

## Phase 1: `@web-audio/midi` Package + Demo App

Standalone package with no monorepo dependencies. Fully usable and testable in isolation.

### Step 1.1 — Package scaffold

**Files:** `packages/midi/package.json`, `packages/midi/tsconfig.json`, `packages/midi/src/index.ts`

Create the package following the conventions of other built packages (`clock`, `fluid`):
- `"type": "module"`
- Build with `tsdown` to `dist/index.mjs`
- Add to `pnpm-workspace.yaml` and turbo pipeline

**Acceptance criteria:**
- [ ] `pnpm --filter @web-audio/midi build` succeeds
- [ ] `pnpm --filter @web-audio/midi exec tsc --noEmit` passes

---

### Step 1.2 — Signal implementation

**Files:** `packages/midi/src/signal.ts`

Implement the base `Signal<T>` class used throughout the library.

```ts
class Signal<T> {
  get value(): T
  subscribe(fn: (value: T) => void): () => void
  protected _emit(value: T): void
}

class CcSignal extends Signal<number> {
  get value(): number   // normalized 0–1
  get raw(): number     // 0–127
}

class NoteSignal extends Signal<Set<{ note: number; velocity: number }>> {
  // .value is the set of currently held notes
}
```

**Acceptance criteria:**
- [ ] `subscribe()` returns an unsubscribe function
- [ ] All active subscribers are called on `_emit()`
- [ ] Unsubscribed listeners are not called after unsubscribe
- [ ] `.value` reflects the most recently emitted value
- [ ] `CcSignal.raw` reflects the pre-normalization integer

**Testing:** `packages/midi/src/signal.test.ts`

---

### Step 1.3 — MIDI access and status

**Files:** `packages/midi/src/midi.ts`

Implement the `Midi` class shell: initialization, permission flow, and status.

```ts
class Midi {
  readonly ready: Promise<void>
  readonly status: Signal<"pending" | "connected" | "denied" | "unavailable">
  readonly inputs: Signal<MidiDevice[]>
  readonly outputs: Signal<MidiDevice[]>
}

interface MidiDevice {
  id: string
  name: string
}
```

- Constructor calls `navigator.requestMIDIAccess()` immediately.
- On success: sets `status` to `"connected"`, populates `inputs` and `outputs`.
- On denial: sets `status` to `"denied"`, rejects `ready`.
- If Web MIDI is unavailable: sets `status` to `"unavailable"`, rejects `ready`.
- Listens to `MIDIAccess.onstatechange` to update `inputs`/`outputs` and reconnect automatically when a device returns.

**Acceptance criteria:**
- [ ] `midi.status.value` starts as `"pending"`
- [ ] `midi.status.value` updates to `"connected"` on successful access
- [ ] `midi.inputs.value` and `midi.outputs.value` populate after access
- [ ] Device connect/disconnect updates `inputs`/`outputs` signals
- [ ] Disconnected device that reconnects restores status to `"connected"`

**Testing:** `packages/midi/src/midi.test.ts` (mock `navigator.requestMIDIAccess`)

---

### Step 1.4 — Input: CC

**Files:** `packages/midi/src/input.ts`

Implement `MidiInput` class with `cc()` method.

```ts
class MidiInput {
  cc(cc: number): CcSignal
  cc(deviceId: string, cc: number): CcSignal
}

// CcSignal has a fluent .channel() filter
midi.in.cc(74).channel(1)
midi.in.cc("device-id", 74).channel(1)
```

- Parses raw `Uint8Array` MIDI messages. CC messages: status byte `0xB0–0xBF` (channel 1–16).
- Normalizes value: `signal.value = data[2] / 127`.
- Caches signals — `cc(74)` called twice returns the same signal instance.
- Merges all connected inputs when no device ID is specified.
- `.channel(n)` returns a filtered view of the signal — only fires for messages on that channel.

**Acceptance criteria:**
- [ ] `.value` is `0` before any CC message received
- [ ] `.value` updates correctly on CC message (normalized 0–1)
- [ ] `.raw` reflects the raw 0–127 integer
- [ ] Subscribers are called on each CC message
- [ ] Device-scoped `cc("id", 74)` only fires for messages from that device
- [ ] Global `cc(74)` fires for messages from any connected device
- [ ] `.channel(1)` filters to only messages on channel 1
- [ ] Same CC number called twice returns the same signal instance

**Testing:** `packages/midi/src/input.test.ts`

---

### Step 1.5 — Input: Notes

**Files:** `packages/midi/src/input.ts`

Add `note()` method to `MidiInput`.

```ts
class MidiInput {
  notes(): NoteSignal
  notes(deviceId: string): NoteSignal
}

// NoteSignal has a fluent .channel() filter
midi.in.notes().channel(1)
midi.in.notes("device-id").channel(1)
```

- Note-on: status byte `0x90–0x9F`, velocity > 0. Adds `{ note, velocity }` to the held set.
- Note-off: status byte `0x80–0x8F`, or note-on with velocity 0. Removes matching note from the set.
- `.value` is always the current set of held notes.
- Subscribers are called on both note-on and note-off.
- `.channel(n)` returns a filtered view — only fires for messages on that channel.

**Acceptance criteria:**
- [ ] `.value` is an empty `Set` initially
- [ ] Note-on adds to `.value`, note-off removes from `.value`
- [ ] Note-on with velocity 0 is treated as note-off
- [ ] Multiple simultaneous notes are tracked correctly
- [ ] Device-scoped `notes("id")` only fires for that device
- [ ] `.channel(1)` filters to only messages on channel 1
- [ ] Subscribers called on both note-on and note-off

**Testing:** `packages/midi/src/input.test.ts`

---

### Step 1.6 — Output

**Files:** `packages/midi/src/output.ts`

Implement `MidiOutput` class.

```ts
class MidiOutput {
  noteOn(deviceId: string, options: { note: number; velocity: number; channel: number; time?: number }): void
  noteOff(deviceId: string, options: { note: number; channel: number; time?: number }): void
  cc(deviceId: string, options: { cc: number; value: number; channel: number; time?: number }): void
  send(deviceId: string, data: Uint8Array, time?: number): void
}
```

- All methods look up the device from `MIDIOutputMap` by ID and call `MIDIOutput.send()`.
- `time` maps directly to `MIDIOutput.send()`'s timestamp parameter (`performance.now()` milliseconds).
- Logs a console warning if the device ID is not found.

**Acceptance criteria:**
- [ ] `noteOn` sends correct MIDI bytes: `[0x90 | channel, note, velocity]`
- [ ] `noteOff` sends correct MIDI bytes: `[0x80 | channel, note, 0]`
- [ ] `cc` sends correct MIDI bytes: `[0xB0 | channel, cc, value]`
- [ ] `send` passes data through directly
- [ ] Unknown device ID logs a warning and does not throw

**Testing:** `packages/midi/src/output.test.ts`

---

### Step 1.7 — Wire `Midi` class

**Files:** `packages/midi/src/midi.ts`, `packages/midi/src/index.ts`

Expose `midi.in` and `midi.out` on the `Midi` class. Export everything from `src/index.ts`.

```ts
class Midi {
  readonly in: MidiInput
  readonly out: MidiOutput
  readonly ready: Promise<void>
  readonly status: Signal<"pending" | "connected" | "denied" | "unavailable">
  readonly inputs: Signal<MidiDevice[]>
  readonly outputs: Signal<MidiDevice[]>
}
```

**Acceptance criteria:**
- [ ] `midi.in` and `midi.out` are accessible after construction
- [ ] Full public API is exported from package root

---

### Step 1.8 — Demo app

**Files:** `apps/midi-demo/` (new Vite + vanilla TS app, no framework)

A minimal browser app for manual testing of the MIDI package during development. Not a production app.

**Features:**
- Displays `midi.status.value` and updates reactively
- Lists `midi.inputs` and `midi.outputs` with device names and IDs
- Shows last received CC value for CC 1, 7, and 74 (number + normalized)
- Shows currently held notes (note number + velocity)
- Buttons to send a test note-on and note-off to a selected output device
- Button to send a test CC message to a selected output device

**Acceptance criteria:**
- [ ] `pnpm --filter midi-demo dev` starts without errors
- [ ] Status updates correctly when MIDI permission is granted or denied
- [ ] CC signals update in real time when a controller is moved
- [ ] Held notes display updates on note-on and note-off
- [ ] Output buttons send audible MIDI messages to external hardware

---

## Phase 2: Schema Extensions

Add MIDI node types to `@web-audio/schema` so Fluid and AudioEngine can describe and resolve MIDI bindings.

### Step 2.1 — MIDI parameter source schema

**Files:** `packages/schema/src/index.ts`

```ts
interface MidiCcSchema {
  type: "midi-cc"
  cc: number
  channel?: number
}
```

Extend `ParameterSchema` union to include `MidiCcSchema`.

**Acceptance criteria:**
- [ ] `MidiCcSchema` exported from `@web-audio/schema`
- [ ] `ParameterSchema` union includes `MidiCcSchema`
- [ ] Package type-checks cleanly

---

### Step 2.2 — MIDI instrument note source schema

**Files:** `packages/schema/src/index.ts`

```ts
interface MidiInSchema {
  type: "midi-in"
  channel?: number
  deviceId?: string
}
```

Extend the instrument `noteSource` field to accept `MidiInSchema`.

**Acceptance criteria:**
- [ ] `MidiInSchema` exported from `@web-audio/schema`
- [ ] Instrument schema accepts `MidiInSchema` as a note source
- [ ] Package type-checks cleanly

---

### Step 2.3 — MIDI output schema

**Files:** `packages/schema/src/index.ts`

```ts
interface MidiOutSchema {
  type: "midi-out"
  deviceId?: string  // omitted = AudioEngine uses first available output
  channel: number
}
```

Add `noteOutput` field to instrument schema accepting `MidiOutSchema`.

**Acceptance criteria:**
- [ ] `MidiOutSchema` exported from `@web-audio/schema`
- [ ] Instrument schema accepts `MidiOutSchema` as a note output
- [ ] Package type-checks cleanly

---

## Phase 3: Fluid Integration

Extend Drome to express MIDI bindings as schema nodes. Fluid never imports `@web-audio/midi` — it only produces schema descriptions.

### Step 3.1 — `d.midi.cc()` parameter source

**Files:** `packages/fluid/src/drome.ts`, `packages/fluid/src/midi.ts`

```ts
// Usage
d.synth().filter(d.lpf(d.midi.cc(74)))
d.synth().filter(d.lpf(d.midi.cc(74).channel(1)))
d.synth().filter(d.lpf(d.midi.cc("device-id", 74).channel(1)))

// Produces schema
{ type: "midi-cc", cc: 74, channel: 1 }
```

`d.midi` is a namespace on `Drome`. `d.midi.cc()` returns a fluent builder that serializes to `MidiCcSchema`. Accepted anywhere a `ParameterSchema` is accepted.

**Acceptance criteria:**
- [ ] `d.midi.cc(74)` produces `{ type: "midi-cc", cc: 74 }` in the schema
- [ ] `.channel(1)` adds `channel` to the schema node
- [ ] `d.midi.cc("device-id", 74)` adds `deviceId` to the schema node
- [ ] Result is accepted by `.filter()`, `.gain()`, `.detune()`, and other parameter slots
- [ ] No import of `@web-audio/midi` anywhere in `@web-audio/fluid`

---

### Step 3.2 — MIDI-driven synth: `d.midi.notes()` as a note source

**Files:** `packages/fluid/src/synthesizer.ts`, `packages/fluid/src/midi.ts`

```ts
// MIDI notes passed to .notes() — same entry point as pattern-based notes
d.synth("sawtooth")
  .notes(d.midi.notes().channel(1))
  .env(d.env().adsr(0.01, 0.1, 0.8, 0.3))

// Scoped to a specific device
d.synth("sawtooth")
  .notes(d.midi.notes("device-id").channel(1))
```

- `d.midi.notes()` returns a fluent builder that serializes to `MidiInSchema`.
- `.notes()` already exists on `Synthesizer` — it now accepts either a pattern or a `MidiInSchema` value. No new method needed; no special mutual-exclusion error case.
- All other Fluid instrument methods (`.wave()` via the constructor arg, `.env()`, `.fx()`, etc.) work identically.

**Acceptance criteria:**
- [ ] `getSchema()` produces `noteSource: { type: "midi-in" }` when `d.midi.notes()` is passed to `.notes()`
- [ ] `.channel(1)` adds `channel` to the schema node
- [ ] `d.midi.notes("device-id")` adds `deviceId` to the schema node
- [ ] `.env()`, `.fx()`, `.gain()` work normally on MIDI-driven synths
- [ ] No import of `@web-audio/midi` anywhere in `@web-audio/fluid`

---

### Step 3.3 — MIDI output synth: `.out(d.midi.out())`

**Files:** `packages/fluid/src/synthesizer.ts`, `packages/fluid/src/midi.ts`

```ts
// First available output device (default)
d.synth()
  .out(d.midi.out().channel(1))
  .notes([0, 3, 5])
  .euclid(3, 8)
  .gain(0.8)

// Specific device
d.synth()
  .out(d.midi.out("device-id").channel(1))
  .notes([0, 3, 5])
```

- `d.midi.out()` returns a fluent builder that serializes to `MidiOutSchema`.
- `.out()` is a new method on `Synthesizer` that sets the note output target. Mutually exclusive with producing Web Audio nodes.
- When no device ID is provided, `MidiOutSchema.deviceId` is omitted; AudioEngine resolves to the first available MIDI output at runtime.
- Full pattern system (`.notes()`, `.euclid()`, `.fast()`, `.slow()`, `.reverse()`, etc.) works identically.
- Gain value is preserved in the schema for velocity mapping.

**Acceptance criteria:**
- [ ] `getSchema()` produces correct `noteOutput` for a MIDI output synth
- [ ] `d.midi.out().channel(1)` produces `{ type: "midi-out", channel: 1 }` (no deviceId)
- [ ] `d.midi.out("id").channel(1)` produces `{ type: "midi-out", deviceId: "id", channel: 1 }`
- [ ] Pattern methods work on MIDI output synths
- [ ] Gain value appears in schema for downstream velocity conversion
- [ ] No import of `@web-audio/midi` anywhere in `@web-audio/fluid`

---

## Phase 4: AudioEngine Integration

AudioEngine resolves MIDI schema nodes using a connected `Midi` instance.

### Step 4.1 — `engine.connectMidi()`

**Files:** `packages/audio-engine/src/engine.ts`

```ts
engine.connectMidi(midi: Midi): void
```

- Stores the `Midi` instance for use when processing schemas.
- Logs a console warning if called after a schema with MIDI nodes has already been processed.
- No-op if called with the same instance twice.

**Acceptance criteria:**
- [ ] `connectMidi()` can be called before or after `engine.update()`
- [ ] Calling without MIDI nodes in the schema has no effect
- [ ] Warning logged if MIDI nodes are in the current schema but no instance is connected

---

### Step 4.2 — Resolve `midi-cc` schema nodes

**Files:** `packages/audio-engine/src/engine.ts`, relevant scheduler files

When AudioEngine processes an instrument schema and encounters a `{ type: "midi-cc" }` parameter node:
- Subscribes to `midi.in.cc(cc, { channel })`.
- On each value, updates the corresponding `AudioParam` in real time.
- Unsubscribes when the instrument is torn down or the schema is updated.

**Acceptance criteria:**
- [ ] Moving a MIDI controller updates the target audio parameter in real time
- [ ] Subscription is cleaned up on schema update or engine stop
- [ ] Console warning if schema has `midi-cc` node but no Midi instance

---

### Step 4.3 — Resolve `midi-in` schema nodes (MIDI-driven synths)

**Files:** `packages/audio-engine/src/engine.ts`, synth scheduler

When AudioEngine processes an instrument with `noteSource: { type: "midi-in" }`:
- Subscribes to `midi.in.note({ channel, deviceId })`.
- On note-on: starts the synth's attack → decay → sustain hold. Velocity multiplied against envelope peak gain.
- On note-off: triggers the release phase for that note; schedules node cleanup after release completes.
- Tracks polyphony: each held note gets its own voice.

**Acceptance criteria:**
- [ ] Note-on triggers synth audio
- [ ] Note-off triggers release and cleans up nodes
- [ ] Velocity scales gain correctly (`velocity / 127 * envelopePeakGain`)
- [ ] Multiple simultaneous notes produce correct polyphonic voices
- [ ] Subscription is cleaned up on schema update or engine stop

---

### Step 4.4 — Resolve `midi-out` schema nodes (MIDI output synths)

**Files:** `packages/audio-engine/src/engine.ts`, pattern scheduler

When AudioEngine processes an instrument with `noteOutput: { type: "midi-out" }`:
- Uses the existing pattern scheduling pipeline to compute note events and timestamps.
- Sends `midi.out.noteOn()` at the scheduled note start time.
- Sends `midi.out.noteOff()` at end of sustain (attack + decay + sustain duration), before release.
- Converts gain to velocity: `Math.round(gain * 127)`.
- No Web Audio nodes are created for MIDI output synths.

**Acceptance criteria:**
- [ ] Pattern notes arrive at external hardware at correct clock-synchronized times
- [ ] Note-off is sent before the release phase would begin
- [ ] Velocity matches `Math.round(gain * 127)`
- [ ] No audio nodes created for MIDI output instruments
- [ ] Pattern methods (euclid, fast, slow, reverse, etc.) work correctly

---

## Future: Quantization

Not implemented in this plan. MIDI-driven synths fire free-form only. This section documents the intended API for when quantization is added to AudioEngine.

### Fluid API

```ts
d.synth().notes(d.midi.notes().channel(1).quantize(16))
d.synth().notes(d.midi.notes().channel(1).quantize(16, "start"))
```

```ts
quantize(steps: 4 | 8 | 16 | 32, points: "both" | "start" = "both")
```

- `steps` — the subdivision to snap to (4 = quarter note, 8 = eighth, 16 = sixteenth, 32 = thirty-second)
- `points: "both"` — snap both note-on and note-off to the grid
- `points: "start"` — snap note-on only; note-off fires free-form (more natural feel for live performance)

### Schema extension

`MidiInSchema` grows a `quantize` field:

```ts
interface MidiInSchema {
  type: "midi-in"
  channel?: number
  deviceId?: string
  quantize?: { steps: 4 | 8 | 16 | 32; points: "both" | "start" }
}
```

### AudioEngine requirements

When `quantize` is present on a `midi-in` schema node, AudioEngine must:
1. On note-on: compute the next subdivision boundary using `clock.nextBeatStartTime` and `clock.beatDuration / (steps / 4)`
2. Schedule the note to start at that future `AudioContext` time rather than immediately
3. If `points: "both"`: apply the same snapping logic to note-off
4. If `points: "start"`: fire note-off immediately when received

AudioEngine already holds a reference to `AudioClock` — no new dependencies required.
