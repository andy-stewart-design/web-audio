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

main input → effects → unity duck gain → output gain
  → generation retirement gain → persistent engine output/analyser → destination
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
- Duck timing is proportional to scheduled pattern-event duration, including for samplers. Proportions are resolved to absolute durations before equal-time requests merge.
- Duck events are normalized to sample frames, collected globally per bar, sorted per target, and merged independently of instrument order.
- Duck ramps use a software-modeled exponential timeline; retriggers truncate and reconstruct timeline segments analytically.
- Ducking is applied after bus processing through a dedicated gain node.
- Bus effects support the existing parameter sources. Bus envelopes repeat once per bar and fit a bounded ADSR shape inside that bar.
- Fluid trims bus names; canonical schemas contain already-normalized names and are never silently mutated by engine validation.
- Graph references are validated after the complete Fluid schema is assembled, so forward references work.
- Invalid direct engine updates fail before replacing `_pending` or disturbing active playback. Accepted schemas are cloned snapshots.
- Every commit transactionally builds a new graph generation through a failure-safe resource ledger; buses are not reconciled by name.
- BPM must be finite and greater than zero when supplied; each committed schema with omitted BPM resolves to `DEFAULT_BPM = 120` rather than inheriting timing from the previous sketch.
- BPM and generation installation commit atomically, and no clock-driven engine callback error escapes through the clock scheduler.
- Instruments retain local voice ownership; GraphGeneration coordinates shared graph lifetime rather than creating a global voice store.
- Retired generations use `FILTER_SETTLING_TIME = 0.1` followed by `RETIREMENT_FADE_TIME = 0.01`, both measured on the audio-context timeline.
- Existing `.gain()` remains a per-voice envelope API. This work does not add an instrument output fader.
- The schema change is intentionally breaking. All repository fixtures migrate together.

## Implementation status / next-session handoff

**Current position:** Phases 1–3 and Phase 4 through **Step 4.2** are complete. The next implementation task is **Step 4.3 — Refactor AudioEngine around generations**.

Completed foundations:

- canonical schema fields, shared graph validation, and repository fixture migration;
- Fluid bus, route, send, and duck builders with completed-graph validation;
- reusable AudioEngine `ParameterManager` composition and effect-chain construction;
- explicit LFO parameter-edge ownership and cleanup;
- absolute-value LFO semantics, with target `AudioParam` intrinsic values neutralized to `0`.

The manual LFO compatibility gate was approved after listening to existing sketches: the change did not noticeably alter their sound or violate expected code semantics. No development server was started by the coding agent.

Latest focused verification at this checkpoint:

- Schema: 51 tests passing;
- Fluid: 327 tests passing, plus check/lint/build passing;
- AudioEngine: 272 tests passing, plus check/lint/build passing;
- workspace TypeScript check passed after the Phase 1 fixture migration.

Implementation naming note: the concrete runtime abstraction originally planned as `ParameterHost` is implemented as `ParameterManager` in `packages/audio-engine/src/automation/parameter-manager.ts`, and instruments expose it internally as `protected readonly _parameters`.

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

- [x] TypeScript requires `buses` on every `DromeSchema`.
- [x] TypeScript requires `route`, `sends`, and `ducks` on synth and sampler schemas.
- [x] The schema represents one normalized configuration per send/duck target.
- [x] Schema check and lint pass after fixture migration in Step 1.3.

### Step 1.2 — Implement shared graph validation

**Files:** `packages/schema/src/validate-signal-graph.ts` (new), `packages/schema/src/validate-signal-graph.test.ts` (new), `packages/schema/src/index.ts`, `packages/schema/package.json`

Add a validator with a runtime-boundary contract such as:

```ts
validateSignalGraph(schema: DromeSchema): void;
```

Use one exported error class or structured error shape so Fluid and AudioEngine report the same invariant failures. Although the TypeScript signature is `DromeSchema`, defensively check graph-field shapes before traversing them because `AudioEngine.update()` is callable from untyped JavaScript. This validator is responsible for graph fields, not full decoding of unrelated schema data.

Validate:

- optional BPM is finite and greater than zero;
- `buses` is a non-null, non-array record and `buses.main` exists;
- each bus schema contains a valid gain and effects array;
- every instrument graph object has string `route` and non-null, non-array `sends`/`ducks` records;
- every nested duck value is a non-null, non-array record before numeric traversal;
- every bus key is non-empty and already canonical (`name === name.trim()`);
- every bus gain is finite and `>= 0`;
- every route is canonical and resolves to `main` or a declared named bus;
- every send target is canonical, declared, and not `main`;
- every send amount is finite and in `[0, 1]`;
- every duck target is canonical, declared, and not `main`;
- every duck depth is finite and in `[0, 1]`;
- every duck onset/recovery is finite and `>= 0`;
- bus and instrument effect arrays contain only supported `EffectSchema` discriminators.

Requirements:

- validator does not trim, clamp, or mutate direct schemas;
- old/malformed graph schemas produce structured validation errors rather than incidental `TypeError`s;
- errors identify the offending bus or instrument index and field path;
- validation is deterministic and reports the first invalid path consistently;
- add `test`/`test:ci` scripts to `@web-audio/schema` rather than leaving runtime validation untested;
- add package dependencies only with `pnpm` if a new dependency proves necessary; none is expected.

**Acceptance criteria:**

- [x] Valid main-only and named-bus schemas pass.
- [x] Invalid BPM, missing/malformed graph records, missing main, whitespace names, empty names, unresolved targets, main sends/ducks, unsupported bus/instrument effects, non-finite values, and invalid ranges fail with useful paths.
- [x] Old schemas without graph fields fail through the structured validator rather than throwing incidental traversal errors.
- [x] Validation leaves the input deeply unchanged.
- [x] Schema test, check, lint, and build-equivalent package checks pass.

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

- [x] Existing Fluid programs produce behaviorally unchanged schemas plus canonical graph defaults.
- [x] Every repository schema fixture compiles with required fields.
- [x] Existing engine playback still routes instruments through the current master path at this intermediate step.
- [x] Fluid rejects non-finite or non-positive supplied BPM while omitted BPM remains absent for AudioEngine to resolve to `DEFAULT_BPM = 120` at commit.
- [x] Workspace check identifies no old-format schema construction.

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

- [x] Leading/trailing whitespace is trimmed consistently for declarations and references.
- [x] Empty/whitespace-only names fail.
- [x] Internal whitespace and case remain unchanged.
- [x] Duck clamping and non-finite rejection match the spec.

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

- [x] `d.bus(" main ")` configures the implicit main builder.
- [x] Repeated named-bus access shares scalar and effect state.
- [x] Gain above unity is accepted; negative and non-finite gain fails.
- [x] Effects preserve exact append order.
- [x] Empty Drome output includes default main.

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

- [x] Default instrument schema contains main route and empty records.
- [x] Array and chained forms normalize identically.
- [x] Later route/send/duck calls replace only their relevant target/state.
- [x] Duck clamping and static defaults are covered.
- [x] Every method remains fluent.

### Step 2.4 — Validate the completed Fluid graph

**Files:** `packages/fluid/src/index.ts`, `packages/fluid/src/index.test.ts`

Call the shared schema validator only after all instruments, buses, and banks have been assembled in `getSchema()`.

Requirements:

- validate Fluid BPM as finite and greater than zero when supplied;
- forward references work regardless of builder call order;
- routes to main remain valid without calling `d.bus("main")`;
- sends and ducks to main fail;
- undeclared named targets fail with instrument/path context;
- Fluid canonicalization happens before shared validation;
- failures do not mutate builders, allowing the user to declare the missing bus and call `getSchema()` again.

**Acceptance criteria:**

- [x] Route/send/duck forward-reference fixtures pass after declaration.
- [x] Missing target fixtures fail at `getSchema()`, not at fluent call time.
- [x] Adding a missing bus after a failed `getSchema()` permits a subsequent successful call.
- [x] Main send/duck rejection is covered.

---

## Phase 3: Shared runtime parameter/effect hosting

Tracer bullet: gain and filter processors can be hosted by either a voice or a persistent bus without duplicating incompatible parameter, LFO, or MIDI logic.

### Step 3.1 — Extract reusable parameter resolution

**Files:** `packages/audio-engine/src/automation/parameter-manager.ts` (new), `packages/audio-engine/src/automation/parameter-manager.test.ts` (new), `packages/audio-engine/src/instruments/instrument.ts`, related tests

Extract the runtime responsibilities currently embedded in `Instrument` that are also needed by buses:

- static/random parameter resolution by bar and step;
- envelope schema resolution;
- LFO construction, schema tracking, and per-bar output updates;
- MIDI CC binding/mapping and cleanup;
- applying `AudioParamSchema` values to an `AudioParam`;
- safe ownership/disconnection of persistent automation resources.

Prefer composition over creating a broad inheritance hierarchy. Keep voice tracking, source lifecycle, detune semantics, and instrument retirement in `Instrument`.

Requirements:

- preserve intended current instrument behavior while fixing existing LFO parameter semantics and connection leaks before introducing buses;
- LFO output represents the absolute target value, so neutralize the target `AudioParam` intrinsic value before connecting the LFO signal;
- represent each LFO-to-parameter edge as an explicitly owned connection;
- disconnect per-voice LFO parameter edges when a voice ends, when a future voice is cancelled, and during instrument destruction;
- disconnect persistent bus edges during bus/generation destruction;
- keep random resolvers scoped so repeated resolution remains deterministic;
- let parameter managers register the schemas they actually use rather than hard-coding only instrument detune/effect traversal;
- retain starting-bar/bar-origin LFO phase behavior;
- MIDI ownership must still distinguish active and retired generations later;
- do not add explicit return types unless needed by exported contracts.

**Acceptance criteria:**

- [x] Existing synth/sampler filter, gain, envelope, random, and MIDI behavior remains unchanged.
- [x] LFO-controlled parameters have a neutral intrinsic value and tests assert the effective value rather than only connection calls.
- [x] Voice-end, future-note cancellation, and destruction each disconnect incoming LFO-to-parameter edges.
- [x] Parameter manager can initialize/update/clean up bus effect parameters independently.
- [x] No LFO or MIDI connections leak after voice or parameter-manager destruction.

> [!IMPORTANT]
> **Manual LFO sound-compatibility gate:** Neutralizing an `AudioParam` intrinsic value changes existing LFO-controlled gain, filter-frequency, and Q behavior and may audibly change current sketches. Treat this as a potentially breaking compatibility change, not an incidental refactor. Implement it as an isolated checkpoint with before/after fixtures for gain, frequency, Q, and detune; then manually test a representative set of existing sketches at multiple LFO ranges and rates. Do not proceed to Step 3.2 or build bus automation on the new semantics until the sound is explicitly approved. Keep the intrinsic-value change easy to revert independently from the connection-lifecycle cleanup. If absolute-value semantics are rejected after listening, preserve existing sound behavior while retaining the leak fix and document the chosen compatibility semantics.

**Manual gate acceptance criteria:**

- [x] Before/after fixtures make the effective parameter-value difference inspectable.
- [x] Existing sketches using LFO-controlled gain, frequency, Q, and detune receive focused listening tests.
- [x] Connection cleanup is evaluated separately from the audible intrinsic-value change.
- [x] The approved LFO semantics are recorded before Step 3.2 begins.
- [x] No development server or manual browser session is started without permission.

### Step 3.2 — Extract effect-node construction

**Files:** `packages/audio-engine/src/effects/effect-chain.ts` (new), `packages/audio-engine/src/effects/effect-chain.test.ts` (new), `packages/audio-engine/src/instruments/instrument.ts`

Create a reusable effect-chain builder for the existing `filter` and `gain` variants. It must accept a scheduling context supplied by its host:

- voice host: note-relative parameter context;
- bus host: bar-relative parameter context, completed as part of runtime Bus delivery in Phase 4 and detailed/tested in Phase 5.

Requirements:

- preserve serial effect order;
- return owned nodes so voice and bus lifecycles can disconnect them correctly;
- route every effect parameter through the shared parameter manager;
- fail exhaustively for unsupported effect variants;
- do not add wet/dry behavior or infer group/aux roles.

**Acceptance criteria:**

- [x] Voice effect graph snapshots/mocks retain existing order and parameter values.
- [x] Empty chains connect input to output without a hidden duplicate path.
- [x] Gain and every filter parameter source use shared automation logic.
- [x] Unsupported effect types cannot silently produce `undefined` nodes.

---

## Phase 4: Complete runtime Bus and graph-generation foundation

Tracer bullet: AudioEngine can fully execute every bus effect parameter source Fluid is allowed to emit, then transactionally builds a generation containing generated buses and a retirement output stage.

### Step 4.1 — Implement the runtime Bus graph

**Files:** `packages/audio-engine/src/buses/bus.ts` (new), `packages/audio-engine/src/buses/bus.test.ts` (new)

Implement a runtime bus owning:

- an input/summing `GainNode`;
- its serial effect nodes;
- a dedicated duck `GainNode` initialized to `1`;
- a static output `GainNode` initialized from `BusSchema.gain`;
- complete static/random, LFO, MIDI, and bounded bar-envelope parameter automation;
- stop/reset and destruction behavior.

This step includes the scheduling semantics detailed in Phase 5. Do not construct a bus effect using accidental native defaults or permit Fluid-emitted parameter sources that the runtime bus cannot yet execute.

Graph order must be:

```text
input → effects → duck gain → output gain → destination
```

Requirements:

- named bus destination is generated main input;
- main bus destination is the generation's retirement gain;
- only one forward connection exists at every stage;
- main's duck gain remains present but unused at unity in v1, or omit it only if the implementation keeps an equivalent stable abstraction without exposing main ducking;
- output gain is separate from duck automation;
- `destroy()` disconnects input, effects, duck, output, LFOs, and MIDI bindings idempotently;
- expose only narrow methods needed by the generation: `input`, `scheduleBar`, ordered duck timeline submission, `stop`, MIDI connect/disconnect, and `destroy`;
- the ordered duck submission method is deliberately deferred until Step 7.1 defines the real `DuckAutomation` timeline contract; do not add a hollow placeholder API in Step 4.1;
- initialize and schedule every accepted parameter source completely in this phase; Phase 5 is verification/refinement, not deferred basic support.

**Acceptance criteria:**

- [x] Exact node order is asserted with Web Audio mocks.
- [x] Empty and multi-effect buses connect once without dry duplication.
- [x] Duck automation never writes to output gain.
- [x] Static/random, LFO, MIDI, and bus-envelope parameters are initialized without native-default intermediate behavior.
- [x] Destruction is idempotent and disconnects all owned nodes and parameter edges.

### Step 4.2 — Introduce a GraphGeneration owner

**Files:** `packages/audio-engine/src/graph-generation.ts` (new), `packages/audio-engine/src/graph-generation.test.ts` (new), `packages/audio-engine/src/utils/audio-time-scheduler.ts` (new), `packages/audio-engine/src/utils/audio-time-scheduler.test.ts` (new), `packages/audio-engine/src/index.ts`

Encapsulate one committed schema generation. Instruments continue to own and track their individual voices. GraphGeneration owns only generation-wide resources and coordination:

- generated main and named runtime buses;
- generation instruments;
- a dedicated retirement `GainNode` between generated main and persistent engine output;
- generation-scoped MIDI connection state;
- scheduling, duck-event collection, and stop/reset delegation;
- graceful retirement and terminal destruction.

Do not expose a partially constructed instance. Use `GraphGeneration.create()` or an equivalent factory backed by an internal resource ledger. Register every node, connection, instrument, callback, and binding immediately after allocation. If any step throws, destroy ledger resources idempotently in reverse construction order.

Build in this order:

1. receive an already validated schema snapshot and explicit prospective timing configuration;
2. create the retirement gain targeting persistent engine output;
3. create main bus targeting the retirement gain;
4. create named buses targeting main input;
5. create instruments with generation-provided route/send destinations;
6. connect MIDI if already active;
7. expose the completed generation only after every step succeeds.

At the first slice, route every instrument to generated main and defer named routing connections to Phase 6.

Requirements:

- retain sample cache ownership in `AudioEngine`, shared across generations;
- preserve sampler fallback-buffer lookup by instrument index against the previous active generation;
- define `FILTER_SETTLING_TIME = 0.1` and `RETIREMENT_FADE_TIME = 0.01` seconds in one runtime constants module;
- expose `finished` that resolves only after all generation instruments finish, audio time advances by `FILTER_SETTLING_TIME`, and the retirement gain completes its `RETIREMENT_FADE_TIME` automation;
- drive completion through a cancellable audio-time-aware scheduler; if the context is suspended and `currentTime` stops, retirement pauses;
- document the settling allowance as intentional bounded truncation, not guaranteed filter silence;
- do not disconnect buses when one instrument finishes;
- destruction after retirement tears down buses and all remaining generation resources;
- terminal `destroy()` immediately destroys all instruments/buses, cancels settling/fade timers, and resolves lifecycle state;
- active generation may be idle without being considered finished.

**Acceptance criteria:**

- [x] Main-only schemas route through generated main and retirement gain into the existing persistent output.
- [x] Generation owns and destroys all generated graph objects while instruments retain local voice tracking.
- [x] Failure at every construction stage cleans prior ledger resources and exposes no partial generation.
- [x] Shared sample cache and fallback behavior survive generation replacement.
- [x] MIDI connections transfer to a new active generation and disconnect from retiring generations as today.

### Step 4.3 — Refactor AudioEngine around generations

**Files:** `packages/audio-engine/src/index.ts`, `packages/audio-engine/src/engine.test.ts`, `packages/audio-engine/src/scheduling/bar-schedule-ledger.ts` (new), `packages/audio-engine/src/scheduling/bar-schedule-ledger.test.ts` (new)

Replace flat active/retiring instrument collections with:

- one active `GraphGeneration | null`;
- a retiring generation set;
- existing persistent output/analyser;
- existing pending schema and shared sample cache.

`update(schema)` first defensively validates graph-field shapes on the caller value so malformed/old schemas fail structurally before traversal or cloning. It then `structuredClone()`s the plain-data schema, validates the snapshot, and assigns only that accepted snapshot to `_pending`. Clone failure also preserves prior state. Caller mutation after return cannot affect `prepare()` or commit.

Commit is an explicit transaction:

1. inspect but do not clear the latest accepted pending snapshot;
2. derive prospective BPM as `schema.bpm ?? DEFAULT_BPM`, then derive bar duration and generation timing without mutating the clock;
3. call the failure-safe `GraphGeneration.create()`;
4. on construction failure, clean all partial resources, discard the failing pending update, report the error through an engine error boundary, preserve current BPM/active generation, and return without throwing through the clock listener;
5. on success, apply BPM, install the new generation, clear pending, and retire the old generation;
6. remove/destroy the old generation after its settling allowance and retirement fade complete.

Requirements:

- invalid updates throw synchronously and preserve the previous pending/active graph;
- `DEFAULT_BPM = 120` is defined in one shared runtime constants module, and every schema with omitted BPM uses it instead of the current clock BPM;
- prospective timing is passed explicitly into construction rather than read from a prematurely mutated clock;
- generation construction and BPM installation behave atomically from the active graph's perspective;
- wrap every clock-driven engine listener (`prebar`, `bar`, and `stop`, plus any future clock event subscription) in one error boundary so no callback exception prevents `AudioClock.scheduler()` from installing its next timer;
- provide an explicit engine error reporting hook or consistently logged error path that tests can observe;
- schedule each bar with a bar-local duck collector and a small scheduling resource ledger;
- if bar scheduling fails, discard the collector without submitting automation, roll back newly scheduled future resources where possible, report the error, and return normally;
- define/document any resource that cannot participate in bar rollback rather than silently leaking it;
- `prepare()` continues to preload the latest valid pending snapshot;
- clock `bar`, MIDI, and destroy operations delegate to generation owners;
- clock `stop` delegates to the active generation and every retiring generation;
- the persistent output remains the only engine object connected directly to destination;
- analyser sees both active and retiring generation output during overlap.

**Acceptance criteria:**

- [ ] Invalid updates, clone failures, and caller mutation do not replace or alter an earlier valid pending snapshot or active generation.
- [ ] Last-valid-write wins before prebar.
- [ ] Committing a schema without BPM resets timing to `DEFAULT_BPM = 120`, including after a previous schema used a different BPM.
- [ ] Construction failures at multiple allocation stages clean partial resources, discard only the failing update, preserve BPM/active playback, and report an error.
- [ ] Failed prebar, bar, and stop callbacks are reported and do not halt subsequent clock scheduling.
- [ ] A partially failed bar submits no duck timeline and rolls back ledger-owned future resources.
- [ ] Old and new generated main buses can coexist while the old generation retires.
- [ ] Old buses wait exactly `0.1` audio seconds, fade through retirement gain for exactly `0.01` audio seconds, and disconnect only after `currentTime` reaches the endpoint.
- [ ] A suspended context pauses retirement completion, and destroy cancels the pending audio-time wait.
- [ ] Stop reaches active and all retiring generations.
- [ ] Existing MIDI, prepare, cache, analyser, and destroy tests remain covered.

---

## Phase 5: Persistent bus automation verification and audible refinement

Tracer bullet: the complete runtime Bus delivered in Phase 4 is verified across every accepted parameter source, stop/reset lifecycle, and bounded bar-envelope behavior before routes and sends depend on it.

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

### Step 7.1 — Implement the software-modeled exponential duck timeline

**Files:** `packages/audio-engine/src/buses/duck-automation.ts` (new), `packages/audio-engine/src/buses/duck-automation.test.ts` (new)

Represent duck automation as explicit constant and exponential segments. The model must analytically evaluate its value at any frame-derived time:

```ts
value = startValue * Math.pow(endValue / startValue, elapsed / duration);
```

Use exponential ramps for onset and recovery. The abstraction accepts already ordered absolute events rather than unresolved proportions:

```ts
type ResolvedDuckEvent = {
  triggerFrame: number;
  triggerTime: number;
  targetGain: number;
  onsetDuration: number;
  recoveryDuration: number;
};

schedule(events: ResolvedDuckEvent[]): void;
reset(time: number): void;
destroy(): void;
```

Requirements:

- derive requested gain before submission as `clamp(1 - sqrt(depth), 0.01, 1)`;
- zero depth produces no resolved event and does not disturb active automation;
- apply `MIN_RAMP` to resolved absolute onset/recovery durations;
- use `effectiveTarget = Math.min(gainAtTrigger, requestedTarget)`;
- build all events supplied together into one ordered, non-overlapping software timeline before installing Web Audio automation;
- when a later bar truncates a recovery scheduled by an earlier bar, analytically evaluate the old segment, cancel its future endpoint, and recreate the shortened endpoint using `exponentialRampToValueAtTime(valueAtTrigger, triggerTime)` before scheduling the retrigger;
- do not use `setValueAtTime()` in a way that changes the preceding ramp and do not depend on `cancelAndHoldAtTime()` returning a value;
- compact the model at least once per bar by pruning segments completed before `AudioContext.currentTime` while retaining an anchor/current segment and all future segments required for exact evaluation;
- timeline storage must remain bounded by active/future automation rather than total elapsed bars;
- callbacks/timeline state from one generation cannot affect another;
- reset/destruction cancel future automation and prevent later writes.

**Acceptance criteria:**

- [ ] Analytical constant/exponential values match scheduled curves at boundaries and intermediate times.
- [ ] Truncating a future ramp preserves its preceding exponential shape.
- [ ] Deep-to-shallow uses the current lower gain as effective target; shallow-to-deep reaches the deeper request.
- [ ] Same-batch and cross-bar retriggers restart recovery without stacking.
- [ ] Thousands of repeated bars keep timeline segment count bounded while preserving current/future values.
- [ ] Stop/reset returns gain to `1` with a safe exponential ramp.
- [ ] Destruction prevents every pending timeline operation from writing again.

### Step 7.2 — Collect, normalize, sort, and merge generation duck events

**Files:** `packages/audio-engine/src/graph-generation.ts`, `packages/audio-engine/src/buses/duck-events.ts` (new), `packages/audio-engine/src/buses/duck-events.test.ts` (new), `packages/audio-engine/src/buses/bus.ts`

Instrument scheduling returns or reports unresolved events to a per-bar collector; it never directly schedules target-bus automation. After every instrument has scheduled the bar, GraphGeneration flushes the collector.

Normalize trigger precision to audio sample frames:

```ts
triggerFrame = Math.round(startTime * audioContext.sampleRate);
triggerTime = triggerFrame / audioContext.sampleRate;
```

For each instrument, deduplicate events at one `triggerFrame` using the maximum scheduled event duration. Then expand each event's target records and resolve absolute timing:

```ts
onsetDuration = config.onset * eventDuration;
recoveryDuration = config.recovery * eventDuration;
targetGain = clamp(1 - Math.sqrt(config.depth), 0.01, 1);
```

Group expanded requests by target and trigger frame, sort chronologically, and merge equal-frame requests:

```ts
targetGain = Math.min(...targetGains);
onsetDuration = Math.min(...onsetDurations);
recoveryDuration = Math.max(...recoveryDurations);
```

Only then submit one ordered batch to each target Bus.

Requirements:

- sorting is independent of instrument/schema order, including direct schemas with unsorted patterns;
- minimum onset/maximum recovery merge absolute durations, never original proportions;
- all duck sources targeting one bus share that bus's single timeline;
- main remains unreachable by validated duck records;
- target processing precedes duck gain and self-inclusive ducking remains valid;
- stop resets active and retiring generation collectors/timelines.

**Acceptance criteria:**

- [ ] A later-listed instrument's offset `0.25` event schedules before an earlier instrument's offset `0.75` event.
- [ ] Equal-frame events with different event durations merge resolved seconds correctly.
- [ ] Floating-point times within one sample frame group together; adjacent frames remain distinct.
- [ ] Equal-frame results are independent of instrument order.
- [ ] Old triggers cannot duck same-named buses in a new generation.

### Step 7.3 — Share instrument onset event production

**Files:** `packages/audio-engine/src/instruments/duck-events.ts` (new), `packages/audio-engine/src/instruments/duck-events.test.ts` (new), `packages/audio-engine/src/instruments/synthesizer.ts`, `packages/audio-engine/src/instruments/sampler.ts`

Create one synth/sampler event abstraction using scheduled pattern timing:

```ts
type InstrumentDuckEvent = {
  startTime: number;
  duration: number;
  targets: Record<string, DuckSchema>;
};
```

Both instrument types report resolved, unmasked event onsets to the generation collector. Shared normalization groups by sample-frame onset and retains the maximum event duration; voice creation remains instrument-specific.

Requirements:

- use `startTime = barStartTime + note.offset * barDuration` and `duration = note.duration * barDuration`;
- muted instruments still report events;
- random/masked patterns report only resolved non-rest events;
- separate sample-frame offsets report separately;
- zero-depth-only target records may be skipped without disturbing active automation;
- MIDI output and audio voice scheduling remain independent.

**Acceptance criteria:**

- [ ] Synth chords and polyphonic sampler events use the same deduplication path.
- [ ] Simultaneous differing durations select the maximum before target timing resolution.
- [ ] Offset events report at each distinct sample frame.
- [ ] Masked/rest events report none.
- [ ] Mute does not suppress event reporting.

### Step 7.4 — Emit sampler duck events independently of source availability

**Files:** `packages/audio-engine/src/instruments/sampler.ts`, sampler tests

Refactor sampler event resolution so duck dispatch occurs after the pattern event is known but before these audio-only early exits:

- no initial buffer loaded;
- no playback source for resolved variation/key;
- invalid or unavailable source window.

Use scheduled pattern-event duration, never clipped/playback duration.

Requirements:

- report events through the shared Step 7.3 abstraction before audio-only early exits;
- preserve alternate playback-direction state: a duck-only event caused by unavailable audio must not incorrectly advance audible alternation unless current event semantics explicitly require it;
- masked/random/static note paths share event logic;
- sample fit, pitch, region, clip mode, loop, and one-shot duration do not change duck timing;
- avoid duplicate reporting when source playback succeeds;
- simultaneous sampler polyphony uses maximum-duration sample-frame deduplication.

**Acceptance criteria:**

- [ ] Missing initial and per-note buffers still produce duck events.
- [ ] Audible notes produce exactly one event per deduplicated onset.
- [ ] Pattern duration controls duck timing across clip/one-shot/loop cases.
- [ ] Mute suppresses audio through the graph but not event dispatch.
- [ ] Existing sampler direction/variation behavior remains covered.

### Step 7.5 — Complete duck transport/lifecycle tests

**Files:** bus, graph-generation, engine, synth, and sampler tests

**Acceptance criteria:**

- [ ] Stop cancels future duck events and automation in the active generation and every retiring generation.
- [ ] Stop restores every active/retiring generation duck gain to unity.
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

- [ ] Finite positive BPM validation and omitted-BPM defaulting to `120` without inheriting the previous sketch's BPM.
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
- [ ] LFO intrinsic-value neutralization and per-voice parameter-edge cleanup.
- [ ] MIDI/LFO cleanup for active, retiring, and destroyed generations.
- [ ] Transactional partial-construction cleanup and commit error containment.
- [ ] Schema snapshot isolation from caller mutation.
- [ ] Active and retiring generation stop delegation.
- [ ] Exact audio-time filter settling and retirement output fade, including suspended-context behavior.
- [ ] Error containment for every clock callback and partial-bar collector/resource rollback.

#### Bus automation

- [ ] Static/random cycle resolution by bar.
- [ ] Persistent LFO phase/update behavior.
- [ ] MIDI CC updates and cleanup.
- [ ] Bounded one-bar envelopes, minimum ramps, stop reset.

#### Ducking

- [ ] Square-root target curve and minimum target gain.
- [ ] Event-relative onset/recovery and minimum ramps.
- [ ] Zero-depth no-op.
- [ ] Software-modeled exponential ramps and analytically reconstructed truncation.
- [ ] Non-stacking deep-to-shallow and shallow-to-deep retriggers.
- [ ] Shared synth/sampler sample-frame onset deduplication with maximum event duration.
- [ ] Global cross-instrument ordering and deterministic equal-frame absolute-duration merging.
- [ ] Long-running timeline compaction keeps storage bounded.
- [ ] Distinct offset frames.
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
- [ ] Duck depth and proportional recovery feel consistent across note lengths and valid BPMs.
- [ ] Re-evaluation permits old releases and the bounded filter-settling/fade window to finish without routing into new buses.
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
- AudioEngine defensively validates graph shapes, clones accepted schemas, and validates owned snapshots before changing pending/active state;
- every commit is transactional, failure-contained, and owns an isolated graph generation;
- retired generations receive stop events, bounded filter settling, and a final output fade;
- buses host existing effects and all agreed parameter sources;
- primary routes and post-mute sends satisfy the connection invariants;
- event-triggered ducking satisfies global ordering, sample-frame merging, exponential timeline, retrigger, mute, sampler, stop, and lifecycle semantics;
- focused and workspace checks pass;
- the manual topology and envelope reviews find no unresolved correctness issue;
- deferred capabilities remain documented rather than partially implemented.
