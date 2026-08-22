# @web-audio/audio-engine

Web Audio playback engine for scheduled Fluid schemas.

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

Main gain is engine-global, so a main gain update affects both active and retiring voices. Main effects, dynamic bus parameters, and bus-to-bus routing are not currently supported.

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
      // remaining synthesizer or sampler fields
    },
  ],
}
```

Bus and route names must already be trimmed and non-empty. Named routes and send targets must reference declared buses; sends cannot target main and their amounts must be finite values in `[0, 1]`. Bus gain must be finite and non-negative. Named-bus effects currently accept only gain and filter processors whose parameters contain one finite static value.

At commit, an undefined BPM resets the clock to the default 120 BPM rather than inheriting the previous sketch's tempo.

The engine clones and validates each update before retaining it for the next prebar. Later caller mutation cannot alter pending state. A validation or clone failure throws synchronously and preserves the last valid pending update and active graph. This boundary protection does not make Web Audio graph construction transactional.

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
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/audio-engine build
```
