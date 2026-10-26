---
title: sub()
description: Add one centered pitched sub oscillator to a synthesizer voice
---

# sub()

Add one pitched sub oscillator to every voice of a synthesizer.

**Available on:** Basic and unison synthesizers only. Samplers do not have
`.sub()`.

Each call replaces the complete sub configuration. There is at most one sub per
synth voice; calling `.sub()` does not add another note or another scheduler.
The gain is required in every form.

## Usage

```text
synth.sub(gain)
synth.sub(octave, gain)
synth.sub(waveform, octave, gain)
```

| Form                           | Defaults and meaning                                                         |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `.sub(gain)`                   | Sine at `-1` octave with the supplied gain.                                  |
| `.sub(octave, gain)`           | Sine at the literal `-1` or `-2` octave with the supplied gain.              |
| `.sub(waveform, octave, gain)` | The selected waveform at literal `-1` or `-2` octave with the supplied gain. |

Supported waveform aliases canonicalize as follows:

| Aliases           | Canonical waveform |
| ----------------- | ------------------ |
| `sin`, `sine`     | `sine`             |
| `tri`, `triangle` | `triangle`         |
| `sq`, `square`    | `square`           |
| `saw`, `sawtooth` | `sawtooth`         |

Octaves are fixed selectors: only `-1` and `-2` are accepted. Waveform and
octave choices are not patterned or automated. Gain is the final argument and
is always required; `.sub()`, `.sub(-1)`, and `.sub("square", -1)` are invalid.

```ts
// All three positional forms.
d.synth().sub(0.3).push();
d.synth().sub(-2, 0.25).push();
d.synth().sub("square", -2, 0.2).push();

// Every waveform family is available through its aliases.
d.synth().sub("sin", -1, 0.2).push();
d.synth().sub("tri", -1, 0.2).push();
d.synth().sub("sq", -1, 0.2).push();
d.synth().sub("saw", -1, 0.2).push();
```

A later call replaces waveform, octave, and gain together, including defaults:

```ts
// The final schema has one sine sub at -1 octave with gain 0.2.
d.synth().sub("square", -2, 0.4).sub(0.2).push();
```

## Gain input

The sub gain (`subGain`, serialized as `sub.gain`) uses Fluid's existing
single-slot audio parameter contract. It accepts a scalar number, a numeric
shorthand string, a reusable `d.sh()` / `d.shorthand()` value, a numeric
`d.str()` / `d.structured()` value, or a direct
`d.rand()`, `d.env()`, `d.lfo()`, or `d.midi.cc()` source.

```ts
// Shorthand, reusable shorthand, and structured values.
d.synth().sub("0.2 0.4").push();
d.synth().sub(d.sh("0.2 0.4")).push();
d.synth()
  .sub(-2, d.str([0.2, 0.4]))
  .push();

// Automation sources go directly in the one gain slot.
d.synth().sub(d.rand()).push();
d.synth().sub(-1, d.lfo(0, 0.3)).push();
d.synth()
  .sub("triangle", -1, d.env(0, 0.35).adsr(0.01, 0.2, 0.3, 0.1))
  .push();
d.synth().sub("sine", -1, d.midi.cc(74)).push();
```

For structured geometry, `d.str(0.3, 0.5)` means one value in each of two
successive bars. `d.str([0.3, 0.5])` means two values within one bar. The
shorthand equivalents are `d.sh("<0.3 0.5>")` and `d.sh("0.3 0.5")`.

```ts
// Successive bars: bar 1 is 0.3, bar 2 is 0.5.
d.synth().sub("sine", -1, d.str(0.3, 0.5)).push();

// One bar containing two values.
d.synth()
  .sub("sine", -1, d.str([0.3, 0.5]))
  .push();
```

Raw arrays and extra positional arguments are rejected. Package structured
values with `d.str()` instead:

```ts
// Invalid: these are intentionally not executable examples.
d.synth().sub("square", -1, [0.3, 0.5]);
d.synth().sub("square", -1, 0.3, 0.5);
```

Static negative source gains resolve to `0` without changing the reusable
shorthand or structured input. There is no upper clamp at `1`. Existing
automation remains unchanged, including signed outputs from random, envelope,
LFO, and MIDI sources; the static floor is not an automation clip.

## Pitch, stereo, and lifetime

The sub follows each note's pitch and the same common detune trajectory as the
main source. A chord gets one sub per note. The sub does **not** inherit the
unison main source's detune spread, voice count, or stereo width, and starts
centered for a stable low end. User effects can change the final stereo image
after the sources are mixed.

```text
main source → main/source gain ─┐
sub oscillator → sub gain       ┼→ ordered .fx() → shared .gain()/.adsr()
noise → noise gain              ┘
```

The sub shares the main voice's scheduling, amplitude envelope, release, and
cleanup. A sub gain envelope can change only the sub's level during that
lifetime; it cannot extend sustain, release, or tail time. `.gain()` and
`.adsr()` control the complete mixed voice after effects, not `subGain` itself.

Adding the sub is additive and does not automatically reduce or normalize the
main source. Leave headroom when combining correlated sources or gains above
`1`.

[Synth reference](synth.md) · [Instrument reference](index.md)
