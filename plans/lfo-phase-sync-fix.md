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

The bug was in how the LFO worklet's initial phase was seeded.

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

### The timing mismatch

The calculation used `this._ctx.currentTime`, which is read on the **JS main thread**. But the AudioWorkletNode doesn't start processing at `ctx.currentTime` — it starts on the **audio rendering thread** at the next render quantum boundary, which is at least 128 samples (~2.9ms at 44.1kHz) later.

This means:
- `preAdvance` was **overestimated** — we assumed the worklet had more time to advance than it actually did
- The worklet had less time to advance than calculated, so at `barStartTime` the phase landed slightly **behind** the target
- Instead of reaching phase 0.0, the phase landed at something like 0.998

### What that sounds like

For a normalized sawtooth LFO outputting 0-1600:
- Phase 0.998 maps to an output of ~1597 cents (nearly the top of the range)
- The phase then takes ~3ms to wrap past 1.0 and drop back to 0

So every bar started with a brief spike near 1600 cents that quickly dropped to 0 and then ramped up normally. This matches the observed behavior: "starting at a slightly elevated place, drops down right after the bar starts, and then ramps up."

### Why filter frequency wasn't affected

The same phase error existed on both detune and filter frequency — but the perceptual impact was completely different:

- **Detune:** 1600 cents = over an octave of pitch deviation for ~3ms across 4 simultaneous voices. Pitch perception is extremely precise (humans detect ~5 cent deviations), so this was very audible.
- **Filter frequency:** ~1600 Hz cutoff blip for ~3ms on a filter sweeping a wide range. Filter frequency perception is far less precise, so the same artifact was inaudible.

### Why it repeated every bar

The phase error was baked in at worklet creation and persisted because the LFO free-runs with no bar-boundary sync. The offset was constant: at every bar boundary, the phase was consistently ~0.998 instead of 0.0.

## The Fix

### Core idea

Move the preAdvance calculation from the JS main thread into the worklet's first `process()` call, where `currentFrame` (an AudioWorkletGlobalScope global) provides the exact audio-thread time.

### Changes

**`packages/audio-engine/src/instrument.ts`** (`_initLfos`):

Removed the JS-side `preAdvance` and `seedPhase` computation. Now passes `basePhase` (the target phase at bar start) and `barStartTime` directly to the worklet as processor options:

```ts
const basePhase = lfo.phase + startingBar * lfo.speed[0];
const node = new AudioWorkletNode(this._ctx, "lfo-processor", {
  processorOptions: {
    // ...
    basePhase,
    barStartTime: barStartTime ?? this._ctx.currentTime,
  },
});
```

**`packages/worklets/src/processors/lfo-processor.ts`**:

On the first `process()` call, the worklet computes the preAdvance using `currentFrame / sampleRate` — the precise audio-thread time:

```ts
if (this._needsSync) {
  const currentTime = currentFrame / sampleRate;
  const leadTime = this._barStartTime - currentTime;
  const preAdvance =
    (leadTime * this._speeds[0]) / this._barDuration;
  this._phase =
    (((this._basePhase - preAdvance) % 1.0) + 1.0) % 1.0;
  this._prevOutput = WAVEFORM_FNS[this._waveforms[0]](this._phase);
  this._needsSync = false;
}
```

This also seeds `_prevOutput` with the actual waveform value at the computed phase, preventing the slew limiter from ramping up from 0 on the first sample.

**`packages/worklets/src/worklet-globals.d.ts`**:

Added the `currentFrame` type declaration (already available in AudioWorkletGlobalScope at runtime, but missing from the project's type definitions).

### Why this works

The old approach had an inherent race: the JS thread computed a time-sensitive value (`preAdvance`) based on `ctx.currentTime`, but the worklet started processing at a slightly different time on the audio thread. The gap between these two times was the source of the phase error.

The new approach eliminates the race entirely. The worklet computes its own phase correction on its first `process()` call, where `currentFrame` gives the exact sample-accurate time. There is no timing gap — the computation happens at the precise moment the worklet begins processing.
