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
- Simultaneous polyphonic voices at one instrument onset produce one duck trigger. Their shared event duration is the maximum duration in the onset group.
- Distinct event offsets trigger independently.
- Trigger times are normalized to audio sample frames. Events in the same frame are simultaneous.
- Every resolved, unmasked note event triggers ducking even if the instrument is muted or its audio source cannot be created.
- Muting still suppresses routed and sent audio.
- Sampler duck timing uses the scheduled pattern-event duration, not decoded sample length, playback duration, clipping, or source availability.

Timing values are proportions of the triggering event duration:

```ts
onsetDuration = onset * eventDuration;
recoveryDuration = recovery * eventDuration;
```

`onset` is the ramp-down duration. Recovery begins after the target level is reached. Both ramps apply the engine's safe minimum duration and use exponential curves.

Depth follows Strudel's perceptual curve:

```ts
targetGain = clamp(1 - Math.sqrt(depth), 0.01, 1);
```

Parameter normalization is performance-oriented:

- reject non-finite values;
- clamp depth to `[0, 1]`;
- clamp onset and recovery to values greater than or equal to zero;
- treat a clamped depth of zero as a true no-op that does not alter an active duck.

Duck events are not installed while instruments are scheduled sequentially. For each bar, the graph generation:

1. collects duck events from every instrument;
2. normalizes each trigger to an integer audio sample frame;
3. deduplicates each instrument's simultaneous events using their maximum event duration;
4. resolves proportional onset/recovery values into absolute durations;
5. groups requests by target bus and trigger frame;
6. sorts each target's groups chronologically;
7. merges equal-time requests before submitting one ordered timeline to the target bus.

Equal-time requests merge independently of instrument order:

```ts
targetGain = Math.min(...targetGains);
onsetDuration = Math.min(...onsetDurations);
recoveryDuration = Math.max(...recoveryDurations);
```

Overlapping triggers do not stack. Duck automation maintains a software model of constant and exponential timeline segments. At a retrigger:

```ts
effectiveTarget = Math.min(gainAtTrigger, requestedTarget);
```

A shallower request therefore does not raise gain during onset. The model analytically evaluates the current exponential segment, truncates and reconstructs that segment at the trigger with the same curve, then schedules the new onset and recovery. It must not rely on `AudioParam.value` or `cancelAndHoldAtTime()` to return the held value. Automation installed for one bar must also compose correctly with recovery extending into a later bar.

The software timeline is compacted at least once per scheduled bar. Segments completed before `AudioContext.currentTime` are pruned while retaining an anchor/current segment and all future segments needed for exact evaluation. Timeline storage must remain bounded by active and future automation rather than total generation lifetime.

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

An omitted `bpm` means the sketch uses `DEFAULT_BPM = 120`. AudioEngine resolves this default when committing every schema, so a sketch never inherits BPM from the previously committed sketch. Fluid may leave an unspecified BPM absent from its schema.

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

Fluid validates the completed graph in `getSchema()`, allowing bus forward references. `AudioEngine.update()` is also a runtime JavaScript boundary: validation must defensively check the presence and shape of `buses`, `route`, `sends`, `ducks`, and nested duck values before traversing them. It need not decode unrelated schema fields, but malformed or old graph schemas must produce structured path errors rather than incidental `TypeError`s.

AudioEngine defensively validates graph-field shapes before cloning, then stores a validated `structuredClone()` snapshot rather than the caller's mutable reference. Clone failures and invalid updates must leave the pending and active graph generations undisturbed.

Validate these invariants:

- when present, BPM is finite and greater than zero; omitted BPM resolves to `DEFAULT_BPM = 120` when the schema is committed;
- a canonical `main` bus exists;
- every bus key is a valid canonical name;
- bus gain is finite and non-negative;
- every instrument has one route;
- every named route resolves;
- every send target resolves and is not `main`;
- every send amount is finite and in `[0, 1]`;
- every duck target resolves and is not `main`;
- duck values are finite and canonicalized into their supported ranges;
- effect arrays and discriminators are supported for both instruments and buses.

Fluid trims names before producing the canonical schema. Direct schemas supplied to AudioEngine should already be canonical; shared validation should not silently mutate them.

## Runtime graph

### Graph generation

Each committed schema creates a complete graph generation:

```text
generation
  ├─ instruments
  ├─ named buses
  ├─ generated main bus
  └─ retirement gain
       ↓
persistent engine output/analyser
       ↓
AudioContext.destination
```

Do not reconcile bus nodes by name across commits. Generation construction is transactional. A factory or equivalent constructible resource ledger owns every node, connection, callback, and binding as soon as it is allocated. Partial construction failure cleans the ledger in reverse order and never exposes an incomplete generation.

A commit:

1. uses an accepted schema snapshot, resolves prospective BPM as `schema.bpm ?? DEFAULT_BPM`, and derives bar timing without mutating the clock;
2. constructs the complete new generation;
3. on failure, destroys partial resources, discards the failing pending update, reports the error without throwing through the clock scheduler, and preserves the active generation and BPM;
4. on success, applies BPM, installs the new generation, clears pending, and retires the old generation.

Retirement uses exact constants:

```ts
FILTER_SETTLING_TIME = 0.1;
RETIREMENT_FADE_TIME = 0.01;
```

Both values are seconds on the `AudioContext` timeline. Retirement:

1. permits already-scheduled voices and releases to finish through their original buses;
2. waits until audio time advances by `FILTER_SETTLING_TIME` after every generation instrument reports `finished`;
3. fades a dedicated generation retirement gain to silence over `RETIREMENT_FADE_TIME`;
4. destroys the generation only after audio time reaches the fade endpoint.

A cancellable audio-time-aware scheduler drives completion. If the context is suspended and `currentTime` stops, settling and retirement pause rather than destroying an unrendered tail.

A resonant filter can ring longer than this allowance, so this is bounded truncation rather than guaranteed settling. Reverb and feedback effects require formal per-effect tail contracts.

The engine's final output and analyser remain persistent. Encapsulate generation ownership rather than adding unrelated bus state directly to `AudioEngine`. Instruments continue to own and track their voices; a generation coordinates the lifetime of its instruments, shared buses, duck timelines, MIDI connections, scheduling, retirement, and destruction.

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
  → generation retirement gain
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
- LFOs are persistent for the graph generation. Because their worklet output represents an absolute parameter value, the target `AudioParam` intrinsic value is neutralized before connection.
- Every LFO-to-parameter edge has explicit ownership. Per-voice edges disconnect when the voice ends or is cancelled; persistent bus edges disconnect with their bus/generation.
- MIDI bindings are owned and cleaned up by the graph generation.
- Envelopes use one bar as their duration basis.

A bus envelope fits its complete shape inside one bar:

```text
bar start → attack → decay → sustain → release → next bar boundary
```

Attack, decay, and release are proportions of bar duration. Sustain occupies the remaining time. If their sum exceeds one, normalize timing using Drome's bounded-envelope rules. Every bar retriggers the envelope.

This behavior must be tested by ear during implementation. It is a proposed persistent-parameter model, not a commitment that all future bus automation must use it.

## Transport and lifecycle behavior

On transport stop, apply the following behavior to the active generation and every retiring generation:

- cancel future voices;
- cancel future duck events and automation, then restore duck gains to unity with a safe minimum ramp;
- cancel future bus-envelope automation and return affected parameters to their configured minima with a safe minimum ramp;
- keep the active graph generation available for playback to resume.

Every clock-driven AudioEngine callback has an error boundary, not only `prebar`. A bar-scheduling failure discards the bar-local duck collector, reports the error, rolls back newly scheduled resources where possible through a bar-scheduling ledger, and returns normally so the clock scheduler continues. No partial duck timeline is submitted.

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

### 3. Runtime parameter and bus abstraction

Extract shared effect-node and parameter-automation behavior from the current instrument implementation, fixing LFO intrinsic-value handling and per-voice LFO connection cleanup rather than preserving the existing defects.

Add a complete AudioEngine bus abstraction that owns input, serial effects, duck gain, output gain, all accepted parameter automation, MIDI/LFO state, stop/reset behavior, and destruction. Do not permit an intermediate state where emitted bus effects use native defaults or only some parameter sources work.

### 4. Transactional graph generation abstraction

Move active instruments and generated buses behind a graph-generation owner created through a failure-safe resource ledger. Build complete bus graphs before instruments so route/send destinations are available. Route generated main through a dedicated retirement gain into the persistent engine output.

Commit BPM and the new generation atomically. Reject supplied BPM values unless they are finite and greater than zero. Define `DEFAULT_BPM = 120` in one shared runtime constants module and resolve every omitted BPM to that default, never to the current clock timing. Retire complete generations using exact audio-time settling/fade constants, preserving existing sample-cache behavior across generations.

### 5. Routes and sends

Pass the selected primary destination and normalized send destinations into runtime instruments. Connect each instrument's post-mute output exactly once to its route and once through each send gain to each send target. Add graph-connection and lifecycle tests.

### 6. Globally ordered duck scheduling

Use one shared onset-normalization abstraction for synths and samplers. Collect all generation duck events for a bar before automation is installed. Normalize to sample frames, deduplicate polyphony with maximum duration, resolve absolute timings, sort per target, merge equal-frame collisions, and submit complete ordered event groups.

Implement a software-modeled exponential timeline with retrigger-safe segment truncation/reconstruction, minimum ramps, depth mapping, zero-depth no-op behavior, and stop/destruction cleanup. Test cross-instrument ordering, unsorted direct schemas, equal-time collisions, cross-bar recovery, muted triggers, unavailable samples, and graph replacement.

### 7. Bus automation review

Exercise the bus parameter cycles and bounded bar envelopes delivered with the runtime bus abstraction. Add stop/reset and generation cleanup tests. Conduct an audible browser test of repeated bar-envelope boundaries before treating the proposed envelope behavior as settled.

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
- omitted BPM resolves to `120`, including after a previously committed schema used a different BPM;
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
- old buses remain for `FILTER_SETTLING_TIME = 0.1`, fade through the generation retirement gain for `RETIREMENT_FADE_TIME = 0.01`, and disconnect only when audio time reaches the fade endpoint.

### Ducking

- shared synth/sampler deduplication produces one trigger per sample-frame onset using maximum event duration;
- separate triggers for offset events;
- cross-instrument events are globally sorted before automation;
- equal-frame requests merge resolved absolute durations deterministically;
- muted instruments trigger while their sends/routes remain silent;
- missing sampler sources still trigger;
- sampler timing uses pattern-event duration;
- square-root depth mapping and clamping;
- zero depth is a no-op;
- software-modeled exponential segments truncate/reconstruct correctly and retrigger without stacking;
- completed duck segments are compacted so long-running generations retain bounded timeline storage;
- self-inclusive ducking works;
- stop and destruction cancel future timeline work and reset automation.

### Bus automation

- static, parameter, LFO, MIDI, and envelope parameter sources;
- envelope timing uses current bar duration;
- bounded timing normalization;
- repeated-bar retrigger behavior;
- stop resets envelopes to minimum;
- generation destruction cleans up automation resources;
- every clock callback contains errors, and failed bar scheduling submits no partial duck timeline;
- LFO-controlled parameters neutralize intrinsic values and per-voice LFO connections disconnect at voice end.

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
