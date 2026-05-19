# LFO Phase Sync Fix

## The Problem

When an LFO was applied to oscillator detune, there was an audible glitch at the beginning of each bar — the pitch started slightly elevated, dropped down, then ramped up normally. The same LFO applied to a filter frequency parameter sounded correct.

**Glitchy (detune):**
```ts
d.synth("saw").notes([60,64,67,71])
  .detune(d.lfo(0,1600).norm().wave("saw"))
  .fx(d.lpf(800))
  .push()
```

**Clean (filter frequency):**
```ts
d.synth("saw").notes([60,64,67,71])
  .fx(d.lpf(d.lfo(0,1600).norm().wave("saw")))
  .push()
```

Both use the exact same LFO configuration. The fluid layer produces identical schemas for both. The engine connects the LFO to the AudioParam the same way in both cases (`lfoNode.connect(param)`). The difference was purely perceptual — the same underlying bug affected both, but pitch deviations are far more perceptible than filter frequency deviations.

## Root Cause

The bug was in how the LFO worklet's phase was derived — specifically, a timing mismatch between the JS main thread and the audio rendering thread, compounded by a free-running phase accumulator that could drift over time.

### Background: the preAdvance compensation

When a Synthesizer is created (during the clock's `prebar` callback), the LFO AudioWorkletNode needs to start running immediately — but the bar it's targeting is ~100-200ms in the future (`barStartTime`). To compensate, the engine pre-computed how much phase the LFO would accumulate between "now" and `barStartTime`, and subtracted that from the target phase:

```ts
// OLD CODE — instrument.ts _initLfos()
const preAdvance =
  ((barStartTime - this._ctx.currentTime) * lfo.speed[0]) /
  this._clock.barDuration;
const seedPhase = (((basePhase - preAdvance) % 1.0) + 1.0) % 1.0;
```

The intent: the worklet starts at `seedPhase`, advances by `preAdvance` worth of phase by `barStartTime`, and arrives at exactly `basePhase` (typically 0) right when the bar begins.

### Problem 1: JS↔audio thread timing mismatch

The calculation used `this._ctx.currentTime`, which is read on the **JS main thread**. But the AudioWorkletNode doesn't start processing at `ctx.currentTime` — it starts on the **audio rendering thread** at the next render quantum boundary, which is at least 128 samples (~2.9ms at 44.1kHz) later.

This means:
- `preAdvance` was **overestimated** — we assumed the worklet had more time to advance than it actually did
- The worklet had less time to advance than calculated, so at `barStartTime` the phase landed slightly **behind** the target
- Instead of reaching phase 0.0, the phase landed at something like 0.998

### Problem 2: accumulation drift on hot-swap

After the initial seed, the LFO accumulated phase sample-by-sample (`this._phase += speed / barSamples`). This worked fine for the first evaluation, but on re-evaluation (hot-swap while the clock is running), the `startingBar` is non-zero and the absolute time values are larger. Any small timing discrepancy at creation — even if corrected on the first `process()` call — compounded over the LFO's lifetime as the free-running accumulator drifted relative to the bar grid.

This manifested as a glitch that appeared only on re-evaluation:

```ts
// Glitched on re-evaluation:
d.synth("saw").root("a3").scale("min").notes([0,2,4,6])
  .detune(d.lfo(0,400).wave("saw").inv().speed(0.5).norm())
  .fx(d.lpf(1200))
  .push()
```

### What the glitch sounds like

For a normalized sawtooth LFO outputting 0-1600 cents of detune:
- Phase 0.998 maps to an output of ~1597 cents (nearly the top of the range)
- The phase then takes ~3ms to wrap past 1.0 and drop back to 0

So every bar started with a brief spike near 1600 cents that quickly dropped to 0 and then ramped up normally. This matches the observed behavior: "starting at a slightly elevated place, drops down right after the bar starts, and then ramps up."

### Why filter frequency wasn't affected

The same phase error existed on both detune and filter frequency — but the perceptual impact was completely different:

- **Detune:** 1600 cents = over an octave of pitch deviation for ~3ms across 4 simultaneous voices. Pitch perception is extremely precise (humans detect ~5 cent deviations), so this was very audible.
- **Filter frequency:** ~1600 Hz cutoff blip for ~3ms on a filter sweeping a wide range. Filter frequency perception is far less precise, so the same artifact was inaudible.

## The Fix

### Core idea

Replace the free-running phase accumulator with **absolute-time phase derivation**. Instead of accumulating `phase += speed / barSamples` and hoping it stays aligned, the worklet recomputes the phase from `currentFrame` (an AudioWorkletGlobalScope global) at the start of every `process()` call. This is deterministic — the phase is always exactly right regardless of when the worklet was created or how long it's been running.

### How absolute-time phase works

The engine computes `barOriginTime` — the audio time of bar 0 — and passes it to the worklet along with the LFO's `initialPhase`. The worklet precomputes a cumulative bar-fraction table from the speed array, then uses it to derive the exact phase at any point in time.

**For single-speed LFOs** (e.g., `speed: [1]`), this is straightforward:
```
elapsed = currentFrame / sampleRate - barOriginTime
absolutePhase = initialPhase + elapsed * speed / barDuration
phase = absolutePhase % 1.0
```

**For multi-speed LFOs** (e.g., `speed: [2, 1]`), the speed changes per cycle, not per bar. The worklet precomputes how many bars each speed segment takes (`1 / speed[i]`) and builds a cumulative table:

```
speed: [2, 1]
segment 0: takes 1/2 = 0.5 bars
segment 1: takes 1/1 = 1.0 bars
cumBars: [0, 0.5, 1.5]
periodBars: 1.5 (total bars before the pattern repeats)
```

Given elapsed bars, the worklet finds which period and segment it's in, then computes the phase within the current cycle:

```ts
completePeriods = floor(elapsedBars / periodBars)
barsInPeriod = elapsedBars - completePeriods * periodBars
// Linear scan of cumBars to find segment k
barsInSegment = barsInPeriod - cumBars[k]
phaseInCycle = barsInSegment * speed[k]
```

This also gives the correct waveform and speed indices for multi-waveform/multi-speed LFOs via `completePeriods * speeds.length + k`.

### Handling initialPhase

The `initialPhase` (a user-specified cycle offset, typically 0) is converted to an equivalent bar offset in the constructor and baked into the origin time. This way, all elapsed-bar calculations naturally include it without special-casing:

```ts
// Convert initialPhase cycles to bars through the speed segments
let remainingPhase = initialPhase;
let initialBars = 0;
let segIdx = 0;
while (remainingPhase >= 1.0) {
  initialBars += 1 / speeds[segIdx % speeds.length];
  remainingPhase -= 1.0;
  segIdx++;
}
if (remainingPhase > 0) {
  initialBars += remainingPhase / speeds[segIdx % speeds.length];
}
adjustedOriginTime = barOriginTime - initialBars * barDuration;
```

### Changes

**`packages/audio-engine/src/instrument.ts`** (`_initLfos`):

Removed the JS-side `preAdvance` and `seedPhase` computation. Now computes `barOriginTime` (the audio time of bar 0) and passes it along with `lfo.phase` to the worklet:

```ts
const effectiveBarStart = barStartTime ?? this._ctx.currentTime;
const barOriginTime =
  effectiveBarStart - startingBar * this._clock.barDuration;
const node = new AudioWorkletNode(this._ctx, "lfo-processor", {
  processorOptions: {
    // ...
    initialPhase: lfo.phase,
    barOriginTime,
  },
});
```

**`packages/worklets/src/processors/lfo-processor.ts`**:

The processor now calls `_syncPhase()` at the start of every `process()` quantum, which derives the phase from absolute time using `currentFrame`. The per-sample loop still advances the phase for intra-quantum precision, but any drift is corrected at the next quantum boundary (~every 2.9ms):

```ts
private _syncPhase(): void {
  const elapsedBars =
    (currentFrame / sampleRate - this._adjustedOriginTime) / this._barDuration;
  const completePeriods = Math.floor(elapsedBars / this._periodBars);
  const barsInPeriod = elapsedBars - completePeriods * this._periodBars;

  // Find speed segment within this period
  let k = 0;
  while (k < this._speeds.length - 1 && barsInPeriod >= this._cumBars[k + 1]) {
    k++;
  }

  const barsInSegment = barsInPeriod - this._cumBars[k];
  const phaseInCycle = barsInSegment * this._speeds[k];
  const totalCycles = completePeriods * this._speeds.length + k;

  this._phase = ((phaseInCycle % 1.0) + 1.0) % 1.0;
  this._speedIndex = k;
  this._waveformIndex =
    ((totalCycles % this._waveforms.length) + this._waveforms.length) %
    this._waveforms.length;
}
```

On the first `process()` call, `_prevOutput` is also seeded with the raw waveform value at the computed phase, preventing the slew limiter from ramping up from 0.

**`packages/worklets/src/worklet-globals.d.ts`**:

Added the `currentFrame` type declaration (already available in AudioWorkletGlobalScope at runtime, but missing from the project's type definitions).

### Why this works

The old approach had two fundamental issues:

1. **Timing race:** The JS thread computed a time-sensitive value (`preAdvance`) based on `ctx.currentTime`, but the worklet started processing at a slightly different time on the audio thread.
2. **Accumulation drift:** The phase was accumulated sample-by-sample with no ongoing reference to the bar grid, so any initial error persisted and could compound over the LFO's lifetime.

The new approach eliminates both. The phase is derived from `currentFrame` — the audio thread's exact sample-accurate time — at the start of every render quantum. There is no timing race because the computation happens on the audio thread itself. There is no drift because the phase is recomputed from absolute time rather than accumulated, so it's always exactly correct regardless of how long the LFO has been running or when it was created.
