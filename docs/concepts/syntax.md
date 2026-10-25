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

See [Patterns](patterns.md) for steps, bars, cycles, and how patterns play.

## Structured syntax

Structured syntax describes patterns using values, arrays, and method arguments.

| Structure                    | Meaning                              |
| ---------------------------- | ------------------------------------ |
| A single value               | One step in a bar                    |
| An array                     | Sequential steps within one bar      |
| Multiple pattern arguments   | Successive bars in a repeating cycle |
| An array nested within a bar | Simultaneous values, where supported |
| `null`                       | A rest, where supported              |

```ts
// Three sequential steps in one bar.
d.sample("bd").variation([0, 1, 2]).push();

// Three bars, with one step in each bar.
d.sample("bd").variation(0, 1, 2).push();

// Two simultaneous variations, followed by variation 2.
d.sample("bd")
  .variation([[0, 1], 2])
  .push();

// A rest between variations 0 and 2.
d.sample("bd").variation([0, null, 2]).push();
```

In method documentation, `...patterns` means separate pattern arguments. For example, `.variation(0, 1, 2)` supplies three bars, while `.variation([0, 1, 2])` supplies one.

## Shorthand syntax

Shorthand syntax describes a pattern inside a string. Spaces sequence values, and symbols express operations such as rests, layering, and alternation.

The following examples use sample variations:

| Notation  | Meaning                                                 |
| --------- | ------------------------------------------------------- |
| `0 1 2`   | Three sequential values in one bar                      |
| `[0,1] 2` | Variations 0 and 1 together, followed by variation 2    |
| `0 ~ 2`   | A rest between values 0 and 2                           |
| `<0 1 2>` | One value in each of three successive bars              |
| `0 <1 2>` | 0 then 1 in the first bar; 0 then 2 in the next; repeat |
| `0!3 2`   | 0 three times, then 2                                   |

```ts
// Two simultaneous variations, followed by variation 2.
d.sample("bd").variation("[0,1] 2").push();

// Alternate the second value across bars.
d.sample("bd").variation("0 <1 2>").push();
```

Commas matter inside brackets: `[0,1]` plays values together, while `[0 1]` groups sequential values. Shorthand brackets are notation, not JavaScript arrays.

A shorthand string describes one complete pattern input. Don't mix shorthand with structured values for the same input: use `.variation("0 1 2")`, not `.variation("0 1", 2)`. Each method's reference lists the notation and values it accepts.

## Reusing patterns

Use `d.str()` (alias `d.structured()`) to save a structured pattern, or `d.sh()` (alias `d.shorthand()`) to save shorthand:

```ts
const structuredVariations = d.str([0, 1, 2]);
d.sample("bd").variation(structuredVariations).push();
d.sample("sd").variation(structuredVariations).push();

const shorthandVariations = d.sh("0 1 2");
d.sample("bd").variation(shorthandVariations).push();
d.sample("sd").variation(shorthandVariations).push();
```

The distinction between arrays and separate arguments stays the same:

| Structured pattern  | Shorthand equivalent | Meaning                                  |
| ------------------- | -------------------- | ---------------------------------------- |
| `d.str([0.2, 0.8])` | `d.sh("0.2 0.8")`    | Two values within one bar                |
| `d.str(0.2, 0.8)`   | `d.sh("<0.2 0.8>")`  | One value in each of two successive bars |

`d.str()` also lets you pass a structured pattern as one argument when a method has other inputs:

```ts
// Color is one argument; the gain pattern is another.
d.synth()
  .noise("pink", d.str([0.05, 0.2]))
  .push();

// The same pattern using shorthand.
d.synth().noise("pink", "0.05 0.2").push();
```

A reusable pattern replaces the complete pattern input; don't combine it with extra pattern arguments. Strings inside `d.str()` are literal values, not shorthand; use `d.sh()` for shorthand. Pass random or automated controls directly where a method accepts them, rather than putting them inside `d.str()`.

See the [instrument reference](../reference/instruments/index.md) for method-specific arguments and examples.
