# @web-audio/audio-engine

Web Audio playback engine for scheduled Fluid schemas.

## Instrument lifecycle

Engine instruments move through a one-way lifecycle:

```text
Active ──retire()──▶ Retired ──voices end──▶ Finished ──destroy()──▶ Destroyed
   └────────────────── engine.destroy() ──────────────────────────▶ Destroyed
```

### Active

An active instrument belongs to the engine's current instrument collection. It can schedule new bars and voices, and it may hold real-time MIDI bindings.

An active instrument may temporarily have no scheduled voices. Being idle does not finish it because later bars may schedule more voices.

### Retired

Schema replacement calls `retire()` and removes the instrument from active scheduling. Retirement:

- prevents new MIDI connections;
- removes existing MIDI bindings immediately;
- preserves scheduled voices and their release tails;
- keeps the instrument in the engine's retiring collection until it finishes.

### Finished

`finished` is a completion Promise, not a separately mutable operating mode. It resolves when an instrument is both retired and has no remaining tracked voices.

The engine waits for `finished`, removes the instrument from its retiring collection, and calls `destroy()` to release the remaining graph resources.

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
