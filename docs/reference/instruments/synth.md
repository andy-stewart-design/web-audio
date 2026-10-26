---
title: synth()
description: Create a basic or unison synthesizer with optional source gain
---

# synth()

Create a basic synthesizer or the saw-only unison synthesizer. The optional
constructor gain controls only the main source. The existing `.gain()` method
still controls the complete voice after its sources are mixed.

**Available on:** Fluid (`d.synth()`); the resulting builder is a basic or
unison synthesizer.

## Factory forms

```text
d.synth()
d.synth(gain)
d.synth(selector)
d.synth(selector, gain)
d.synth(undefined, gain)
```

| Form                                               | Result                                               |
| -------------------------------------------------- | ---------------------------------------------------- |
| `d.synth()`                                        | Basic sine synth, main source gain `1`.              |
| `d.synth(gain)`                                    | Basic sine synth with the supplied main source gain. |
| `d.synth("sine")` / `d.synth("sin")`               | Basic sine synth, gain `1`.                          |
| `d.synth("saw", gain)`                             | Basic sawtooth synth with the supplied gain.         |
| `d.synth("unison")` / `d.synth("uni")`             | Saw-only unison synth, gain `1`.                     |
| `d.synth("unison", gain)` / `d.synth("uni", gain)` | Unison synth with the supplied gain.                 |
| `d.synth(undefined, gain)`                         | The default basic sine synth with the supplied gain. |

Basic selector aliases are `sin`, `sine`, `tri`, `triangle`, `sq`, `square`,
`saw`, and `sawtooth`. The unison engine aliases are `unison` and `uni`.
Unison's existing main source remains sawtooth; its `.type()` accepts the
existing saw aliases only.

A sole string is dispatched exactly, in this order:

1. A recognized waveform or unison alias selects that source.
2. Any other string is decoded as numeric gain shorthand for the default sine
   synth.

Consequently, `d.synth("saw")` selects a waveform, while
`d.synth("0.5")` selects sine with gain `0.5`. Invalid nonnumeric text throws;
it does not silently select a waveform. With two arguments, the first argument
must be a supported selector or `undefined`, and the second is one gain value.

```ts
// Basic/default forms.
d.synth().push();
d.synth(0.5).push();
d.synth("saw", 0.8).push();
d.synth(undefined, 0.4).push();

// Unison aliases retain the concrete unison builder and its methods.
d.synth("unison", 0.6).voices(5).spread(0.4).width(0.7).push();
d.synth("uni").sub(0.3).push();
```

## Main source gain

The constructor gain is the main-source gain (`sourceGain` in the serialized
schema). It accepts one existing single-slot audio parameter input:

- a finite number;
- numeric shorthand as a string or reusable `d.sh()` / `d.shorthand()` value;
- a numeric `d.str()` / `d.structured()` value; or
- a direct `d.rand()` random cycle, `d.env()` envelope, `d.lfo()` LFO, or
  `d.midi.cc()` MIDI CC source.

The gain slot does not accept a raw JavaScript array or extra positional
arguments. Use `d.str()` for a structured pattern. The same single-slot rule
applies to a gain-only factory call and a selector-plus-gain call.

```ts
// Equivalent static forms.
d.synth(0.3).push();
d.synth("0.3").push();
d.synth(d.sh("0.3")).push();
d.synth(d.str(0.3)).push();
d.synth("saw", d.str(0.3)).push();

// Direct automation sources are supplied as the gain value.
d.synth(d.rand()).push();
d.synth(d.env(0, 0.8).adsr(0.01, 0.2, 0.6, 0.1)).push();
d.synth("saw", d.lfo(0, 0.5)).push();
d.synth("unison", d.midi.cc(74)).push();
```

`d.str(0.3, 0.5)` supplies successive bars. `d.str([0.3, 0.5])` supplies
two values within one bar. A shorthand string follows the same geometry:
`d.sh("<0.3 0.5>")` alternates bars, while `d.sh("0.3 0.5")` supplies two
values within a bar.

Static negative values for this new source gain resolve to `0`, including
values supplied as numbers, shorthand, structured values, or direct static
schemas. This coercion happens at the source-gain target and does not mutate a
reusable shorthand or structured value. Values above `1` remain allowed. The
existing automation behavior is unchanged: dynamic random, envelope, LFO, and
MIDI outputs retain their signed values and existing timing semantics.

## Source mixing and shared voice controls

Each synth voice mixes its sources before the user effects and shared amplitude
envelope:

```text
main source → source gain ─┐
sub         → sub gain     ┼→ .fx() → .gain()/.adsr() → output
noise       → noise gain   ┘
```

The constructor gain changes only the main source, including the complete
unison stack; it is `sourceGain`. A sub's gain is the sub gain (`sub.gain` in the
serialized schema) and changes only its sub oscillator; see the [`sub()`
reference](sub.md). `.gain()` and `.adsr()` continue to shape the complete mixed
voice after effects, and do not replace either source gain or a layer gain
envelope. Noise keeps its existing `.noise()` contract.

Mixing is additive. Adding a sub or noise layer does not turn down the main
source, automatically normalize the result, or add output protection. Correlated
sources can increase peaks, so leave headroom with the shared `.gain()` or the
source gains.

All sources belong to the same voice. A source gain envelope can shape its
layer during that voice, but it cannot extend the voice's sustain, release, or
cleanup lifetime. A layer does not create another note, MIDI event, duck event,
or scheduler.

## Examples

### Main muted, sub audible

A zero main-source gain does not discard the voice; the sub remains audible
under the same shared amplitude envelope.

```ts
d.synth(0).sub(0.35).gain(0.4).push();
```

### Stereo unison with a centered sine sub

The unison main source can retain its detuned stereo spread while the default
sine sub stays centered. The sub follows the note and common detune modulation,
not the unison stack's detune spread or stereo width.

```ts
d.synth("unison", 0.65)
  .voices(7)
  .spread(12)
  .width(0.8)
  .sub(0.3)
  .fx(d.lpf(2400))
  .gain(0.5)
  .push();
```

### A layer envelope

A sub envelope controls the sub level within the existing voice lifetime. It
cannot keep the voice alive after the shared amplitude release.

```ts
d.synth("saw", 0.7)
  .sub("sine", -1, d.env(0, 0.35).adsr(0.01, 0.2, 0.4, 0.1))
  .adsr(0.01, 0.15, 0.8, 0.2)
  .push();
```

### Deferred scope

`d.osc()` composition, arbitrary extra oscillator layers, independently gated
or sustained layers, additional octave choices, main-unison waveforms, and new
effects such as saturation or compression are not part of this API. Standalone
`d.noise()` is also separate from the accompanying `.noise()` layer.

[Sub reference](sub.md) · [Instrument reference](index.md)
