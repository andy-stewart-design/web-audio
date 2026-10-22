---
title: Instruments
description: Fluid instrument methods and aliases
---

# Instruments

Instrument methods configure a sampler, basic synthesizer, or unison synthesizer. This reference is being built incrementally; linked methods have reference pages, and unlinked methods are not yet documented here. Aliases share the canonical method's page.

Examples assume an existing Fluid instance named `d`. Each example is independent, and `.push()` adds the instrument to that instance for playback. Sample examples use the built-in default bank; available variations depend on the selected sample and bank.

See [Pattern syntax](../../concepts/syntax.md) for structured and shorthand syntax, and [Patterns](../../concepts/patterns.md) for bars, steps, chords, and rests.

## Creating instruments

| Method                                      | Creates                                                              |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `d.synth()`                                 | Basic synthesizer                                                    |
| `d.synth("unison")` / `d.synth("uni")`      | Unison synthesizer                                                   |
| `d.sample()` / `d.sample(name, variation?)` | Sampler; an unnamed sampler needs `.name()` before schema generation |

Factory arguments are not yet covered by dedicated reference pages. `"uni"` is a selector alias, not a separate method.

## Shared methods

Available on samplers, basic synthesizers, and unison synthesizers.

| Method                   | Aliases               |
| ------------------------ | --------------------- |
| `.notes()`               | —                     |
| `.root()`                | —                     |
| `.scale()`               | —                     |
| `.key()`                 | —                     |
| [`.legato()`](legato.md) | [`.leg()`](legato.md) |
| `.xox()`                 | —                     |
| `.euclid()`              | —                     |
| `.hex()`                 | —                     |
| `.sequence()`            | —                     |
| `.fast()`                | —                     |
| `.slow()`                | —                     |
| `.stretch()`             | —                     |
| `.reverse()`             | —                     |
| `.gain()`                | —                     |
| `.adsr()`                | —                     |
| `.detune()`              | —                     |
| [`.noise()`](noise.md)   | —                     |
| `.fx()`                  | —                     |
| `.mute()`                | —                     |
| `.route()`               | —                     |
| `.send()`                | —                     |
| `.duck()`                | —                     |
| `.push()`                | —                     |
| `.getSchema()`           | —                     |

## Sampler methods

In addition to the shared methods above.

| Method                         | Aliases                  |
| ------------------------------ | ------------------------ |
| `.name()`                      | —                        |
| `.bank()`                      | —                        |
| [`.variation()`](variation.md) | [`.var()`](variation.md) |
| `.fit()`                       | —                        |
| `.start()`                     | —                        |
| `.end()`                       | —                        |
| `.duration()`                  | `.dur()`                 |
| `.chop()`                      | —                        |
| `.direction()`                 | `.dir()`                 |
| `.loop()`                      | —                        |
| `.clip()`                      | —                        |

## Synthesizer methods

In addition to the shared methods above.

| Method      | Available on                                               | Aliases |
| ----------- | ---------------------------------------------------------- | ------- |
| `.type()`   | Basic and unison synths; unison accepts saw waveforms only | —       |
| `.out()`    | Basic and unison synths                                    | —       |
| `.voices()` | Unison synths only                                         | —       |
| `.spread()` | Unison synths only                                         | —       |
| `.width()`  | Unison synths only                                         | —       |
