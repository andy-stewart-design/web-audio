# Bus MIDI Automation Implementation Plan

## Context

This plan implements SOW 3 from [`bus-followup-roadmap.md`](bus-followup-roadmap.md). It builds on the persistent named-bus bindings delivered by [`completed/patterned-bus-parameters-plan.md`](completed/patterned-bus-parameters-plan.md).

The current runtime supports static and deterministic random values for named-bus gain/filter effect parameters. MIDI CC already controls per-voice instrument parameters through Fluid's `MidiCcSchema`, `Midi.in.cc()` signals, and instrument-owned subscriptions. This SOW extends that established MIDI behavior to persistent named-bus parameters without introducing a general parameter host.

This SOW also corrects an unnecessary limitation from the patterned-parameter work: named-bus output gain becomes a canonical parameter binding supporting static, deterministic random, and MIDI CC values. Main gain remains constant and engine-owned. Sends remain constant.

## Goals

- Support MIDI CC on persistent named-bus gain/filter effect parameters.
- Support static, deterministic random, and MIDI CC values on named-bus output gain.
- Match existing instrument MIDI behavior unless a demonstrated bug requires a separate correction.
- Share focused MIDI signal-selection, mapping, initialization, smoothing, and unsubscribe logic between instruments and buses.
- Preserve routing, post-mute sends, persistent main ownership, graph retirement, Stop behavior, and active-voice semantics.

## Non-goals

- MIDI-controlled sends
- MIDI-controlled main gain
- Main effects
- Bus envelopes or LFOs
- Native Web Audio parameter-domain validation
- MIDI event timestamp propagation
- Global MIDI schema hardening
- Live MIDI-provider replacement smoothing changes
- A general parameter manager or parameter-host abstraction
- Custom scheduling infrastructure
- Instrument MIDI behavior changes

## Canonical schema contract

`BusSchema.gain` becomes future-ready:

```ts
interface BusSchema {
  gain: number | AudioParamSchema;
  transition: number;
  effects: EffectSchema[];
}
```

Shared semantic validation enforces one canonical representation per context:

- `buses.main.gain` is one finite non-negative number.
- Every named-bus `gain` is an `AudioParamSchema`.
- During this SOW, named-bus output gain accepts static, safe deterministic random, and MIDI CC schemas.
- Named-bus output envelopes and LFOs remain contextually rejected until their own SOWs.
- Numeric named-bus gain is rejected after the mechanical migration; there is no compatibility or runtime-normalization branch.

Fluid preserves ergonomic numeric authoring:

```ts
d.bus("main").gain(0.9); // numeric main gain
d.bus("drums").gain(0.8); // canonical static named-bus parameter
d.bus("drums").gain(1, 0.5); // two bars
d.bus("drums").gain([1, 0.5]); // two intra-bar steps; bus uses step zero
d.bus("drums").gain(d.rand().range(0.25, 1));
d.bus("drums").gain(d.midi.cc(7));
```

Dynamic main gain fails immediately in `Bus.gain()` and remains rejected by shared validation for direct schemas.

## Supported MIDI parameter surface

MIDI CC is supported on named-bus:

- output gain;
- gain effect gain;
- filter frequency;
- filter Q;
- filter detune;
- filter gain.

It is not supported on:

- main gain;
- main effects;
- sends;
- routes.

`Bus.transition()` applies only to bar-resolved static/random changes. MIDI updates use the existing fixed real-time MIDI smoothing behavior.

## MIDI behavior contract

Bus MIDI matches instrument MIDI behavior:

- Before a matching CC has been received, initialize from `schema.default`.
- If the resolved signal already has a value, immediately adopt its cached value on subscription.
- The first subscription callback initializes immediately.
- Later CC messages call:

  ```ts
  param.setTargetAtTime(mappedValue, ctx.currentTime, 0.01);
  ```

- MIDI input event timestamps are not introduced; updates use `AudioContext.currentTime`.
- Reversed linear and exponential ranges remain valid.
- Device selectors remain opaque and use existing ID-first/name-second matching.
- Optional channel and device scoping match instruments exactly.
- Connecting the same MIDI instance is a no-op.
- Explicit MIDI disconnect retains the last controlled parameter value.
- Reconnecting or replacing MIDI immediately synchronizes from the new signal's cached value or default, matching instruments.
- Any future change to live provider-replacement smoothing must address instruments and buses together.

### Mapping safety

Focused bus validation requires:

- integer CC in `[0, 127]`;
- optional integer channel in `[1, 16]`;
- finite range endpoints;
- a supported linear or exponential curve;
- positive exponential endpoints;
- finite mapping arithmetic;
- finite default within the inclusive unordered range bounds.

Do not add bus-only device-selector restrictions or native frequency/Q/detune/filter-gain ranges.

Named-bus output gain additionally requires every possible resolved value to be non-negative:

- every represented static row's step-zero value is finite and `>= 0`;
- random range/value-map output is safely constrained to finite values `>= 0`;
- MIDI range endpoints and default are `>= 0`;
- there is no upper gain bound.

Validation remains focused on bus usage. Do not globally change instrument MIDI schema acceptance in this SOW.

## Shared MIDI utility boundary

Extract a focused AudioEngine utility for common MIDI parameter behavior. It owns only:

- unscoped/device-scoped `CcSignal` selection;
- optional channel selection;
- cached-value/default initialization;
- linear/exponential mapping;
- immediate first synchronization;
- 10 ms smoothing for later values;
- idempotent unsubscription.

A representative boundary is:

```ts
subscribeMidiParam({
  ctx,
  midi,
  param,
  schema,
  scale,
});
```

It returns an unsubscribe function. A pure mapping helper may be exported file-locally or alongside it for focused tests.

Ownership remains separate:

- Instrument retains per-voice MIDI registration and lifecycle ownership.
- RuntimeBus owns persistent bus MIDI bindings and subscriptions.
- AudioEngine owns graph-level MIDI dispatch.

Do not extract a shared lifecycle base class, parameter host, parameter manager, or automation scheduler.

## RuntimeBus binding model

Use explicit scheduled and MIDI binding variants. Conceptually:

```ts
type BusParameterBinding = ScheduledBusBinding | MidiBusBinding;
```

Scheduled bindings:

- contain static/random schemas;
- resolve once per bar with step zero;
- participate in atomic resolve-before-apply scheduling;
- use configured bar-relative transitions;
- track active linear transition state for Stop.

MIDI bindings:

- contain `MidiCcSchema`;
- initialize to their schema default during construction;
- are excluded from bar resolution and scheduling atomicity;
- install subscriptions through `connectMidi()`;
- retain their value through `disconnectMidi()`;
- are excluded from transport Stop cancellation.

Named-bus output gain is registered as a binding targeting the existing output `GainNode.gain`. Its node position remains after bus effects and before persistent main; no topology changes occur.

## Stop behavior

Transport Stop remains scoped to transport-scheduled automation:

- static/random bindings evaluate and hold active transitions with `cancelAndHoldAtTime(stopTime)`;
- MIDI bindings remain subscribed and responsive;
- Stop does not cancel an in-progress MIDI `setTargetAtTime()` update;
- Stop does not disconnect MIDI, reset values, disconnect nodes, or destroy graphs;
- restart schedules static/random bindings from their held values as today.

This matches existing instrument behavior, where Stop preserves MIDI control of active voices.

## Graph and MIDI lifecycle

### Initial connection

If AudioEngine already has a MIDI instance during commit:

1. Construct replacement buses and initialize MIDI parameters to schema defaults.
2. Connect replacement buses to MIDI inside `_commit()`'s construction `try` block.
3. The subscription callback synchronously installs a cached value or default.
4. Construct/connect replacement instruments through their existing path.
5. Only after successful construction, swap the active graph.
6. Retire the old graph and disconnect its buses from MIDI.

A replacement graph must install its initial MIDI-controlled values before it can receive scheduled audio. New voices are not scheduled until the later `bar` callback.

Connecting before the active-graph swap preserves existing construction-failure behavior: failed replacement resources unsubscribe and destroy, while the old graph remains active. A brief synchronous overlap in subscriptions cannot process an external MIDI event mid-commit and the replacement graph is silent.

### Active graphs

- `AudioEngine.connectMidi(midi)` connects all active buses and instruments.
- Passing the same instance remains a no-op.
- Replacing the MIDI instance disconnects the old bindings before connecting the new provider through the existing engine lifecycle.

### Retiring graphs

- Retirement immediately unsubscribes bus MIDI bindings.
- Retiring buses retain their last controlled value.
- Already-installed 10 ms MIDI smoothing may finish; retirement installs no new cancellation event.
- Retiring buses receive no later controller or bar updates.
- Existing voices continue through the frozen retiring bus.

### Disconnect and destruction

- Explicit engine MIDI disconnect unsubscribes active and, defensively, retiring buses.
- RuntimeBus `disconnectMidi()` is idempotent and retains parameter values.
- RuntimeBus `destroy()` unsubscribes before disconnecting nodes.
- Failed graph construction destroys and unsubscribes every successfully created replacement bus.
- Engine destruction leaves no bus subscriptions.

## Implementation phases

## Phase 0 — Patterned named-bus output gain

**Tracer bullet:** Fluid authors a multi-bar named-bus output gain, shared validation accepts its canonical parameter schema, and RuntimeBus schedules the existing output gain node through the established persistent binding path.

### 0.1 Canonical schema and fixture migration

- Change `BusSchema.gain` to `number | AudioParamSchema`.
- Require numeric gain for main and parameter-shaped gain for named buses.
- Mechanically migrate named-bus fixtures and direct schemas to canonical static gain schemas.
- Retain numeric main fixtures.
- Reject old numeric named-bus gain with a contextual migration error.
- Do not add a compatibility conversion branch.

### 0.2 Fluid authoring

- Make named `Bus.gain()` variadic using the established broad `AudioParamInput` conventions.
- Serialize numeric named-bus gain as a canonical static parameter.
- Preserve bar-versus-step syntax.
- Apply the existing gain MIDI context to `MidiCc` serialization.
- Immediately reject any non-single-number main gain input.
- Keep envelopes/LFOs serializable by the broad input type but contextually rejected by current graph validation.

### 0.3 Validation and runtime

- Reuse existing static/random bus-safe validation for named output gain.
- Add output-gain-specific non-negative guarantees.
- Register the existing output node's gain as a scheduled RuntimeBus binding.
- Include output gain in atomic resolution, transitions, first-bar idempotence, Stop, restart, and retirement freeze behavior.
- Preserve output node identity and graph topology.

**Acceptance criteria:**

- [ ] Named-bus numeric authoring remains ergonomic but serializes canonically.
- [ ] Multi-bar static and deterministic random output gain resolve once per bar at step zero.
- [ ] Intra-bar output-gain steps are retained but ignored after step zero.
- [ ] Output gain remains finite and non-negative for every supported source.
- [ ] Main gain remains numeric and constant.
- [ ] Numeric named-bus direct schemas are rejected after migration.
- [ ] Output gain transitions and Stop behavior match effect bindings.
- [ ] Existing routing topology and effect ordering remain unchanged.

---

## Phase 1 — Behavior-neutral shared MIDI utility

**Tracer bullet:** Existing instrument MIDI tests pass through a focused shared utility with no semantic changes.

### 1.1 Utility extraction

- Extract CC signal selection, channel scoping, mapping, initialization, smoothing, and unsubscribe.
- Preserve `scale` behavior used by instrument parameter application.
- Use `ctx.currentTime` and the existing 10 ms time constant.
- Keep first synchronization immediate.
- Keep device selector behavior unchanged.

### 1.2 Instrument migration

- Replace Instrument's private signal/mapping implementation with the shared utility.
- Retain Instrument's `_registerMidiBinding()` ownership and per-voice completion cleanup.
- Preserve same-instance no-op, replacement, disconnect, retirement, and destruction behavior.
- Do not combine discovered behavior changes with this extraction.

**Acceptance criteria:**

- [ ] Existing instrument MIDI behavior is unchanged.
- [ ] Cached/default initialization matches prior behavior.
- [ ] Later updates retain 10 ms smoothing at `ctx.currentTime`.
- [ ] Linear, exponential, reversed, device-scoped, and channel-scoped behavior remains unchanged.
- [ ] Repeated unsubscribe and lifecycle cleanup remain safe.
- [ ] Existing instrument MIDI and active-voice regression tests pass.

---

## Phase 2 — Persistent bus MIDI bindings

**Tracer bullet:** A Fluid or direct MIDI CC schema controls a persistent named-bus parameter in real time, survives Stop, and cleans up across replacement and destruction.

### 2.1 Focused bus MIDI validation

- Accept `MidiCcSchema` for named-bus output gain and supported gain/filter effect fields.
- Add the focused mapping-safety rules above.
- Require output-gain MIDI ranges/defaults to remain non-negative.
- Preserve reversed ranges and opaque device selectors.
- Continue rejecting MIDI on main and sends.
- Do not globally change instrument MIDI validation.

### 2.2 RuntimeBus MIDI ownership

- Add MIDI binding variants and initialize them from schema defaults.
- Add idempotent `connectMidi(midi)` and `disconnectMidi()` methods.
- Use the shared utility for signal selection, mapping, cached/default sync, smoothing, and unsubscribe.
- Exclude MIDI bindings from bar scheduling and transport Stop cancellation.
- Ensure destruction always unsubscribes.

### 2.3 AudioEngine lifecycle dispatch

- Connect replacement buses inside the existing construction `try` block when MIDI is present.
- Connect active buses from `AudioEngine.connectMidi()`.
- Disconnect active and defensively retiring buses from `disconnectMidi()`.
- Disconnect buses immediately when their graph retires.
- Preserve existing instrument and MIDI output scheduler behavior.
- Preserve active graph state if replacement construction or connection fails.

**Acceptance criteria:**

- [ ] MIDI controls every supported named-bus output/effect parameter.
- [ ] Defaults initialize before audio and cached CC values are adopted synchronously.
- [ ] Later controller messages use existing 10 ms smoothing.
- [ ] Device and channel scoping match instruments.
- [ ] Stop leaves bus MIDI live and does not reset or cancel it.
- [ ] Explicit disconnect retains the last value.
- [ ] Same-instance connection is a no-op.
- [ ] Provider replacement matches instrument first-sync behavior.
- [ ] Retiring buses stop receiving MIDI while already-installed smoothing may finish.
- [ ] Failed replacement, retirement, disconnect, and destruction leak no subscriptions.

---

## Phase 3 — Integration, documentation, and closeout

### 3.1 Canonical integration coverage

Cover equivalent Fluid and direct schemas containing:

- numeric main gain;
- patterned named-bus output gain;
- MIDI-controlled named-bus output gain;
- MIDI-controlled gain and filter effects;
- unscoped, device-scoped, and channel-scoped CCs;
- reversed linear and exponential ranges;
- a named primary route and post-mute send;
- multiple bars;
- Stop/restart;
- graph replacement at a nonzero bar;
- MIDI connection before and after commit;
- MIDI provider replacement and explicit disconnect;
- graph construction failure and destruction cleanup.

Verify:

- Fluid and direct schemas share canonical meaning and validation;
- output gain preserves its post-effects graph position;
- bar scheduling never touches MIDI bindings;
- first MIDI sync occurs before replacement audio can be scheduled;
- retiring buses freeze and unsubscribe;
- main remains the only destination-connected node;
- sends remain post-mute and constant;
- caller-mutation and last-valid-write guarantees remain intact;
- instrument MIDI semantics remain unchanged.

### 3.2 Documentation

Document:

- patterned and MIDI-controlled named-bus output gain;
- MIDI-controlled named-bus gain/filter effects;
- bar-level versus intra-bar gain syntax;
- output-gain non-negative semantics;
- contextual MIDI defaults and explicit overrides;
- cached/default first synchronization;
- fixed 10 ms MIDI smoothing versus bar-relative `transition()`;
- Stop, disconnect, replacement, retirement, and destruction behavior;
- unsupported MIDI sends/main and unsupported bus envelopes/LFOs;
- the intentional direct-schema migration;
- global MIDI hardening and provider-replacement smoothing as separate concerns.

After closeout, move this plan to `plans/effects-chain/completed/` and update the roadmap link.

### 3.3 Automated verification

Run formatting and changed-package verification:

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

### 3.4 Focused hardware MIDI review

Use real MIDI hardware before closeout:

- [ ] Unscoped CC controls filter frequency and named-bus output gain.
- [ ] Channel scope ignores messages from other channels.
- [ ] Device scope selects the intended controller when available.
- [ ] Cached/default initialization matches expectations.
- [ ] Controller movement is responsive without zippering or clicks.
- [ ] `transition()` does not add bar-relative latency to MIDI movement.
- [ ] Stop leaves controller response live and restart remains stable.
- [ ] Graph replacement transfers control to the new bus and freezes the retiring bus.
- [ ] Explicit disconnect retains the last value; reconnect synchronizes as documented.
- [ ] Repeated connect/replacement does not duplicate updates.
- [ ] Instrument MIDI, LFOs, voices, routes, sends, and MIDI output remain unchanged.

## Reassessment gates

Pause and split or revise the SOW if implementation starts requiring:

- changes to instrument MIDI semantics;
- a general parameter host or manager;
- MIDI event timestamp propagation;
- MIDI-controlled sends or main;
- graph topology changes;
- continuous scheduling infrastructure;
- advancing retiring buses;
- native Web Audio parameter-domain policy;
- global MIDI schema validation changes;
- provider-replacement smoothing changes for only one parameter owner;
- bus envelopes or LFO runtime support.

## Completion criteria

This SOW is complete when:

- named-bus output gain is canonically parameter-shaped and supports safe static, random, and MIDI values;
- named-bus gain/filter effect parameters support focused safe MIDI CC schemas;
- bus MIDI behavior matches instruments for selection, mapping, initialization, smoothing, and disconnect;
- transport Stop leaves MIDI live while cancelling only scheduled automation;
- replacement graphs initialize MIDI before scheduled audio and retiring buses unsubscribe/freeze;
- failed construction, provider replacement, explicit disconnect, retirement, and destruction leak no subscriptions;
- main gain and sends remain constant;
- shared utility extraction changes no instrument behavior;
- automated package/workspace verification passes;
- focused hardware MIDI review passes.
