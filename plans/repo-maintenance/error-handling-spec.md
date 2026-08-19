# Error Handling and Diagnostics Spec

## Status

Proposed repository-maintenance specification. This work should be coordinated with `plans/repo-maintenance/schema-validation-spec.md`: schema validation supplies structured, path-aware failures, while this specification defines how failures and non-fatal diagnostics cross package and application boundaries.

## Problem

The repository currently has several unrelated error-reporting mechanisms:

- Fluid and Patterns throw ad hoc `Error`, `TypeError`, and `RangeError` instances for invalid authoring calls;
- Fluid emits authoring warnings directly with `console.warn()`;
- AudioEngine and sampler internals emit load, availability, and skipped-playback warnings directly with `console.warn()`;
- some asynchronous failures are converted to `null` and leave only a console warning;
- some best-effort browser operations intentionally swallow promise rejections;
- the evaluation worker returns only an error message or a schema;
- the frontend REPL log has only `output` and `error` entries;
- AudioEngine clock callbacks have no coherent application-visible error boundary;
- internal invariant failures can surface as messages that are meaningless to an author.

Consequences include:

- important feedback is visible only in browser developer tools;
- equivalent failures have different shapes depending on where they occur;
- repeated scheduling warnings can flood the console;
- UI code cannot distinguish authoring mistakes, recoverable runtime degradation, and engine defects;
- plain error messages are difficult to test or evolve;
- libraries decide presentation policy by calling `console.*` themselves;
- asynchronous failures lose useful context such as sampler, bank, URL, bar, or schema path.

## Goal

Provide one coherent, structured diagnostics model for authoring and real-time runtime feedback while retaining ordinary exceptions for failed operations.

The system must:

- surface evaluation, schema-generation, engine, sample-loading, and MIDI feedback in the application;
- preserve useful developer-tool reporting without making libraries own console presentation;
- distinguish fatal operation failures from non-fatal diagnostics;
- use stable codes and structured context rather than parsing messages;
- remain safe across worker `postMessage()` boundaries;
- avoid warning floods during repeated bars or evaluations;
- make internal defects observable without exposing implementation-only messages as user guidance;
- avoid introducing a broad event bus or global singleton.

## Core position: exceptions and diagnostics are different

A diagnostic is not a replacement for every thrown error.

### Throw or reject when an operation cannot honor its contract

Examples:

- invalid Fluid method arguments;
- malformed canonical schema passed to AudioEngine;
- failure to construct a graph generation transactionally;
- unavailable required Web Audio worklets;
- invalid MIDI API arguments;
- invalid scheduler configuration;
- a failed evaluation that cannot produce a schema.

The caller must be able to observe that the operation failed. Returning a diagnostic while pretending success is not acceptable.

### Emit a diagnostic when the operation can continue meaningfully

Examples:

- an out-of-range chop index will wrap deterministically;
- a sample bank or variation is unavailable and one event is skipped;
- a previous sample buffer is used while a replacement loads;
- contextual MIDI CC defaults were selected implicitly;
- reverse playback was requested before its prepared buffer became available;
- a recoverable external resource load failed.

### Do both when a terminal failure also needs asynchronous reporting

A runtime callback may have no useful synchronous caller, such as a clock-driven graph commit. It should report an error diagnostic through the configured sink and contain the exception so the scheduler remains alive. The failed transaction must still be represented internally as failed; reporting must not turn partial work into success.

### Assertions represent defects

Impossible states and exhaustive-union failures should throw an internal error. At an application boundary they become a developer-facing diagnostic with a stable generic message and retained cause for logging. They should not be rewritten as user-actionable warnings.

`packages/audio-engine/src/resolvers/random-resolver.ts` throwing for an empty random bar is an example. Once canonical schema validation exists, malformed input should fail earlier with a schema path. If the resolver still reaches that state, it is an engine invariant violation, not an author warning.

## Shared diagnostics model

Create a small dependency-light package, tentatively `@web-audio/diagnostics`, containing data contracts and collection utilities only. It must not depend on Fluid, schema, AudioEngine, Svelte, browser globals, or Node APIs.

A diagnostic must be plain structured-cloneable data:

```ts
type DiagnosticSeverity = "error" | "warning" | "info";

type DiagnosticAudience = "author" | "developer";

type DiagnosticPhase =
  | "evaluation"
  | "schema"
  | "prepare"
  | "commit"
  | "scheduling"
  | "runtime"
  | "midi";

interface DiagnosticLocation {
  source?: string;
  line?: number;
  column?: number;
  schemaPath?: string;
}

interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  audience: DiagnosticAudience;
  subsystem: string;
  phase: DiagnosticPhase;
  message: string;
  location?: DiagnosticLocation;
  context?: Record<string, string | number | boolean | null>;
}

type DiagnosticSink = (diagnostic: Diagnostic) => void;
```

The final names may differ, but the semantics should not.

### Required properties

- `code` is stable, machine-readable, lowercase kebab case, and namespaced by subsystem, for example `sampler/variation-not-ready`.
- `severity` controls presentation priority, not control flow.
- `audience` explicitly separates actionable author feedback from implementation defects.
- `subsystem` identifies the owner, such as `fluid`, `schema`, `audio-engine`, `sampler`, or `midi`.
- `phase` describes when the diagnostic occurred.
- `message` is complete human-readable text and must not require context interpolation by the UI.
- `location.schemaPath` uses the same path convention as schema validation.
- `context` contains bounded, serializable values useful for presentation, tests, telemetry, and deduplication.

### Deliberate exclusions

Diagnostics must not contain:

- `Error` objects or stack traces;
- arbitrary causes;
- browser objects, AudioNodes, MIDI ports, or class instances;
- callbacks;
- unbounded arrays or mutable subsystem state;
- presentation markup;
- timestamps generated by libraries;
- random diagnostic IDs.

Native `Error` causes and stacks may be retained separately at the application boundary for developer logging, but they are not part of worker or public diagnostic transport.

## Diagnostic codes

Codes are public compatibility identifiers once exposed in the REPL. Tests and UI behavior may depend on them.

Rules:

- use `<subsystem>/<condition>`;
- describe the condition, not the current message wording;
- do not encode severity in the code;
- do not include dynamic values;
- reuse one code when the condition and remediation are the same;
- use separate codes when deduplication or presentation policy should differ;
- document codes next to their emitter and in a package-level exported registry if consumers need type-safe narrowing.

Initial candidate codes:

| Code | Severity | Audience | Meaning |
| --- | --- | --- | --- |
| `sampler/chop-index-wrapped` | warning | author | A static chop index is outside the slice range and will wrap. |
| `sampler/random-region-clamped` | warning | author | A random region may resolve outside `[0, 1]` and will be clamped. |
| `sampler/bank-not-found` | warning | author | A sampler references a bank absent from the assembled schema. |
| `sampler/sample-not-found` | warning | author | A sampler references a sample absent from its bank. |
| `sampler/variation-not-ready` | warning | author | A scheduled event was skipped because its buffer is still loading. |
| `sampler/reverse-not-ready` | warning | author | Reverse playback was skipped because the reversed buffer is unavailable. |
| `sampler/load-failed` | error | author | A sample resource failed to fetch or decode. |
| `midi/implicit-cc-default` | info | author | Contextual MIDI range/default values were selected. |
| `midi/access-failed` | error | author | Browser MIDI access failed. |
| `audio-engine/commit-failed` | error | author | A pending schema could not be installed and the active graph was preserved. |
| `audio-engine/bar-scheduling-failed` | error | developer | One bar failed to schedule and was rolled back where possible. |
| `audio-engine/internal-error` | error | developer | An unexpected engine invariant failed. |

This table is a starting point, not permission to emit every possible event. Diagnostics should be added only when a caller can act on them or when they materially improve defect visibility.

## Ownership and transport

### No global diagnostic bus

Each long-lived subsystem accepts an optional `DiagnosticSink`. Short-lived authoring evaluation uses an explicit collector. This keeps tests deterministic, avoids cross-instance leakage, and supports multiple engines or workers.

A no-op sink is the library default. Libraries must not silently substitute `console.warn` as their default transport.

A reusable collector may expose:

```ts
const collector = createDiagnosticCollector();
collector.emit(diagnostic);
collector.diagnostics;
```

The collector owns deduplication for one evaluation. Runtime deduplication is owned by the application-facing engine diagnostic channel because it has lifecycle context.

### Fluid and worker evaluation

Fluid needs an explicit evaluation-scoped route for non-fatal authoring diagnostics. Prefer constructor injection:

```ts
const diagnostics = createDiagnosticCollector();
const drome = new Drome({ onDiagnostic: diagnostics.emit });
```

Avoid mutable global collectors and avoid a `drainDiagnostics()` API whose result depends on call order.

The worker response becomes an explicit discriminated union:

```ts
type EvalResponse =
  | {
      id: string;
      ok: true;
      schema: DromeSchema;
      diagnostics: Diagnostic[];
    }
  | {
      id: string;
      ok: false;
      error: EvaluationErrorData;
      diagnostics: Diagnostic[];
    };
```

`EvaluationErrorData` should contain a safe message and optional classification, not a cast `(err as Error).message`. Unknown thrown values must be normalized deliberately.

Warnings collected before a later terminal evaluation failure remain useful and should be returned with the failure.

The worker must not monkey-patch `console.*` or capture arbitrary user console output as diagnostics. User logging is a separate REPL feature and should have a separate transport and presentation contract.

### AudioEngine

AudioEngine accepts a diagnostic sink in constructor options:

```ts
new AudioEngine(ctx, clock, { onDiagnostic });
```

The sink is used for asynchronous prepare, commit, scheduling, and playback diagnostics. Synchronous methods still throw when their contract fails.

Requirements:

- every clock listener executes through one engine error boundary;
- callback errors do not escape into `AudioClock.scheduler()`;
- transaction failures preserve the previous active graph and timing state;
- the error boundary emits one structured diagnostic with phase and context;
- expected recoverable sample states emit their specific diagnostic rather than a generic engine error;
- an exception thrown by the diagnostic sink is contained and must not interrupt audio scheduling;
- destruction prevents subsequent diagnostics from late promises or callbacks;
- diagnostics from retired generations retain generation context and cannot be attributed to the new active generation.

AudioEngine should assign monotonically increasing generation IDs for diagnostic context. IDs are runtime correlation values, not persisted schema data.

### MIDI

MIDI's status subscriptions remain the primary representation for ordinary state transitions such as pending, ready, unsupported, and denied. Diagnostics are for failures or degradation that merit a log entry, not a duplicate stream of every status change.

The app may translate a rejected `midi.ready` promise into `midi/access-failed`; alternatively MIDI may accept a sink and emit it. Choose one owner and test that the failure appears exactly once. Prefer the MIDI package as owner if enough browser failure context exists there.

### Application

`AudioPlayer` owns the application sinks and translates diagnostics into UI state. It should not collapse all diagnostics into `lastError`.

Recommended state:

- retain `lastError` only for the latest terminal play/evaluation failure if required by other UI;
- append structured diagnostics to the workspace log;
- keep MIDI status/error state for the MIDI settings control;
- optionally mirror developer-audience diagnostics and their retained causes to `console.error` in development;
- do not mirror ordinary author warnings from every library independently.

The workspace log entry should preserve diagnostic structure rather than reducing immediately to `{ type, message }`:

```ts
type LogEntry =
  | { id: string; kind: "evaluation-success"; message: string }
  | { id: string; kind: "diagnostic"; diagnostic: Diagnostic };
```

The UI maps severity to visual role:

- `error` → alert/error;
- `warning` → warning;
- `info` → neutral information;
- evaluation success → success.

The UI should display the code in an accessible details affordance or developer mode, not necessarily as primary text.

## Deduplication and lifecycle

Deduplication must be deterministic and explicit. Emitters should report facts; collectors decide whether repeated facts create repeated entries.

### Evaluation diagnostics

Deduplicate within one worker evaluation using:

```text
code + schemaPath + stable serialized context
```

Examples:

- the same implicit MIDI CC default emitted while one builder is traversed repeatedly appears once;
- distinct MIDI CC schema paths remain distinct;
- distinct missing samples remain distinct.

A new evaluation starts a new diagnostic epoch. The same warning may appear again because the author reran the code and needs feedback about the current result.

### Runtime diagnostics

Runtime deduplication uses a bounded policy per engine generation:

- structural absence, such as a missing bank or sample: once per generation and target;
- resource load failure: once per generation and URL, with retry failure allowed to re-emit only after an explicit retry epoch;
- temporary not-ready events: once per generation and resource until readiness changes;
- bar scheduling or commit failure: once per failed operation, never once per affected note;
- internal errors: do not suppress distinct occurrences, but apply a hard bounded rate limit to protect the UI.

Deduplication state must be discarded when its generation is destroyed. Global process-lifetime suppression is prohibited because it hides failures in later sketches.

Diagnostics should not include wall-clock time. The app may timestamp log receipt for presentation.

## Source and schema location

### Schema paths now

Schema and engine diagnostics should include canonical schema paths wherever known, for example:

```text
instruments[2].region.slices[4]
banks["drums"].samples["kick"]["36"][0]
```

All packages should use the path syntax established by shared schema validation rather than inventing package-specific formats.

### User source locations later

The current evaluator uses `new Function()` and Fluid builders do not retain call-site metadata. Accurate source ranges therefore require parser/instrumentation work and are out of scope for the first implementation.

Do not infer source lines from stack strings. Until source maps or instrumented evaluation exist:

- use schema paths and structured authoring context;
- allow `location.source` to identify the sketch or manifest when known;
- leave line and column absent.

The data model deliberately supports future source ranges without making them mandatory.

## Error normalization

Create one utility at application/worker boundaries:

```ts
normalizeThrown(value: unknown, fallbackMessage: string): NormalizedError;
```

It should:

- preserve the message and name of native `Error` values;
- preserve known structured errors such as schema validation errors and their paths/codes;
- assign the fallback message to strings, objects, `null`, and other unknown thrown values rather than unsafe casting;
- retain the original value locally as an optional cause for developer logging;
- expose only safe structured-cloneable fields across workers.

Do not add `try/catch` merely to replace an error with `new Error(error.message)`, as that discards stack and type information. Catch only to add context, recover, contain an asynchronous boundary, or serialize.

## Console policy

After migration:

- reusable packages do not call `console.warn`, `console.error`, or `console.log` for expected product behavior;
- the app is the only browser layer that decides whether diagnostics are mirrored to developer tools;
- development-only UI component invariant warnings, such as malformed popover composition, may remain local temporarily but should use framework/dev guards and are not REPL diagnostics;
- server-side operational logging remains separate from music-authoring diagnostics;
- intentionally ignored best-effort browser promises must include a comment explaining why failure has no actionable consequence.

This specification does not require OAuth, database, AT Protocol, or SvelteKit action errors to use the audio-authoring diagnostic model. They should follow a separate server observability policy rather than being forced into a client REPL abstraction.

## Migration inventory and decisions

### Fluid

Migrate these warnings to evaluation-scoped author diagnostics:

- chop index wrapping in `packages/fluid/src/instruments/sampler-utils.ts`;
- random region clamping warnings in the same file;
- missing bank/sample warnings generated while deriving sampler source keys;
- future implicit MIDI CC contextual defaults.

Keep thrown authoring errors for invalid calls. Over time, replace generic `Error` with suitable built-in classes or a small Fluid authoring error carrying a code, but do not convert terminal misuse into warning diagnostics.

### AudioEngine and sampler runtime

Migrate these console warnings:

- failed preload in `packages/audio-engine/src/index.ts`;
- initial sampler buffer unavailable;
- variation not loaded;
- reverse buffer not prepared;
- bank/sample absent during runtime resolution;
- sample fetch or decode failure;
- invalid resolved region skipped.

Avoid duplicate reports across `prepare()`, `SampleBufferStore`, and `Sampler`. Resource loading should have one owner that knows the URL and cause. Sampler scheduling should report skipped playback only when it adds information beyond the load failure.

### Internal errors

- `RandomResolver` empty-bar failure should be prevented by canonical validation; reaching it afterward is `audio-engine/internal-error`.
- unsupported effect discriminators should be prevented by canonical validation and protected by exhaustive TypeScript handling; reaching the runtime fallback is an internal error.
- graph-generation and bar-scheduling exceptions should use the AudioEngine error boundary described in the signal-processing plan.

### Context package

`packages/context/src/index.ts` intentionally suppresses several `resume()`, `suspend()`, `play()`, and `close()` failures. Review each call:

- expected autoplay-policy failures should become state the caller can observe if they affect playback;
- cleanup-only close failures may remain ignored with a comment;
- blanket empty catches without documented semantics should be removed.

Do not emit repetitive diagnostics for every failed autoplay retry.

### Web app and worker

- replace the optional-field worker response with a discriminated union;
- normalize unknown thrown values safely;
- return diagnostics on both successful and failed evaluation;
- add warning/info rendering to the REPL log;
- wire the AudioEngine sink into the same workspace log;
- preserve separate MIDI control state;
- remove non-null assertion of a missing worker schema;
- define behavior for worker `error` and `messageerror` events and reject all pending evaluations if the worker fails;
- terminate/recreate a failed worker rather than leaving pending promises unresolved.

### Server code

Server `console.error`, SvelteKit `error()`, `fail()`, and network exceptions are outside the initial migration. They should not be routed to the REPL unless directly associated with sketch evaluation or playback. A later server-observability spec should define request correlation, safe client messages, and private logs.

## Behavioral requirements

### Authoring and evaluation

- one evaluation returns zero or more diagnostics whether it succeeds or fails;
- a terminal authoring error prevents schema installation;
- warnings do not prevent schema generation or playback;
- evaluation diagnostics are scoped to the schema produced by that evaluation;
- stale worker responses do not append diagnostics to a newer run unless the UI intentionally retains historical runs;
- rerunning a sketch starts a fresh deduplication epoch.

### Engine update and commit

- synchronous invalid updates throw structured validation errors and preserve previous pending and active state;
- failed asynchronous commits preserve active playback and emit one error diagnostic;
- no clock callback exception escapes through the clock scheduler;
- partial bar failures produce at most one scheduling diagnostic plus specific independently useful resource diagnostics;
- reporting failure cannot itself interrupt playback;
- late diagnostics from destroyed engines are ignored.

### Resource loading

- HTTP non-success responses are failures before attempting `arrayBuffer()`;
- fetch and decode failures are distinguishable in diagnostic context if remediation differs;
- URLs may be included in context only when safe for display; credentials and secret query parameters must not be exposed;
- one failed resource does not prevent unrelated samples from preparing;
- a failed preload does not also generate one warning per skipped note indefinitely;
- successful readiness clears temporary-not-ready deduplication state.

### MIDI

- access failure appears once in the relevant UI surfaces;
- unsupported/denied states remain represented by status, not repeated diagnostics;
- MIDI send failures that are already returned as structured results are not automatically promoted to author errors unless playback semantics are materially degraded;
- disconnect and destroy do not emit errors for expected cleanup.

## Testing strategy

### Diagnostics package

- diagnostic values are structured-cloneable;
- collector preserves emission order;
- evaluation deduplication keys are deterministic;
- context serialization is stable and bounded;
- a throwing sink is safely containable by the caller-facing helper.

### Fluid and worker

- warnings are collected without touching `console.warn`;
- repeated equivalent authoring warnings deduplicate within one evaluation;
- distinct schema paths remain distinct;
- successful worker responses include schema and diagnostics;
- failed responses include normalized error data and diagnostics emitted before failure;
- strings, objects, and `null` thrown by evaluated code are normalized safely;
- worker failure rejects every pending evaluation and allows recovery.

### AudioEngine

- each migrated warning reaches the sink with stable code and context;
- no migrated path calls `console.warn` directly;
- prepare failures are deduplicated by resource;
- temporary scheduling warnings reset when readiness changes;
- generation replacement resets appropriate deduplication state;
- commit, bar, prebar, and stop errors are contained and reported;
- a throwing diagnostic sink cannot halt scheduler callbacks;
- destroy suppresses late asynchronous diagnostics;
- internal invariant failures are developer-audience errors.

### Application

- info, warning, error, and success entries render with distinct accessible roles/styles;
- evaluation and engine diagnostics enter one ordered workspace log;
- stale run diagnostics are associated with the correct run;
- `lastError`, MIDI error state, and log entries do not accidentally overwrite one another;
- developer diagnostics may mirror to console once in development without duplicate library output.

## Implementation phases

### Phase 1: Contracts and application plumbing

1. Add `@web-audio/diagnostics` with plain types, collector, deduplication helpers, and tests.
2. Replace the worker response with a discriminated union.
3. Add safe unknown-error normalization.
4. Extend workspace log types and REPL rendering for structured diagnostics.
5. Add worker fatal-error handling and pending-request cleanup.

### Phase 2: Fluid authoring diagnostics

1. Add an optional sink to Drome construction.
2. Migrate sampler authoring warnings.
3. Add evaluation-scoped deduplication.
4. Add the deferred implicit MIDI CC default diagnostic.
5. Keep terminal builder misuse as exceptions.

### Phase 3: AudioEngine runtime channel

1. Add optional AudioEngine diagnostic sink injection.
2. Add phase-aware clock callback error boundaries.
3. Migrate preload and sample-buffer warnings.
4. Add generation/resource deduplication lifecycle.
5. Wire AudioPlayer's sink into the workspace log.

This phase should align with graph-generation transactional work rather than creating two competing engine error boundaries.

### Phase 4: Internal invariants and cleanup

1. Complete canonical schema validation so malformed schemas fail before resolvers.
2. Reclassify remaining engine-only impossible states as internal errors.
3. Audit empty catches and floating promises in browser packages.
4. Remove obsolete package-level `console.*` calls.
5. Document the diagnostic code registry and package extension rules.

## Non-goals

- Capturing arbitrary user `console.log()` output from evaluated sketches.
- Replacing SvelteKit form errors or HTTP status handling.
- Defining production server logging, telemetry, or crash reporting.
- Guaranteeing user source line/column information before evaluator instrumentation exists.
- Turning all exceptions into result objects.
- Making warnings fatal.
- Persisting diagnostics in `DromeSchema`.
- Adding a process-global event bus.
- Exposing native error stacks or sensitive URLs through worker messages or the public UI.

## Completion criteria

This work is complete when:

- shared diagnostics are plain, stable, structured-cloneable values;
- Fluid evaluation and AudioEngine runtime diagnostics reach the REPL through explicit sinks;
- worker responses preserve diagnostics on both success and failure;
- expected author/runtime warnings no longer rely on package-level `console.warn`;
- synchronous failed operations still throw or reject appropriately;
- asynchronous clock-driven failures are contained, transactional, and observable;
- repeated runtime conditions follow bounded generation-aware deduplication policies;
- schema paths are used consistently where source locations are unavailable;
- internal invariant failures are classified for developers rather than shown as misleading author guidance;
- worker crashes and unknown thrown values cannot strand pending evaluations;
- package and workspace format, check, lint, test, and build commands pass.
