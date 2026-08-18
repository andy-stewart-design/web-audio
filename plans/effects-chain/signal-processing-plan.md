# Signal Processing Implementation Plan

## Context

This plan implements [`signal-processing-spec.md`](signal-processing-spec.md) as incremental, testable vertical slices across `@web-audio/schema`, `@web-audio/fluid`, and `@web-audio/audio-engine`.

The target graph is:

```text
voice effects → instrument mix → balancing gain → mute
  ├─→ primary bus
  ├─→ send gain → named bus
  └─→ send gain → named bus

named bus input → effects → duck gain → output gain ─┐
                                                     ├─→ main bus
main-routed instruments ─────────────────────────────┘

main input → effects → output gain → persistent engine output/analyser → destination
```

Each committed schema owns a complete graph generation. A replacement generation is built independently while the previous generation retires through its original buses. Only the engine's final output/analyser remains persistent across commits.

The implementation is deliberately limited to the existing gain and filter processors. Reverb and other processors remain separate work. Before reverb lands, generation retirement must be extended to account for effect tails as documented in [`effects.md`](effects.md).

## Key design decisions

- `main` always exists and is serialized explicitly.
- Named buses are declared through a get-or-create `d.bus(name)` builder and always output to `main`.
- Instruments have exactly one primary route, defaulting to `main`.
- Sends and duck target arrays are builder conveniences normalized into target-keyed records.
- Routes and sends branch after the instrument's internal balancing and mute stages.
- Send amounts are static normalized values in v1.
- Ducking is event-triggered gain automation, not audio-reactive sidechain compression.
- Muted instruments still emit duck events while their routed and sent audio remains silent.
- Duck timing is proportional to scheduled pattern-event duration, including for samplers.
- Ducking is applied after bus processing through a dedicated gain node.
- Bus effects support the existing parameter sources. Bus envelopes repeat once per bar and fit a bounded ADSR shape inside that bar.
- Fluid trims bus names; canonical schemas contain already-normalized names and are never silently mutated by engine validation.
- Graph references are validated after the complete Fluid schema is assembled, so forward references work.
- Invalid direct engine updates fail before replacing `_pending` or disturbing active playback.
- Every commit builds a new graph generation; buses are not reconciled by name.
- Existing `.gain()` remains a per-voice envelope API. This work does not add an instrument output fader.
- The schema change is intentionally breaking. All repository fixtures migrate together.

---

## Phase 1: Canonical schema and shared graph validation

Tracer bullet: Fluid and AudioEngine can exchange a canonical no-routing-change schema containing an explicit default main bus and default instrument routing fields.

### Step 1.1 — Add routing and bus schema types

**Files:** `packages/schema/src/index.ts`

Add and export:

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
```

Extend `InstrumentSchema` with required fields:

```ts
route: string;
sends: Record<string, number>;
ducks: Record<string, DuckSchema>;
```

Extend `DromeSchema` with:

```ts
buses: Record<string, BusSchema>;
```

Requirements:

- fields are required rather than optional compatibility fields;
- `BusSchema.effects` reuses the existing `EffectSchema` union;
- do not add destination or bus-kind fields because named buses always feed main in v1;
- do not encode builder-only array forms in schema types;
- export all new public types from the package entry point.

**Acceptance criteria:**

- [ ] TypeScript requires `buses` on every `DromeSchema`.
- [ ] TypeScript requires `route`, `sends`, and `ducks` on synth and sampler schemas.
- [ ] The schema represents one normalized configuration per send/duck target.
- [ ] Schema check and lint pass after fixture migration in Step 1.3.

### Step 1.2 — Implement shared graph validation

**Files:** `packages/schema/src/validate-signal-graph.ts` (new), `packages/schema/src/validate-signal-graph.test.ts` (new), `packages/schema/src/index.ts`, `packages/schema/package.json`

Add a validator with a narrow contract such as:

```ts
validateSignalGraph(schema: DromeSchema): void;
```

Use one exported error class or structured error shape so Fluid and AudioEngine report the same invariant failures. Validation may trust the compile-time shape of non-graph schema fields; this validator is responsible for signal-graph invariants, not full `unknown` decoding.

Validate:

- `buses.main` exists;
- every bus key is non-empty and already canonical (`name === name.trim()`);
- every bus gain is finite and `>= 0`;
- every route is canonical and resolves to `main` or a declared named bus;
- every send target is canonical, declared, and not `main`;
- every send amount is finite and in `[0, 1]`;
- every duck target is canonical, declared, and not `main`;
- every duck depth is finite and in `[0, 1]`;
- every duck onset/recovery is finite and `>= 0`;
- bus effects belong to the currently supported `EffectSchema` union.

Requirements:

- validator does not trim, clamp, or mutate direct schemas;
- errors identify the offending bus or instrument index and field path;
- validation is deterministic and reports the first invalid path consistently;
- add `test`/`test:ci` scripts to `@web-audio/schema` rather than leaving runtime validation untested;
- add package dependencies only with `pnpm` if a new dependency proves necessary; none is expected.

**Acceptance criteria:**

- [ ] Valid main-only and named-bus schemas pass.
- [ ] Missing main, whitespace names, empty names, unresolved targets, main sends/ducks, non-finite values, and invalid ranges fail with useful paths.
- [ ] Validation leaves the input deeply unchanged.
- [ ] Schema test, check, lint, and build-equivalent package checks pass.

### Step 1.3 — Migrate existing schema producers and fixtures to canonical defaults

**Files:** `packages/fluid/src/instruments/instrument.ts`, `packages/fluid/src/instruments/sampler.ts`, `packages/fluid/src/instruments/synthesizer.ts`, `packages/fluid/src/index.ts`, Fluid tests, AudioEngine tests and schema fixtures, any app fixtures found by TypeScript

Before adding user-facing routing behavior, make existing Fluid output canonical defaults:

```ts
route: "main",
sends: {},
ducks: {},
```

and make `Drome.getSchema()` emit:

```ts
buses: {
  main: { gain: 1, effects: [] },
}
```

Migrate all manually authored `DromeSchema` fixtures. Do not hide missing fields behind engine defaults.

**Acceptance criteria:**

- [ ] Existing Fluid programs produce behaviorally unchanged schemas plus canonical graph defaults.
- [ ] Every repository schema fixture compiles with required fields.
- [ ] Existing engine playback still routes instruments through the current master path at this intermediate step.
- [ ] Workspace check identifies no old-format schema construction.

---

## Phase 2: Fluid bus, route, send, and duck builders

Tracer bullet: users can author and inspect a fully normalized routing graph even though AudioEngine still ignores the new topology until later phases.

### Step 2.1 — Add bus-name and numeric normalization helpers

**Files:** `packages/fluid/src/utils/signal-graph.ts` (new), `packages/fluid/src/utils/signal-graph.test.ts` (new)

Add small reusable helpers for builder input normalization:

- trim one bus name and reject a result of `""`;
- normalize `string | string[]` targets without retaining array structure;
- reject non-finite bus/send values;
- clamp finite duck depth to `[0, 1]`;
- clamp finite duck onset/recovery to `>= 0`.

Requirements:

- preserve case and internal whitespace;
- normalize every declaration and reference through the same name helper;
- preserve target order only while applying last-write-wins assignments; schema records are authoritative;
- duplicate names within an array resolve deterministically to one record entry;
- no unsafe casts.

**Acceptance criteria:**

- [ ] Leading/trailing whitespace is trimmed consistently for declarations and references.
- [ ] Empty/whitespace-only names fail.
- [ ] Internal whitespace and case remain unchanged.
- [ ] Duck clamping and non-finite rejection match the spec.

### Step 2.2 — Add the Bus builder

**Files:** `packages/fluid/src/buses/bus.ts` (new), `packages/fluid/src/buses/bus.test.ts` (new), `packages/fluid/src/index.ts`

Create a `Bus` builder owned by one `Drome` instance. It should hold normalized name, static output gain, and an ordered list of existing `Filter | GainEffect` builders.

Suggested surface:

```ts
class Bus {
  gain(value: number): this;
  fx(...effects: (Filter | GainEffect)[]): this;
  getSchema(): BusSchema;
}
```

Add `Drome.bus(name)`, backed by `Map<string, Bus>` or an equivalent key-preserving collection.

Requirements:

- construct/configure the main builder during `Drome` initialization so main always exists;
- `d.bus(name)` returns the same builder for repeated normalized names;
- `.gain()` is last-write-wins, defaults to `1`, accepts finite values `>= 0`, and rejects negatives;
- `.fx()` appends in call order across repeated accessor calls;
- `getSchema()` emits one entry per canonical name and always includes main;
- bus declaration order must not affect reference validity.

**Acceptance criteria:**

- [ ] `d.bus(" main ")` configures the implicit main builder.
- [ ] Repeated named-bus access shares scalar and effect state.
- [ ] Gain above unity is accepted; negative and non-finite gain fails.
- [ ] Effects preserve exact append order.
- [ ] Empty Drome output includes default main.

### Step 2.3 — Add instrument routing APIs

**Files:** `packages/fluid/src/instruments/instrument.ts`, `packages/fluid/src/instruments/instrument.test.ts`, sampler/synth schema tests as needed

Store canonical routing state on the base Fluid instrument builder and add:

```ts
route(target: string): this;
send(target: string | string[], amount: number): this;
duck(
  target: string | string[],
  depth?: number,
  onset?: number,
  recovery?: number,
): this;
```

Requirements:

- route defaults to main and repeated calls are last-write-wins;
- send amount is required, finite, and in `[0, 1]`;
- send arrays share one amount;
- duck defaults are depth `1`, onset `0`, recovery `1`;
- duck arrays share one configuration;
- repeated send/duck targets are last-write-wins, including overlap between arrays and chained calls;
- zero-depth duck remains serialized as a valid disabled configuration;
- sampler and synth schemas spread one shared base routing representation rather than duplicating logic.

**Acceptance criteria:**

- [ ] Default instrument schema contains main route and empty records.
- [ ] Array and chained forms normalize identically.
- [ ] Later route/send/duck calls replace only their relevant target/state.
- [ ] Duck clamping and static defaults are covered.
- [ ] Every method remains fluent.

### Step 2.4 — Validate the completed Fluid graph

**Files:** `packages/fluid/src/index.ts`, `packages/fluid/src/index.test.ts`

Call the shared schema validator only after all instruments, buses, and banks have been assembled in `getSchema()`.

Requirements:

- forward references work regardless of builder call order;
- routes to main remain valid without calling `d.bus("main")`;
- sends and ducks to main fail;
- undeclared named targets fail with instrument/path context;
- Fluid canonicalization happens before shared validation;
- failures do not mutate builders, allowing the user to declare the missing bus and call `getSchema()` again.

**Acceptance criteria:**

- [ ] Route/send/duck forward-reference fixtures pass after declaration.
- [ ] Missing target fixtures fail at `getSchema()`, not at fluent call time.
- [ ] Adding a missing bus after a failed `getSchema()` permits a subsequent successful call.
- [ ] Main send/duck rejection is covered.

---

## Phase 3: Shared runtime parameter/effect hosting

Tracer bullet: gain and filter processors can be hosted by either a voice or a persistent bus without duplicating incompatible parameter, LFO, or MIDI logic.

### Step 3.1 — Extract reusable parameter resolution

**Files:** `packages/audio-engine/src/automation/parameter-host.ts` (new), `packages/audio-engine/src/automation/parameter-host.test.ts` (new), `packages/audio-engine/src/instruments/instrument.ts`, related tests

Extract the runtime responsibilities currently embedded in `Instrument` that are also needed by buses:

- static/random parameter resolution by bar and step;
- envelope schema resolution;
- LFO construction, schema tracking, and per-bar output updates;
- MIDI CC binding/mapping and cleanup;
- applying `AudioParamSchema` values to an `AudioParam`;
- safe ownership/disconnection of persistent automation resources.

Prefer composition over creating a broad inheritance hierarchy. Keep voice tracking, source lifecycle, detune semantics, and instrument retirement in `Instrument`.

Requirements:

- preserve current instrument behavior and tests before introducing buses;
- keep random resolvers scoped so repeated resolution remains deterministic;
- let hosts register the schemas they actually use rather than hard-coding only instrument detune/effect traversal;
- retain starting-bar/bar-origin LFO phase behavior;
- MIDI ownership must still distinguish active and retired generations later;
- do not add explicit return types unless needed by exported contracts.

**Acceptance criteria:**

- [ ] Existing synth/sampler filter, gain, LFO, envelope, random, and MIDI tests remain behaviorally unchanged.
- [ ] Parameter host can initialize/update/clean up bus effect parameters independently.
- [ ] No LFO or MIDI connections leak after host destruction.

### Step 3.2 — Extract effect-node construction

**Files:** `packages/audio-engine/src/effects/effect-chain.ts` (new), `packages/audio-engine/src/effects/effect-chain.test.ts` (new), `packages/audio-engine/src/instruments/instrument.ts`

Create a reusable effect-chain builder for the existing `filter` and `gain` variants. It must accept a scheduling context supplied by its host:

- voice host: note-relative parameter context;
- bus host: bar-relative parameter context, implemented in Phase 5.

Requirements:

- preserve serial effect order;
- return owned nodes so voice and bus lifecycles can disconnect them correctly;
- route every effect parameter through the shared parameter host;
- fail exhaustively for unsupported effect variants;
- do not add wet/dry behavior or infer group/aux roles.

**Acceptance criteria:**

- [ ] Voice effect graph snapshots/mocks retain existing order and parameter values.
- [ ] Empty chains connect input to output without a hidden duplicate path.
- [ ] Gain and every filter parameter source use shared automation logic.
- [ ] Unsupported effect types cannot silently produce `undefined` nodes.

---

## Phase 4: Runtime Bus and graph generation foundations

Tracer bullet: AudioEngine builds a generation containing a generated main bus and routes all instruments through it while preserving current audible behavior.

### Step 4.1 — Implement the runtime Bus graph

**Files:** `packages/audio-engine/src/buses/bus.ts` (new), `packages/audio-engine/src/buses/bus.test.ts` (new)

Implement a runtime bus owning:

- an input/summing `GainNode`;
- its serial effect nodes;
- a dedicated duck `GainNode` initialized to `1`;
- a static output `GainNode` initialized from `BusSchema.gain`;
- parameter/LFO/MIDI automation resources;
- stop/reset and destruction behavior.

Graph order must be:

```text
input → effects → duck gain → output gain → destination
```

Requirements:

- named bus destination is generated main input;
- main destination is the persistent engine output;
- only one forward connection exists at every stage;
- main's duck gain remains present but unused at unity in v1, or omit it only if the implementation keeps an equivalent stable abstraction without exposing main ducking;
- output gain is separate from duck automation;
- `destroy()` disconnects input, effects, duck, output, LFOs, and MIDI bindings idempotently;
- expose only narrow methods needed by the generation: `input`, `scheduleBar`, `duck`, `stop`, MIDI connect/disconnect, and `destroy`.

**Acceptance criteria:**

- [ ] Exact node order is asserted with Web Audio mocks.
- [ ] Empty and multi-effect buses connect once without dry duplication.
- [ ] Duck automation never writes to output gain.
- [ ] Destruction is idempotent and disconnects all owned nodes.

### Step 4.2 — Introduce a GraphGeneration owner

**Files:** `packages/audio-engine/src/graph-generation.ts` (new), `packages/audio-engine/src/graph-generation.test.ts` (new), `packages/audio-engine/src/index.ts`

Encapsulate one committed schema generation. It should own:

- generated main and named runtime buses;
- active instruments;
- generation-scoped MIDI connection state;
- scheduling and stop/reset delegation;
- pending duck callback cancellation;
- graceful retirement and terminal destruction.

Build in this order:

1. validate schema before construction;
2. create main bus targeting persistent engine output;
3. create named buses targeting main input;
4. create instruments with generation-provided route/send destinations;
5. connect MIDI if already active.

At the first slice, route every instrument to generated main and defer named routing connections to Phase 6.

Requirements:

- retain sample cache ownership in `AudioEngine`, shared across generations;
- preserve sampler fallback-buffer lookup by instrument index against the previous active generation;
- expose `finished` that resolves after all generation instruments have finished retirement;
- do not disconnect buses when one instrument finishes;
- destruction after `finished` tears down buses and any remaining generation resources;
- terminal `destroy()` immediately destroys all instruments/buses and resolves lifecycle state;
- active generation may be idle without being considered finished.

**Acceptance criteria:**

- [ ] Main-only schemas route through generated main into the existing persistent output.
- [ ] Generation owns and destroys all generated graph objects.
- [ ] Shared sample cache and fallback behavior survive generation replacement.
- [ ] MIDI connections transfer to a new active generation and disconnect from retiring generations as today.

### Step 4.3 — Refactor AudioEngine around generations

**Files:** `packages/audio-engine/src/index.ts`, `packages/audio-engine/src/engine.test.ts`

Replace flat active/retiring instrument collections with:

- one active `GraphGeneration | null`;
- a retiring generation set;
- existing persistent output/analyser;
- existing pending schema and shared sample cache.

Commit behavior:

1. consume only the latest validated pending schema at `prebar`;
2. create the new generation;
3. retire the old generation;
4. remove/destroy the old generation when `finished` resolves;
5. preserve old generation buses until then.

Requirements:

- validate synchronously in `update(schema)` before assigning `_pending`; invalid updates throw and preserve the previous pending/active graph;
- if generation construction throws, do not retire the active generation;
- `prepare()` continues to preload the latest valid pending schema;
- clock `bar`, `stop`, MIDI, and destroy operations delegate to generations;
- the persistent output remains the only engine object connected directly to destination;
- analyser sees both active and retiring generation output during overlap.

**Acceptance criteria:**

- [ ] Invalid updates do not replace an earlier valid pending schema or active generation.
- [ ] Last-valid-write wins before prebar.
- [ ] Old and new generated main buses can coexist while the old generation retires.
- [ ] Old buses disconnect only after every old instrument finishes.
- [ ] Existing stop, MIDI, prepare, cache, analyser, and destroy tests remain covered.

---

## Phase 5: Persistent bus effect automation

Tracer bullet: a main or named bus can process the summed signal through existing gain/filter effects using static, patterned, LFO, MIDI, and bounded bar-envelope parameters.

### Step 5.1 — Define bus scheduling contexts

**Files:** `packages/audio-engine/src/buses/bus.ts`, shared automation/effect modules and tests

On each clock `bar`, call `scheduleBar(barIndex, barStartTime)` on every bus before or after instrument scheduling consistently. Resolve bus static/random parameter cycles with:

```ts
barIndex;
stepIndex = 0;
startTime = barStartTime;
duration = clock.barDuration;
endTime = barStartTime + clock.barDuration;
```

For ordinary static/random parameter schemas, set the bar's resolved value at `barStartTime`. LFO output bounds update once per bar using existing phase-preserving behavior. MIDI CC remains real-time.

Requirements:

- do not recreate effect nodes each bar;
- preserve effect and LFO state for the generation lifetime;
- scheduling order must not change instrument note timing;
- bus random resolution is deterministic by bar;
- all scheduled automation is generation-owned and resettable.

**Acceptance criteria:**

- [ ] Static and multi-bar parameter values update at exact bar boundaries.
- [ ] Persistent LFO nodes are created once and retain phase.
- [ ] MIDI bindings update bus parameters and cleanly disconnect.
- [ ] Multiple bus effects retain serial order while updating parameters.

### Step 5.2 — Implement bounded one-bar bus envelopes

**Files:** `packages/audio-engine/src/utils/compute-bus-envelope.ts` (new), `packages/audio-engine/src/utils/compute-bus-envelope.test.ts` (new), bus/automation modules

Compute a bus envelope that fits wholly inside one bar:

```text
bar start → attack → decay → sustain → release → next bar start
```

Use `a`, `d`, and `r` as proportions of bar duration. If their sum exceeds `1`, normalize proportionally using bounded timing semantics. Sustain occupies the remaining time after attack, decay, and release. Apply `MIN_RAMP` without scheduling past the next bar boundary; define tested behavior for bars too short to fit all minimum ramps.

Resolve `max`, ADSR values, and sustain for `barIndex`/step `0`. At each bar start, cancel/replace the previous bar's future automation and begin from the configured minimum.

Requirements:

- this is bus-specific behavior; do not change existing per-voice `computeEnvelope()` semantics;
- release ends at the next bar boundary rather than beginning there;
- `mode` does not permit bleed beyond the bar for a persistent bus parameter;
- stop cancels future values, holds safely, and ramps to configured minimum;
- implementation must be easy to revise after listening tests.

**Acceptance criteria:**

- [ ] Attack/decay/release proportions and sustain placement are tested at representative bar durations.
- [ ] Oversubscribed ADR values normalize to one bar.
- [ ] Minimum ramps never schedule times out of order.
- [ ] Repeated bars retrigger without stale automation.
- [ ] Stop restores parameter minima safely.

### Step 5.3 — Conduct a focused audible bus-envelope review

**Files:** a temporary or existing demo under `apps/demos/src/components/scratch.ts`, findings recorded in `signal-processing-spec.md` or a follow-up note only if behavior changes

Use a sustained synth routed through bus gain/filter effects and listen for:

- boundary clicks at repeated bars;
- expected attack/release feel at multiple BPMs;
- behavior when BPM changes on a generation replacement;
- zero and oversubscribed ADR values;
- stop/resume reset behavior.

Do not run a development server without asking first. If automated/offline rendering can answer a question, prefer it; otherwise request permission for the manual demo run.

**Acceptance criteria:**

- [ ] Automated timing tests pass before listening.
- [ ] Any audible boundary problem is fixed or explicitly moved to a follow-up with a safe v1 fallback.
- [ ] The reviewed behavior still matches or deliberately amends the spec.

---

## Phase 6: Primary routes and auxiliary sends

Tracer bullet: instruments route once to main or a named bus and can send post-mute copies to one or more named buses.

### Step 6.1 — Expose one post-mute instrument output connection point

**Files:** `packages/audio-engine/src/instruments/instrument.ts`, instrument tests

Refactor the instrument base graph so construction no longer directly connects `_muteNode` to a single destination. Supply routing destinations or a narrow output-routing descriptor from `GraphGeneration`.

Suggested internal shape:

```ts
interface InstrumentRouting {
  primary: AudioNode;
  sends: { destination: AudioNode; amount: number }[];
}
```

Connect:

```text
_balancingNode → _muteNode
_muteNode → primary
_muteNode → send GainNode → send destination
```

Requirements:

- primary receives exactly one direct connection;
- each send owns one persistent gain node initialized before connection;
- no implicit main connection remains when primary is named;
- sends are post-balancing and post-mute;
- send nodes are disconnected during instrument destruction;
- retirement keeps send nodes connected until scheduled voices finish;
- route/send graph setup is independent of per-voice effect nodes.

**Acceptance criteria:**

- [ ] Default route creates exactly one main connection.
- [ ] Named route creates no direct main connection.
- [ ] Multiple sends create independent gain nodes and destinations.
- [ ] Muting suppresses primary and every send.
- [ ] Destruction disconnects send nodes without cutting another instrument's bus input.

### Step 6.2 — Resolve routing through GraphGeneration

**Files:** `packages/audio-engine/src/graph-generation.ts`, graph-generation tests

Map canonical schema names to runtime bus inputs while constructing instruments.

Requirements:

- rely on prior validation but fail defensively if a runtime bus lookup is unexpectedly absent;
- main route resolves to generated main input;
- named routes/sends resolve to named bus inputs;
- bus inputs sum any mix of routes and sends without role flags;
- source order does not alter bus construction or target availability.

**Acceptance criteria:**

- [ ] Two instruments routed to one group bus sum into one input.
- [ ] Route and send can intentionally enter the same named bus.
- [ ] A source can route to one bus and send to several others.
- [ ] Every named bus forwards its processed output exactly once to main.

### Step 6.3 — Add integration graph tests

**Files:** `packages/audio-engine/src/engine.test.ts`, `packages/audio-engine/src/graph-generation.test.ts`, instrument tests

Cover the reference topology from `signal-processing-spec.md`, including kick/snare group routing, independent verb sends, and a synth default route.

**Acceptance criteria:**

- [ ] Connection assertions prove no dry-signal duplication.
- [ ] Send gain values match schema amounts.
- [ ] Bus output gain affects all sources entering that bus.
- [ ] Primary-bus effects do not process pre-bus instrument sends.
- [ ] Old-generation route/send connections remain isolated from new-generation buses.

---

## Phase 7: Event-triggered ducking

Tracer bullet: resolved note events schedule retrigger-safe attenuation on named bus outputs, including muted and unavailable sampler triggers.

### Step 7.1 — Prove the retrigger automation mechanism

**Files:** `packages/audio-engine/src/buses/duck-automation.ts` (new), `packages/audio-engine/src/buses/duck-automation.test.ts` (new)

Before wiring note events, isolate the timing mechanism. Compare:

1. scheduling `AudioParam.cancelAndHoldAtTime(triggerTime)` ahead of time where supported;
2. a cancellable callback executed shortly before trigger time, using `cancelScheduledValues(now)` plus an anchored current value as the compatibility fallback.

Choose one implementation with feature detection and deterministic tests. The abstraction should expose:

```ts
schedule(triggerTime: number, eventDuration: number, config: DuckSchema): void;
reset(time: number): void;
destroy(): void;
```

Requirements:

- derive target gain as `clamp(1 - sqrt(depth), 0.01, 1)`;
- zero depth schedules nothing and does not disturb active automation;
- onset/recovery multiply scheduled event duration and apply `MIN_RAMP`;
- retriggers hold current automation, do not stack gain multiplication, and do not first raise toward a shallower target;
- callback fallback is cancellable on stop and destruction;
- callbacks scheduled for one generation cannot affect another;
- avoid wall-clock assumptions in unit tests by injecting a minimal scheduler/timeout boundary;
- document browser support reasoning in the module.

**Acceptance criteria:**

- [ ] Ahead-of-time scheduling preserves the calculated value at retrigger time.
- [ ] Deep-to-shallow and shallow-to-deep retriggers follow the spec.
- [ ] Repeated triggers restart recovery without multiplying attenuation.
- [ ] Stop/reset returns gain to `1` with a safe ramp.
- [ ] Destruction prevents every pending callback from writing again.

### Step 7.2 — Add duck event dispatch to GraphGeneration

**Files:** `packages/audio-engine/src/graph-generation.ts`, `packages/audio-engine/src/buses/bus.ts`, related tests

Give instruments a narrow event callback rather than direct access to bus internals:

```ts
onDuck(event: {
  startTime: number;
  duration: number;
  targets: Record<string, DuckSchema>;
}): void;
```

GraphGeneration resolves target names and calls each target Bus's duck controller.

Requirements:

- main is unreachable by validated duck records;
- all duck sources targeting one bus share that bus's single duck automation timeline;
- target bus processing precedes duck gain;
- self-inclusive route/send ducking is allowed;
- generation stop resets every bus duck controller;
- retired generations continue only already-scheduled duck behavior until destruction, while stop cancels it.

**Acceptance criteria:**

- [ ] Multiple source instruments coordinate through one target duck gain.
- [ ] Duck writes never alter bus output gain or effect parameters.
- [ ] Self-inclusive ducking schedules normally.
- [ ] Old triggers cannot duck same-named buses in a new generation.

### Step 7.3 — Emit synth duck events once per distinct onset

**Files:** `packages/audio-engine/src/instruments/synthesizer.ts`, shared instrument scheduling helpers/tests

Emit duck events from resolved, unmasked pattern events using:

```ts
startTime = barStartTime + note.offset * barDuration;
duration = note.duration * barDuration;
```

Deduplicate simultaneous polyphonic events by onset within one instrument/bar. Prefer deduplicating resolved scheduling events before voice creation rather than letting every oscillator emit.

Requirements:

- muted synths still emit;
- random/masked patterns emit only for resolved non-rest events;
- separate offsets emit separately;
- MIDI output behavior remains independent;
- zero-depth-only target records may be skipped as an optimization without changing semantics.

**Acceptance criteria:**

- [ ] A chord onset emits one duck event.
- [ ] Offset chord/note events emit at each distinct onset.
- [ ] Masked/rest events emit none.
- [ ] Mute does not suppress duck dispatch.

### Step 7.4 — Emit sampler duck events independently of source availability

**Files:** `packages/audio-engine/src/instruments/sampler.ts`, sampler tests

Refactor sampler event resolution so duck dispatch occurs after the pattern event is known but before these audio-only early exits:

- no initial buffer loaded;
- no playback source for resolved variation/key;
- invalid or unavailable source window.

Use scheduled pattern-event duration, never clipped/playback duration.

Requirements:

- preserve alternate playback-direction state: a duck-only event caused by unavailable audio must not incorrectly advance audible alternation unless current event semantics explicitly require it;
- masked/random/static note paths share dispatch logic;
- sample fit, pitch, region, clip mode, loop, and one-shot duration do not change duck timing;
- avoid duplicate dispatch when source playback succeeds.

**Acceptance criteria:**

- [ ] Missing initial and per-note buffers still produce duck events.
- [ ] Audible notes produce exactly one event.
- [ ] Pattern duration controls duck timing across clip/one-shot/loop cases.
- [ ] Mute suppresses audio through the graph but not event dispatch.
- [ ] Existing sampler direction/variation behavior remains covered.

### Step 7.5 — Complete duck transport/lifecycle tests

**Files:** bus, graph-generation, engine, synth, and sampler tests

**Acceptance criteria:**

- [ ] Stop cancels future duck callbacks and future automation.
- [ ] Stop restores every duck gain to unity.
- [ ] Resume permits newly scheduled ducks without stale state.
- [ ] Generation replacement isolates old and new duck timelines.
- [ ] Engine destruction produces no late timeout/audio-param writes.

---

## Phase 8: Documentation, verification, and closeout

### Step 8.1 — Update package documentation

**Files:** `packages/fluid/README.md`, `packages/audio-engine/README.md`, other public docs only where routing is already documented

Document:

- bus declaration/configuration;
- route replacement semantics;
- post-mute sends and array convenience;
- event-triggered duck API, defaults, proportional timing, and ghost triggers;
- explicit wet-only responsibility for future auxiliary effects;
- generation retirement behavior;
- current limitations and follow-ups.

Treat `signal-processing-spec.md` as normative for this SOW.

**Acceptance criteria:**

- [ ] Examples serialize into valid declared graphs.
- [ ] Docs do not describe ducking as a compressor or audio detector.
- [ ] Send and duck restrictions on main are explicit.
- [ ] The distinction between voice `.gain()` and bus `.gain()` is clear.

### Step 8.2 — Required focused test coverage

#### Schema and Fluid

- [ ] Required canonical fields and implicit main emission.
- [ ] Name trimming, empty rejection, case/internal-space preservation.
- [ ] Bus get-or-create and effect ordering.
- [ ] Forward references and unresolved references.
- [ ] Last-write-wins route/send/duck behavior.
- [ ] Send/duck array and chained forms.
- [ ] Main send/duck rejection.
- [ ] Finite/range validation and duck clamping.

#### Runtime topology and lifecycle

- [ ] Only persistent engine output connects directly to destination.
- [ ] Instrument output branches after balancing/mute.
- [ ] Exactly one primary connection per instrument.
- [ ] No implicit main path for named routes.
- [ ] Independent send gains and pre-primary-bus tap position.
- [ ] Bus effect → duck → output ordering.
- [ ] Main and named bus forwarding invariants.
- [ ] Whole-generation replacement, retirement, and destruction.
- [ ] Sample cache/fallback preservation across generations.
- [ ] MIDI/LFO cleanup for active, retiring, and destroyed generations.

#### Bus automation

- [ ] Static/random cycle resolution by bar.
- [ ] Persistent LFO phase/update behavior.
- [ ] MIDI CC updates and cleanup.
- [ ] Bounded one-bar envelopes, minimum ramps, stop reset.

#### Ducking

- [ ] Square-root target curve and minimum target gain.
- [ ] Event-relative onset/recovery and minimum ramps.
- [ ] Zero-depth no-op.
- [ ] Non-stacking retriggers from current automation.
- [ ] Polyphonic onset deduplication.
- [ ] Distinct offset events.
- [ ] Muted and unavailable-source triggers.
- [ ] Scheduled sampler duration independent of playback duration.
- [ ] Shared target behavior from multiple trigger sources.
- [ ] Self-inclusive ducking.
- [ ] Stop, replacement, and destruction cancellation.

### Step 8.3 — Run required automated verification

- [ ] `pnpm --filter @web-audio/schema test:ci`
- [ ] `pnpm --filter @web-audio/schema check`
- [ ] `pnpm --filter @web-audio/schema lint`
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/fluid check`
- [ ] `pnpm --filter @web-audio/fluid lint`
- [ ] `pnpm --filter @web-audio/fluid build`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine check`
- [ ] `pnpm --filter @web-audio/audio-engine lint`
- [ ] `pnpm --filter @web-audio/audio-engine build`
- [ ] `pnpm check`
- [ ] `pnpm lint`
- [ ] `pnpm test`

Run format commands for changed packages before the final checks. Do not run a development server without permission.

### Step 8.4 — Manual graph review

Use a small composition matching the reference graph:

```ts
d.bus("drums").gain(0.8).fx(d.lpf(8_000));
d.bus("verb").gain(0.5);
d.bus("music");

d.sample("bd").route("drums").send("verb", 0.1).duck("music").push();
d.sample("sd").route("drums").send("verb", 0.4).push();
d.synth().route("music").send("verb", 0.2).push();
```

Review:

- [ ] Kick/snare group processing does not process their verb sends.
- [ ] Synth has no duplicate direct-main path.
- [ ] Muting kick silences its route/send while ducking music remains active.
- [ ] Duck depth and proportional recovery feel consistent across note lengths and BPMs.
- [ ] Re-evaluation permits old releases to finish without routing into new buses.
- [ ] Stop leaves no attenuated bus or delayed duck callback.

If no wet-only effect exists yet, use gain/filter buses to inspect topology rather than treating the `verb` name as actual reverb.

---

## Explicit follow-ups excluded from this plan

- Patterned duck depth, onset, and recovery through Drome `Parameter` resolution.
- Patterned/per-note send amounts and semantics for overlapping voices.
- Pre-fader, pre-mute, and per-voice sends.
- Named bus routing, bus-to-bus sends, graph cycle detection, and feedback routing.
- Audio-reactive sidechain compression.
- User-facing persistent instrument output level control.
- Auxiliary-return convenience APIs.
- Re-evaluation of bounded bar-envelope behavior after practical use.
- Reverb graph retirement: effect tail-duration/completion contracts and maximum retirement policy.
- Delay/feedback graph retirement and leak prevention.
- New DSP effects listed in `effects.md`.

## Completion criteria

This SOW is complete when:

- Fluid emits and validates the canonical graph schema;
- AudioEngine validates updates before changing pending/active state;
- every commit owns an isolated, gracefully retired graph generation;
- buses host existing effects and all agreed parameter sources;
- primary routes and post-mute sends satisfy the connection invariants;
- event-triggered ducking satisfies timing, retrigger, mute, sampler, stop, and lifecycle semantics;
- focused and workspace checks pass;
- the manual topology and envelope reviews find no unresolved correctness issue;
- deferred capabilities remain documented rather than partially implemented.
