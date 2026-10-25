---
title: variation()
description: Choose which recording of a sample plays on each hit
---

# variation()

Choose which recording of a sample plays on each hit.

**Available on:** Samplers only.  
**Alias:** `.var()`

Returns the same sampler for chaining. `.var()` accepts the same call forms below.

## Structured syntax

```text
sampler.variation(...patterns)
sampler.variation(structured)
```

| Argument      | Accepted values                                                                    | Description                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `...patterns` | Finite numbers, `null`, or arrays of numbers, rests, and simultaneous voice groups | Each argument is one bar; array entries are sequential steps; nested arrays are simultaneous voices. `null` is a whole-hit rest. |
| `structured`  | A value from `d.str()` / `d.structured()`                                          | The same structured pattern, supplied as one reusable argument. Must be the only argument.                                       |

```ts
// Three sequential hits in one bar.
d.sample("bd").variation([0, 1, 2]).push();

// One hit per bar over a three-bar cycle, using the alias.
d.sample("bd").var(0, 1, 2).push();

// Two simultaneous recordings on the first hit, then one on the second.
d.sample("bd")
  .variation([[0, 1], 2])
  .push();

// A whole-hit rest between variations 0 and 2.
d.sample("bd").var([0, null, 2]).push();

// Save a structured pattern and reuse it.
const structuredVariations = d.str([0, 1, 2]);
d.sample("bd").var(structuredVariations).push();
d.sample("sd").var(structuredVariations).push();
```

See [Structured syntax](../../concepts/syntax.md#structured-syntax) for the general input structure.

## Shorthand syntax

```text
sampler.variation(shorthand)
```

`shorthand` is a string or a reusable value from `d.sh()` / `d.shorthand()`. It must be the only argument. Variation values must be finite numbers.

```ts
// The same three-hit pattern as .variation([0, 1, 2]).
d.sample("bd").variation("0 1 2").push();

// Variation 0, then alternating 1 and 2 across bars.
d.sample("bd").variation("0 <1 2>").push();

// Reuse a shorthand value.
const variations = d.sh("0 <1 2>");
d.sample("bd").var(variations).push();
```

See [Shorthand syntax](../../concepts/syntax.md#shorthand-syntax) for notation and reusable values.

## Random source

```text
sampler.variation(random)
```

`random` is a numeric source from `d.rand()`. It generates one variation value per hit, shared by that hit's simultaneous voices.

```ts
// Random integer variation values.
d.sample("bd").var(d.rand().int().range(0, 3).steps(4)).push();
```

## Behavior

- At least one input is required; calling `.variation()` with no arguments throws. Without a variation setter or constructor selection, a sampler uses variation `0`.
- Each call replaces the previous variation pattern, including a constructor selection such as `d.sample("bd:2")`.
- Values are rounded with `Math.round()`, then wrapped within the available recordings for the selected sample and pitch. With four recordings, `-1` selects `3` and `4` selects `0`. Variation `0` is a recording, not a rest.
- Variations can set the rhythm, or follow a rhythm set with methods such as `.xox()` or `.chop()`. Rests silence hits without consuming later values.
- When layering sample names, notes, and variations, shorter groups repeat to match the longest group. A rest silences the whole hit, not an individual voice.
- Empty simultaneous groups, rests inside simultaneous groups, and non-finite numbers are rejected.

See [Patterns](../../concepts/patterns.md) for sampler layers and hit-based playback.

[Instrument reference](index.md)
