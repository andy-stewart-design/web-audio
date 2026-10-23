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

## Numeric parameter shorthand

Numeric parameter slots support a small value-only subset of shorthand. A direct string or a reusable value from `d.sh()` / `d.shorthand()` is one whole-pattern alternative for one logical slot:

```ts
const levels = d.sh("0.2!3 0.8");

d.synth().gain("0.2 0.8").push();
d.synth().gain(levels).push();

const filter = d.lpf("<400 1200>");
d.synth().fx(filter).push();
```

Numeric atoms are finite decimal or scientific-notation values, including signed values such as `-2`, `+.5`, `1.`, and `1e-3`. `0` is a value, not a rest. Non-finite values and other spellings such as `NaN`, `Infinity`, hexadecimal, or underscored numbers are rejected.

In a numeric slot, shorthand has value semantics rather than event-timing semantics:

| Shorthand       | Numeric result                                       |
| --------------- | ---------------------------------------------------- |
| `0.2 0.8`       | Two values in one bar                                |
| `[0.2 0.8]`     | The same two values; sequential groups flatten       |
| `[0.2 0.8]!2`   | The group structurally repeats: `0.2, 0.8, 0.2, 0.8` |
| `<0.2 0.8>`     | One value in each successive bar                     |
| `0.2 <0.5 0.8>` | `0.2` in each bar, paired with the alternating value |

Grouping does not subdivide a bar, create simultaneous values, or create events. `!` repeats the value or group in the resulting value sequence. Angle brackets select bars, not hits; once a bar is selected, ordinary value lookup still wraps by surviving hit. See [Patterns](patterns.md) for the distinction between bars, hits, and processing values.

The numeric subset rejects rests (`~`), parallel/comma groups (for example `[0.2, 0.8]`), and `*`, `/`, or `@` operators, including when they occur in an alternate branch. A reusable value can still contain event-only syntax for an event consumer, but a numeric consumer rejects it:

```ts
const eventPattern = d.sh("0.2 ~ 0.8");
d.sample("bd").notes(eventPattern).push(); // valid event shorthand
// d.synth().gain(eventPattern);             // rejected for a numeric slot
```

A shorthand value cannot be mixed with another argument or nested in a structured numeric array. For example, `.gain("0.2", 0.8)`, `.gain("0.2", "0.8")`, and `.gain(["0.2", 0.8])` are invalid. Ordinary structured numeric arrays remain available and keep their existing meaning: `.gain([0.2, 0.8])` is one bar with two hit values, while `.gain(0.2, 0.8)` is two bars. The envelope minimum plus maximum and a leading noise color are documented exceptions because they address separate logical slots.

### Envelope maximum and ADSR fields

An envelope's shorthand form patterns its maximum and defaults the minimum to zero. The factory and constructor use the same forms:

```ts
d.env("0.2 0.8"); // minimum 0, patterned maximum
d.env(d.sh("0.2 0.8")); // same

d.env(0.1, "0.2 0.8"); // explicit numeric minimum, patterned maximum
d.env(undefined, "0.2 0.8"); // explicit undefined minimum, so minimum 0
d.env(0.1); // existing form: minimum 0.1, maximum 1
```

A leading shorthand must be the sole argument: `d.env("0.2 0.8", 0.5)` and `d.env(d.sh("0.2 0.8"), 0.5)` are rejected. The minimum remains numeric-only. The same shorthand-only maximum overload applies to `new Envelope(...)` when using the constructor directly.

The positional `.adsr(a, d, s, r)` API is intentionally narrower: each field accepts only a number or a shorthand value. Positional number arrays are rejected by TypeScript and at runtime. This is limited to the positional call; individual `.a()`, `.d()`, `.s()`, and `.r()` setters retain their structured-array, random, and shorthand inputs. It does not generalize to other multi-slot APIs.

### Consumer boundaries

Numeric shorthand is available in the supported numeric slots, including instrument detune/gain/noise gain, gain-effect inputs, filter frequency/q/detune/gain, envelope maximum and individual ADSR setters, unison numeric controls, sampler `start()`, `end()`, `duration()` and its `.dur()` alias, sampler chop sequences, and LFO endpoints. Existing random, envelope, LFO, and MIDI source permissions remain specific to each slot. Noise color and gain dispatch is described in [`noise()`](../reference/instruments/noise.md).

LFO endpoint arrays retain their separate-bar meaning, while shorthand can produce multivalue bars:

```ts
d.lfo([0.2, 0.8], 1); // [[0.2], [0.8]]; no ignored values
d.lfo("<0.2 0.8>", 1); // the same two bars
d.lfo("0.2 0.8", 1); // [[0.2, 0.8]]; playback uses 0.2 and warns
```

For a static LFO endpoint, only the first value of each bar is used. Schema serialization warns once for each affected endpoint per LFO instance; it does not warn during playback, reject or rewrite the bars, or add warnings for random endpoint metadata. LFO `speed()`, `wave()`, and `offset()`/phase remain outside this shorthand contract, as do scalar configuration, timing generators (`euclid()`, `hex()`, and `sequence()`), fit length, chop slice count, and routing/send amounts.

Sampler chop sequences are the one timing-related exception: `.chop(4, "0 2 1 3")` uses the authored sequence shape just as its structured equivalent does, and `.chop(4, "<0 2 1 3>")` creates four sequence bars. `.fit()` distributes only an automatically generated chop sequence; it does not redistribute an explicitly authored sequence.

The evaluator bounds shorthand source/tree size and each numeric result: source is limited to 65,536 UTF-16 code units, with at most 16,384 tokens/nodes and depth 128; expanded choice schedules and bars are limited to 1,024, numeric values and structural sequence entries to 16,384. Intermediate results have the same per-result limits, and unsafe repetition or alternation is rejected before oversized allocation. Invalid shorthand fails synchronously without replacing the prior parameter configuration. See the [parameter shorthand specification](../../plans/parameter-shorthand/spec.md) for the exact accounting rules.

## Other input types

Random sources, envelopes, LFOs, and MIDI controls are input types rather than additional syntaxes. Each method's reference lists the input forms it currently accepts.

See the [instrument reference](../reference/instruments/index.md) for method-specific arguments and examples.
