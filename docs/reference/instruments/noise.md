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
instrument.noise(gain)
instrument.noise(color, gain)
```

Returns the same instrument for chaining.

| Argument | Accepted values                                                                         | Default when omitted | Description                                                      |
| -------- | --------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------- |
| `color`  | `"white"` or `"pink"`                                                                   | `"white"`            | Noise color; fixed, not patterned or automated.                  |
| `gain`   | A number, shorthand, a `d.str()` value, random source, envelope, LFO, or MIDI CC source | Required             | Linear noise level, not decibels. Pattern values advance by hit. |

A new instrument has **no noise layer**. Gain is required: `.noise()` and `.noise("pink")` are invalid.

Pass the gain as one argument. For structured patterns, use `d.str()`, not a raw array or extra gain arguments. Gain patterns support sequences, grouping, repetition (`!`), and bar alternation (`< >`); they do not accept rests, simultaneous values, or `*`, `/`, and `@` operators.

```ts
// White noise at a constant level.
d.synth("saw").noise(0.15).gain(0.3).push();

// White noise with a shorthand gain pattern.
d.synth("saw").noise("0.05 0.2").gain(0.3).push();

// Pink noise with two gain values within each bar.
d.sample("hh")
  .xox("xxxx")
  .noise("pink", d.str([0.05, 0.2]))
  .gain(0.3)
  .push();

// One gain value per bar, over a repeating two-bar cycle.
d.sample("hh").noise("pink", d.str(0.05, 0.2)).gain(0.3).push();

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

- Each call replaces the complete noise layer. After `.noise("pink", 0.2)`, calling `.noise(0.1)` selects white noise at `0.1`.
- `.noise(0)` makes the layer silent; it does not remove it. Gain is not clamped to `0…1`; signed values and values above `1` are accepted.
- Noise is unpitched and mono/centered. It is added to the main source before per-voice effects and the shared amplitude ADSR.
- Adding noise does not turn down the main source or apply a limiter. Allow headroom with the instrument's `.gain()`.
- Noise follows the existing voice duration rules. Its gain automation cannot extend the voice's lifetime, and a skipped sampler voice produces no noise.

See [Pattern syntax](../../concepts/syntax.md) for structured and shorthand inputs, and [Patterns](../../concepts/patterns.md) for hit-based value selection.

[Instrument reference](index.md)
