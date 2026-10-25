# Fluid pattern input cleanup

## The short version

**Make argument boundaries obvious without making users choose between shorthand and structured patterns.**

We will add `d.structured()` / `d.str()` to package a structured pattern into one reusable value. Methods with multiple logical inputs will then take one argument per input. Dedicated pattern setters will keep their existing convenient syntax.

This is planned work, not a description of features already available. The [spec](spec.md) defines the exact behavior; the [plan](plan.md) describes implementation and verification.

## Why do this?

Today, this is valid:

```ts
instrument.noise("pink", 0.2, 0.1);
```

It has three JavaScript arguments, but only two logical inputs:

- **Color:** pink.
- **Gain pattern:** `0.2` for one bar, then `0.1` for the next, repeating.

The gain pattern spills across argument positions. You need to know the method's special rules to understand where one input ends and another begins.

Shorthand already makes that boundary clear:

```ts
instrument.noise("pink", "<0.2 0.1>");
```

Structured patterns should be able to do the same thing without requiring a string.

## The new rule

> When a method has multiple logical inputs, each input occupies one argument.

Patterns in those slots can use shorthand or the new structured builder:

```ts
instrument.noise("pink", "<0.2 0.1>");
instrument.noise("pink", d.str(0.2, 0.1));
```

Scalars and already-supported modulation sources remain available too. For example, an LFO can still be supplied directly to a parameter that accepts one.

## Meet `d.str()`

`d.structured()` and `d.str()` are two names for the same builder. They package the structured syntax we already have; they do not introduce a new pattern language.

**The existing distinction between arguments and arrays stays intact:**

| Structured builder  | Shorthand equivalent | Meaning                   |
| ------------------- | -------------------- | ------------------------- |
| `d.str(0.2, 0.1)`   | `"<0.2 0.1>"`        | Two successive bars       |
| `d.str([0.2, 0.1])` | `"0.2 0.1"`          | Two values within one bar |

Values are reusable, just like `d.sh()` values:

```ts
const levels = d.str(0.2, 0.1);

firstInstrument.gain(levels);
secondInstrument.noise("pink", levels);
```

The builder will support **event patterns as well as numeric patterns**:

```ts
const melody = d.str([60, 64, 67], [62, 65, 69]);

firstInstrument.notes(melody);
secondInstrument.notes(melody);
```

Each consumer still decides what its values mean. A notes pattern can contain chords or rests where supported; a numeric parameter does not gain those capabilities merely because its input is wrapped.

## Where signatures change

The cleanup applies to these multi-input API families:

| API          | What becomes explicit                       |
| ------------ | ------------------------------------------- |
| `.noise()`   | Color and one gain value/pattern            |
| `d.env()`    | One maximum, or a minimum and maximum       |
| `d.filter()` | Filter type and one frequency value/pattern |
| `.chop()`    | Slice count and one optional sequence       |
| `d.lfo()`    | One value/pattern for each endpoint         |
| `.adsr()`    | One value/pattern for each envelope field   |

For example:

```ts
d.filter("lp", d.str(400, 1200));
sampler.chop(4, d.str([0, 2], [1, 3]));
d.lfo(d.str(0.2, 0.8), 1);
instrument.adsr(d.str(0.01, 0.02), 0.1, 0.8, 0.2);
```

Raw arrays and extra pattern arguments will no longer be accepted in these positional slots. Noise will use one gain slot even when color is omitted.

**Dedicated single-input methods keep their existing syntax:**

```ts
instrument.gain(0.2, 0.1); // still valid: the whole call is one pattern
instrument.gain(d.str(0.2, 0.1)); // explicit alternative
```

The same principle applies to individual envelope setters, sampler regions, event setters, and dedicated filter factories such as `d.lpf()`.

We are not adding compensating methods such as `.noiseGain()`.

## Fixing envelopes along the way

### One argument will always mean maximum

Currently, `d.env(0.1)` sets minimum, while `d.env("0.1")` sets maximum. That difference is surprising.

As prework, we will make the meaning consistent:

```ts
d.env(); // minimum 0, maximum 1
d.env(0.1); // minimum 0, maximum 0.1
d.env(0.1, 0.8); // minimum 0.1, maximum 0.8
```

**This is a breaking change.** To preserve the previous meaning of numeric `d.env(0.1)`, write `d.env(0.1, 1)`.

### Minimum will become patternable too

Both bounds will support numeric patterns:

```ts
d.env("0 0.1", "0.5 1");
d.env(d.str(0, 0.1), d.str(0.5, 1));
```

Minimum will be selected per event using the same pattern lookup rules as maximum. This does not add continuous modulation or a new rhythm clock. Inverted envelopes, where minimum exceeds maximum, remain valid.

## What gets simpler internally?

Methods should not each need their own interpretation of where a pattern starts and ends.

We will normalize explicit structured values and existing variadic convenience inputs at a shared boundary, then let the appropriate decoder handle the pattern's meaning.

That is **shared input handling**, not a universal decoder that treats notes, sample names, numeric parameters, and XOX as interchangeable.

## What stays outside this work?

- Patterned settings for `.euclid()`, `.hex()`, and `.sequence()` belong in a separate SOW.
- LFO speed, waveform, and phase input expansion is not included.
- Existing source permissions and random behavior are not being broadened.
- There is no new shorthand grammar or automatic saved-sketch rewrite.

## What success looks like

- You can see the logical inputs by looking at the arguments.
- Both pattern syntaxes are equally usable and reusable.
- Simple dedicated setters remain concise.
- Envelope argument meanings are consistent, and both bounds can be patterned.
- Existing pattern structure, timing, source restrictions, and failure atomicity survive the cleanup.
