# Shorthand Syntax Specification

## Status

Proposed.

This feature provides a compact syntax for expressing existing patterns. It is intentionally a subset of Tidal/Strudel mini-notation and is called **shorthand**, not mini-notation.

The central rule is:

> Shorthand is syntax sugar, not a new pattern semantic.

A shorthand expression must desugar to the same authoring representation and compiled result as the equivalent structured API input. It must not change how notes, names, variations, rhythm methods, transforms, or processing methods interact.

## Public API

```ts
d.shorthand("60 [64 67]");
d.sh("60 [64 67]"); // alias
```

`d.shorthand()` is the canonical API. `d.sh()` is a concise alias for live coding.

The parsed value is reusable:

```ts
const pattern = d.shorthand("0 <1 2>");

d.sample("bd").var(pattern);
```

The parser and AST types are also exported from `@web-audio/patterns`.

## Supported consumers

The first implementation supports shorthand in:

- `.notes()`;
- `.name()`;
- `.var()` and `.variation()`;
- `.xox()`.

Future integrations may support `.hex()`, `.euclid()`, `.sequence()`, chop sequences, and processing patterns. Those integrations require target-specific decisions and are intentionally deferred.

## Argument dispatch

A single string passed to a supported method is shorthand:

```ts
.name("bd sd");
.var("0 <1 2>");
.notes("60 [64 67]");
.xox("1!4 0!4");
```

Existing structured forms remain unchanged:

```ts
.name("bd", "sd");       // separate bars
.name(["bd", "sd"]);     // existing structured input
.notes(60, 64);            // existing numeric input
```

A parsed shorthand object must be the sole argument:

```ts
.name(d.shorthand("bd sd"));

// Invalid:
.name(d.shorthand("bd"), "sd");
```

The direct-string and pre-parsed-object paths use the same parser/evaluator.

## Parser architecture

`@web-audio/patterns` owns:

- shorthand lexing and parsing;
- public AST types;
- immutable parsed shorthand values;
- structural evaluation;
- rational expansion;
- normalized raw-grid lowering.

`@web-audio/fluid` owns:

- `d.shorthand()` and `d.sh()`;
- target-specific atom conversion;
- sample-name validation;
- integration with `AuthoredPitches` and `AuthoredEventValues`.

The schema and audio engine do not parse shorthand.

## Parsed shorthand value

The parsed value is immutable data:

```ts
interface Shorthand {
  readonly type: "shorthand";
  readonly source: string;
  readonly ast: ShorthandNode;
}
```

`parseShorthand()` and `d.shorthand()` return this representation. Parsing occurs immediately, so syntax errors are reported at the call site.

## AST

The initial AST contains:

```txt
atom
rest
sequence
 group
parallel
alternate
modifier
```

Conceptually:

```ts
type ShorthandNode =
  | { type: "atom"; value: string }
  | { type: "rest" }
  | { type: "sequence"; children: ShorthandNode[] }
  | { type: "group"; child: ShorthandNode }
  | { type: "parallel"; children: ShorthandNode[] }
  | { type: "alternate"; children: ShorthandNode[] }
  | {
      type: "modifier";
      operator: "repeat" | "accelerate" | "slow" | "weight";
      amount: string;
      child: ShorthandNode;
    };
```

User-authored atom and operator-argument lexemes remain strings in the AST. Typed interpretation happens in Fluid.

Examples:

```txt
[0 2]
→ group(sequence(atom("0"), atom("2")))

[0,2]
→ group(parallel(atom("0"), atom("2")))

<0 1>
→ alternate(atom("0"), atom("1"))

0!3
→ modifier("repeat", "3", atom("0"))
```

## Lexical rules

Whitespace separates sequential items. Spaces, tabs, and newlines have the same meaning. Newlines do not create bars.

Structural and operator characters are reserved. Unsupported constructs such as `?`, `|`, and parentheses are parse errors rather than ordinary atoms.

The lexer must still support target-relevant atom text such as:

```txt
-2
1.5
c#4
```

A standalone `~` is a rest. `-` is not a rest token; it is available for negative numeric atoms and is otherwise invalid when it cannot form a valid atom.

Empty structures are rejected:

```txt
""       // invalid
[]       // invalid
<>       // invalid
[0,,2]   // invalid
```

Use `~` for explicit silence.

## Core semantics

### Sequences

Whitespace-separated values form a sequence. Sequence children receive equal structural allocation unless modified by `@`.

### Groups

Square brackets group children into one parent time slot:

```txt
a [b c] d
```

The group occupies the middle third, and `b` and `c` divide that third. Nesting is recursive.

### Polyphony

Commas create simultaneous voices and are valid only inside square groups:

```txt
[0,2,4]       // one event with three voices
[0,2] [4,5]   // two sequential polyphonic events
0,2,4         // invalid
```

Voice order and duplicates are preserved. Operators applied to a polyphonic group operate on the group as one event:

```txt
[0,2]!2  // two sequential chord events
[0,2]*2  // accelerated chord pattern
[0,2]@2  // one chord event with double weight
```

### Alternation

Angle brackets select deterministic alternatives across cycles:

```txt
<0 1 2>
```

selects `0`, `1`, and `2` on successive cycles and then wraps. It is not random choice and is not within-cycle sequencing.

Nested alternation composes deterministically:

```txt
<0 <2 3>>
```

produces the finite cycle sequence `0`, `2`, `0`, `3`.

### Rests

`~` emits no value but consumes structural time. Rests work inside groups and support postfix operators:

```txt
[~ 2]
~@2
~!2
```

A rest cannot occur inside a simultaneous voice group:

```txt
[0,~] // invalid
```

### Structural repetition: `!`

`!n` duplicates an item structurally:

```txt
60!3 67
```

is equivalent to:

```txt
60 60 60 67
```

The count must be a positive whole number. Zero, negative, fractional, and non-finite counts are invalid.

### Acceleration: `*`

`*n` accelerates an expression inside its existing parent allocation:

```txt
60*3 67
```

The accelerated expression remains one parent item. This differs from `!`, which creates siblings.

### Slowdown: `/`

`/n` extends an expression across more cycles while preserving event order:

```txt
[0 2 4 6]/2
```

produces cycle 0 containing `0, 2` and cycle 1 containing `4, 6`.

### Relative weight: `@`

`@n` changes relative duration without creating events:

```txt
0@3 2 3
```

allocates relative weights `3:1:1`. A flattened grid may contain padding for the longer allocation, but the value is still one event.

Weights must be positive and finite.

### Operator composition

Postfix operators apply to the immediately preceding node in written order:

```txt
[0 2]*2/2
```

is equivalent to `[0 2]` after rational normalization.

`*` and `/` accept positive finite values representable by the bounded rational expansion rules. Unsupported or excessive expansions are rejected rather than rounded or truncated.

## Canonical lowering

The evaluator may calculate structural spans using internal rational arithmetic. It then chooses one common subdivision denominator for the complete expression, including all cycle variants produced by alternation.

The final generic lowering result is:

```ts
type ShorthandGrid = Array<Array<string[] | null>>;
```

Dimensions:

```txt
bars
→ grid cells
→ simultaneous raw atom values
```

Example:

```txt
0 [0 2 3]
```

lowers conceptually to:

```ts
[[["0"], null, null, ["0"], ["2"], ["3"]]];
```

All cycle variants use the same common grid resolution. This preserves alignment for expressions such as:

```txt
60@3 <64 [64 64]>
```

Entirely silent value bars collapse to the existing silent-bar representation during target-specific lowering. XOX retains its binary mask geometry.

The existing `AuthoredPitches`, `AuthoredEventValues`, timing compiler, schema, and engine remain responsible for normal pattern behavior after lowering.

## Target-specific conversion

Typed conversion happens after parsing and grid lowering:

```ts
.notes("60 64");       // finite numeric note atoms
.var("0 1.5 -2");      // finite numeric atoms
.name("bd sd");        // alphanumeric sample aliases
.xox("1!4 0!4");       // binary values
```

For the first version, `.notes()` remains numeric-only. Note-name parsing is not added by shorthand; `.root()` retains its existing note-name behavior.

Sample aliases must match:

```txt
[A-Za-z0-9]+
```

This rule applies consistently to constructors, `.name()`, sample-bank keys, and direct schema validation. URLs remain unrestricted.

`~` is the only rest token. Sample names may not use notation-reserved characters.

## XOX compatibility

`.xox()` supports both shorthand and the existing compact syntax.

Legacy compact strings containing only `x`, `o`, `.`, and whitespace retain their current behavior:

```ts
.xox("xoxo");
.xox("x o . x");
```

General shorthand supports:

```ts
.xox("1!4 0!4");
.xox("1 0 1");
.xox(d.shorthand("1!4 0!4"));
```

XOX shorthand accepts `0`, `1`, `~`, and the legacy `x/o` aliases. Polyphonic groups and non-binary atoms are rejected.

## Interaction with existing APIs

Shorthand is desugared before existing authoring state is updated. It does not change method interaction rules.

Existing rules remain authoritative:

- explicit rhythm has priority over inferred event timing;
- fixed rhythm methods compose in call order;
- value setters replace only their own lanes;
- later setters are not retroactively transformed;
- rests filter timing according to existing behavior;
- `fast`, `slow`, `stretch`, and `reverse` retain existing call-order semantics;
- processing patterns remain independent from event timing.

When explicit rhythm owns timing, shorthand supplies values and rest availability but does not override explicit offsets or durations.

## Errors

Errors remain eager:

- syntax errors occur during parsing;
- typed conversion errors occur when shorthand is passed to a consumer;
- expansion-limit errors occur during lowering;
- missing sample resources retain existing schema/runtime warning behavior.

Existing expansion limits apply. Total bars, active events, and padded grid cells must be bounded. Nothing is silently truncated or approximated.

## Testing requirements

Semantic-equivalence tests are the primary acceptance criterion. Each supported shorthand form should be compared with an equivalent structured input and produce the same compiled result.

Coverage should include:

- atoms, rests, groups, nesting, and polyphony;
- alternation and nested alternation;
- `!`, `*`, `/`, and `@`;
- operator composition and cancellation;
- negative and fractional numeric atoms;
- silent bars and rest filtering;
- unequal alternation resolutions;
- expansion-limit failures;
- direct strings versus `d.shorthand()` objects;
- single versus multiple method arguments;
- legacy XOX strings;
- notes, names, variations, and XOX target conversion;
- existing rhythm, transform, and setter call-order behavior.
