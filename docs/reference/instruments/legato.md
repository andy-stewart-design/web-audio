---
title: legato()
description: Set note gates to reach the next hit in the repeating cycle
---

# legato()

Set each note's gate to reach the next hit in the repeating cycle.

**Available on:** Samplers, basic synthesizers, and unison synthesizers.  
**Alias:** `.leg()`

## Usage

```text
instrument.legato(enabled?)
instrument.leg(enabled?)
```

Returns the same instrument for chaining.

| Argument  | Accepted values | Default when omitted | Description                                              |
| --------- | --------------- | -------------------- | -------------------------------------------------------- |
| `enabled` | Boolean         | `true`               | Enable legato timing; `false` restores the normal gates. |

Legato is **off** on a new instrument. Calling `.legato()` turns it on.

```ts
// Notes start half a bar apart and sustain across the intervening rests.
d.synth().notes([60, null, 67, null]).legato().push();

// The alias accepts the same argument.
d.synth("unison").notes([60, null, 64, null]).leg().push();

// Disable legato again.
d.sample("bd").xox("xoxo").legato().leg(false).push();
```

## Behavior

- Gates can span silent bars. The final hit reaches the first hit of the next cycle, rather than stopping at the bar boundary.
- Onsets, notes, and chord groups do not change. A wholly silent cycle stays silent.
- Gates are calculated before random rhythm chance filtering; a skipped hit does not extend the preceding gate again.
- Legato does not change ADSR, sample looping, or clipping settings. A longer gate does not make a non-looping sample play beyond its available audio.

See [Patterns](../../concepts/patterns.md) for hits, rests, and cycles.

[Instrument reference](index.md)
