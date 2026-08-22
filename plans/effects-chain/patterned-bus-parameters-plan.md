# Patterned Bus Parameters Implementation Plan

## Context

This plan implements SOW 2 from [`bus-followup-roadmap.md`](bus-followup-roadmap.md) as small vertical slices. Each phase adds one independently testable capability while preserving the bus/routing topology delivered by [`bus-mvp-plan.md`](bus-mvp-plan.md) and the canonical graph contract completed in [`completed/bus-schema-hardening-plan.md`](completed/bus-schema-hardening-plan.md).

The current runtime accepts only one constant static value for each named-bus effect parameter. `RuntimeBus` applies that value when it constructs the effect node and never changes it. This SOW extends that proven path just far enough to resolve static and deterministic random values once per bar:

```text
Fluid parameter → DromeSchema → shared validation → RuntimeBus binding
                                                        │
clock bar index + exact audio time ─────────────────────┘
                                                        ↓
                                            AudioParam.setValueAtTime()
```

This is deliberately not a general automation system. Effect nodes remain persistent for the runtime graph lifetime, the engine continues to own bar dispatch, and instrument parameter behavior remains untouched. Do not extract a shared parameter manager, add a scheduler, or prepare lifecycle infrastructure for MIDI, LFOs, envelopes, patterned sends, or ducking during this plan.

## Key design decisions

- SOW 2 applies only to named-bus **effect parameters**. `BusSchema.gain` remains one constant number.
- Supported bus parameter schemas are `StaticSchema` and `RandomSchema`. Envelopes, LFOs, and MIDI CC remain invalid on buses.
- A bus parameter resolves exactly once per bar with `stepIndex = 0`.
- Static resolution selects `cycle[barIndex % cycle.length][0].value`. Additional steps in the selected row are intentionally ignored; this SOW does not schedule intra-bar changes.
- Random resolution reuses the existing deterministic `RandomResolver` with `(barIndex, 0)`. Do not duplicate random algorithms or seed semantics.
- Bus effect nodes and their `AudioParam` bindings are created once and retained by `RuntimeBus` until graph destruction.
- Values are installed with `AudioParam.setValueAtTime(value, barStartTime)` so they take effect at the exact clock boundary rather than callback execution time.
- A newly committed graph initializes every bus parameter for `upcomingBar` at the supplied `barStartTime`. When no start time is available, it initializes the intrinsic value synchronously for the same bar.
- Only the active runtime graph receives new bar scheduling. Retiring buses freeze at their last installed value while their existing voices finish.
- Stop cancels future scheduled bus values and holds the value audible at the stop time. It does not disconnect buses or modulation edges and does not destroy active or retiring graphs.
- Stop cleanup applies to both active and retiring buses because either graph may still be audible.
- Validation remains typed semantic validation of `DromeSchema`, not a runtime decoder for arbitrary `unknown` input.
- Invalid bus parameter schemas throw at the shared Schema boundary. Runtime resolution keeps a narrow invariant error for impossible post-validation states.
- Main effects, patterned sends, bus output-gain patterns, envelopes, LFOs, MIDI CC, and parameter-manager extraction remain out of scope.

---

## Phase 1: Canonical bar-resolvable bus parameters

Tracer bullet: Fluid can emit a multi-bar static named-bus effect parameter, and the shared graph validator accepts that canonical schema while continuing to reject unsupported automation types.

### Step 1.1 — Define and validate the supported schema subset

**Files:** `packages/schema/src/validate-graph.ts`, `packages/schema/src/validate-graph.test.ts`, `packages/schema/src/index.ts` if a shared type guard is warranted

Replace the constant-only bus parameter check with a focused bar-resolvable check.

Requirements:

- accept `StaticSchema` when its cycle contains at least one bar, every bar contains a step at index zero, and every value that can be selected at index zero is finite;
- accept `RandomSchema` when its grid and configuration can deterministically produce a finite value at `stepIndex = 0` for every represented bar;
- reject envelopes, LFOs, and MIDI CC with contextual bus/effect/parameter paths;
- reject empty static cycles and empty selected rows before they can reach modulo or indexed access in AudioEngine;
- reject random schemas with empty segments, empty grids, empty selected rows, non-finite ranges/value maps, or other configuration that cannot safely resolve step zero;
- retain existing bus name, gain, main-effect, route, send, and range validation unchanged;
- use terminology such as “bar-resolvable static or random parameter” rather than the old “one finite constant static value” error;
- export a schema predicate only if both validation and AudioEngine need exactly the same narrowing; do not create a general decoder abstraction.

**Acceptance criteria:**

- [ ] Constant and multi-bar static bus effect parameters pass shared validation.
- [ ] Deterministic random bus effect parameters pass shared validation.
- [ ] Empty or non-finite static/random configurations fail with the exact bus effect parameter path.
- [ ] Envelope, LFO, and MIDI CC bus parameters remain rejected.
- [ ] Existing graph validation behavior outside bus effect parameter kinds is unchanged.
- [ ] Schema build, check, lint, and tests pass.

### Step 1.2 — Confirm Fluid’s existing authoring path emits canonical patterns

**Files:** `packages/fluid/src/buses/bus.test.ts`, `packages/fluid/src/index.test.ts`, effect tests only if existing coverage cannot express the behavior

Use the existing `Parameter` and random authoring APIs rather than adding a bus-specific pattern builder.

Requirements:

- demonstrate a named bus gain effect with a multi-bar static parameter;
- demonstrate at least one patterned filter parameter;
- demonstrate a deterministic random parameter on a named-bus effect;
- verify constant bus effects serialize exactly as before;
- verify bus output `.gain()` remains a finite constant number;
- avoid changing `GainEffect`, `Filter`, `Parameter`, or random builders unless a test exposes an actual serialization defect.

**Acceptance criteria:**

- [ ] Existing Fluid syntax serializes multi-bar static bus effect parameters canonically.
- [ ] Existing Fluid syntax serializes deterministic random bus effect parameters canonically.
- [ ] Constant bus effect and bus output-gain schemas remain unchanged.
- [ ] Fluid build, check, lint, and tests pass.

---

## Phase 2: Persistent runtime bindings and static bar scheduling

Tracer bullet: one persistent named-bus effect node receives the correct static value at each exact bar boundary without reconstruction or instrument changes.

### Step 2.1 — Retain effect parameter bindings in RuntimeBus

**Files:** `packages/audio-engine/src/buses/runtime-bus.ts`, `packages/audio-engine/src/buses/runtime-bus.test.ts`

Refactor effect construction so `RuntimeBus` retains the minimal relationship between each supported schema and its target `AudioParam`.

A binding may be shaped locally along these lines:

```ts
interface BusParameterBinding {
  target: AudioParam;
  schema: ParameterSchema;
}
```

Requirements:

- retain bindings for gain effect `gain` and filter `frequency`, `Q`, `detune`, and `gain`;
- preserve effect order and the existing serial audio-node topology;
- keep `buildEffect()` and any stateless resolution helpers file-local rather than turning them into instance methods without state;
- initialize constant schemas to the same audible value as today;
- do not retain bindings for `BusSchema.gain`;
- do not introduce a parameter host, automation class hierarchy, or engine-wide registry;
- preserve idempotent node disconnection in `destroy()`.

**Acceptance criteria:**

- [ ] Every supported gain/filter parameter has one retained target binding.
- [ ] Effect node identity and serial connection order are unchanged.
- [ ] Constant parameters initialize exactly as before.
- [ ] Bus output gain remains constant and outside the binding list.
- [ ] RuntimeBus destruction remains idempotent.

### Step 2.2 — Resolve and schedule static values by bar

**Files:** `packages/audio-engine/src/buses/runtime-bus.ts`, `packages/audio-engine/src/buses/runtime-bus.test.ts`

Add a narrow method such as:

```ts
scheduleBar(barIndex: number, startTime?: number): void;
```

Requirements:

- resolve static values from `cycle[barIndex % cycle.length][0]`;
- always use step zero even when the selected row contains additional steps;
- wrap multi-bar cycles deterministically;
- when `startTime` is defined, call `setValueAtTime(value, startTime)` on every target;
- when `startTime` is undefined during construction, assign the target’s intrinsic value synchronously;
- initialize a new RuntimeBus for its supplied starting bar rather than assuming bar zero;
- keep one effect node and one target `AudioParam` across every scheduled bar;
- throw one narrow RuntimeBus invariant error if a schema bypasses validation or cannot resolve.

**Acceptance criteria:**

- [ ] Static cycles select and wrap by bar index.
- [ ] Multi-step rows resolve only `stepIndex = 0`.
- [ ] Every value is scheduled at the exact supplied audio time.
- [ ] Construction at a nonzero starting bar installs that bar’s value.
- [ ] Missing construction time initializes synchronously and deterministically.
- [ ] Scheduling never reconstructs or reconnects an effect node.

### Step 2.3 — Dispatch active graph bars from AudioEngine

**Files:** `packages/audio-engine/src/index.ts`, `packages/audio-engine/src/engine.test.ts`, focused graph-generation tests if needed

Extend the existing clock ownership rather than creating another scheduler.

Requirements:

- pass `upcomingBar` and `barStartTime` into each RuntimeBus created during commit;
- from the existing `bar` listener, call `scheduleBar(bar, time)` for every bus in `_activeGraph`;
- leave instrument `scheduleBar()` calls and ordering behavior unchanged;
- never schedule a retiring graph from later bar events;
- preserve graph replacement, routing, main gain, and last-valid-pending behavior;
- avoid adding lifecycle methods to `RuntimeGraph`; it remains a plain ownership structure.

**Acceptance criteria:**

- [ ] A committed graph initializes bus effects for the upcoming bar.
- [ ] Active buses receive subsequent bars with the clock’s exact time.
- [ ] Instrument scheduling behavior remains unchanged.
- [ ] Retiring buses receive no new bar values after replacement.
- [ ] Main remains the only node connected directly to destination.

---

## Phase 3: Deterministic random resolution

Tracer bullet: a persistent named-bus parameter resolves the existing seeded random schema once per bar and produces the same value for the same bar regardless of callback repetition.

### Step 3.1 — Reuse RandomResolver for bus bindings

**Files:** `packages/audio-engine/src/buses/runtime-bus.ts`, `packages/audio-engine/src/buses/runtime-bus.test.ts`, `packages/audio-engine/src/resolvers/random-resolver.ts` only if a demonstrated reusable API adjustment is required

Add per-schema random resolver ownership to `RuntimeBus`.

Requirements:

- instantiate or lazily memoize one `RandomResolver` per `RandomSchema` object owned by the bus;
- resolve with `(barIndex, 0)` for every random binding;
- preserve current seed segments, algorithms, masks, ranges, quantization, chance, and value-map semantics;
- repeated scheduling of the same bar must produce the same value;
- bar order must not alter the deterministic result for a given schema and bar;
- do not move instrument resolver maps or `_resolve()` methods into shared infrastructure;
- do not modify random generation semantics merely to simplify bus scheduling.

**Acceptance criteria:**

- [ ] Random bus values are deterministic for a schema and bar.
- [ ] Random resolution always uses step zero.
- [ ] Segment and cycle behavior matches the existing `RandomResolver` contract.
- [ ] Repeated scheduling does not create additional resolvers or nodes.
- [ ] Instrument random-resolution tests remain unchanged and pass.

### Step 3.2 — Cover all supported effect destinations

**Files:** `packages/audio-engine/src/buses/runtime-bus.test.ts`, `packages/audio-engine/src/engine.test.ts`

Exercise static and random resolution across the complete SOW 2 parameter surface.

Requirements:

- cover gain effect `gain`;
- cover filter `frequency`, `Q`, `detune`, and `gain`;
- combine constant, multi-bar static, and random bindings in one persistent chain;
- verify scheduled values and times without asserting implementation-private collection shapes;
- retain a focused runtime invariant test for an unvalidated unsupported parameter.

**Acceptance criteria:**

- [ ] Every gain/filter AudioParam supports constant, static-cycle, and random resolution.
- [ ] Mixed parameter kinds schedule independently on the same bar.
- [ ] Effect ordering and routing are unchanged under patterned values.
- [ ] Invalid post-validation runtime input fails explicitly rather than partially scheduling a chain.

---

## Phase 4: Stop semantics and lifecycle containment

Tracer bullet: stopping transport cancels future bus values while active and retiring audio keeps its currently audible parameter values and graph ownership.

### Step 4.1 — Cancel future scheduled values without disconnecting buses

**Files:** `packages/audio-engine/src/buses/runtime-bus.ts`, `packages/audio-engine/src/buses/runtime-bus.test.ts`

Add a focused stop operation such as:

```ts
stop(time: number): void;
```

Requirements:

- cancel future scheduled values for every retained target at the supplied audio time;
- hold the value audible at that time using the appropriate Web Audio automation operation;
- do not reset parameters to schema bar zero, an arbitrary default, or unity;
- do not disconnect effect nodes, bus inputs, outputs, or active voice paths;
- make repeated stop calls safe;
- allow later `scheduleBar()` calls after restart to install new values normally;
- keep destruction separate from transport stop.

**Acceptance criteria:**

- [ ] Future scheduled bus values are removed at stop time.
- [ ] The currently audible value is held without an abrupt reset.
- [ ] Stop does not disconnect or destroy any bus node.
- [ ] Repeated Stop and later scheduling remain safe.
- [ ] Existing active-voice Stop/LFO regression behavior remains unchanged.

### Step 4.2 — Apply Stop cleanup to active and retiring graphs

**Files:** `packages/audio-engine/src/index.ts`, `packages/audio-engine/src/engine.test.ts`

Extend the existing clock `stop` listener.

Requirements:

- call `stop(this._ctx.currentTime)` for every active bus;
- call the same operation for every retiring bus because retiring voices may still be audible;
- retain existing future-note cancellation and MIDI output scheduler Stop behavior;
- do not retire, destroy, or disconnect a graph because transport stopped;
- preserve active-voice completion cleanup and graph replacement isolation.

**Acceptance criteria:**

- [ ] Active and retiring buses cancel future parameter values on Stop.
- [ ] Active and retiring instruments retain their existing Stop behavior.
- [ ] Stop does not alter graph retirement ownership.
- [ ] Destroy still cleans active and retiring graphs exactly once.

---

## Phase 5: Integration, documentation, and closeout

Tracer bullet: the same Fluid-authored and direct-schema reference graph evolves gain/filter parameters deterministically by bar without changing routes, sends, main ownership, or instrument behavior.

### Step 5.1 — Add canonical end-to-end coverage

**Files:** `packages/fluid/src/index.test.ts`, `packages/audio-engine/src/engine.test.ts`, `packages/audio-engine/src/graph-generation.test.ts` only where topology assertions already belong

Use one compact reference graph with:

- a named primary-route bus;
- a named send bus;
- a multi-bar static gain or filter parameter;
- a deterministic random gain or filter parameter;
- at least one instrument routed directly to main;
- more than one bar of scheduling;
- graph replacement and Stop.

Requirements:

- verify Fluid output passes the same validator as direct schema input;
- verify values change at exact bar times;
- verify the same bar resolves identically from Fluid and direct schemas;
- verify primary routes remain exclusive and sends remain post-mute;
- verify no named bus connects directly to destination;
- verify replacement freezes retiring bus parameters and new buses begin at the upcoming bar;
- verify caller mutation and invalid-update behavior from SOW 1 remain intact.

**Acceptance criteria:**

- [ ] Fluid and direct schemas produce equivalent patterned bus behavior.
- [ ] Multi-bar static and seeded random values resolve correctly across replacement.
- [ ] Canonicalization introduces no dry duplication or send-tap change.
- [ ] Main remains the only node connected directly to destination.
- [ ] Pending-state cloning and last-valid-write behavior remain intact.

### Step 5.2 — Document the supported behavior and explicit limits

**Files:** `packages/fluid/README.md`, `packages/audio-engine/README.md`, `plans/effects-chain/bus-followup-roadmap.md`

Document:

- named-bus effect parameters may use static cycles and deterministic random patterns;
- values resolve once per bar with step zero;
- extra intra-bar steps are ignored for bus parameters;
- exact-time scheduling and persistent effect-node behavior;
- bus output gain remains constant;
- retiring buses freeze at their last value;
- Stop holds current values and cancels future values;
- envelopes, LFOs, MIDI CC, patterned sends, and main effects remain unsupported;
- direct schemas are subject to shared semantic validation.

Link this detailed plan from SOW 2 in the roadmap. After closeout, move this file to `plans/effects-chain/completed/` and update the roadmap link rather than leaving completion status ambiguous.

**Acceptance criteria:**

- [ ] Fluid documentation explains authoring syntax and bar-level resolution.
- [ ] AudioEngine documentation explains scheduling, Stop, and retirement semantics.
- [ ] Unsupported automation kinds are explicit.
- [ ] The roadmap points to this implementation plan.

### Step 5.3 — Required automated verification

Run after all slices are complete:

- [ ] `pnpm --filter @web-audio/schema build`
- [ ] `pnpm --filter @web-audio/schema check`
- [ ] `pnpm --filter @web-audio/schema lint`
- [ ] `pnpm --filter @web-audio/schema test:ci`
- [ ] `pnpm --filter @web-audio/fluid build`
- [ ] `pnpm --filter @web-audio/fluid check`
- [ ] `pnpm --filter @web-audio/fluid lint`
- [ ] `pnpm --filter @web-audio/fluid test:ci`
- [ ] `pnpm --filter @web-audio/audio-engine build`
- [ ] `pnpm --filter @web-audio/audio-engine check`
- [ ] `pnpm --filter @web-audio/audio-engine lint`
- [ ] `pnpm --filter @web-audio/audio-engine test:ci`
- [ ] `pnpm check`
- [ ] `pnpm lint`
- [ ] `pnpm test`

### Step 5.4 — Required focused manual review

Use a short sketch with an obvious alternating filter cutoff or gain pattern and a seeded random parameter.

- [ ] Values change on bar boundaries rather than callback execution time.
- [ ] Static cycles wrap at the expected bar.
- [ ] Seeded random behavior repeats after replay/reconstruction.
- [ ] No click or dry duplication is introduced by parameter changes at ordinary values.
- [ ] Stopping before a scheduled boundary does not allow the future value to arrive afterward.
- [ ] Existing voices remain audible through Stop according to current semantics.
- [ ] Replacing a sketch does not continue evolving the retiring bus.
- [ ] Instrument effects, envelopes, LFOs, MIDI, routes, and sends sound unchanged.

---

## Closeout constraints

This SOW is complete only when named-bus gain/filter effect parameters evolve deterministically once per bar and all existing topology and instrument semantics remain intact.

Do not expand closeout to include:

- intra-bar bus automation;
- patterned bus output gain;
- patterned sends;
- shared parameter-manager extraction;
- envelopes, LFOs, or MIDI CC on buses;
- retirement fades or tail infrastructure;
- main effects;
- bus-to-bus routing;
- broad engine commit or clock refactors.

If implementation requires changing unrelated voice, sampler, MIDI, LFO, transport, or routing behavior, stop and split that work into a separately approved plan rather than enlarging this SOW.
