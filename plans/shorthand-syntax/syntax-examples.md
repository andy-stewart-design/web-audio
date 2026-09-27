# Shorthand Syntax Examples

## Status

Illustrative companion to [`spec.md`](./spec.md). The specification is authoritative.

These examples show the closest structured authoring form for each shorthand expression. `.notes()` is used illustratively; the same structural relationship applies to other supported consumers.

A structured `null` is an explicit rest and cannot represent a shorthand continuation. Rows marked **onsets only** therefore match event positions but not sustained duration or availability semantics. A future `.legato()` can make some of those forms exact, but it is not part of v1.

## Group: square brackets `[]`

Group items so they occupy one parent allocation relative to surrounding items.

| Shorthand            | Closest structured form                                                                      | Equivalence |
| -------------------- | -------------------------------------------------------------------------------------------- | ----------- |
| `0 [0 2 3]`          | `.notes([0, null, null, 0, 2, 3])`                                                           | Onsets only |
| `60 71 [64 67]!2`    | `.notes([60, null, 71, null, 64, 67, 64, 67])`                                               | Onsets only |
| `60 64 71 [64 67]*2` | `.notes([60, null, null, null, 64, null, null, null, 71, null, null, null, 64, 67, 64, 67])` | Onsets only |

The `null` padding above approximates the longer parent allocations. In shorthand those occupied positions are continuations, not explicit rests.

## Alternation: angle brackets `<>`

Choose deterministic alternatives across bars.

| Shorthand     | Closest structured form      | Equivalence |
| ------------- | ---------------------------- | ----------- |
| `0 <2 3>`     | `.notes([0, 2], [0, 3])`     | Exact       |
| `[0 <2 3>]*2` | `.notes([0, 2, 0, 3])`       | Exact       |
| `<0 <2 3>>`   | `.notes([0], [2], [0], [3])` | Exact       |
| `<0 <2 3>>*2` | `.notes([0, 2], [0, 3])`     | Exact       |

## Acceleration: `*`

Accelerate a node inside its parent allocation.

| Shorthand | Closest structured form                | Equivalence |
| --------- | -------------------------------------- | ----------- |
| `60*3 67` | `.notes([60, 60, 60, 67, null, null])` | Onsets only |

The shorthand `67` occupies the second half of the bar. The structured form places it correctly but cannot express that sustained allocation without continuation semantics.

## Slowdown: `/`

Slow event progression without implicitly extending gates.

| Shorthand     | Closest structured form        | Equivalence |
| ------------- | ------------------------------ | ----------- |
| `60/2`        | `.notes(60).slow(2)`           | Exact       |
| `[0 2 4 6]/2` | `.notes([0, 2, 4, 6]).slow(2)` | Exact       |
| `60/2 1`      | `.notes([60, 1], [null, 1])`   | Exact       |

For authored sources, `.notes([60], [null])` has the same event/rest pattern as `.notes(60).slow(2)` and `"60/2"`. If another lane owns timing, the silent bar filters candidates in all three forms.

## Defaults versus authored patterns

Constructor defaults are fallback values, while every setter creates an authored pattern even when it supplies the same value:

```ts
d.sample("bd").slow(2).xox([1, 1]);
// The default fallback "bd" fills every surviving XOX hit.

d.sample().name("bd").slow(2).xox([1, 1]);
// The authored name pattern's slowed rest bar can suppress XOX hits.
```

Fallback values never create hits or activate silent timing bars.

## Structural repetition: `!`

Duplicate a node as sibling structure.

| Shorthand | Closest structured form    | Equivalence |
| --------- | -------------------------- | ----------- |
| `60!3 67` | `.notes([60, 60, 60, 67])` | Exact       |

## Relative weight: `@`

Inside a sequence, weight changes relative duration without creating another onset. Inside alternation, it changes whole-bar selection frequency and retriggers each selected bar.

| Shorthand     | Closest structured form         | Equivalence |
| ------------- | ------------------------------- | ----------- |
| `0@3 2 3`     | `.notes([0, null, null, 2, 3])` | Onsets only |
| `<0@2 2 3>`   | `.notes([0], [0], [2], [3])`    | Exact       |
| `<0@2 2 3>*2` | `.notes([0, 0], [2, 3])`        | Exact       |

A future `.notes([0, null, null, 2, 3]).legato()` would be the exact structured equivalent of `0@3 2 3`.

## Rests: `~`

Consume structural allocation without producing an onset or value.

| Shorthand       | Closest structured form                        | Equivalence |
| --------------- | ---------------------------------------------- | ----------- |
| `[0 [~ 2] 4 6]` | `.notes([0, null, null, 2, 4, null, 6, null])` | Onsets only |

This row contains both an authored rest and implicit continuations. A flat structured array cannot distinguish them because both would be written as `null`.

## Polyphony: `,`

Play multiple values simultaneously. Polyphonic values must be grouped with square brackets.

| Shorthand | Closest structured form | Equivalence |
| --------- | ----------------------- | ----------- |
| `[0,2,4]` | `.notes([[0, 2, 4]])`   | Exact       |

A square group cannot mix same-level sequencing and polyphony:

```txt
[0 1,2] // invalid
[0,1 2] // invalid
```

Nest the structures instead:

```txt
[0 [1,2]] // 0 followed by the chord [1,2]
```

Its structured equivalent is:

```ts
.notes([0, [1, 2]]);
```
