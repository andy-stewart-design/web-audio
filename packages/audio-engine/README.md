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

## Development

```bash
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/audio-engine build
```
