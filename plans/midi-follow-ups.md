# MIDI Follow-up Work

## Context

MIDI V1 is complete. Its implementation history and settled V1 decisions are archived in:

- [`completed/midi-prd.md`](completed/midi-prd.md)
- [`completed/midi-plan.md`](completed/midi-plan.md)

This file is the active index for work deliberately deferred from that scope. Each substantial item should receive its own PRD/SOW before implementation rather than being added opportunistically to the completed V1 design.

## Structured diagnostics

Use the shared diagnostics design in [`error-handling.md`](error-handling.md). Do not introduce a MIDI-specific warning or deduplication subsystem.

Future diagnostics should cover:

- contextual MIDI CC defaults that were inferred by Fluid;
- ambiguous device-name selectors;
- unavailable input/output targets;
- invalid pattern-derived MIDI output notes or timings that are safely discarded;
- engine lifecycle or binding warnings useful to authors.

Diagnostics should surface in the frontend REPL once per relevant evaluation/operation rather than existing only in browser developer tools.

## MIDI note input → synthesizer voices

This requires a dedicated live-voice runtime. The current engine is bar-scheduled and calculates envelopes from known note durations, so note input must not be implemented as a small branch in the pattern scheduler.

A separate PRD must define:

- `MidiInSchema` and `d.midi.notes()`;
- transport-independent versus transport-bound triggering;
- held-note attack/decay/sustain and note-off release;
- source-aware polyphony and duplicate-note semantics;
- velocity mapping and whether it affects primary gain;
- live-voice teardown on stop, schema replacement, MIDI reconnect, and engine destruction;
- behavior when a device disconnects while notes are held;
- random, pattern, LFO, effect, and envelope semantics for live notes;
- how active note input interacts with local mute and external MIDI output.

MIDI note 0 endpoint handling in `midiToFrequency()` is already correct and covered by AudioEngine tests.

## MIDI-controlled envelopes

MIDI control of primary gain, ADSR values, and other envelope fields remains deferred. A design must define:

- whether CC changes affect only newly created voices or also active voices;
- how updates interact with already scheduled Web Audio automation ramps;
- whether active ramps are cancelled, recomputed, or allowed to finish;
- smoothing behavior and initialization before a future voice starts;
- retirement, stop, reconnect, and destruction cleanup;
- contextual ranges/defaults for each envelope destination.

## Sampler MIDI output

Sampler output needs product decisions before schema or runtime work begins:

- whether the original requested note, nearest source key, or transposed playback pitch is emitted;
- keeping original resolved MIDI pitch separate from sample playback rate;
- whether generated fit/chop timing changes external note duration;
- whether MIDI output remains independent of local sample-buffer availability;
- behavior for one-shot, clipped, looped, chopped, and sprite playback;
- velocity semantics and interaction with sampler gain/mute;
- whether sampler output targets remain single-target in the first slice.

## MIDI note input → samplers

Sampler input should follow the live synth-note design and separately define:

- source-key selection and transposition;
- variation selection;
- held-note, one-shot, loop, and release behavior;
- duplicate-note/polyphony semantics;
- fit/chop/region behavior for live input;
- teardown on note-off, device disconnect, stop, schema replacement, and destroy.

## Additional protocol and product extensions

These were non-goals for MIDI V1 and need independent prioritization:

- MIDI clock/transport input or output and quantization;
- SysEx support and permission requirements;
- multiple MIDI output targets per instrument;
- persistent user-defined device aliases;
- richer device identity where input and output ports do not share IDs/names;
- additional typed output messages such as program change, pitch bend, channel pressure, and All Sound Off;
- persisted web-app MIDI enablement, gated by both user preference and already-granted browser permission.
