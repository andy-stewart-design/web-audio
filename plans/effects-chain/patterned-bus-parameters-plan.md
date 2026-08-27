# Patterned Bus Parameters Implementation Plan

## Context

This plan implements SOW 2 from [`bus-followup-roadmap.md`](bus-followup-roadmap.md) as end-to-end vertical slices. It preserves the topology delivered by [`completed/bus-mvp-plan.md`](completed/bus-mvp-plan.md) and the canonical contract from [`completed/bus-schema-hardening-plan.md`](completed/bus-schema-hardening-plan.md).

The current runtime accepts one constant static value for each named-bus effect parameter. `RuntimeBus` installs that value during construction and never changes it. This SOW extends that path just far enough to resolve static and deterministic random values once per bar:

```text
Fluid authoring → DromeSchema → shared validation → RuntimeBus binding
                                                        │
clock bar index + exact audio time ─────────────────────┘
                                                        ↓
                                      minimum linear smoothing ramp
```

This is not a general automation system. Effect nodes remain persistent for the runtime graph lifetime, AudioEngine continues to own bar dispatch, and instrument parameter behavior remains untouched.

## Key design decisions

- SOW 2 applies only to named-bus **effect parameters**. `BusSchema.gain` remains one constant number.
- Supported bus parameter schemas are `StaticSchema` and a focused bus-resolvable subset of `RandomSchema`.
- Envelopes, LFOs, and MIDI CC remain invalid on buses.
- A bus parameter resolves once per bar with `stepIndex = 0`.
- Static resolution selects `cycle[barIndex % cycle.length][0].value`.
- Additional steps in a selected row are ignored; this SOW does not schedule intra-bar changes.
- Random resolution reuses `RandomResolver.resolve(barIndex, 0)` without changing its algorithms or instrument behavior.
- Bus nodes and parameter bindings persist until graph destruction.
- After first initialization, values begin a `MIN_RAMP * 2` linear transition at the exact bar boundary and reach their target 5 ms later; hard parameter jumps are unacceptable.
- Construction initializes a new graph for `upcomingBar`. Identical `(barIndex, startTime)` scheduling is idempotent so the following bar callback cannot install the first event twice.
- Only active buses receive new bar scheduling. Retiring buses freeze at their last installed value.
- Stop calls `AudioParam.cancelAndHoldAtTime(stopTime)` on active and retiring bus bindings.
- Each scheduling call resolves and verifies every binding before applying any value.
- Validation remains typed semantic validation, not decoding of arbitrary `unknown` input.
- No shared parameter manager, custom scheduler, or speculative lifecycle abstraction is introduced.

## Authoring semantics

Fluid patterns distinguish bars from steps within one bar:

```ts
d.lpf(400, 800); // two bars: bar 0 → 400, bar 1 → 800
d.lpf([400, 800]); // two intra-bar steps; a bus resolves only the first
```

SOW 2 adds the same parameter-input capability to gain effects:

```ts
d.gain(0.5); // constant
d.gain(0.5, 1, 0.75); // three bars
d.gain([0.5, 1, 0.75]); // intra-bar steps; a bus uses only 0.5
d.gain(randomCycle); // deterministic random value by bar
d.gain(envelope);
d.gain(lfo);
d.gain(midiCc);
```

The expanded gain API preserves existing constant, envelope, LFO, and MIDI serialization. The shared bus validator still rejects envelope, LFO, and MIDI gain effects when they are placed on buses.

## Supported parameter surface

Patterning applies to these named-bus effect fields:

- gain effect `gain`;
- filter `frequency`;
- filter `Q`;
- filter `detune`;
- filter `gain`.

It does not apply to:

- `BusSchema.gain`;
- main;
- sends;
- instrument parameters beyond their existing behavior.

## Runtime design

### Persistent bindings

`RuntimeBus` retains a file-local binding for each supported effect parameter:

```ts
interface BusParameterBinding {
  target: AudioParam;
  schema: ParameterSchema;
}
```

The binding and target node remain stable for the graph lifetime. `BusSchema.gain` is not a binding.

### Static resolution

Static values resolve as:

```ts
schema.cycle[barIndex % schema.cycle.length][0].value;
```

Every selected row must contain a first entry and that entry must be finite. Additional entries are valid but ignored by bus scheduling.

### Random resolution

`RuntimeBus` owns or memoizes one `RandomResolver` per `RandomSchema` object and calls:

```ts
resolver.resolve(barIndex, 0);
```

Repeated resolution of the same schema and bar must be deterministic. This SOW does not change `RandomResolver` behavior for instruments.

### Atomic binding application

Each `scheduleBar()` call has two stages:

1. Resolve every binding and verify every result is finite.
2. Only after all resolution succeeds, initialize or schedule any target.

If an invalid schema bypasses shared validation, `RuntimeBus` throws its narrow invariant error without partially scheduling the effect chain.

### First-bar idempotence

Construction initializes bindings for `upcomingBar` at `barStartTime`. The later clock `bar` callback may describe the same boundary.

`RuntimeBus.scheduleBar()` must therefore ignore an exact duplicate `(barIndex, startTime)` request. The key includes both values so a Stop/restart at the same bar with a different audio time still schedules normally.

Tests must establish:

- first bar scheduled once;
- later bars scheduled once;
- replacement graph initialized once;
- scheduling after Stop/restart still works.

### Missing construction time

If construction has no `barStartTime`, RuntimeBus resolves the supplied starting bar and initializes target intrinsic values synchronously. A later timed scheduling call is not considered a duplicate of this untimed initialization.

### Replacement and retirement

Only `_activeGraph.buses` receive bar callbacks. After replacement, retiring buses:

- remain connected while their voices finish;
- receive no future bar scheduling;
- freeze at their last installed value;
- are destroyed through existing graph retirement ownership.

### Stop

`RuntimeBus.stop(stopTime)` calls:

```ts
parameter.cancelAndHoldAtTime(stopTime);
```

for every binding in active and retiring buses.

No compatibility fallback is required for this SOW. Add one only if supported target environments demonstrate a concrete need and its audible semantics are separately approved.

Stop does not disconnect nodes, reset values, destroy graphs, or alter active-voice LFO semantics. Later bar scheduling can install values normally.

## Focused bus-resolvable random contract

This SOW validates only what is needed to execute random bus parameters safely. It does not globally harden every use of `RandomSchema`.

### Intrinsic safety required by RandomResolver

For a random schema used by a bus, reject configuration that can cause runtime failure or non-finite output, including:

- missing or empty segments;
- non-finite seeds;
- segment lengths that are not positive finite integers where a period is required;
- non-finite range endpoints or a non-finite numeric span;
- reversed ranges remain valid to preserve the existing directional mapping contract;
- zero, negative, or non-finite quantization;
- non-finite or out-of-domain chance configuration;
- empty or non-finite value maps;
- value maps that can be indexed unsafely by the configured data type and mapper.

### Bus-specific resolvability

Additionally require:

- a non-empty grid cycle;
- every represented grid bar to contain a first entry;
- finite first-entry grid values;
- a finite result from `resolve(barIndex, 0)` for the finite represented configuration.

An empty random row may legitimately mean silence for notes or rhythmic masks. The non-empty-row rule therefore applies only when a random schema is used as a bus effect parameter.

Schema validation establishes these guarantees structurally from the declared schema. It must not import or execute AudioEngine's `RandomResolver`. Runtime resolution performs the final finite-result invariant check before applying any binding values.

### Representative accepted cases

- one unbounded seed segment with a valid non-empty grid;
- multiple positive finite integer segment lengths;
- finite ascending, equal-endpoint, or reversed float/integer ranges whose span is finite;
- positive finite quantization;
- non-empty finite value map with safe indexing;
- grid rows with multiple steps, where only the first is resolved for buses.

### Representative rejected cases

- no segments;
- multiple segments whose total period is zero;
- non-finite seed;
- zero, negative, fractional, or non-finite segment length;
- finite range endpoints whose subtraction overflows to a non-finite span;
- empty grid cycle or empty grid row;
- zero/non-finite quantization;
- non-finite range endpoint;
- invalid chance;
- empty or non-finite value map;
- configuration that resolves `(barIndex, 0)` to `undefined` or a non-finite number.

## Separate follow-up: global RandomSchema hardening

Do not broaden this SOW into changing random behavior across instruments or globally rejecting intentionally empty rhythmic bars.

Record global random hardening as separate future work spanning:

- `@web-audio/patterns` builder-time validation;
- shared Schema semantic validation;
- direct AudioEngine input;
- compatibility review for existing instrument note, mask, and rhythm semantics.

Fluid-only validation is insufficient because direct schemas can bypass Fluid.

---

## Phase 0 — Normalize Fluid gain-effect authoring

**Purpose:** Make gain effects capable of expressing the same parameter inputs as filters before the static vertical slice uses them.

This is an independently releasable Fluid authoring correction because instrument gain effects already execute static and random parameter schemas. Bus validation continues rejecting patterned gain effects until Phase 1 or Phase 2 adds the matching bus runtime capability.

**Files:**

- `packages/fluid/src/effects/gain.ts`
- `packages/fluid/src/index.ts`
- relevant public input types
- focused Fluid tests

**Requirements:**

- correct the stale public typing for already-working intra-bar arrays and `RandomCycle` inputs;
- make `d.gain()` and `GainEffect` variadic so multi-bar static values are forwarded rather than discarded;
- use the established `AudioParamInput` and parameter source conventions;
- preserve constants, envelopes, LFOs, and MIDI CC;
- match filter parameter-input ergonomics where applicable;
- do not create a bus-specific gain builder;
- keep generated `GainEffectSchema` canonical.

**Acceptance criteria:**

- [x] Existing constant gain syntax and schema output are unchanged.
- [x] Existing envelope, LFO, and MIDI gain syntax remains unchanged.
- [x] Multi-bar and intra-bar static gain inputs serialize correctly.
- [x] Random gain inputs serialize correctly.
- [x] Gain and filter use the same established pattern-input terminology.
- [x] Phase 0 remains safe independently because bus validation still rejects patterned parameters.

---

## Phase 1 — Static bus parameters end to end

**Tracer bullet:** Fluid authors a static patterned gain/filter bus parameter, shared validation accepts it, one persistent RuntimeBus binding resolves it, and AudioEngine schedules it exactly once at each bar.

All Phase 1 bus validation, runtime binding, and engine dispatch changes must land atomically. The numbered steps guide implementation and review; none is an independently safe merge boundary because validation must not accept schemas RuntimeBus cannot execute.

### 1.1 Authoring and validation

- Complete Phase 0 gain authoring changes.
- Add Fluid serialization coverage for static gain and filter patterns.
- Replace constant-only bus validation with static bar-resolvable validation.
- Accept non-empty static cycles whose represented rows have finite first entries.
- Continue rejecting random and other automation until Phase 2 is complete.
- Preserve all graph validation outside bus effect parameter kinds.

### 1.2 Persistent static bindings

- Retain target/schema bindings for all supported gain/filter fields.
- Preserve effect order, node identity, and serial topology.
- Resolve static values by bar with fixed step zero.
- Resolve and verify all bindings before applying any value.
- Initialize the first timed value with `setValueAtTime()` while the new graph is silent.
- Hold the prior value through the boundary, then smooth subsequent changes over `MIN_RAMP * 2`.
- If scheduling arrives late, begin at the current audio time and preserve the full 5 ms ramp rather than introducing a hard jump.
- Initialize untimed construction synchronously.
- Keep `BusSchema.gain` constant and outside the bindings.

### 1.3 Engine dispatch and first-bar ownership

- Pass `upcomingBar` and `barStartTime` into RuntimeBus construction.
- Dispatch active buses from the existing `bar` listener.
- Make identical `(barIndex, startTime)` scheduling idempotent.
- Leave instrument scheduling unchanged.
- Do not schedule retiring buses.

**Acceptance criteria:**

- [x] Static gain/filter patterns work end to end from Fluid and direct schemas.
- [x] Static cycles wrap by bar and always use step zero.
- [x] Every represented static row has a finite first value.
- [x] Invalid runtime input cannot partially schedule bindings.
- [x] First, later, and replacement bars are each installed once.
- [x] Replacement starts from the upcoming nonzero bar.
- [x] Effect nodes and routing remain unchanged across bars.
- [x] Random, envelope, LFO, and MIDI bus parameters remain rejected.
- [x] Schema, Fluid, and AudioEngine checks pass at phase closeout.

---

## Phase 2 — Random bus parameters end to end

**Tracer bullet:** Fluid authors a deterministic random bus parameter, bus-specific shared validation accepts its safe subset, and RuntimeBus resolves it once per bar without changing instrument random behavior.

All Phase 2 authoring, validation, and runtime resolution changes must land atomically. Steps 2.1 and 2.2 are not independent merge boundaries: shared validation must not accept random bus schemas until RuntimeBus can resolve them safely.

### 2.1 Authoring and bus-specific validation

- Add Fluid random gain/filter bus serialization tests.
- Validate the focused intrinsic and bus-resolvability rules above.
- Accept safe `RandomSchema` values only for bus effect parameters.
- Keep empty-row rejection contextual to bus usage.
- Do not alter global `RandomSchema` semantics or instrument validation.

### 2.2 Runtime random resolution

- Reuse `RandomResolver` without duplicating algorithms.
- Own or memoize one resolver per random schema in RuntimeBus.
- Resolve with `(barIndex, 0)`.
- Verify every result is finite during the resolve-all stage.
- Preserve atomic application across mixed static/random bindings.

**Acceptance criteria:**

- [ ] Safe random gain/filter patterns work end to end.
- [ ] Same schema and bar always produce the same value.
- [ ] Random resolution always uses step zero.
- [ ] Mixed static/random chains apply atomically.
- [ ] Empty bus random rows and unsafe configurations fail contextually.
- [ ] Intentionally empty instrument rhythm/mask rows remain valid and unchanged.
- [ ] Existing `RandomResolver` and instrument tests pass without semantic rewrites.

---

## Phase 3 — Stop behavior

**Tracer bullet:** Stop cancels future bus automation while preserving the currently audible values and all active/retiring graph connections.

### 3.1 RuntimeBus Stop

- Add `stop(stopTime)`.
- Call `cancelAndHoldAtTime(stopTime)` on every binding.
- Keep repeated Stop safe.
- Clear or update scheduling-idempotence state so restart at a new audio time schedules normally.
- Do not disconnect, reset, or destroy nodes.

### 3.2 Engine Stop dispatch

- Use the exact time supplied by the clock event: `clock.on("stop", (_metronome, time) => ...)`.
- Pass that event time to every bus rather than reading `this._ctx.currentTime` independently.
- Call bus Stop for `_activeGraph` and every retiring graph.
- Preserve existing future-note cancellation and MIDI scheduler behavior.
- Preserve active-voice LFO and completion semantics.

**Acceptance criteria:**

- [ ] Active and retiring buses cancel future values at the supplied time.
- [ ] Currently audible values are held rather than reset.
- [ ] Stop does not disconnect or destroy bus nodes.
- [ ] Repeated Stop is safe.
- [ ] Stop/restart can schedule the same bar at a new time.
- [ ] Existing active-voice Stop/LFO regression tests remain valid.

---

## Phase 4 — Integration, documentation, and closeout

### 4.1 Canonical integration coverage

Use equivalent Fluid and direct schemas containing:

- a named primary-route bus;
- a named send bus;
- static gain/filter patterns;
- a deterministic random gain/filter parameter;
- an instrument routed directly to main;
- multiple bars;
- graph replacement at a nonzero bar;
- Stop and restart.

Verify:

- first and later boundaries schedule once;
- direct and Fluid schemas resolve equivalently;
- retiring buses freeze after replacement;
- primary routes remain exclusive;
- sends remain post-mute;
- main remains the only destination-connected node;
- caller-mutation and last-valid-write guarantees remain intact.

### 4.2 Documentation

Document:

- static and deterministic random named-bus effect parameters;
- bar-level versus intra-bar Fluid syntax;
- fixed step-zero bus resolution;
- click-free 5 ms smoothing beginning at the exact boundary, plus first-bar idempotence;
- persistent nodes and frozen retiring buses;
- `cancelAndHoldAtTime()` Stop behavior;
- constant bus output gain;
- unsupported envelopes, LFOs, MIDI CC, patterned sends, and main effects;
- the separate global random-hardening follow-up.

After closeout, move this plan to `plans/effects-chain/completed/` and update the roadmap link.

### 4.3 Automated verification

Run changed-package formatting before final checks:

- [ ] `pnpm --filter @web-audio/schema format`
- [ ] `pnpm --filter @web-audio/fluid format`
- [ ] `pnpm --filter @web-audio/audio-engine format`
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

### 4.4 Focused manual review

Use a short sketch with obvious alternating gain/filter values and a seeded random parameter.

- [ ] Changes occur on audio bar boundaries rather than callback execution time.
- [ ] Static cycles wrap at the expected bar.
- [ ] Seeded random behavior repeats after reconstruction.
- [ ] Ordinary value changes introduce no unexpected click or dry duplication.
- [ ] Stop before a future boundary prevents that value from arriving.
- [ ] Existing voices remain audible through Stop according to current semantics.
- [ ] Replacing a sketch freezes the retiring bus.
- [ ] Instrument effects, envelopes, LFOs, MIDI, routes, and sends sound unchanged.

## Explicit non-goals

- Patterned `BusSchema.gain`
- Patterned sends
- Intra-bar bus automation
- Bus envelopes, LFOs, or MIDI CC
- Global RandomSchema hardening
- Changes to intentionally empty instrument rhythm or mask rows
- Parameter-manager extraction
- Shared parameter-host abstraction
- Custom scheduling infrastructure
- Instrument parameter refactors
- Routing or send-tap changes
- Tail-aware retirement
- Main effects
- Ducking

## Reassessment gates

Pause and split or revise the SOW if implementation starts requiring:

- changes to instrument parameter or random semantics;
- globally rejecting empty rhythmic rows;
- a generalized parameter host or manager;
- a custom scheduler;
- changes to routing, send taps, or main ownership;
- advancing retiring buses after replacement;
- continuous or intra-bar bus automation;
- graph retirement or active-voice lifecycle changes;
- a compatibility fallback for `cancelAndHoldAtTime()` without demonstrated target need.

## Completion criteria

This SOW is complete when:

- Fluid gain effects support the established static/random parameter-input capability without breaking existing automation inputs;
- named-bus gain/filter effects accept safe static and deterministic random patterns;
- all values resolve with `stepIndex = 0`, resolve atomically, and transition without hard parameter jumps;
- first-bar scheduling is idempotent;
- replacement starts new buses from the upcoming bar and freezes retiring buses;
- Stop cancels future values while holding current values;
- instrument random, parameter, LFO, MIDI, voice, and routing behavior remains unchanged;
- package and workspace verification passes.
