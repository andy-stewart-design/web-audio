# Error Handling and Diagnostics

## Goal

Replace scattered `console.log`, `console.warn`, and ad hoc thrown errors with a coherent diagnostics system that can surface relevant authoring and runtime feedback in the frontend REPL console as well as developer tooling.

## Current motivation

- A chopped sample sequence index that is out of range currently uses `console.warn`.
- Other parts of the system throw errors directly.
- The REPL currently displays evaluation success/errors, but not engine, schema-generation, or runtime warnings.

## Direction

Design a structured diagnostics model rather than adding local warning helpers in individual packages.

Diagnostics should eventually include at least:

- severity, such as `error`, `warning`, or `info`;
- a stable diagnostic code;
- a human-readable message;
- an originating subsystem/package;
- optional source/context information appropriate for the caller.

The code-evaluation worker should be able to return diagnostics alongside a generated schema. The app can then add them to the REPL output log. Runtime systems such as AudioEngine should have an equivalent route for reporting diagnostics to the application, instead of relying solely on browser developer-tools output.

## MIDI-driven example

Fluid MIDI CC builders will support contextual mapping/default values. For example:

```ts
d.lpf(d.midi.cc(74));
```

can use a contextual exponential frequency range and resting value when the author omits `.expRange(...)` and `.default(...)`.

Do **not** introduce MIDI-specific `console.warn` deduplication for these implicit values. Until the shared diagnostics system exists, contextual defaults should be silent and documented. Once it exists, schema generation should emit a structured, once-per-evaluation authoring diagnostic such as `implicit-midi-cc-default`, which the REPL can display.

## Open questions

- What is the transport/interface between worker evaluation, AudioEngine, and the Svelte UI?
- Which diagnostics should be user-facing versus developer-only?
- How should diagnostics associate with user source code or schema paths?
- What is the lifecycle/deduplication policy for repeated runtime diagnostics?
- Which existing `console.*` calls and thrown errors should migrate first?
