---
title: noise()
description: Add a white or pink noise layer to each instrument voice
---

# noise()

Add a white or pink noise layer to each instrument voice.

**Available on:** Samplers, basic synthesizers, and unison synthesizers.  
**Aliases:** None.

## Usage

```text
instrument.noise(...gain)
instrument.noise(color, ...gain)
```

Both `.noise()` and `.noise(color)` are valid. Returns the same instrument for chaining.

| Argument  | Accepted values                                                                              | Default when omitted | Description                                                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color`   | `"white"` or `"pink"`                                                                        | `"white"`            | Noise color; fixed for the layer, not patterned or automated.                                                                                                    |
| `...gain` | Numbers or number arrays; alternatively, one random source, envelope, LFO, or MIDI CC source | `1`                  | Linear noise level, not decibels. For numeric patterns, each argument is one bar and array entries advance by hit. A control source must be the only gain input. |

A new instrument has **no noise layer** until `.noise()` is called.

```ts
// White noise at a constant level.
d.synth("saw").noise(0.15).gain(0.3).push();

// Pink noise with a patterned level.
d.sample("hh").xox("xxxx").noise("pink", [0.05, 0.2]).gain(0.3).push();

// Animate the level with an LFO.
d.synth("unison").noise("pink", d.lfo(0, 0.2).norm()).gain(0.3).push();

// Shape the noise level with an envelope.
d.sample("hh")
  .noise("white", d.env(0, 0.3).adsr(0.01, 0.2, 0, 0.1))
  .gain(0.3)
  .push();

// Control the level with MIDI CC.
d.synth().noise(d.midi.cc(74)).gain(0.3).push();
```

## Behavior

- Each call replaces the complete noise layer, resetting omitted arguments to their defaults. After `.noise("pink", 0.2)`, calling `.noise(0.1)` selects white noise at `0.1`.
- `.noise(0)` makes the layer silent; it does not remove it. Gain is not clamped to `0…1`; signed values and values above `1` are accepted.
- Noise is unpitched and mono/centered. It is added to the main source before per-voice effects and the shared amplitude ADSR.
- Adding noise does not turn down the main source or apply a limiter. Allow headroom with the instrument's `.gain()`.
- Noise follows the existing voice duration rules. Its gain automation cannot extend the voice's lifetime, and a skipped sampler voice produces no noise.

Numeric patterns use [structured syntax](../../concepts/syntax.md#structured-syntax). See [Patterns](../../concepts/patterns.md) for hit-based value selection.

[Instrument reference](index.md)
