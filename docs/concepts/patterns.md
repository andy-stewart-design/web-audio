---
title: Patterns
description: How Drome organizes notes, steps, bars, and cycles
---

Patterns are how you tell an instrument what to play over time. In Drome, a **pattern** is a sequence of **steps** that plays over exactly one **bar**. Each step can contain a note, a chord, or silence, and the steps are spread evenly across the bar.

Drome does not use a separate pattern language. Patterns are written with JavaScript values: numbers, arrays, nested arrays, and a few helper methods for building rhythms.

## Steps

A step is one subdivision of a pattern. A single value creates a one-step pattern:

```js
d.synth().notes(60).push();
```

An array creates a pattern with one step per item:

```js
d.synth().notes([60, 64, 67, 71]).push();
```

That pattern has four steps. Since every pattern lasts one bar, each step takes up one quarter of the bar.

## Notes, chords, and silence

A step can hold a single note:

```js
d.synth().notes([60, 64, 67, 71]).push();
```

A step can also hold a chord. A chord is written as an array inside the pattern array:

```js
d.synth()
  .notes([[60, 64, 67]])
  .push();
```

That is one step containing three notes, so all three notes play together. A chord counts as one hit for gain, detune, variation, effects, and other event-addressed value patterns. You can mix chords and single notes in the same pattern:

```js
d.synth()
  .notes([[60, 64], 67, [71, 74]])
  .push();
```

Silence is represented with `null`, `undefined`, or an empty slot:

```js
d.synth().notes([60, null, 64, undefined]).push();

d.synth().notes([60, , 64, 67]).push();
```

These authored silent steps still take up time. They are rests, not shortened patterns. Fluid removes them from the compiled timing candidates while preserving the offsets of active steps. Rests do not consume notes, gain values, sample variations, effect values, or other values resolved for a hit.

## Patterns last one bar

A pattern always stretches across one bar, no matter how many steps it contains. This is the most important thing to understand about Drome sequencing: the number of steps in a pattern changes the resolution of the bar.

A four-step pattern divides the bar into four equal parts:

```js
d.synth().notes([60, 60, 60, 60]).push();
```

An eight-step pattern divides the same bar into eight equal parts:

```js
d.synth().notes([60, 60, 60, 60, 60, 60, 60, 60]).push();
```

A three-step pattern divides the bar into three equal parts:

```js
d.synth().notes([60, 64, 67]).push();
```

There is no separate global step grid that all patterns have to follow. Each pattern defines its own grid by the number of steps it contains.

## Steps and beats are related, but not equivalent

Drome’s clock is measured in beats and bars. Patterns are measured in steps. Those two systems line up at the bar level: one pattern lasts one bar. But steps do not have to equal beats.

In the default 4-beat bar:

- 4 steps means each step lines up with a beat.
- 8 steps means two steps per beat.
- 3 steps means three evenly spaced steps across the bar.
- 5 steps means five evenly spaced steps across the bar.

This makes it easy to write patterns that feel straight, syncopated, uneven, or polymetric without changing the clock.

## Cycles

You are not limited to one pattern. If you pass multiple patterns, Drome plays one pattern per bar, then loops back to the beginning. The full repeating sequence is called a **cycle**.

```js
d.synth().notes([60, null, 64, null], [60, null, 64, 67]).push();
```

This creates a two-pattern cycle:

- bar 1: `[60, null, 64, null]`
- bar 2: `[60, null, 64, 67]`
- bar 3: back to the first pattern

A cycle with one pattern is one bar long. A cycle with four patterns is four bars long.

## Pattern helpers

Writing arrays directly is the clearest way to understand patterns, but it can get verbose. Drome also includes helper methods for generating and reshaping patterns. These methods operate on the same underlying idea: steps spread across bars.

For example:

- Euclidean rhythms distribute a number of hits across a number of steps.
- Hex patterns turn hexadecimal rhythm notation into step patterns.
- XOX patterns use drum-machine-style strings like `x---x---`.
- Sequence patterns activate specific step positions.
- Speed and stretch helpers reshape how patterns move through time.

These helpers do not replace the pattern model. They are shortcuts for building step grids and deciding which steps should play.

## Timing and active hits

Authoring rhythms and masks decide which positions become compiled timing candidates. The playback schema stores only active candidate offsets and durations—never source grid positions or step indices. Fixed rests are already absent. An optional random chance condition may remove further candidates at playback.

The surviving candidates become **hits**, and event-addressed value patterns advance only when a hit occurs.

```js
d.synth("saw").notes([60, 64]).gain([0.25, 1]).euclid(2, 4).push();
```

The Euclidean rhythm authors hits at positions `0` and `2`. Fluid compiles their offsets into timing entries. They become hit `0` and hit `1`, so the notes are `60` then `64`, and the gain values are `0.25` then `1`. Silent authored positions do not consume values and are not serialized.

This rule also applies to random masks: a random-mask miss is not a hit and consumes nothing. Each chord is one hit even though it creates multiple voices.

Hit numbering restarts within each bar, while pattern bars continue to advance normally. These two gain forms therefore retain different meanings:

```js
.gain([0.25, 1]) // two values within each bar, selected by hit
.gain(0.25, 1)   // one value in bar 1, then one value in bar 2
```

This active-hit behavior is intentional. Authored positions compile into timing; final hit order controls values used to create each event.

## Timing, event values, and processing values

The compiled playback model has three independent parts:

1. **Timing** says when candidate events occur and may include one chance condition.
2. **Event values** provide instrument-specific notes, sample names, and variations.
3. **Processing values** provide gain, detune, envelope, effect, and region settings.

Value patterns contain no offsets or durations. Their bars and hits wrap independently and are addressed only after timing has produced final hits.

## The core model

The whole system comes down to four levels:

1. A **step** is an authored subdivision of a pattern.
2. A **hit** is a compiled candidate that survives all timing decisions.
3. A **voice** is one simultaneous sound within an event, such as one chord note.
4. A **cycle** is one or more pattern bars repeating.

Once those are clear, the rest of Drome’s sequencing tools are easier to understand. They all build on the same structure.
