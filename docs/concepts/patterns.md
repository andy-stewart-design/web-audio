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

That is one step containing three notes, so all three notes play together. You can mix chords and single notes in the same pattern:

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

These silent steps still take up time. They are rests, not removed steps.

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

## The core model

The whole system comes down to three levels:

1. A **step** is one subdivision of a pattern.
2. A **pattern** is one bar of steps.
3. A **cycle** is one or more patterns repeating.

Once those are clear, the rest of Drome’s sequencing tools are easier to understand. They all build on the same structure.
