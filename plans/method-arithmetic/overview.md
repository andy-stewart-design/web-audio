# Method arithmetic overview

## Status and purpose

Agreed API direction and behavioral decisions from the pattern/automation arithmetic discussion. This is an overview, not an implementation specification. All arithmetic APIs below are proposed, not claims about current support.

Provide one arithmetic vocabulary for numeric patterns and continuous parameter sources:

- `.add()` / `d.add()` for addition.
- `.mul()` / `d.mul()` for multiplication.
- Both instance and factory forms construct lazy, composable expressions.
- The destination supplies the evaluation context and validates the operands.
- Sources retain their existing timing semantics; arithmetic changes values, not timing.

The discussion began with FM index modulation, but this feature is independent of an FM engine and should apply wherever the destination supports the relevant parameter sources.

## Public interface

### Instance and factory forms

These forms are equivalent:

```ts
pattern.add(other);
d.add(pattern, other);

envelope.add(1, lfo);
d.add(envelope, 1, lfo);

pattern.mul(2);
d.mul(pattern, 2);
```

Multiple arguments are operands of the named operation, not a sequence of pattern steps:

```ts
d.add(1, envelope, lfo); // 1 + envelope + LFO
```

Composition returns a new expression without mutating its operands:

```ts
const envelope = d.env(0, 4);
const modulated = envelope.mul(lfo).add(1);
const shifted = envelope.add(2);
```

Creating `modulated` does not change `envelope` or `shifted`. This nonmutation rule applies to arithmetic construction, including methods called on shorthand, regardless of the configuration conventions of existing builders.

Expressions support further arithmetic:

```ts
envelope.mul(lfo).add(1);
d.add(d.mul(envelope, lfo), 1);
```

### Explicit shorthand wrappers

Use the existing shorthand wrapper for instance syntax:

```ts
d.sh("0 2").add("0 4 7");
```

Do not extend `String.prototype` to make string literals expose `.add()` or `.mul()`.

The factory form can accept shorthand strings directly:

```ts
d.add("[0 <2 4>]*2", "<0 2>");
```

### Preserve the distinction from pattern input syntax

Arithmetic is explicitly requested by a method or factory:

```ts
.index([1, 2, 4]);                 // Existing patterned values
.index(d.add(1, envelope, lfo));   // Simultaneous arithmetic contributions
```

Do not reinterpret existing variadic arguments or array inputs as implicit addition or multiplication. Existing layering and sequencing meanings must remain intact.

## Lazy expressions and destination context

`d.add()` should not immediately guess whether it is performing shorthand evaluation or continuous audio modulation. It describes an operation over operands. The consuming destination determines which evaluation rules and operand kinds are valid.

```ts
.notes(d.add(pattern, 2));     // Note-value arithmetic
.index(d.add(envelope, lfo)); // Continuous parameter arithmetic
```

A numeric-only expression has no inherent destination or timing:

```ts
d.add(1, 2); // Constant value 3
```

It can become a note value, FM index, or another supported numeric parameter according to its destination.

Expected operand domains:

| Destination                    | Operand kinds                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Notes                          | Numbers and supported numeric patterns/shorthand                                                      |
| General automatable parameters | Numbers, supported numeric patterns, envelopes, LFOs, MIDI controls                                   |
| Instrument gain                | Intended to support composition, but its envelope/lifetime contract needs explicit integration design |

Reject unsupported combinations clearly. For example, an LFO passed into a note expression must not silently become a value sampled at each note:

```ts
.notes(d.add(pattern, lfo)); // Invalid in the initial design
```

Sampling a continuous source into a note pattern would be a separate explicit capability, not an accidental consequence of arithmetic.

## Pattern arithmetic

### Timing ownership

Pattern arithmetic is left-timed:

> The first timing-bearing operand supplies event timing. Other operands supply values. Arithmetic does not merge rhythms or create events from the right-hand operand.

For instance syntax, the receiver naturally provides the timing when it is a timing-bearing pattern. Leading constants in a factory expression do not supply event timing.

Where the destination already has an explicit timing source, preserve Drome's existing timing-precedence rules. Arithmetic must not introduce a second competing timing policy.

### Value alignment

- Align operands by bar phase and the destination's existing hit index.
- Wrap each operand's cycle independently.
- Broadcast a single value in a bar across that bar's hits.
- When a bar contains multiple values, select and wrap using the existing bar/hit value-resolution rules.
- Preserve existing handling of final hit indices, rather than adding an arithmetic-specific counter.
- Unused right-hand values do not create extra events or carry forward as a pending queue into the next bar.

### Agreed example: unequal value counts

```ts
d.add(d.sh("0 2"), "0 4 7");
```

is equivalent to:

```ts
d.sh("0 6");
```

The left pattern supplies two events:

```text
Left:    0  2
Right:   0  4
Result:  0  6
```

The right-hand `7` is unused for this bar.

Consequently, numerical addition is commutative, but swapping timing-bearing operands can change event timing and event count. Do not promise that swapping patterned operands produces the same musical result.

### Agreed example: alternating transposition

```ts
.notes(d.sh("[0 <2 4>]*2").add("<0 2>"));
```

and:

```ts
.notes(d.add("[0 <2 4>]*2", "<0 2>"));
```

have the intended behavior of:

```ts
.notes("<[0 <2 4>]*2 [2 <4 6>]*2>");
```

The right operand supplies alternating per-bar offsets of `0` and `2`, broadcast over the left pattern's hits.

Evaluate shorthand with its existing nested-alternation, repetition, and phase semantics, then combine values. Do not implement arithmetic as textual shorthand substitution. The expanded string is a behavioral example to verify against the evaluator, not a string-rewriting algorithm.

### Multiplication is not speed

```ts
pattern.mul(2); // Multiply numeric values by 2
pattern.fast(2); // Existing timing/speed transformation
```

The `*` operator inside shorthand retains its existing meaning; adding `.mul()` does not redefine shorthand syntax.

## Continuous parameter arithmetic

### Addition: independent contributions

```ts
const attack = d.env(0, 3).adsr(0.01, 0.3, 0, 0.1);
const movement = d.lfo(0, 0.25);

const index = d.add(2, attack, movement);
```

The result is a base index of `2`, plus a per-note brightness envelope, plus ongoing LFO movement. The LFO continues to contribute after the brightness envelope has returned to zero, while the voice remains alive.

### Multiplication: envelope-shaped movement

```ts
const brightness = d.env(0, 4).adsr(0.01, 0.3, 0.2, 0.1);
const movement = d.lfo(0.75, 1.25).norm();

const index = brightness.mul(movement);
```

The LFO scales the brightness envelope by a factor between `0.75` and `1.25`. When the envelope reaches zero, the product reaches zero.

Current LFO argument semantics matter:

- `d.lfo(offset, depth)` means offset plus a bipolar waveform times depth.
- `.norm()` interprets the two arguments as range endpoints.

Composition must not change these meanings.

### Preserve source timing and identity

- Envelopes are instantiated and triggered separately for each voice/note.
- LFOs retain their existing phase, tempo, and sharing behavior; composition does not implicitly retrigger them.
- Numeric patterns retain their existing bar/hit sampling behavior.
- MIDI controls remain live inputs.
- Continuous contributions are combined continuously, not only at note or bar boundaries.

Reusing an expression must not cause one voice's envelope scheduling to overwrite another voice's state.

### Units and ranges

Arithmetic must have predictable numerical meaning:

- Additive contributions to a frequency parameter are in Hz.
- Additive contributions to detune are in the destination's detune units.
- An envelope in FM-index units can be multiplied by a dimensionless LFO factor.

Do not silently normalize or clamp every intermediate operation. Define target-specific validation and out-of-range behavior explicitly. Static invalid inputs and dynamically out-of-range signals may require different handling.

## Instrument gain and voice lifetime

The desired authoring forms include:

```ts
.gain(envelope.add(1, lfo));
.gain(d.add(1, envelope, lfo));
```

Instrument gain currently has an envelope-specific role. General expressions may never reach zero, so voice lifetime cannot be inferred from the arithmetic output becoming silent.

Agreed direction:

- Keep note gating, release ownership, and cleanup explicit and separate from the arithmetic result.
- Do not let a constant or continuously running LFO leave a voice alive indefinitely.
- Preserve a defined release/termination contract even when the gain expression has a nonzero baseline.

The exact gain API/schema change and whether a separate final gate is required remain implementation-design questions. General parameter composition should not silently replace the current gain-envelope contract.

## Implementation direction, not a prescribed representation

A shared tagged expression tree is a suitable model: arithmetic nodes contain numeric/pattern/control operands, and destination-specific validation/evaluation handles the domain differences.

This need not make the shorthand parser itself understand audio signals. An arithmetic method on `Shorthand` can construct an expression wrapping the existing shorthand value.

For continuous parameters, native audio graphs can implement the operations:

- Scheduled constant sources for constants and envelope signals.
- Existing LFO worklet outputs for LFO leaves.
- Native signal summing for addition.
- Gain nodes for multiplication.

Do not use main-thread timers to approximate continuous expression evaluation.

Implementation work will need recursive source discovery, validation, per-voice binding, automation scheduling, and cleanup rather than top-level source-kind dispatch alone. Exact schema structure, builder typing, expression limits, and graph optimizations are not decided here.

## Decisions still required before implementation

- Exact supported operand types and overloads, especially structured arrays, rests, and chord/layer arithmetic. Preserve existing input meanings rather than guessing or flattening them.
- Treatment of timing operators in non-owning shorthand operands. Such operands cannot contribute event geometry; decide which forms are valid rather than silently discarding unsupported syntax.
- Timing-owner discovery and timing precedence in nested expressions.
- Instrument gain's release/lifetime integration and compatibility behavior.
- Target-specific dynamic range handling, including any explicit clamp operation.
- Random-source reuse and evaluation/memoization details, preserving existing deterministic resolution contracts.
- Error messages and limits for malformed, cyclic, or excessively deep expression trees.

Initial scope is addition and multiplication. General mathematical operators, arbitrary routing, automatic continuous-to-note sampling, new envelope timing/curve features, and FM synthesis itself are separate work.

## Verification expectations

A future implementation should cover:

- Instance/factory equivalence and chained/nested expressions.
- Arithmetic nonmutation and expression reuse.
- Both agreed shorthand examples, including repeated cycles and nested alternation phase.
- Unequal pattern lengths, scalar broadcasting, bar wrapping, and explicit timing precedence.
- Numeric multiplication versus shorthand speed/repetition.
- Clear rejection of continuous sources in note arithmetic.
- Existing pattern-input behavior remaining unchanged outside explicit arithmetic.
- Independent envelopes for overlapping notes and preserved LFO phase/sharing.
- Continuous addition/multiplication, deterministic pattern/random resolution, and cleanup.
- Defined release/termination for gain expressions that do not reach zero.
- Offline audio regression cases for representative continuous compositions once implemented.
