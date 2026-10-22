# Parameter shorthand: the big picture

## What we're doing

We want shorthand to work for numeric parameters without adding special parsing logic to every setter. First, we'll standardize how parameter inputs are interpreted. Then we'll add a small, useful shorthand subset through that shared boundary.

We're building on the syntax infrastructure created for event patterns—not routing parameters through the event pipeline.

**Status:** Proposed work; implementation has not started. The [spec](./spec.md) is the behavioral source of truth; this overview explains the idea, not every rule. The [implementation plan](./plan.md) breaks the work into reviewable changes and verification gates.

## Why tidy up first?

The core parameter pipeline is already small: normalize numeric inputs, store a static or random pattern, and emit the existing schema. But the surrounding logic is scattered. Several setters repeat the same checks for envelopes, LFOs, and MIDI sources, and some consumers adapt arrays differently.

Adding shorthand directly to each method would multiply those differences. Instead, we'll give numeric inputs one shared interpretation boundary and keep genuine consumer differences explicit. That should make this feature—and the next parameter setter—easier to follow.

This is a focused cleanup, not an attempt to redesign the cycle classes or make every consumer behave identically.

## What users get

Numeric-pattern slots such as gain, filter frequency, detune, and envelope components will accept a string or reusable `d.sh()` value alongside their existing input forms:

```ts
d.synth().gain("[0.2 0.8]!2"); // Values: 0.2, 0.8, 0.2, 0.8 within a bar
d.lpf("<400 1200>"); // Alternate frequency values across bars

const levels = d.sh("0.2!3 0.8");
d.env(levels); // Minimum 0, patterned maximum
d.env(0.1, levels); // Explicit minimum, same maximum pattern
```

The envelope factory and constructor also accept shorthand by itself for the maximum. Minimum stays numeric-only: `d.env(0.1)` still means minimum `0.1`, maximum `1`. A leading shorthand must be the sole argument.

The subset is deliberately small:

| Syntax    | Parameter meaning                           |
| --------- | ------------------------------------------- |
| `0.2 0.8` | Successive values within a bar              |
| `[ ... ]` | Group a sequence, mainly for operator scope |
| `!n`      | Repeat a value or group                     |
| `< ... >` | Alternate between choices across bars       |

Existing structured inputs keep their meanings. Shorthand is an alternative for a whole numeric pattern, not something mixed into its arrays.

## How it fits together

**Target shape:** the event branch already exists; the value-sequence evaluator is new.

```text
                         Shared shorthand parser
                                   ↓
                           PatternExpression
                                   │
                 ┌─────────────────┴─────────────────┐
                 ↓                                   ↓
          Event evaluator                  New value-sequence evaluator
                 ↓                                   ↓
            EventCycle                         Numeric bars
                 ↓                                   ↓
     Event state + compiler                  Parameter / ValueCycle
                 ↓                                   ↓
          Event schema                       NumberPattern schema
```

The parser answers, “What structure did the user write?” Each evaluator answers, “What does that structure mean for this kind of pattern?”

This picture shows shorthand only. Structured numeric inputs join at the shared numeric-input boundary; random patterns and supported modulation sources keep their existing separate paths. We don't turn them into event geometry or change the audio engine's schema.

## The boundaries that matter

- **Values, not a new clock.** Ordinary parameters still advance through values on surviving hits. Alternation changes bars, not hits. Parameter patterns don't start creating or suppressing notes.
- **Grouping is not subdivision here.** `[0.2 [0.4 0.6]]` becomes the ordered values `0.2, 0.4, 0.6`; it doesn't allocate portions of musical time. Groups still matter for repetition and alternation scope.
- **Unsupported syntax fails clearly.** Rests, polyphony, `*`, `/`, and `@` aren't included. We won't silently throw away their meaning.
- **Special consumers stay explicit.** LFO endpoints still use only the first value in each bar and warn during schema serialization, once per affected endpoint per LFO instance. Multivalue LFO bars are useful shorthand input even though the existing structured endpoint API can't express them. Chop sequences still affect generated timing exactly as equivalent structured sequences do.
- **No adjacent redesigns.** Diagnostics infrastructure, parameter scheduling, existing array meanings, and the event pipeline aren't being overhauled.

The main thing to protect is compatibility: this should feel like a new way to write existing numeric patterns, not a surprise change to how those patterns play. The work is intended to fit in one PR, with existing behavior characterized before the shared boundary and shorthand are connected.

For the complete consumer list, exact expression examples, limits, and acceptance criteria, see the [specification](./spec.md).
