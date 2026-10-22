---
title: Pattern syntax
description: Write patterns using structured syntax or shorthand syntax
---

# Pattern syntax

Drome has two ways to write patterns: **structured syntax**, using JavaScript values and arrays, and **shorthand syntax**, using notation inside a string.

These examples describe the same pattern: three sequential sample variations in one bar.

```ts
// Structured syntax
d.sample("bd").variation([0, 1, 2]).push();

// Shorthand syntax
d.sample("bd").variation("0 1 2").push();
```

Examples assume an existing Fluid instance named `d`. Each example is independent; `.push()` includes the instrument for playback. Available recordings depend on the sample and bank.

## Structured syntax

Structured syntax describes patterns using method arguments, values, and arrays.

| Structure                    | Meaning                              |
| ---------------------------- | ------------------------------------ |
| A single value               | One step in a bar                    |
| An array                     | Sequential steps within one bar      |
| Multiple arguments           | Successive bars in a repeating cycle |
| An array nested within a bar | Simultaneous values, where supported |
| `null`                       | A rest, where supported              |

```ts
// One step per bar.
d.sample("bd").variation(0).push();

// Three sequential steps in one bar.
d.sample("bd").variation([0, 1, 2]).push();

// Three bars, with one step in each bar.
d.sample("bd").variation(0, 1, 2).push();

// Two simultaneous variations on the first step, then variation 2.
d.sample("bd")
  .variation([[0, 1], 2])
  .push();

// A rest between variations 0 and 2.
d.sample("bd").variation([0, null, 2]).push();
```

In method documentation, `...patterns` means **one or more separate arguments**. Do not type the dots: `.variation(0, 1, 2)` supplies three patterns, while `.variation([0, 1, 2])` supplies one.

The method determines what the values mean and whether it accepts simultaneous values or rests. For example, simultaneous notes form a chord, while simultaneous variations layer sample recordings. See [Patterns](patterns.md) for how steps, bars, cycles, and hits relate.

## Shorthand syntax

Shorthand syntax describes a pattern inside a string. Spaces sequence values, and symbols express operations such as rests, layering, and alternation.

| Notation  | Meaning                                                                          |
| --------- | -------------------------------------------------------------------------------- |
| `0`       | One value                                                                        |
| `0 1 2`   | Three sequential values                                                          |
| `[0,1] 2` | Variations 0 and 1 together, followed by variation 2                             |
| `0 ~ 2`   | A rest between values 0 and 2                                                    |
| `0 <1 2>` | Value 0 followed by 1 in the first bar, then 0 followed by 2 in the next; repeat |

```ts
// Three sequential steps in one bar.
d.sample("bd").variation("0 1 2").push();

// Two simultaneous variations, followed by variation 2.
d.sample("bd").variation("[0,1] 2").push();

// A rest between variations 0 and 2.
d.sample("bd").variation("0 ~ 2").push();

// Alternate the second value across bars.
d.sample("bd").variation("0 <1 2>").push();
```

Commas matter inside brackets: `[0,1]` plays values together, while `[0 1]` groups sequential values. Shorthand brackets are notation, not JavaScript arrays.

Pass a shorthand pattern as the method's only argument. The method determines how its values are interpreted: `60` can be a note in `.notes()` or a variation index in `.variation()`.

### Reusing shorthand

Use `d.sh()` or its alias `d.shorthand()` to create a reusable shorthand value:

```ts
const variations = d.sh("0 <1 2>");
d.sample("bd").variation(variations).push();
d.sample("sd").variation(variations).push();
```

The reusable value must also be the method's only argument.

## Other input types

Random sources, envelopes, LFOs, and MIDI controls are input types rather than additional syntaxes. Each method's reference lists the input forms it currently accepts.

See the [instrument reference](../reference/instruments/index.md) for method-specific arguments and examples.
