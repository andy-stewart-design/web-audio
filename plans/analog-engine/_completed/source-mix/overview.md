# Synth source mixing: the big picture

## What we're doing

We're adding two things in one PR: a main-source gain argument to `d.synth()` and
a `.sub()` layer for synths. Together, they let you balance the ingredients of a
sound without changing the volume of the whole instrument.

The motivating sound is simple: wide, detuned saws with a steady, centered sine
underneath. Turn the saws down, bring the sub up, and send the combination through
the same filter and amplitude envelope.

**Status:** Delivered. Main-source gain and `.sub()` are implemented and
available. The [spec](spec.md) defines the behavior; the [plan](plan.md) and
[evidence/2.3.md](evidence/2.3.md) record the completed verification and final
saved-reference listening approval from reviewer `user`: “Yep, sounds good.”

## Two levels of control

The new gain argument controls just the main source:

```js
d.synth(0.5); // Default sine, main-source gain 0.5
d.synth("saw", 0.8); // Saw, main-source gain 0.8
```

The existing `.gain()` still controls the whole voice. That distinction matters
once the voice contains more than one source:

```js
d.synth("unison", 0.6)
  .sub(0.3)
  .noise("pink", 0.05)
  .gain(0.4)
  .fx(d.lpf(2000))
  .push();
```

Here, `0.6` sets the unison layer's level, `.sub(0.3)` adds the low oscillator,
and `.noise()` adds texture. `.gain(0.4)` shapes the combined voice's amplitude.
Existing synth calls keep their level when the new argument is omitted.

## What the sub does

A sub is one extra oscillator attached to each note. It follows the note's pitch
and common detune, but not the unison stack's spread or stereo width. The sub
starts centered, so widening the main source doesn't spread the low end too.

There are three ways to configure it:

```js
synth.sub(0.3); // Sine, one octave below
synth.sub(-2, 0.3); // Sine, two octaves below
synth.sub("square", -2, 0.3); // Square, two octaves below
```

Sine, triangle, square, and sawtooth are supported, with the existing short aliases.
The initial octave choices are `-1` and `-2`, and gain is required in every form.
Calling `.sub()` again replaces its configuration rather than adding another
oscillator layer.

You can also turn the main contribution off and hear only the accompanying layers:

```js
d.synth(0).sub(0.3).gain(0.4).push();
```

## Familiar patterns, one gain slot

We're using the parameter inputs Fluid already has, not building another pattern
system. Each gain takes one number, shorthand string, reusable `d.sh()` value,
structured value, or supported direct random source, envelope, LFO, or MIDI CC.

```js
synth.sub("square", -2, "<0.3 0.5>");
synth.sub("square", -2, d.str(0.3, 0.5)); // Same two alternating bars
synth.sub("square", -2, d.str([0.3, 0.5])); // Two values within a bar
synth.sub(d.lfo(0.1, 0.3));
```

Raw arrays and extra gain arguments aren't accepted in these slots; use `d.str()`
to package a structured pattern. Main-source gain follows the same rule.

Known synth-selector strings still select a source: `d.synth("saw")` means saw.
Other sole strings are gain shorthand: `d.synth("<0.3 0.5>")` means default sine
with a patterned level. Invalid text fails rather than silently choosing a sound.

Negative static gain values resolve to zero, including those written in shorthand
or structured patterns. Existing automation behavior stays unchanged.

## One voice, not separate instruments

The sources are mixed before the note's effects and shared amplitude envelope:

```text
main source → main gain ─┐
sub → sub gain ──────────┼→ ordered effects → shared amplitude envelope → output
noise → noise gain ──────┘
```

Each chord tone gets its own sub and processing. The sub doesn't create another
MIDI note or rhythm, and a layer's gain envelope can't keep the voice alive after
its shared lifetime ends. Existing voice ownership handles the layers together,
including cancellation, live edits, and cleanup.

Adding a layer won't secretly turn down the main source or normalize the mix.
More layers can mean louder peaks, so leave headroom with the overall gain.

## Keeping this work focused

This PR covers basic and unison synths, not sampler source-gain or sub controls.
It doesn't add an oscillator builder, arbitrary extra layers, independent layer
lifetimes, more unison waveforms, saturation, compression, or automatic limiting.
Those remain separate features.

Most of the new work is connecting the source layers correctly. We'll reuse the
existing input, automation, and cleanup machinery, then check the new wiring,
pitch, stereo mix, and lifetime behavior. Native audio checks and a human
listening review will establish that the resulting sound matches the intent.
