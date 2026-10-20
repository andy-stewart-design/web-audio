# @web-audio/audio-engine

Web Audio playback engine for scheduled Fluid schemas.

## Source map and ownership

```text
src/
├── index.ts              # Sole code entry point: AudioEngine and EngineClock
├── audio-engine.ts       # Graph assembly, transport integration, graph retirement
├── engine-clock.ts       # Host clock contract
├── constants.ts          # Shared audio defaults and filter mapping
├── instruments/          # Runtime Instrument, Synthesizer, Sampler; voice ownership
├── events/               # Timing selection and synth/sampler event expansion
├── patterns/             # Runtime value-pattern and chance evaluation
├── samples/              # Sample lookup, preload planning, decoded/reverse caches
├── parameters/           # Envelope calculation, ADSR normalization, resolved types
├── sources/              # Noise/supersaw source adapters and source contracts
├── midi/                 # MIDI output scheduling and note-to-frequency conversion
├── buses/                # Named-bus runtime and duck automation
├── worklets/             # Worklet module registration
└── __tests__/            # Public API and cross-domain integration suites
    └── support/          # Shared schema fixtures and manual clock
```

`events/` resolves candidate timing, hit indices, and musical voice groups without creating audio nodes. `patterns/` evaluates the schema's static/random values and chance conditions at playback time; it is not the generic construction and transformation API in `@web-audio/patterns`. Both instruments and buses consume runtime value resolution directly.

`instruments/` owns playback and voice lifecycle, while `samples/` owns resource lookup and loading independently of any instrument. `sources/` adapts worklet nodes to the scheduled-source contract; processor implementations remain in `@web-audio/worklets`. Parameter automation, effect construction, and MIDI input bindings remain in the base instrument; this organization does not redesign that class.

Internal types live with their owners rather than in a package-wide type registry. Unit tests live in each domain's `__tests__/`; cross-domain suites and shared test support live in `src/__tests__/`. Tests remain TypeScript-checked, and production modules never import test support.

## Public API

```ts
import AudioEngine, { type EngineClock } from "@web-audio/audio-engine";
```

`src/index.ts` exposes only the default `AudioEngine` class and the `EngineClock` type. The class implementation lives in `src/audio-engine.ts`; implementation classes, helpers, and their types are not package exports. Schema-owned types come directly from `@web-audio/schema`.

Internal modules import directly from their owners, not through folder barrels or compatibility shims. Source paths are not supported package subpaths. Native adapter tests in `audio-regression` intentionally load source files as white-box integration tests, not as a public consumer API.

## Playback-plan resolution

Synthesizers and samplers receive explicit `events.timing` separately from their event values. For each bar, the engine:

1. selects the timing-cycle bar;
2. evaluates its optional chance condition once per candidate;
3. removes misses and assigns consecutive hit indices;
4. resolves note, sample-name, variation, and processing patterns by final hit;
5. schedules every event voice with the event's offset and duration.

Static patterns contain values only. Random numeric patterns use `valuesPerBar`; they do not carry timing grids or chance policy. Chords and sampler layers are explicit voice arrays, and every voice in one event shares its hit index.

Sampler notes and sample names are resolved as independent voice dimensions. Names are static schema values; simultaneous names create voices, shorter name/note/variation groups wrap, and duplicate names remain distinct voices. When notes are absent, the engine selects the lowest source key for each name and plays it at rate `1`. An absent variation pattern means variation `0`.

Sampler note and variation groups are layered voice dimensions. The engine chooses their longest group length and wraps shorter groups. A random variation resolves once per event and broadcasts that one value across every static layer. It rounds each resolved variation value, then positively wraps it by the selected source key's variation count; missing variation entries skip only their affected voice.

Alternate sample direction is event-based: all successful layers in one event use the same direction, and the alternate state advances once only if at least one layer is scheduled. A failed timing chance gates the complete event before any of its voice values resolve.

## Sample resources

Sample entries are resolved from `bank → sample name → source key → variation`. Source keys are derived from normalized bank data rather than serialized on instruments. Pitched playback selects the nearest key, using the lower key for midpoint ties.

Decoded buffers are shared by exact resolved URL. Concurrent requests for one URL share one fetch and decode; different URLs never substitute for each other. A voice whose exact URL is not loaded starts or joins a background load, warns, and skips its scheduled time. Later hits may use the completed load; no other sample name is substituted. Reverse buffers are shared per decoded buffer.

`prepare()` builds a conservative preload plan from fixed sample names, all bank-derived source keys, and every provably possible variation. Broad random variation patterns preload every available variation. Missing external resources warn but do not invalidate an otherwise structurally valid graph.

## Bus and routing topology

The engine keeps one persistent main gain connected to destination and analyser. Named buses belong to a runtime graph and feed that persistent main:

```text
instrument balancing → mute ┬→ primary route
                             ├→ send gain → named bus
                             └→ send gain → named bus

named bus input → static gain/filter effects → output gain → persistent main
main-routed instruments ────────────────────────────────────────────────┘
```

Each instrument has exactly one primary route. Named routes replace the default direct-main path, preventing dry duplication. Sends are independent post-mute branches with one owned gain node each.

Main gain is engine-global, so a main gain update affects both active and retiring voices. Named-bus gain/filter parameters may resolve from static or deterministic random patterns once per bar. Main effects, envelopes, LFOs, MIDI CC, patterned sends, and bus-to-bus routing are not currently supported.

## Canonical schema updates

Direct `AudioEngine.update()` callers must provide explicit graph fields. Fluid emits these defaults automatically:

```ts
{
  bpm: undefined,
  buses: {},
  banks: {},
  instruments: [
    {
      route: "main",
      sends: {},
      ducks: {},
      // remaining synthesizer or sampler fields
    },
  ],
}
```

Bus and route names must already be trimmed and non-empty. Named routes and send targets must reference declared buses; sends cannot target main and their amounts must be finite values in `[0, 1]`. Bus gain must be finite and non-negative. Every bus schema includes `transition`, a finite bar proportion in `[0, 1]` that defaults to `0` in Fluid. Named-bus gain and filter parameters accept safe static and deterministic random patterns and resolve once per bar using step zero.

Bus parameter changes begin at the bar boundary and ramp for the greater of 10 ms or `barDuration * transition`. The mandatory minimum prevents hard parameter jumps; longer configured transitions provide audible slides without overlapping the next bar. Bus effect nodes remain persistent for their runtime graph's lifetime. Replaced buses receive no later bar scheduling and freeze while their retiring voices finish.

Transport Stop calls `cancelAndHoldAtTime()` at the exact Clock event time for every effect parameter on active and retiring buses. This cancels future values while preserving the currently audible value and graph connections. A later restart can schedule the same bar at its new audio time.

Bus output gain remains constant. Intra-bar bus automation, envelopes, LFOs, MIDI CC, patterned sends, main effects, and bus-to-bus routing remain unsupported. Bus random validation covers only the safely resolvable subset.

### Pattern-triggered ducking

Synthesizer and sampler pattern onsets can trigger ducking on declared named buses. The engine emits one trigger per resolved onset and configured target, before synth voice expansion or sampler source/buffer availability checks. Instrument mute does not suppress a trigger, and sampler duck timing uses the scheduled pattern duration rather than clip, region, loop, or one-shot playback length.

```text
named bus input → effects → duck gain → output gain → persistent main
```

Depth maps to a bounded gain target using `1 - sqrt(depth)`, with a positive floor. Onset and recovery are proportional to the pattern-event duration; recovery begins immediately when the duck target is reached. For example, a 0.5-second event with `onset = 0.2` and `recovery = 0.5` ramps for 0.1 seconds and then recovers for 0.25 seconds. Zero depth leaves existing duck automation unchanged.

Triggers targeting the same bus at the same exact start time are reduced to the deepest request. Other retriggers hold the current gain and replace the remaining dip/recovery rather than stacking gains or jumping to unity. This is intentionally simpler than sample-frame-normalized timeline scheduling: dense or nearly simultaneous requests can remain order-dependent, and interrupted ramps are not analytically reconstructed. The engine does not perform audio-reactive sidechain compression.

Duck gains belong to their runtime graph. Stop cancels future duck automation and holds each active and still-audible retiring bus at its current duck gain; replacement graphs start at unity and old graph callbacks cannot target same-named buses in the new graph. Destroyed graphs take their duck gains with them. Main cannot be ducked, and ducking does not alter instrument routing, sends, mute, bus output gain, or destination connections.

At commit, an undefined BPM resets the clock to the default 120 BPM rather than inheriting the previous sketch's tempo.

The engine clones and validates each update before retaining it for the next prebar. Later caller mutation cannot alter pending state. A validation or clone failure throws synchronously and preserves the last valid pending update and active graph. This boundary protection does not make Web Audio graph construction transactional.

## Per-voice noise layers

When a schema instrument contains a noise layer, each scheduled musical voice
owns one mono `noise-processor` source and its local gain node. The noise branch
is mixed additively with the main source before the voice's ordered effects and
shared amplitude envelope:

```text
main source ───────────────────────┐
noise source → noise gain ─────────┴→ voice effects → shared ADSR
```

Noise gain reuses the normal parameter scheduler, including static/random
patterns, envelopes, LFO connections, and MIDI CC bindings. A zero initial LFO
value does not skip source creation. Noise does not add note or duck events,
change main-source gain, collapse stereo main audio, or create an independent
clock or release tail. The shared voice stop time remains authoritative,
including for sampler loop, clip, fit, region, reverse, and one-shot duration
branches.

The current internal seed is always `0`, making fresh native renders
reproducible without instrument-index or voice-index propagation. Public seed
selection and per-identity variation are deferred. Processor completion,
processor errors, cancellation, destruction, and partial setup failures all use
the same multi-source ownership and instrument retirement boundary as the main
voice.

## Instrument lifecycle

Engine instruments move through a one-way lifecycle:

```text
Active ──retire()──▶ Retired ──voices end──▶ Finished ──destroy()──▶ Destroyed
   └────────────────── engine.destroy() ──────────────────────────▶ Destroyed
```

### Active

An active instrument belongs to the engine's current runtime graph. It can schedule new bars and voices, and it may hold real-time MIDI bindings.

An active instrument may temporarily have no scheduled voices. Being idle does not finish it because later bars may schedule more voices.

### Retired

Schema replacement calls `retire()` and removes the instrument from active scheduling. Retirement:

- prevents new MIDI connections;
- removes existing MIDI bindings immediately;
- preserves scheduled voices and their release tails;
- keeps the instrument and its original named buses in a retiring runtime graph until every instrument in that graph finishes.

### Finished

`finished` is a completion Promise, not a separately mutable operating mode. It resolves when an instrument is both retired and has no remaining tracked voices.

The engine waits for every instrument in a retiring runtime graph to finish, then destroys those instruments and their named buses.

### Destroyed

`destroy()` is terminal. It stops and disconnects tracked voices, removes MIDI bindings, disconnects LFOs, disconnects the balancing and mute stages, and resolves `finished` if necessary.

Engine destruction skips graceful retirement and destroys active and retiring instruments immediately.

### Orthogonal conditions

These conditions do not represent lifecycle states:

- **Idle:** no voices are currently tracked.
- **Muted:** the dedicated local mute gain is zero.
- **MIDI connected:** the instrument has a current runtime MIDI provider.
- **Future notes scheduled:** tracked voices exist but have not started yet.

## LFO parameter semantics

An LFO worklet emits the complete target parameter value. Web Audio normally sums connected signals with an `AudioParam`'s intrinsic value, so the engine sets that intrinsic value to `0` before connecting an LFO. Native defaults such as filter frequency `350` or gain `1` therefore do not shift the configured LFO range.

Default LFO mode treats `outputA` as a baseline and `outputB` as a bipolar offset:

```text
output = outputA + outputB × waveform[-1…1]
```

Normalized mode treats them as minimum and maximum:

```text
output = outputA + (outputB - outputA) × waveform[0…1]
```

LFO worklet nodes are instrument-owned and free-running. Their connections to voice parameters are voice-owned:

- a voice disconnects its LFO parameter edges when it ends;
- cancelling a voice that has not started disconnects its edges;
- transport Stop does not disconnect edges from currently audible voices;
- terminal instrument destruction disconnects remaining voice edges before shared LFO nodes.

## Development

```bash
pnpm --filter @web-audio/audio-engine format
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/audio-engine build
```
