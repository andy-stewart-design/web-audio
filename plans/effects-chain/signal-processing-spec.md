# Signal Processing Specification

## Scope

This specification defines the signal-routing model for the SOW.

This SOW includes:

- the always-present `main` bus;
- explicitly declared named buses;
- one primary route per instrument;
- post-mute instrument sends;
- persistent bus processing with the existing gain and filter effects;
- event-triggered bus ducking modeled after Strudel;
- graph validation and generation-based graph retirement.

This SOW does not add reverb, delay, compressor, limiter, pan, phaser, saturation, or bitcrush. Those effects will be separate work built on this topology.

## Public API

### Buses

```ts
d.bus("drums").gain(0.8).fx(d.lpf(8_000));
d.bus("main").gain(0.9);
```

`d.bus(name)` is a get-or-create accessor. Repeated calls return the same builder within a `Drome` instance.

- Bus names are trimmed at the API boundary.
- Names that are empty after trimming are rejected.
- Names are case-sensitive and may contain internal whitespace.
- `"main"` is reserved for the always-present main bus.
- Calling `d.bus("main")` configures the main bus; it does not declare it.
- Scalar controls are last-write-wins.
- `.fx()` appends effects in call order.
- Bus output gain defaults to `1` and accepts any finite value greater than or equal to zero.

Every named bus outputs to `main`. Main is the only generated bus that feeds the engine's persistent final output stage.

### Primary routes

```ts
d.sample("bd").route("drums").push();
```

- Every instrument has exactly one primary route.
- The default route is `"main"`.
- Repeated `.route()` calls are last-write-wins.
- Named targets must resolve to declared buses in the completed graph.
- Forward references are allowed.
- Routing to a named bus replaces the default direct route to main.

### Sends

```ts
d.sample("sd").send("verb", 0.4).push();
d.synth().send(["verb", "delay"], 0.2).push();
```

```ts
send(target: string | string[], amount: number): this;
```

- Send amount is static in v1.
- Amount must be finite and in `[0, 1]`.
- One persistent gain node exists per instrument/send target.
- Calls targeting the same normalized bus are last-write-wins.
- Arrays apply the same amount to every target.
- Send targets must be declared named buses.
- Sending to `main` is rejected.
- Sends branch from instrument output after internal balancing gain and mute, but before primary-bus processing.
- Per-note and pre-fader sends remain deferred.

### Ducking

```ts
d.sample("bd").duck("music").push();
d.sample("bd").duck("music", 1, 0, 1).push();
d.sample("bd").duck(["music", "pads"], 0.75, 0, 0.5).push();
d.sample("bd").duck("music", 1).duck("pads", 0.5).push();
```

```ts
duck(
  target: string | string[],
  depth?: number,
  onset?: number,
  recovery?: number,
): this;
```

Defaults:

```ts
depth = 1;
onset = 0;
recovery = 1;
```

`duck` is event-triggered gain automation, not an audio-reactive sidechain compressor.

- `depth`, `onset`, and `recovery` are static numbers in v1.
- Arrays apply one configuration to every target.
- Multiple chained calls may use different configurations.
- Calls targeting the same normalized bus are last-write-wins.
- Targets must be declared named buses.
- Ducking `main` is rejected.
- An instrument may duck a bus it routes or sends to; the trigger is then included in the attenuated bus mix.
- Simultaneous polyphonic voices at one instrument onset produce one duck trigger.
- Distinct event offsets trigger independently.
- Every resolved, unmasked note event triggers ducking even if the instrument is muted or its audio source cannot be created.
- Muting still suppresses routed and sent audio.
- Sampler duck timing uses the scheduled pattern-event duration, not decoded sample length, playback duration, clipping, or source availability.

Timing values are proportions of the triggering event duration:

```ts
onsetDuration = onset * eventDuration;
recoveryDuration = recovery * eventDuration;
```

`onset` is the ramp-down duration. Recovery begins after the target level is reached. Both ramps apply the engine's safe minimum duration.

Depth follows Strudel's perceptual curve:

```ts
targetGain = clamp(1 - Math.sqrt(depth), 0.01, 1);
```

Parameter normalization is performance-oriented:

- reject non-finite values;
- clamp depth to `[0, 1]`;
- clamp onset and recovery to values greater than or equal to zero;
- treat a clamped depth of zero as a true no-op that does not alter an active duck.

Overlapping triggers do not stack. A retrigger:

1. holds the target bus's current duck gain;
2. cancels the remainder of the existing automation;
3. ramps toward the new target without first raising the gain;
4. restarts recovery from the new trigger.

Because bars are scheduled ahead, gain automation that depends on the value at retrigger time must not naïvely read `AudioParam.value` while scheduling the bar. During implementation, evaluate native `cancelAndHoldAtTime()` with a compatibility fallback against a clock callback installed shortly before the trigger, as Strudel does. The chosen mechanism must be cancellable on transport stop and graph destruction.

## Canonical schema

This is an intentional breaking schema change. The new fields are required; repository consumers and fixtures migrate together.

```ts
interface BusSchema {
  gain: number;
  effects: EffectSchema[];
}

interface DuckSchema {
  depth: number;
  onset: number;
  recovery: number;
}

interface InstrumentSchema {
  // Existing fields...
  route: string;
  sends: Record<string, number>;
  ducks: Record<string, DuckSchema>;
}

interface DromeSchema {
  bpm?: number;
  instruments: (SynthesizerSchema | SamplerSchema)[];
  buses: Record<string, BusSchema>;
  banks: Record<string, BankSchema>;
}
```

Fluid always emits a complete canonical schema containing at least:

```ts
buses: {
  main: {
    gain: 1,
    effects: [],
  },
}
```

Builder arrays and repeated calls are normalized into one send or duck entry per target. The schema does not preserve irrelevant builder call structure.

## Validation

Add shared graph validation to `@web-audio/schema` and enforce it in both Fluid and AudioEngine.

Fluid validates the completed graph in `getSchema()`, allowing bus forward references. AudioEngine validates before accepting or committing a direct schema. An invalid update must leave the active graph generation undisturbed.

Validate these invariants:

- a canonical `main` bus exists;
- every bus key is a valid canonical name;
- bus gain is finite and non-negative;
- every instrument has one route;
- every named route resolves;
- every send target resolves and is not `main`;
- every send amount is finite and in `[0, 1]`;
- every duck target resolves and is not `main`;
- duck values are finite and canonicalized into their supported ranges;
- effect schemas are supported by their host.

Fluid trims names before producing the canonical schema. Direct schemas supplied to AudioEngine should already be canonical; shared validation should not silently mutate them.

## Runtime graph

### Graph generation

Each committed schema creates a complete graph generation:

```text
generation
  ├─ instruments
  ├─ named buses
  └─ generated main bus
       ↓
persistent engine output/analyser
       ↓
AudioContext.destination
```

Do not reconcile bus nodes by name across commits. On replacement:

1. build the new generation;
2. retire all instruments in the old generation;
3. permit their already-scheduled voices and releases to finish through the old buses;
4. destroy the old bus graph after every old instrument reports `finished`.

The engine's final output and analyser remain persistent. With only gain and filter bus effects, no bus has an independent audio tail, so waiting for instruments is sufficient in this SOW.

Encapsulate generation ownership rather than adding unrelated bus state directly to `AudioEngine`. A generation should own its instruments, buses, deferred duck callbacks, MIDI connections, scheduling, retirement, and destruction.

### Bus graph

Each named bus uses:

```text
input
  → serial effect chain
  → dedicated duck gain
  → output gain
  → generated main input
```

Main uses:

```text
main input
  → serial effect chain
  → dedicated duck gain (kept at unity in v1)
  → output gain
  → persistent engine output
```

The dedicated duck gain prevents automation conflicts with user-controlled bus output gain. Ducking is post-processing, so it attenuates the complete processed bus output.

Effects have the same insert semantics on instruments and buses. Drome does not infer an auxiliary-return role or force effects to 100% wet. Future reverb sends must explicitly configure a wet-only reverb effect.

### Instrument graph

Retain per-voice processing and the existing internal balancing stage:

```text
voices
  → per-voice envelopes and effects
  → instrument mix
  → internal balancing/headroom gain
  → mute gain
  ├─→ primary bus input
  ├─→ send gain → named bus input
  └─→ send gain → named bus input
```

Do not add a user-facing instrument output fader in this SOW. Existing `.gain()` remains a per-voice envelope API.

## Bus effect automation

Bus processing reuses the existing gain and filter effect schemas. Static values, parameter cycles, LFOs, MIDI CC controls, and envelopes are allowed.

- Parameter cycles resolve against the transport/bar grid.
- LFOs are persistent for the graph generation.
- MIDI bindings are owned and cleaned up by the graph generation.
- Envelopes use one bar as their duration basis.

A bus envelope fits its complete shape inside one bar:

```text
bar start → attack → decay → sustain → release → next bar boundary
```

Attack, decay, and release are proportions of bar duration. Sustain occupies the remaining time. If their sum exceeds one, normalize timing using Drome's bounded-envelope rules. Every bar retriggers the envelope.

This behavior must be tested by ear during implementation. It is a proposed persistent-parameter model, not a commitment that all future bus automation must use it.

## Transport and lifecycle behavior

On transport stop:

- cancel future voices as today;
- cancel deferred future duck callbacks;
- cancel future duck automation and restore duck gains to unity with a safe minimum ramp;
- cancel future bus-envelope automation and return affected parameters to their configured minima with a safe minimum ramp;
- keep the active graph generation available for playback to resume.

On graph destruction, cancel all callbacks, MIDI subscriptions, LFO connections, scheduled automation owned by the generation, and every audio-node connection.

## Implementation sequence

### 1. Schema and shared validation

Update `packages/schema/src/index.ts` with `BusSchema`, `DuckSchema`, required instrument routing fields, and required `DromeSchema.buses`. Add shared graph validation and focused tests. Migrate all schema fixtures as a breaking change.

### 2. Fluid builders

Add a bus builder under `packages/fluid/src`, store buses in a normalized name-keyed map, and add `Drome.bus()`.

Extend the base instrument builder with:

- `.route(name)`;
- `.send(nameOrNames, amount)`;
- `.duck(nameOrNames, depth?, onset?, recovery?)`.

Emit normalized routing records and the default main bus. Validate only after the complete schema has been assembled so forward references work.

### 3. Runtime bus abstraction

Add an AudioEngine bus abstraction that owns input, serial effects, duck gain, output gain, bar automation, MIDI/LFO state, stop/reset behavior, and destruction. Initially support existing gain and filter effects only.

Extract shared effect-node and parameter-automation behavior from the current instrument implementation where practical; do not duplicate divergent effect construction logic between voices and buses.

### 4. Graph generation abstraction

Move active instruments and generated buses behind a graph-generation owner. Build bus graphs before instruments so route/send destinations are available. Route the generated main bus to the existing persistent engine output.

Retire and destroy complete generations as specified, preserving existing sample-cache behavior across generations.

### 5. Routes and sends

Pass the selected primary destination and normalized send destinations into runtime instruments. Connect each instrument's post-mute output exactly once to its route and once through each send gain to each send target. Add graph-connection and lifecycle tests.

### 6. Duck scheduling

Emit deduplicated duck events from resolved instrument event onsets before audio-source availability checks. Send events to the owning graph generation/bus registry rather than coupling instruments directly to bus internals.

Implement retrigger-safe gain automation, minimum ramps, depth mapping, event-duration scaling, zero-depth no-op behavior, stop cancellation, and callback cleanup. Test simultaneous polyphony, overlapping triggers, muted triggers, unavailable samples, and graph replacement.

### 7. Bus automation

Schedule bus parameter cycles and bounded bar envelopes alongside each bar. Add stop/reset and generation cleanup tests. Conduct an audible browser test of repeated bar-envelope boundaries before treating the proposed envelope behavior as settled.

### 8. Documentation and verification

Update package documentation with routing examples and run:

```bash
pnpm --filter @web-audio/schema check
pnpm --filter @web-audio/schema lint
pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/fluid build
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/audio-engine build
```

The schema package currently has no test script. Add one when introducing shared runtime validation tests rather than leaving that validation untested.

## Required test coverage

### Schema validation

- canonical main bus requirement;
- valid and invalid route/send/duck references;
- rejection of main sends and main duck targets;
- finite/range checks;
- invalid updates do not replace the active engine generation.

### Fluid

- implicit main bus emission;
- trimmed and empty bus names;
- get-or-create bus behavior;
- forward references;
- last-write-wins scalar, route, send, and duck behavior;
- array and chained send/duck forms;
- complete normalized schema output.

### AudioEngine graph

- only persistent engine output connects to destination;
- all generated buses feed generated main exactly once;
- named primary routes do not retain an implicit main connection;
- sends branch post-mute and pre-primary-bus processing;
- bus effects precede duck and output gain;
- old and new generations remain isolated during retirement;
- old buses disconnect after all old instruments finish.

### Ducking

- one trigger per simultaneous instrument onset;
- separate triggers for offset events;
- muted instruments trigger while their sends/routes remain silent;
- missing sampler sources still trigger;
- sampler timing uses pattern-event duration;
- square-root depth mapping and clamping;
- zero depth is a no-op;
- overlapping triggers hold/cancel/recover without stacking;
- self-inclusive ducking works;
- stop and destruction cancel callbacks and reset automation.

### Bus automation

- static, parameter, LFO, MIDI, and envelope parameter sources;
- envelope timing uses current bar duration;
- bounded timing normalization;
- repeated-bar retrigger behavior;
- stop resets envelopes to minimum;
- generation destruction cleans up automation resources.

## Explicit follow-ups

- Patterned duck depth, onset, and recovery using Drome `Parameter` resolution.
- Per-note or otherwise patterned send amounts, after choosing semantics for overlapping voices.
- Pre-fader/pre-mute sends and per-voice sends.
- Named bus routing, bus-to-bus sends, and cycle detection.
- Audio-reactive sidechain compression as a distinct effect from event-triggered ducking.
- User-facing persistent instrument output level control.
- Optional convenience APIs for auxiliary-return buses without changing core bus semantics.
- Re-evaluate bounded one-bar bus envelopes after practical listening tests.
- Add a formal bus-effect tail contract before implementing reverb or feedback delay.
