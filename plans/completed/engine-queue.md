# Engine Queue: Bar-Aligned Schema Updates

Status: **Complete**

## Goal

Refactor AudioEngine from a create-per-eval model to a long-lived instance with
queued, bar-aligned schema updates. Ensures re-evaluation never disrupts
currently-playing audio. Cancel future-scheduled notes on stop.

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
- **Cancel on stop**: when the clock stops, future-scheduled notes (startTime >
  now) are cancelled immediately; currently-sounding notes finish naturally

## Implementation

### 1. Refactor AudioEngine (`packages/audio-engine/src/index.ts`) — Done

**Constructor** changes from `(ctx, clock, schema)` to `(ctx, clock)`:
- Stores `ctx` and `clock`
- Subscribes to `prebar`, `bar`, and `stop` events
- No players created yet

**`update(schema: DromeSchema)`**:
- Sets `this._pending = schema`
- If clock is paused (first run), commit immediately so the first `bar` event
  has players ready

**`prebar` handler (commit phase)**:
- Clean up players retired from the previous bar
- If `this._pending` exists:
  - Move current `_players` to `_retiring` list
  - Create new `_players` from `this._pending`
  - Clear `this._pending`

**`bar` handler (apply phase)**:
- Schedule all current `_players` for this bar

**`stop` handler**:
- Calls `cancelFutureNotes()` on all active players

**`destroy()`**:
- Unsubscribes from all clock events
- Clears players and retiring list

### 2. Cancel Future Notes (`packages/audio-engine/src/synthesizer-player.ts`) — Done

**`ScheduledNote` tracking**:
- Each scheduled oscillator/gain pair is tracked in a `Set<ScheduledNote>` with
  its `startTime`
- Self-removes via `onended` callback when the note finishes naturally

**`cancelFutureNotes()`**:
- Iterates tracked notes, stops and disconnects any where `startTime > ctx.currentTime`
- Currently-sounding notes are left alone to finish naturally

### 3. Update App (`apps/sequencer/src/App.tsx`) — Done

**`getEngine()`** — lazy initializer like `getAudio()` and `getClock()`:
- Creates `new AudioEngine(getAudio().ctx, getClock())`
- Engine persists for the lifetime of the app

**`evaluate()`**:
- Builds schema from code
- Calls `getEngine().update(schema)`
- Starts clock if not running

**`stopClock()`**:
- Stops the clock (engine reacts via stop event)
- Does NOT destroy the engine

**Cleanup effect**:
- Calls `engineRef.current?.destroy()` on unmount

### 4. Files Changed

| File | Change |
|------|--------|
| `packages/audio-engine/src/index.ts` | Rewrite constructor, add `update()`, `prebar`/`bar`/`stop` handlers, retiring queue |
| `packages/audio-engine/src/synthesizer-player.ts` | Track scheduled notes, add `cancelFutureNotes()` |
| `apps/sequencer/src/App.tsx` | Long-lived engine via `getEngine()`, simplified `evaluate()` and `stopClock()` |
