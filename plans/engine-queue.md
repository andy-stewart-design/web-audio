# Engine Queue: Bar-Aligned Schema Updates

## Goal

Refactor AudioEngine from a create-per-eval model to a long-lived instance with
queued, bar-aligned schema updates. Ensures re-evaluation never disrupts
currently-playing audio.

## Design Decisions

- **Engine is long-lived**: created once with `ctx` and `clock`, persists across
  start/stop cycles
- **`update(schema)` queues a pending schema**: last write wins within a bar
- **`prebar` callback commits**: creates new players from pending schema, retires
  old players (without disconnecting their audio graph)
- **`bar` callback applies**: schedules notes with the new players
- **One-bar grace period**: retired players are cleaned up at the next `prebar`
  after they stop scheduling (upgrade to self-reporting when envelopes land)
- **Engine is clock-reactive**: no stop/start API needed — if the clock isn't
  ticking, the engine does nothing
- **Empty schemas are not special-cased**: zero instruments means nothing gets
  scheduled

## Implementation

### 1. Refactor AudioEngine (`packages/audio-engine/src/index.ts`)

**Constructor** changes from `(ctx, clock, schema)` to `(ctx, clock)`:
- Stores `ctx` and `clock`
- Subscribes to `prebar` and `bar` events
- No players created yet

**`update(schema: DromeSchema)`**:
- Sets `this._pending = schema`
- If clock is paused (first run), commit immediately so the first `bar` event
  has players ready

**`prebar` handler (commit phase)**:
- If `this._pending` exists:
  - Move current `_players` to `_retiring` list
  - Create new `_players` from `this._pending`
  - Clear `this._pending`
- If `_retiring` has players from a previous swap (one bar has passed), clean
  them up (currently a no-op since oscillators self-disconnect via `onended`,
  but this is where future cleanup like disconnecting effect chains would go)

**`bar` handler (apply phase)**:
- Schedule all current `_players` for this bar (same as today)

**`destroy()`**:
- Unsubscribes from clock events
- Clears players and retiring list

### 2. Update App (`apps/sequencer/src/App.tsx`)

**`getEngine()`** — lazy initializer like `getAudio()` and `getClock()`:
- Creates `new AudioEngine(getAudio().ctx, getClock())`
- Engine persists for the lifetime of the app

**`evaluate()`**:
- Builds schema from code
- Calls `getEngine().update(schema)`
- Starts clock if not running

**`stopClock()`**:
- Stops the clock
- Does NOT destroy the engine

**Cleanup effect**:
- Calls `engineRef.current?.destroy()` on unmount

### 3. Files Changed

| File | Change |
|------|--------|
| `packages/audio-engine/src/index.ts` | Rewrite constructor, add `update()`, add `prebar`/`bar` handlers, retiring queue |
| `apps/sequencer/src/App.tsx` | Long-lived engine via `getEngine()`, simplified `evaluate()` and `stopClock()` |
