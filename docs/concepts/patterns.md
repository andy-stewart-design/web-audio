---
title: Patterns
description: How Drome organizes notes, steps, bars, and cycles
---

Patterns describe what an instrument plays and how its sound changes over time.

> [!NOTE]
> This page explains pattern concepts using **structured syntax**: JavaScript values and arrays. Patterns can also be expressed using **shorthand syntax**, a compact notation inside strings. See [Pattern syntax](syntax.md) to learn about both forms.

Examples assume an existing Fluid instance named `d`. Each example is independent.

## Steps and bars

A **step** is one position in a pattern. A single value creates a one-step pattern:

```ts
d.synth().notes(60).push();
```

An array creates sequential steps spread evenly across one **bar**:

```ts
d.synth().notes([60, 64, 67, 71]).push();
```

This pattern has four steps, each lasting one quarter of the bar. Changing the number of steps changes their spacing, not the length of the bar:

```ts
// Three evenly spaced notes in one bar.
d.synth().notes([60, 64, 67]).push();

// Eight evenly spaced notes in one bar.
d.synth().notes([60, 60, 60, 60, 60, 60, 60, 60]).push();
```

## Steps and beats

A **beat** is the clock's pulse. By default, a bar contains four beats, but a pattern can have any number of steps:

- Four steps: one step per beat.
- Eight steps: two steps per beat.
- Three steps: three evenly spaced positions across the bar.

Each pattern has its own spacing; there is no single step grid that every instrument must follow.

## Notes, chords, and rests

A step can contain a single note, several notes played together, or silence.

An array inside the pattern array creates a **chord**. Use `null` for a **rest**:

```ts
d.synth()
  .notes([[60, 64], null, 67, null])
  .push();
```

This four-step pattern plays a chord, rests, plays note 67, then rests again. Rests take up time rather than shortening the pattern.

Each note in a chord produces a separate sound, or **voice**. The chord still counts as one hit for controls such as gain.

## Cycles

Separate pattern arguments describe successive bars. The complete repeating sequence is a **cycle**:

```ts
d.synth().notes([60, null, 64, null], [60, null, 64, 67]).push();
```

- Bar 1 plays `[60, null, 64, null]`.
- Bar 2 plays `[60, null, 64, 67]`.
- Bar 3 returns to the first pattern.

One pattern repeats every bar; two patterns make a two-bar cycle.

## Rhythm and hits

A **hit** is a position where the instrument plays. Rests and randomly skipped positions are not hits.

Rhythm methods such as `.xox()` and `.euclid()` let you set a rhythm separately from the notes:

```ts
d.synth("saw").notes([60, 64]).gain([0.25, 1]).euclid(2, 4).push();
```

This plays two hits per bar. The first uses note 60 at gain 0.25; the second uses note 64 at gain 1. Silent positions do not advance the gain pattern, and a chord advances it only once.

Notes, sample variations, gain, and other per-hit controls repeat their values as needed. Each bar starts from its first hit value again.

## Changing values over time

A gain pattern changes the level of existing hits; it does not add more hits:

```ts
// Alternate gain values across the four hits in each bar.
d.synth().xox("xxxx").gain([0.25, 1]).push();

// Use gain 0.25 throughout bar 1, then gain 1 throughout bar 2.
d.synth().xox("xxxx").gain(0.25, 1).push();
```

An array supplies values within a bar; separate pattern arguments supply successive bars. Controls can have different cycle lengths and repeat independently.

## Sample names and layers

Samplers can sequence sample names, just as synthesizers sequence notes:

```ts
d.sample().name(["bd", "sd"]).push();
```

Nested arrays play samples together:

```ts
// Kick and hi-hat together, then snare.
d.sample()
  .name([["bd", "hh"], "sd"])
  .push();
```

Variations select different recordings of a sample. They can also be sequenced, layered, or separated by rests:

```ts
d.sample("bd").var([0, 1, 2]).push();
d.sample("bd")
  .var([[0, 1], 2])
  .push();
d.sample("bd").var([0, null, 2]).push();
```

Variation `0` selects a recording; it is not a rest. Available recordings depend on the sample and bank. See [`variation()`](../reference/instruments/variation.md) for details.

## Pattern helpers

Helpers offer other ways to write or reshape a pattern:

- `.xox()` uses drum-machine-style notation such as `"xoxo"`.
- `.euclid()` distributes hits across a number of steps.
- `.hex()` writes rhythms in hexadecimal notation.
- `.sequence()` selects specific step positions.
- `.fast()`, `.slow()`, `.stretch()`, and `.reverse()` reshape an instrument's pattern.

See the [instrument reference](../reference/instruments/index.md) for the available methods, and [Pattern syntax](syntax.md) for structured and shorthand examples.
