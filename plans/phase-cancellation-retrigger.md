# Fix: Phase Interference on Same-Pitch Bleed Notes

## Problem

When a gain envelope with `mode: "bleed"` causes the release of one note to overlap with
the attack of the next, two `OscillatorNode`s at the same frequency are summed in the
audio graph simultaneously. Each new oscillator always starts at **phase 0**, so the old
(releasing) oscillator is at whatever phase it has accumulated — creating phase-dependent
interference that varies by note and BPM.

### Why note 60 at 120 BPM is the obvious case

At 120 BPM, `barDuration = 2.0s`. The phase offset between the old and new oscillator at
the moment of transition is:

```
φ = (frequency × barDuration) mod 1 cycle
```

| Note | Freq (Hz)  | φ (cycles) | φ (degrees) | cos(φ)            |
|------|------------|------------|-------------|-------------------|
| 59   | 246.94     | 0.88       | 316.8°      | +0.73 (constructive) |
| **60** | **261.63** | **0.26** | **93.6°** | **−0.06 (≈ destructive)** |
| 61   | 277.18     | 0.36       | 129.6°      | −0.64             |

Note 60 lands almost exactly at 90°. The two triangle waves become nearly orthogonal:
they don't cancel to silence (that's 180°), but they combine into a different waveform
shape and their sum amplitude varies as `√(A_old² + A_new²)` — a curved arc from √2
back to 1 over the release window. The waveform distortion and amplitude bump are both
audible.

### Why `[60, 60]` sounds fine

Each note is half the bar → `releaseDur = 0.5 × 1.0s = 0.5s`. The interference window
is half as long and the phase offset is different (229°), making the artifact
imperceptible.

---

## Fix: Reuse the Oscillator on Retrigger

Instead of creating a new `OscillatorNode` every note, when the same MIDI pitch repeats
and the old oscillator is still alive, **keep the oscillator running and only reschedule
the gain envelope**. No new oscillator = no phase mismatch.

---

## Changes Required

### 1. New tracking map in `Synthesizer`

Add alongside (or replacing) the inherited `_scheduled` set:

```ts
type ActivePitch = {
  osc: OscillatorNode;
  gain: GainNode;
  effectNodes: AudioNode[];
  pendingStopTime: number; // when osc should stop if not retriggered
};

private _activePitches = new Map<number, ActivePitch>();
```

---

### 2. Defer `osc.stop()`

**This is the trickiest part.** Currently `_scheduleNote` calls
`osc.stop(endTime + releaseDur + 0.05)` immediately. Once `stop()` is called it cannot
be changed or cancelled — so a retriggered note would find a zombie oscillator it can't
extend.

The fix: **do not call `osc.stop()` at schedule time**. Store the intended stop time in
`pendingStopTime` and call `stop()` lazily:

| Situation | Action |
|---|---|
| Same pitch arrives, old osc still alive | Retrigger — update `pendingStopTime`, never call `stop()` on old osc |
| Different pitch arrives, old osc being evicted | Call `osc.stop(pendingStopTime)` now |
| `cancelFutureNotes` called | Call `osc.stop(0)` on every entry in `_activePitches` |
| Sequencer naturally ends | Iterate `_activePitches`, call `osc.stop(pendingStopTime)` on each |

---

### 3. Retrigger fork in `_scheduleNote`

```ts
const existing = this._activePitches.get(note.value);

if (existing && existing.pendingStopTime > startTime) {
  // --- RETRIGGER PATH ---
  // Oscillator is still alive. Skip creating new nodes.
  // Cancel old gain schedule and reschedule from startTime.
  // Update pendingStopTime.
} else {
  // --- NEW OSC PATH ---
  // Finalize the old osc if one exists (call stop(pendingStopTime)).
  // Create OscillatorNode, GainNode, effects chain as today.
  // osc.start(startTime) — but do NOT call osc.stop() yet.
  // Store in _activePitches.
}
```

---

### 4. Clean gain retrigger with `cancelAndHoldAtTime`

When retriggering mid-release, the gain is already partway through a ramp. Stamping
`setValueAtTime(min, startTime)` over it causes a click. The correct call is:

```ts
gain.gain.cancelAndHoldAtTime(startTime);
```

This cancels all future scheduled values and **holds the gain at the interpolated value
it would have had at `startTime`**. From there the new envelope is scheduled normally
(attack from that held value up to max, decay, sustain, release).

`cancelScheduledValues` would also work but jumps immediately to the last explicitly set
value rather than the interpolated one, which clicks.

`_scheduleParamEnvelope` (or a sibling method) needs a `retrigger: boolean` flag to
conditionally call `cancelAndHoldAtTime` before scheduling.

---

### 5. Effects chain

Two options:

**Option A — reuse effect nodes, reschedule their params** *(simpler, do this first)*
Store `effectNodes` in `ActivePitch`. On retrigger, call `_connectLfoOrSchedule` on the
existing nodes' params rather than building new nodes. Works cleanly when the effects
schema is static (same effects each note, different param values).

**Option B — rebuild the effects chain each note** *(more flexible)*
Keep the oscillator and raw gain node but disconnect the old effect tail, build new
nodes, and reconnect. Handles effects lists changing mid-pattern. More graph
manipulation.

---

## Scope Summary

| Area | Change |
|---|---|
| `Synthesizer` | New `_activePitches` map; retrigger branch in `_scheduleNote`; deferred `osc.stop()` |
| `Instrument._scheduleParamEnvelope` | Add `retrigger` flag (or sibling method) that calls `cancelAndHoldAtTime` before scheduling |
| `Instrument.cancelFutureNotes` | Also drain `_activePitches`, calling `stop(0)` on each |
| `Instrument._track` / `onended` | Unchanged — `onended` still fires when the deferred `stop()` is eventually called |
| Effects | Reschedule params on existing nodes (Option A) to start |

All new state lives in `Synthesizer` — the `Instrument` base class changes are minimal.
