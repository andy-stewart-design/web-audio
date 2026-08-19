# Air Theremin: Web Audio API Notes

These notes focus only on reusable Web Audio API and signal-processing ideas from the Air Theremin implementation. Hand tracking, gyroscope input, and UI behavior are intentionally excluded.

## Most interesting techniques

### 1. Psychoacoustic bass exciter

Signal path:

```text
oscillator
  → low-pass
  → waveshaper saturation
  → tracking high-pass
  → gain
  → main signal chain
```

The oscillator is soft-clipped with a `WaveShaperNode`, generating upper harmonics. A `BiquadFilterNode` high-pass then removes the original fundamental. Small speakers may not reproduce the fundamental, but they can reproduce its harmonics, allowing the listener to perceptually reconstruct the missing bass pitch.

The high-pass cutoff follows the played note:

```js
const hp = clamp(frequency * 2, 120, 340);
bassHP.frequency.setTargetAtTime(hp, context.currentTime, 0.05);
```

Useful details:

- The exciter taps the oscillator before volume modulation, so its saturation character does not change with note volume.
- It rejoins before the instrument VCA, so it follows volume, tremolo, filtering, reverb, and delay.
- `WaveShaperNode.oversample = "4x"` reduces aliasing.
- The saturation curve uses normalized `tanh`:

```js
curve[i] = Math.tanh(k * x) / k;
```

This keeps the small-signal slope near 1 rather than introducing an accidental gain boost.

**Drome relevance:** High. This could become a `bassExciter` effect or an optional synth feature.

### 2. Procedurally generated convolution reverb

Instead of loading an impulse-response asset, the implementation creates one in memory from decaying noise:

```js
sample =
  (Math.random() * 2 - 1) *
  Math.pow(1 - index / length, decay);
```

It then adds sparse impulses for early reflections, with slightly different positions in each stereo channel:

```js
const taps = [0.013, 0.027, 0.043, 0.061, 0.089];
```

Wet path:

```text
send → pre-delay → convolver → low-pass → wet gain
```

Benefits:

- No external asset or network request.
- Pre-delay preserves source clarity.
- Filtering after convolution creates a darker, less metallic tail.
- Slightly offset stereo reflection taps add inexpensive width.

**Drome relevance:** High. This could provide generated room or cave presets. Drome should seed the random impulse response so reevaluation remains deterministic.

A five-second stereo convolution IR can be relatively expensive. Generate it once and share it rather than creating one per voice.

### 3. Custom `PeriodicWave` timbres

The implementation replaces harsh built-in saw and square waves with explicitly attenuated harmonic series:

```js
// Mellow saw-like waveform
imag[n] = (1 / n) * Math.exp(-n / 7);

// Reed/clarinet-like waveform
if (n % 2 === 1) {
  imag[n] = (1 / n) * Math.exp(-n / 11);
}
```

This produces:

- `warm`: all harmonics with exponential attenuation
- `reed`: odd harmonics only, also attenuated

It is a simple way to provide useful synth timbres without samples or an `AudioWorklet`.

**Drome relevance:** High. Drome could offer a small custom-wave library or eventually expose a harmonic-wave DSL.

Fixed 32-harmonic tables are not fully band-limited at high fundamentals, but they are gentler than unfiltered bright waves.

### 4. LFO modulation through `AudioParam`

Vibrato graph:

```text
LFO oscillator → depth gain → oscillator.detune
```

Using `detune` expresses depth in cents and keeps the effect perceptually consistent across pitches.

Tremolo graph:

```text
LFO oscillator → depth gain → VCA.gain
```

The tremolo implementation biases the VCA's base gain downward:

```js
tremGain.gain.value = 1 - depth;
```

A bipolar LFO then adds `depth`, producing approximately `1 - 2d … 1` rather than exceeding unity and creating unnecessary peaks.

**Drome relevance:** Directly relevant to Drome's LFO system. The gain bias is worth retaining.

### 5. Perceptual volume and frequency compensation

The volume mapping works in decibels rather than treating linear gain as perceptually linear:

```js
gain =
  maxGain *
  Math.pow(10, (normalizedVolume - 1) * (dbRange / 20));
```

It also boosts low frequencies with a smooth logarithmic frequency curve:

```js
return Math.pow(10, (bassBoostDb / 20) * amount);
```

Each waveform receives a separate loudness multiplier because harmonically rich waveforms carry more energy than a sine wave.

**Drome relevance:** Medium to high. The techniques are useful for normalized UI parameters, preset loudness matching, waveform switching, and phone-speaker-oriented instruments. Reuse the approach rather than the implementation's instrument-specific constants.

### 6. Parameter smoothing

Continuously changing parameters generally use:

```js
param.setTargetAtTime(value, context.currentTime, timeConstant);
```

Different parameters use different smoothing times:

- Pitch and volume: roughly 12–30 ms
- Filter cutoff: roughly 90 ms
- Reverb mix: roughly 140 ms

Pitch and amplitude need responsiveness, while room and timbre movement can tolerate more lag.

**Drome relevance:** Very high architecturally. Live parameter updates should use Web Audio automation rather than direct `.value` assignments. Drome could associate a default smoothing time with each parameter type.

Scheduled musical events should still use explicit timeline operations such as `setValueAtTime`, ramps, and automation cancellation where appropriate.

### 7. Master and recording graph

Output graph:

```text
mix bus
  → DynamicsCompressorNode configured as a limiter
  → AnalyserNode
  → speakers
  + MediaStreamAudioDestinationNode
```

This allows recording to capture the processed master, including effects and limiting.

Limiter-like settings:

```js
threshold = -6;
knee = 0;
ratio = 20;
attack = 0.003;
release = 0.25;
```

**Drome relevance:** Medium. A shared master bus with metering, safety limiting, and recording output would be useful.

`DynamicsCompressorNode` is not a true brick-wall or lookahead limiter. It is useful as a safety compressor but cannot guarantee that every transient or inter-sample peak is contained.

### 8. Feedback echo topology

The delay uses the standard feedback graph:

```text
input → delay → wet gain → mix
          ↓
     feedback gain
          └────→ delay
```

Reverb and echo are parallel sends instead of one long serial chain. This preserves a clean dry signal and permits independent wet levels.

**Drome relevance:** Directly useful. A delay effect should expose at least:

- Delay time
- Feedback
- Wet/dry mix
- A filter inside the feedback loop

The feedback filter would improve this implementation by making successive repeats darken naturally.

## Smaller ideas worth borrowing

- **Pitch-relative filter cutoff:** The distance low-pass floor is `max(620, fundamental * 2.4)`, preventing the filter from removing the played fundamental.
- **Always-running LFOs gated by modulation depth:** Effects can be toggled without continually constructing and destroying nodes.
- **Stable oscilloscope triggering:** Search for a rising zero crossing and display approximately three waveform periods.
- **Cross-browser recording MIME selection:** Probe Opus/WebM, MP4, and Ogg with `MediaRecorder.isTypeSupported()`.
- **Shared reverb send:** Prefer one shared convolver where possible rather than one convolver per voice.

## Suggested Drome priorities

1. Custom `PeriodicWave` timbres
2. Feedback delay effect
3. Generated, seeded convolution reverb
4. Reusable parameter-smoothing conventions
5. Master bus with analyser, recording destination, and safety compressor
6. Bass exciter as an advanced effect

The bass exciter and procedural convolution reverb are the most distinctive ideas. The remaining code is mostly solid, reusable Web Audio engineering rather than unusual DSP.
