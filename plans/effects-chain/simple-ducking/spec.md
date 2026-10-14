# Basic Event-Triggered Ducking Specification

## Status

- Readiness: Ready for planning; not implemented.
- Blocking decisions: None identified. The API defaults and curve below are carried forward from an older, deprecated design as explicit assumptions, not as decisions confirmed in the interview.
- Source: discussion following [`bus-followup-roadmap.md`](../bus-followup-roadmap.md), especially SOW 6 and its Recommended order; [`deprecated/signal-processing-spec.md`](../deprecated/signal-processing-spec.md) is a reference for proposed API/defaults, **not** the active implementation scope.

## Problem and intended outcome

An instrument can route or send audio to a named bus, but its pattern events cannot currently duck another bus. A user should be able to make, for example, kick pattern onsets attenuate a music bus and hear it swell back, without adding audio-reactive sidechain detection. Every kick should still retrigger the dip if it arrives during recovery; dense, simultaneous, perfectly deterministic overlap is deferred.

## Scope

Included:

- Static per-instrument duck configuration targeting declared named buses, shared by synths and samplers.
- Event-onset triggers, including muted instruments and sampler onsets whose sample cannot play.
- A separate duck gain on each named-bus signal path; proportional onset and recovery timing.
- Within-bar trigger ordering, simple hold-and-retrigger behavior, Stop/reset, and graph-generation isolation.

Non-goals:

- Ducking `main`, audio-reactive sidechain compression, patterned duck settings, ducking from MIDI output events, or routing/topology changes.
- The SOW 7 guarantees: global sample-frame merging, cross-instrument order independence, analytical reconstruction of truncated exponential ramps, and long-running timeline compaction.
- Bus MIDI/LFO/envelope automation or a general parameter scheduler.

**Central invariant:** Duck automation changes only its named target bus's dedicated duck gain. It does not write the bus output gain, alter the triggering instrument's route/send/mute behavior, or let an old graph's triggers operate on a replacement graph's same-named bus.

## Current behavior and evidence

Static source inspection, not an audible runtime check:

- `packages/schema/src/index.ts` defines instrument `route` and `sends`, `TimingPattern` steps with offset/duration, and numeric `BusSchema.gain`; there is no duck schema field. `packages/schema/src/validate-graph.ts` validates routes, sends, timing, and effect parameters, but no duck targets.
- `packages/fluid/src/instruments/instrument.ts` exposes `route()`, `send()`, and `mute()`, but no `duck()`. `packages/fluid/src/drome.ts` assembles and validates the completed graph, allowing a new duck target to be a forward reference.
- `packages/audio-engine/src/instruments/resolve-timing.ts` filters chance-masked onsets. Synth and sampler schedulers consume resolved events in `packages/audio-engine/src/instruments/synthesizer.ts` and `sampler.ts`. Synth voices may be polyphonic; sampler voice creation can fail for unavailable sources. Both receive an instrument mute node rather than suppressing event resolution when muted.
- `packages/audio-engine/src/buses/runtime-bus.ts` currently wires input → effects → output gain and can cancel/hold its scheduled bus-effect automation on Stop. `packages/audio-engine/src/index.ts` schedules instruments and buses each bar, commits replacement graphs, and keeps retiring graphs alive for existing voices. The new duck state must follow that graph ownership.

## Requirements and invariants

- **R1 — Authoring and canonical shape:** Each synth or sampler can specify zero or more named duck targets with one static `{ depth, onset, recovery }` configuration per target. The completed Fluid graph and direct schema have the same canonical meaning; targets may be declared after the instrument. Existing instruments without ducks retain their behavior.
- **R2 — Validation:** Only declared named buses may be targets. Reject `main`, unresolved or noncanonical target names, missing/malformed duck records, and non-finite or out-of-domain settings at the shared graph boundary before accepting an update; an invalid update must not replace a valid pending or active graph.
- **R3 — Trigger identity:** Every resolved, unmasked pattern onset produces one trigger per configured target, not one per synth note or sampler voice. Instrument mute does not suppress triggers; silence/absence of a pattern event does. Sampler trigger emission is independent of buffer availability and audible clip length.
- **R4 — Timing and depth:** At trigger time, depth selects a bounded attenuation target. Onset is the ramp to that target; recovery starts **immediately after the target is reached**, not at the pattern event's end. Onset and recovery are static proportions of the scheduled pattern-event duration (in audio seconds). Zero onset uses a click-safe minimum ramp. Zero depth does not disturb an active duck.
- **R5 — Signal placement:** Each named bus applies ducking after its effects and before its output gain, including when the source instrument routes or sends to that same bus. Main is never ducked; routes, post-mute sends, effect order, and destination connections otherwise remain unchanged.
- **R6 — Basic retrigger:** Order requests by onset time within each scheduled bar. A trigger during an unfinished dip or recovery is **not dropped**: hold the bus duck gain at its value at that trigger time, replace its remaining duck automation, and schedule a fresh dip/recovery. Do not multiply overlapping duck gains or jump to unity first. A shallower request must not raise gain during its new onset; a conservative repeat of the previous deeper target is acceptable. Exact same-target/time requests are reduced to the deepest request before bus automation. Simultaneous requests targeting different buses retain stable submission order and need no SOW 7 order-independent merge guarantee.
- **R7 — Transport and graph lifecycle:** On Stop, cancel future duck automation and restore duck gains to unity on active and still-audible retiring buses without changing their normal bus output gain or stopping existing voices. Restart may schedule new ducks without stale pre-Stop automation. Replacement graph buses start at unity and accept only their own generation's triggers; old voices continue through their old graph until retirement completes. Destruction leaves no duck automation or connections owned by the destroyed graph.
- **R8 — Observable limits:** Document that this feature follows _patterns_, not audio amplitude, and that dense/simultaneous triggers and truncated recovery curves can differ from the deterministic SOW 7 behavior. Do not present basic retriggering as silently dropping all requests during recovery.

## Behavior and contracts

Proposed authoring contract, adapted from the older spec (see Assumptions):

```ts
d.bus("music");
d.bus("pads");
d.sample("bd").duck("music").push();
d.synth().duck(["music", "pads"], 0.75, 0, 0.5).push();

interface DuckSchema {
  depth: number; // proposed default 1, canonical range [0, 1]
  onset: number; // proposed default 0, finite and >= 0
  recovery: number; // proposed default 1, finite and >= 0
}
// InstrumentSchema adds required `ducks: Record<string, DuckSchema>`; `{}` means none.
```

The proposed Fluid form is `duck(target: string | string[], depth?, onset?, recovery?): this`. Arrays share one configuration; a later call to the same target replaces its prior configuration (no duplicate duck gain). Fluid normalizes target names at authoring and validates forward references in the complete graph. Direct schemas are required to be canonical and validated without silently mutating inputs; adding the required empty `ducks` record is an intentional fixture/direct-schema migration, not a runtime compatibility branch. Fluid may clamp finite out-of-range inputs into canonical values as the older design proposed; direct schema values outside the canonical ranges are rejected. The exact clamping policy is an assumption to validate in planning.

Proposed depth mapping from the older spec: `targetGain = clamp(1 - sqrt(depth), 0.01, 1)`. The positive floor allows safe ramps; depth `0` is a genuine no-op, even during an earlier duck. For an event lasting 0.5 seconds, `onset = 0.2` takes 0.1 seconds to reach the target and `recovery = 0.5` then takes 0.25 seconds to return to unity. Recovery does **not** wait for the event's 0.5-second end. Duration is always the resolved _pattern_ duration, even for a short one-shot sample, a looping sample, or a failed sample lookup. Ramps must be scheduled on the audio timeline; no wall-clock duck timers are required.

Basic overlap semantics do not claim to know the exact future value of a cancelled exponential segment in software. Use the held Web Audio parameter state at each chronological retrigger, with a small amount of target/recovery state if needed to prevent a shallower retrigger lifting the bus during onset. Across bar boundaries, an unfinished recovery can be retriggered the same way. If multiple instruments target the same bus at the same instant, the engine keeps the deepest request and uses its timing; requests targeting different buses retain stable submission order. SOW 7 may add broader equal-frame normalization and merging.

## Ownership and boundaries

Fluid owns authoring and canonical serialization; shared schema owns duck-record and target validation; the audio engine owns dispatch of resolved pattern triggers to buses within the active runtime graph; each named runtime bus owns its duck gain and automation. Trigger generation must remain independent of the mute/audio-availability branch, but must not create an additional audio route. Keep event-cycle/shorthand concepts out of schema and engine APIs: the engine consumes resolved timing events, not the notation used to author them. Retirement and Stop operate on the bus belonging to each graph, not a global bus-name lookup. The SOW 6 design must not require SOW 7's generic timeline or unrelated MIDI/bus automation changes.

## Acceptance criteria

| ID   | Requirement(s) | Starting condition / action                                                                                                                                                 | Expected outcome                                                                                                                                                                                                               | Verification approach                         |
| ---- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| AC1  | R1, R2         | An instrument ducks a subsequently declared named bus; serialize Fluid and equivalent direct input.                                                                         | Both yield one target-keyed canonical duck configuration; an instrument without ducks has `{}` and unchanged routing.                                                                                                          | Schema/Fluid tests                            |
| AC2  | R1, R2         | Supply `main`, unknown or noncanonical direct-schema targets, missing/malformed `ducks`, NaN/Infinity, or invalid direct-schema ranges to graph validation / engine update. | Path-specific rejection before commit; last accepted pending/active graph remains available.                                                                                                                                   | Schema + engine boundary tests                |
| AC3  | R3             | A polyphonic synth onset or multi-voice sampler onset is emitted; repeat while muted or with unavailable sample data.                                                       | Exactly one trigger per configured target per resolved onset; mute silences its audio but not its trigger, and unavailable sample audio does not suppress its trigger.                                                         | Resolved-event + engine tests                 |
| AC4  | R3             | A chance condition masks an onset, or a pattern bar contains no onset.                                                                                                      | No duck is scheduled for that event/bar.                                                                                                                                                                                       | Resolver + engine tests                       |
| AC5  | R4             | Schedule a 0.5-second pattern event with onset `0.2`, recovery `0.5`.                                                                                                       | Target is reached about 0.1 seconds after the trigger; recovery begins then and ends about 0.25 seconds later, without waiting for event end. Sample playback length does not change those times.                              | AudioParam schedule tests; audible spot check |
| AC6  | R4, R6         | Trigger with depth zero during another bus duck; then separately trigger again midway through recovery, including across a bar boundary.                                    | Depth zero leaves automation intact. A nonzero retrigger holds the current gain and initiates another dip/recovery without returning to unity or ignoring the trigger; a shallower retrigger does not raise gain on its onset. | Bus automation tests; audible spot check      |
| AC7  | R5             | An instrument routes/sends to the same named bus it ducks; the bus has effects and a non-unity output gain.                                                                 | Ducking attenuates the processed bus signal between effects and output gain; ducking adds no duplicate dry path or write to the bus output gain; main and post-mute sends remain unchanged.                                    | Graph connectivity + AudioParam tests         |
| AC8  | R6, R8         | Multiple non-simultaneous triggers for one target arrive from different instruments in a scheduled bar.                                                                     | They are submitted in onset order; basic retriggering applies even when source iteration order differs. Equal-time cross-instrument curve equivalence is not asserted.                                                         | Engine scheduling tests                       |
| AC9  | R7             | Stop during scheduled ducks with active and retiring buses; restart or replace the graph at a later bar.                                                                    | Future ducks are cancelled, each stopped bus duck gain returns to unity, existing voice/normal bus behavior is preserved, and new graph triggers cannot alter the retiring bus or vice versa.                                  | Lifecycle tests; audible spot check           |
| AC10 | R7, R8         | Destroy a graph or read the feature documentation.                                                                                                                          | No destroyed duck gain remains connected; documentation states pattern-triggered behavior, immediate recovery, retrigger rule, and dense-overlap limitations.                                                                  | Lifecycle tests + documentation review        |

## Assumptions

- The instrument-owned `.duck(nameOrNames, depth?, onset?, recovery?)` API, defaults (`1`, `0`, `1`), one configuration per target, and square-root depth mapping are inherited from the **deprecated** signal-processing spec, not individually approved in the interview. Validate their musical feel with a sparse kick-to-music example before treating the mapping/defaults as final.
- Builder clamping of finite inputs and rejection of noncanonical direct-schema inputs follow the older design and current schema-validation style; verify this ergonomic choice when writing the implementation plan.
- Prefer a positive minimum ramp and positive gain floor to avoid clicks/invalid exponential automation. Exact curve/minimum duration and browser behavior of `cancelAndHoldAtTime()` under future-scheduled, repeated retriggers need implementation tests and an audible check; they are not asserted as observed behavior.

## Risks and open decisions

- Blocking: None identified for planning. If the assumed API or depth/default curve fails the audible tracer bullet, resolve that contract before implementing broad fixture migration.
- Non-blocking: Dense, equal-time cross-instrument requests may produce order-dependent curves; simplified cancellation may not reconstruct an interrupted ramp precisely. Document and test the limitation, then address it in SOW 7. A failed sampler event must not accidentally advance its audible alternating-direction state solely because it emitted a duck trigger.

## Deferred work

- SOW 7: sample-frame normalization, simultaneous-request merging, analytically exact non-stacking retriggers, and bounded timeline compaction.
- Later SOWs: patterned duck settings, main ducking if ever justified, audio-reactive compression, expanded routing, and independent bus MIDI/LFO/envelope automation.
