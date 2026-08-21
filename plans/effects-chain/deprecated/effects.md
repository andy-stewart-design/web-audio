# Effects implementation notes

These notes compare the implementations in the sibling `web-audio-examples` directory. Links are relative filesystem links from this document; they work when `web-audio` and `web-audio-examples` remain siblings.

A useful theme across the examples is that the DSP algorithm is only part of an effect. We also need to decide:

- insert vs. send topology;
- wet/dry law and bypass behavior;
- parameter units/ranges and perceptual mapping;
- whether parameters are smoothed/automatable;
- stereo/channel behavior;
- tail lifetime and node cleanup;
- input/output gain staging.

[Hyperblam's `Box`](../../../web-audio-examples/hyperblam/src/primitives/Box.js) is a compact reference for a common effect wrapper: input, parallel dry/wet gains, output, mix, and bypass. Its linear crossfade (`dry = 1 - mix`, `wet = mix`) attenuates correlated material at the midpoint, however. [Supradough instead implements an equal-power crossfade](../../../web-audio-examples/strudel/packages/supradough/dough.mjs), using sine/cosine gains. We should deliberately choose a mix law rather than inheriting one accidentally.

## Reverb

### Findings

- All three examples use convolution, but demonstrate two useful product models:
  - Hyperblam loads an external IR into a `ConvolverNode` and follows it with a low-pass filter ([source](../../../web-audio-examples/hyperblam/src/elements/Reverb.js)).
  - Strudel supports either a supplied IR or a synthetic IR whose duration, fade-in, starting brightness, and final brightness can be controlled ([reverb wrapper](../../../web-audio-examples/strudel/packages/superdough/reverb.mjs), [IR generation](../../../web-audio-examples/strudel/packages/superdough/reverbGen.mjs)).
  - KickWithReverb stores multiple IRs, selects/prepares one on demand, and runs post-reverb high- and low-pass filters ([signal flow](../../../web-audio-examples/KickWithReverb/dsp/audio_engine.cpp), [UI controls](../../../web-audio-examples/KickWithReverb/frontend/src/hooks/use-reverb-layer.ts)).
- KickWithReverb models reverb as a **100% wet send**. Dry kick/noise bypass convolution and the filtered reverb return is summed later. This avoids duplicating the dry signal and lets one reverb be shared by several sources.
- Strudel uses the same shared-send approach for its main/orbit reverb, while nested per-effect chains construct explicit parallel dry and wet paths ([chain construction](../../../web-audio-examples/strudel/packages/superdough/superdough.mjs)). This is a useful distinction for our architecture: a chain reverb is an insert; a global reverb should usually be a send.
- Strudel's synthetic IR is stereo independent noise with an exponential envelope. `decayTime` is defined as the time to reach -60 dB, while the allocated buffer is 1.5 times longer to reach roughly -90 dB. It optionally fades in the IR and renders a low-pass sweep offline to make the tail darken over time.

```js
const decayBase = Math.pow(1 / 1000, 1 / decaySampleFrames);
channel[sample] = randomSample() * Math.pow(decayBase, sample);
```

- A generated IR is potentially expensive and should not be regenerated on every UI movement. Cache it by its defining parameters, debounce regeneration, or render it off the audio thread. Strudel uses `OfflineAudioContext` for the time-varying filter and explicitly disconnects temporary nodes after rendering.
- If external IRs are supported, account for sample rate, channel layout, decoding/loading state, and switching behavior. KickWithReverb separates `loadIR` (storage) from `selectIR` (FFT preparation), which keeps expensive preparation out of the initial transfer step.
- Reverb tails must outlive the source note. The effect graph cannot be destroyed at note-off; Strudel includes effect release in its graph lifetime calculation.
- The initial buses/routes/sends SOW uses a deliberately bounded policy for existing filters: after all generation instruments finish, it allows exactly 100 ms of audio-context time for filter ringing and then applies an exact 10 ms generation-output fade before destruction. If audio time is suspended, retirement pauses. This is intentional truncation, not a guarantee that a resonant filter has fully settled. Reverb implementation must replace this coarse allowance with a finite per-effect tail-duration contract (or another explicit completion mechanism), and generation retirement must wait for bus tails after the final source disconnects. Feedback or unbounded tails also require a documented maximum retirement policy. This is a prerequisite for adding reverb, not optional cleanup work.

### Suggested first implementation

A `ConvolverNode` insert with explicit dry/wet gains is the simplest start. Keep the convolver path 100% wet internally, expose post-return high-pass and low-pass filters, and make IR loading asynchronous/cached. The same processor can later be hosted on a shared send bus.

## Delay/Echo

### Findings

- The standard graph is `input -> DelayNode -> feedback gain -> (optional filter) -> DelayNode`, with the delayed output also routed to a wet output. Hyperblam's implementation includes a low-pass filter inside the feedback loop, which progressively darkens repeats ([source](../../../web-audio-examples/hyperblam/src/elements/Echo.js)).
- Clamp feedback below unity. Strudel uses `0.995` in its reusable node and `0.98` at the effect-chain boundary ([feedback delay](../../../web-audio-examples/strudel/packages/superdough/feedbackdelay.mjs), [usage](../../../web-audio-examples/strudel/packages/superdough/superdough.mjs)). Absolute-value coercion is less desirable for our API; validating a documented range is clearer.
- Delay mix semantics deserve care. Hyperblam intentionally keeps dry gain at `1` and treats `mix` as an added echo level rather than a crossfade. That is often the intuitive behavior for echo. Strudel likewise uses a send amount while preserving the dry signal.
- Support both seconds and tempo synchronization at the API/UI boundary. Strudel computes delay time from cycles-per-second when no direct delay time is supplied. The DSP only needs seconds; beat division/BPM conversion belongs above it.
- Strudel delays the onset of the wet gain by one delay period. More importantly for us, changing `DelayNode.delayTime` abruptly can pitch-shift/click. Schedule a ramp, use a short crossfade between two delay taps for clean jumps, or explicitly market continuous changes as a tape-style effect.
- A feedback delay has a tail. Teardown should wait until repeats become inaudible and must disconnect both the forward and feedback edges. Strudel's changelog and explicit node tracking show that feedback graphs are easy places to leak connections.
- If implemented sample-by-sample, use one circular buffer per channel and allocate it once for the maximum delay. [Supradough's `Delay`](../../../web-audio-examples/strudel/packages/supradough/dough.mjs) is a minimal illustration. Its modulo-buffer implementation is useful conceptually, but it has no fractional-delay interpolation; Web Audio's `DelayNode` already provides interpolated delay.

### Suggested controls

`time` (seconds), optional beat division/sync, `feedback` (hard-limited below 1), `tone/cutoff`, and `mix/send`. Consider stereo/ping-pong as a later topology rather than overloading the first mono/stereo feedback loop.

## Filter

We already have an implementation. Relevant lessons from the examples:

- Hyperblam exposes Biquad low-pass, high-pass, band-pass, and notch modes with frequency and Q ([source](../../../web-audio-examples/hyperblam/src/elements/Filter.js)). Note that this example appears to contain two bugs and should not be copied literally: its `q` setter writes the `type` attribute, and `type` is missing from `observedAttributes`.
- Strudel supports 12 dB (one biquad), 24 dB (two biquads in series), and a nonlinear ladder worklet ([filter construction](../../../web-audio-examples/strudel/packages/superdough/helpers.mjs), [ladder DSP](../../../web-audio-examples/strudel/packages/superdough/worklets.mjs)). Cascading stages is a straightforward way to offer slope, though Q/resonance behavior does not remain identical between slopes.
- The ladder filter clamps cutoff below Nyquist and resonance to a stable range. Its comments and implementation reinforce that all filter parameters must be bounded before coefficient/state updates; out-of-range values can produce NaNs that poison the entire graph.
- Frequency controls and modulation should be perceptual/exponential. Strudel uses exponential ramps for cutoff envelopes and guards zero with a small positive value. Its LFO path also clamps modulation so the resulting cutoff stays in a valid range.
- KickWithReverb uses logarithmic UI mapping over 30–7000 Hz and converts UI values before sending them to DSP ([UI usage](../../../web-audio-examples/KickWithReverb/frontend/src/hooks/use-reverb-layer.ts)). This is preferable to a linear Hz knob.
- If our existing filter supports live automation, smooth cutoff and Q changes rather than assigning discontinuous values. Also verify behavior near Nyquist at every supported sample rate, not only 44.1 kHz.

## Gain

We already have an implementation. Relevant lessons from the examples:

- Hyperblam is the minimal `GainNode` wrapper ([source](../../../web-audio-examples/hyperblam/src/elements/Gain.js)). In production, update `AudioParam` with scheduled ramps/targets to prevent zipper noise rather than assigning `value` for abrupt UI changes.
- Decide whether the public unit is linear amplitude or dB. KickWithReverb exposes dB for level controls and converts at the DSP boundary with `10 ** (dB / 20)` ([source](../../../web-audio-examples/KickWithReverb/dsp/audio_engine.cpp)). dB is generally more useful for level controls; linear values remain convenient for modulation and internal multiplication.
- A normalized knob should use a perceptual curve. Strudel allows its gain curve to be replaced and Supradough defaults to `value ** 2` ([Web Audio gain hook](../../../web-audio-examples/strudel/packages/superdough/superdough.mjs), [sample DSP](../../../web-audio-examples/strudel/packages/supradough/dough.mjs)). We should define one mapping at the UI/API boundary and avoid applying it twice.
- Clarify gain staging in the chain: input gain/drive before nonlinear effects and output/makeup gain after them are not interchangeable. Strudel has both initial `gain` and final `postgain` stages.
- If gain doubles as mute/bypass, ramp to/from zero over a few milliseconds. This avoids clicks while retaining a truly silent output.

## Limiter

### Findings

- Web Audio has no dedicated limiter node. Hyperblam approximates one with `DynamicsCompressorNode`: threshold -24 dB, knee 30 dB, ratio 12:1, attack 3 ms, release 250 ms ([source](../../../web-audio-examples/hyperblam/src/elements/Limiter.js)). Those settings are actually a fairly soft compressor, not a strict peak ceiling.
- KickWithReverb wraps JUCE's limiter with a 0 dB threshold and 10 ms release ([source](../../../web-audio-examples/KickWithReverb/dsp/limiter.h)). It places adjustable gain **before** the limiter, so its “Limiter” amount is effectively drive into a fixed ceiling rather than a ceiling control ([chain](../../../web-audio-examples/KickWithReverb/dsp/audio_engine.cpp)). That can be a good one-knob UX, but should be named/documented accordingly.
- A true peak limiter normally needs lookahead/delay, envelope detection, linked stereo gain reduction, and often oversampling or true-peak estimation. `DynamicsCompressorNode` is a pragmatic first implementation but cannot promise brick-wall/true-peak output.
- Keep channels linked: deriving independent gain reduction per channel shifts the stereo image. Expose gain reduction for metering if the backend makes it available (`DynamicsCompressorNode.reduction` does).
- Place the safety limiter last, after makeup/output gain. Reserve headroom below 0 dBFS (for example a -1 dB ceiling) if rendered audio may be encoded/resampled.

### Suggested first implementation

Start with `DynamicsCompressorNode` using a near-zero knee, high ratio, short attack, and tunable release, plus a pre-gain control and conservative output ceiling. Label it as a limiter approximation. Move to an AudioWorklet lookahead limiter if strict ceiling behavior becomes a requirement.

## Pan

### Findings

- For the Web Audio graph, `StereoPannerNode` is the direct implementation and takes `[-1, 1]` ([Hyperblam](../../../web-audio-examples/hyperblam/src/elements/Pan.js)). Strudel exposes `[0, 1]` and converts with `2 * pan - 1` ([source](../../../web-audio-examples/strudel/packages/superdough/superdough.mjs)). Pick one public range and normalize only once.
- For custom DSP, Supradough illustrates equal-power panning:

```js
const angle = pan * Math.PI / 2;
left *= Math.cos(angle);
right *= Math.sin(angle);
```

  See [the per-voice implementation](../../../web-audio-examples/strudel/packages/supradough/dough.mjs).
- Define what panning stereo input means. `StereoPannerNode` balances a stereo source rather than simply treating it as mono. If we need width, balance, or true source positioning, those should be separate controls/effects.
- Smooth/automate pan changes. If implementing it ourselves, calculate gains per sample (or ramp block endpoints) for automation and avoid a linear pan law, which drops perceived level at center.

## Phaser

### Findings

- Hyperblam demonstrates the core idea: an oscillator drives filter frequency through a gain (modulation depth), while the source runs through an all-pass filter and is mixed with dry signal ([source](../../../web-audio-examples/hyperblam/src/elements/Phaser.js)). The dry/wet interference creates the moving notches; an all-pass alone mostly changes phase.
- A richer phaser usually cascades several all-pass stages and uses feedback. Hyperblam only uses one stage, so treat it as a topology sketch rather than the target sound.
- Current Strudel uses an LFO driving the `detune` of a notch filter, with center frequency, sweep, rate, and depth/Q controls ([`getPhaser`](../../../web-audio-examples/strudel/packages/superdough/superdough.mjs)). This differs from the canonical all-pass cascade but is useful evidence that the audible contract (moving notches) can be achieved with different graphs.
- BPM-sync is straightforward at the control layer. Hyperblam converts beats to oscillator Hz; Strudel accepts rate directly. Preserve LFO phase across parameter changes if the effect is persistent, rather than rebuilding/restarting the oscillator.
- Clamp the sweep so center ± depth remains in an audible/valid range. Driving frequency negative relies on implementation-specific clamping and can produce pops.
- Lifecycle matters: stop/disconnect the LFO and every filter on bypass/removal. Strudel explicitly tracks LFO nodes and has had fixes for unused biquads and LFO connection leaks.

### Suggested first implementation

Use 4–6 cascaded all-pass `BiquadFilterNode`s, one persistent LFO plus modulation gain connected to every stage's frequency, an optional low feedback amount, and equal-power dry/wet mixing. Expose rate, center, sweep/depth, feedback, and mix; add tempo sync above the DSP layer.

## Saturator

### Findings

- Hyperblam uses `high-pass -> WaveShaper -> attenuation -> low-pass`, with 2x oversampling ([source](../../../web-audio-examples/hyperblam/src/elements/Saturator.js)). Pre/post filtering and output compensation are important: saturation creates high-frequency harmonics and often changes loudness substantially.
- Hyperblam regenerates a 44,100-entry curve when mode/amount changes. Curve length should not be tied to an assumed 44.1 kHz sample rate; a much smaller fixed table is generally sufficient for `WaveShaperNode`, and expensive regeneration should be avoided during continuous gestures.
- Some Hyperblam curve modes are discontinuous or suspicious (for example mode 3 reduces to a scaled absolute-value shape), so use it for graph ideas, not as a validated algorithm set.
- Strudel has a stronger set of candidate transfer functions: soft/tanh, hard clip, normalized cubic, symmetric/asymmetric diode-like shaping, fold, sine fold, and Chebyshev shaping ([algorithms](../../../web-audio-examples/strudel/packages/superdough/helpers.mjs)). Its worklet converts a friendly drive value using `expm1`, applies the selected algorithm sample-by-sample, and includes post-gain ([processor](../../../web-audio-examples/strudel/packages/superdough/worklets.mjs)).
- KickWithReverb's asymmetrical curve adds even harmonics:

```cpp
return std::tanh(x * drive) + 0.1f * x * x;
```

  It saves a dry copy and blends after processing ([waveshaper](../../../web-audio-examples/KickWithReverb/dsp/distortion.cpp), [wet/dry chain](../../../web-audio-examples/KickWithReverb/dsp/audio_engine.cpp)). Note that the added square term can create DC offset; a post high-pass/DC blocker is prudent for asymmetric shaping.
- Oversampling reduces aliasing from nonlinear harmonics. `WaveShaperNode` gives `2x`/`4x` options; a custom worklet needs its own oversampling/filtering if aliasing quality matters.
- Loudness compensation is part of usable saturation. At minimum provide output gain; ideally derive a compensation curve or offer auto-gain that can be disabled.

### Suggested first implementation

Start with `WaveShaperNode`, tanh/soft-clip and optional asymmetric modes, 2x or 4x oversampling, pre-drive, post-gain, optional tone filters, and equal-power mix. Cache transfer curves by algorithm/drive or use one normalized curve with gain before it so ordinary drive changes do not regenerate the table.

## Compressor

### Findings

- Strudel directly maps threshold, ratio, knee, attack, and release to `DynamicsCompressorNode`, with defaults of -3 dB, 10:1, 10 dB, 5 ms, and 50 ms ([helper](../../../web-audio-examples/strudel/packages/superdough/helpers.mjs), [chain insertion](../../../web-audio-examples/strudel/packages/superdough/superdough.mjs)). This is the most practical first implementation.
- Parameter units should match familiar compressor conventions: threshold/knee in dB, ratio unitless, attack/release in seconds internally (milliseconds in UI if clearer). Enforce the native node ranges.
- Add explicit makeup/output gain after compression; otherwise users often perceive “quieter” as “worse.” Input gain before the detector changes how much compression occurs and should be a separate concept.
- `DynamicsCompressorNode.reduction` can drive a gain-reduction meter. Metering should read existing state and not create analyser nodes per render/update.
- Decide whether the effect is a general compressor or a limiter preset. Hyperblam's “Limiter” demonstrates that similar primitives can produce very different behavior depending on knee, ratio, and timing.
- Advanced requirements—sidechain input/filter, selectable detector, lookahead, upward compression, parallel compression—would require a custom AudioWorklet. KickWithReverb's multiband OTT implementation is relevant only if we later add a separate multiband/upward-downward compressor; it should not set the scope for the initial effect.

### Suggested first implementation

Wrap one persistent `DynamicsCompressorNode` with input and makeup `GainNode`s. Expose threshold, ratio, knee, attack, release, makeup, mix, bypass, and reduction metering. Smooth gain controls; use native `AudioParam` scheduling for compressor parameters where available.

## Bitcrush

### Findings

“Bitcrush” commonly combines two independent effects, and Strudel usefully keeps them separate:

1. **Bit-depth/amplitude quantization** (`crush`):

```js
const steps = 2 ** (bits - 1);
out = Math.round(input * steps) / steps;
```

2. **Sample-rate reduction/sample-and-hold** (`coarse`): hold one input sample for N output samples.

See Strudel's [AudioWorklet processors](../../../web-audio-examples/strudel/packages/superdough/worklets.mjs) and the smaller [sample-by-sample classes](../../../web-audio-examples/strudel/packages/supradough/dough.mjs).

- This requires custom DSP/AudioWorklet; there is no native Web Audio bitcrusher node.
- Keep independent state per channel. The worklet implementation quantizes each channel independently and the sample-and-hold processor reuses the previous output sample.
- The simple Strudel coarse processor keys its hold interval to each 128-sample render block (`n % coarse`) and reads `coarse` only once per block. A robust implementation should keep a persistent phase/counter across blocks so intervals larger than or not dividing 128 remain continuous.
- Clamp bit depth to a useful safe range. Strudel clamps only the minimum to 1; we should also cap the maximum (for example 1–16 or 1–24) to avoid meaningless exponent growth.
- Decide how quantization maps full scale. The shown formula provides signed fractional steps and may not match a strict integer PCM quantizer at the endpoints. That is fine musically, but should be tested at `-1`, `0`, and `1` and named as an effect rather than an encoder simulation.
- Abruptly changing bit depth or hold factor is intentionally gritty but may click. If modulation is supported, define whether controls are a-rate or k-rate. Integers/rounded values are generally easier to reason about.
- Consider a post low-pass filter and output trim. Sample-rate reduction aliases by design, but tone control makes it more usable; quantization can also alter peak behavior.

### Suggested first implementation

One stereo AudioWorklet with `bits`, `downsample`, `mix`, and output gain. Maintain `heldSample[channel]` and one persistent downsample phase/counter, quantize after sample-and-hold, and process every channel rather than assuming exactly two. Keep the wet/dry wrapper outside the worklet if all effects will share one chain wrapper.
