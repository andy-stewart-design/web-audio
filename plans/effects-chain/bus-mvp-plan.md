# Bus and Routing MVP Plan

## Goal

Deliver a useful bus/routing system through small vertical slices without first redesigning parameter management, engine commits, or graph retirement.

The MVP graph is:

```text
voice effects → instrument balancing gain → mute ┬→ primary route
                                                  ├→ send gain → named bus
                                                  └→ send gain → named bus

named bus input → static gain/filter effects → bus gain → persistent main gain
main-routed instruments ────────────────────────────────────┘

persistent main gain → destination
                     → analyser
```

`main` is the engine's existing persistent master gain. It is not a generation-owned runtime bus.

## Principles

- Each slice must be audible, independently testable, and safe to merge.
- Prefer additive schema fields and runtime defaults over a repository-wide breaking migration.
- Do not refactor working instrument parameter, LFO, MIDI, voice, or sampler code unless a slice directly requires it.
- Do not add infrastructure for ducking, reverb tails, or hypothetical processors.
- If a slice starts requiring broad lifecycle or automation changes, stop and reduce its scope.
- Keep implementation commits small enough to review. Treat roughly 300 changed production LOC in one slice as a reason to reassess, not a target.

## MVP decisions

### Main

- `main` always exists conceptually.
- `d.bus("main").gain(value)` controls the persistent engine master gain.
- Main gain is engine-global and affects active and retiring voices.
- Main does not support effects in the MVP; `d.bus("main").fx(...)` fails clearly.
- Main is the only path connected directly to `AudioContext.destination`.

### Named buses

- Named buses have an input, serial static effect chain, and output gain.
- Every named bus forwards directly to persistent main.
- Named buses cannot route or send to other named buses.
- One named bus may receive both primary routes and sends.

### Routes

- Every instrument defaults to `main` when `route` is absent.
- `.route(name)` replaces the primary destination; it does not retain an implicit dry path to main.
- Named targets must be declared.

### Sends

- Sends branch after instrument balancing and mute.
- Each send owns one gain node.
- Sends target declared named buses only; sending to main is rejected.
- Repeated sends to one target are last-write-wins.
- Send amounts are finite static numbers in `[0, 1]`.

### Bus effects

- Reuse existing gain and filter effect builders and schema variants.
- In the MVP, every bus effect parameter must serialize as one constant static value.
- Random, multi-step/cycling static patterns, envelopes, LFOs, and MIDI CC are rejected on buses.
- Instrument effects retain all existing behavior unchanged.
- A small `resolveConstantAudioParam()`-style helper may validate and extract bus values; do not extract a general parameter manager.

### Replacement and retirement

- Persistent main survives every update.
- One lightweight runtime graph owns the current instruments and named buses.
- On replacement, old instruments retire through their original named buses.
- Once all old instruments' existing `finished` promises resolve, destroy that graph's instruments and named buses immediately.
- Filter resonance after the last voice may be truncated. This is an accepted MVP limitation.
- No settling timer, retirement gain, fade, custom audio-time scheduler, or effect-tail contract.

### Compatibility

Add graph fields as optional schema fields for this MVP:

```ts
interface DromeSchema {
  buses?: Record<string, BusSchema>;
}

interface InstrumentSchema {
  route?: string;
  sends?: Record<string, number>;
}
```

Runtime defaults preserve every existing direct schema:

```ts
buses ?? { main: { gain: 1, effects: [] } };
route ?? "main";
sends ?? {};
```

Fluid should emit normalized graph fields once its builders are used, but existing manually authored schemas and fixtures do not require a mass migration.

## Explicitly deferred

- Effects on main
- Ducking
- Bus envelopes, random values, LFOs, and MIDI CC
- Patterned send amounts
- Bus-to-bus routing and sends
- Pre-fader, pre-mute, and per-voice sends
- Wet/dry effect conventions
- Reverb, delay, feedback, and effect tails
- Tail-aware retirement and maximum-tail policies
- Transactional graph construction and exhaustive allocation ledgers
- Atomic BPM/graph installation
- Defensive cloning/full runtime decoding of direct schemas
- General hard-stop de-clicking

---

## Slice 0 — Establish regression guardrails

**Purpose:** Protect current playback behavior before routing changes.

**Files:** focused AudioEngine instrument/engine tests only

Add tests proving:

- stop cancels and disconnects notes whose start time is in the future;
- stop does not disconnect an LFO parameter edge from a currently audible voice;
- active LFO modulation remains connected until the current main lifecycle already removes it;
- existing direct-to-master routing remains unchanged.

Requirements:

- Do not refactor MIDI/LFO cleanup as part of the test.
- Do not broaden `midiBindings` into a general cleanup list; renaming or redesigning cleanup categories belongs in separate future work.
- Do not attempt general de-clicking in this slice.

**Acceptance criteria:**

- [x] Regression tests pass on the MVP baseline without changing production behavior.
- [x] Tests would fail against the prior branch behavior that cleaned all voice resources before checking `startTime`.

---

## Slice 1 — Persistent main gain

**Purpose:** Deliver a configurable master level without changing instrument routing.

### Schema and Fluid

Add an optional bus record and a small get-or-create `Bus` builder:

```ts
d.bus("main").gain(0.8);
```

For this slice:

- only `main` is accepted;
- gain defaults to `1`;
- gain must be finite and `>= 0`;
- repeated access returns the same builder;
- `.fx(...)` on main fails clearly;
- bus names are trimmed and whitespace-only names fail.

Fluid may emit:

```ts
buses: {
  main: { gain: 0.8, effects: [] },
}
```

Existing schemas without `buses` remain valid.

### Runtime

At commit, update the existing `_master.gain` from `schema.buses?.main?.gain ?? 1` before new instruments are connected.

Do not replace `_master`; it remains connected to destination and analyser.

**Acceptance criteria:**

- [x] Existing sketches with no bus schema retain unity main gain.
- [x] Main gain changes update the persistent master node.
- [x] Main effects are rejected rather than ignored.
- [x] No instrument, retirement, MIDI, LFO, or sampler implementation changes.

---

## Slice 2 — Named bus gain and primary routing

**Purpose:** Route instruments through named group buses without effects or sends.

### Schema and Fluid

- Permit named bus declarations with output gain.
- Add optional instrument `route` and `.route(name)`.
- Route defaults to main.
- Normalize names consistently.
- Validate the completed Fluid graph in `getSchema()` so forward declarations work.
- Direct engine schemas receive the same small graph validation before construction.

### Runtime Bus

Add a minimal runtime bus:

```text
input GainNode → output GainNode → persistent main
```

It owns only those two nodes and has idempotent `destroy()`.

### Lightweight runtime graph

Introduce a deliberately small owner, for example:

```ts
interface RuntimeGraph {
  instruments: (Synthesizer | Sampler)[];
  buses: Map<string, RuntimeBus>;
}
```

Responsibilities:

- build named buses first;
- construct instruments with either persistent main or a named bus input as destination;
- schedule active instruments;
- connect/disconnect MIDI on active instruments exactly as today;
- retire old instruments;
- keep old named buses alive until all old instruments finish;
- destroy old buses immediately afterward;
- stop and destroy active and retiring graphs.

This is an ownership grouping, not a new lifecycle framework. Use existing instrument `finished` promises.

Construction failure handling is limited to a normal `try/catch` that destroys successfully returned new buses/instruments and leaves the prior graph active. Do not redesign every constructor around allocation failure.

**Acceptance criteria:**

- [x] Default instruments still connect directly to persistent main.
- [x] A named route has exactly one primary path and no direct-main duplicate.
- [x] Multiple instruments sum into one named bus input.
- [x] Named bus gain affects every routed source.
- [x] Old voices retain their original named bus until they finish.
- [x] No scheduler, retirement fade, settling delay, or generated main node exists.
- [x] Sample cache, fallback buffer, prepare, MIDI, analyser, and stop behavior remain covered.

---

## Slice 3 — Static named-bus effects

**Purpose:** Process a named bus with existing gain/filter effects without persistent automation infrastructure.

Add `.fx(...)` to named bus builders and build effects once during runtime bus construction:

```text
input → effect → effect → output gain → persistent main
```

Use a small bus-specific constructor that:

- preserves serial order;
- extracts one constant value for each effect parameter;
- initializes every `AudioParam.value` before connecting the bus;
- rejects non-constant parameter schemas with a useful bus/effect/field path;
- disconnects all owned effect nodes on destroy.

Do not move `_applyParamSchema`, `_resolve`, LFO maps, MIDI bindings, or envelope scheduling out of `Instrument`.

**Acceptance criteria:**

- [x] Empty chains have one path and no dry duplication.
- [x] Gain and every filter parameter initialize from their constant value.
- [x] Multiple effects preserve order.
- [x] Dynamic bus parameters fail before replacing the active graph.
- [x] Instrument parameter and modulation tests remain unchanged.

---

## Slice 4 — Post-mute sends

**Purpose:** Add auxiliary routing without changing voice processing.

### Schema and Fluid

Add optional `sends` and:

```ts
send(target: string | string[], amount: number): this;
```

Requirements:

- amount is finite and in `[0, 1]`;
- arrays apply one amount to all targets;
- duplicate targets are last-write-wins;
- targets must be declared named buses;
- main sends fail;
- forward declarations work through completed-graph validation.

### Runtime instrument routing

Replace the single destination option with a narrow routing descriptor:

```ts
interface InstrumentRouting {
  primary: AudioNode;
  sends: { destination: AudioNode; amount: number }[];
}
```

Build only the persistent instrument output branches:

```text
balancing → mute → primary
                 → send gain → named bus
                 → send gain → named bus
```

Instrument owns its send gain nodes. Voice creation and per-voice effect construction remain untouched.

**Acceptance criteria:**

- [x] One primary connection exists per instrument.
- [x] Each send has an independent gain and destination.
- [x] Sends branch after balancing and mute.
- [x] Primary named-bus effects do not process the instrument's sends.
- [x] Muting suppresses primary and send audio.
- [x] Destroy disconnects only that instrument's send nodes.
- [x] Old graph sends remain connected only to old graph buses.

---

## Slice 5 — Integration, documentation, and MVP closeout

Cover the reference graph:

```ts
d.bus("main").gain(0.9);
d.bus("drums").gain(0.8).fx(d.lpf(8_000));
d.bus("verb").gain(0.5);

d.sample("bd").route("drums").send("verb", 0.1).push();
d.sample("sd").route("drums").send("verb", 0.4).push();
d.synth().send("verb", 0.2).push();
```

Document that `verb` is only a name until a reverb processor exists.

**Acceptance criteria:**

- [ ] Connection tests prove there is no dry-signal duplication.
- [ ] Main is the only node connected directly to destination.
- [ ] Main gain affects active and retiring voices globally.
- [ ] Group processing does not process pre-group sends.
- [ ] Stop reaches active and retiring instruments without disconnecting active voice modulation early.
- [ ] Old buses disconnect after their instruments finish.
- [ ] Schema, Fluid, AudioEngine, and workspace checks pass.
- [ ] A focused manual topology review is completed without starting a development server unless permission is granted.

## Required verification after each slice

Run checks only for changed packages during implementation:

```sh
pnpm --filter <changed-package> test:ci
pnpm --filter <changed-package> check
pnpm --filter <changed-package> lint
```

Run package builds where available. At MVP closeout, run workspace check, lint, and test commands. Format changed files before final verification.

## Reassessment gates

Pause before implementation continues if any slice requires:

- extracting general parameter management from instruments;
- changing LFO effective-value semantics;
- introducing clock-time polling or retirement timers;
- making main generation-owned;
- changing sampler voice semantics;
- broad schema fixture migration despite optional compatibility fields;
- more than one new lifecycle abstraction.

Those are signals to split the slice or explicitly expand the MVP rather than allowing scope to grow implicitly.
