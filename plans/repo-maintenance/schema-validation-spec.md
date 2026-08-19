# Schema Validation Consolidation

## Context

`@web-audio/schema` defines the canonical serialized representation exchanged between schema producers such as Fluid and consumers such as AudioEngine. Signal-graph work introduces the first explicit runtime validator in that package through `packages/schema/src/validate-signal-graph.ts`.

That placement is architecturally useful beyond the signal graph. Several packages currently validate parts of schema-shaped data locally, while AudioEngine assumes many other schema invariants without validating them at its untyped runtime boundary. This creates inconsistent errors, allows direct schemas to bypass Fluid-only checks, and spreads knowledge of the canonical representation across producer and consumer packages.

The desired direction is:

- `@web-audio/schema` is authoritative for validating canonical serialized schemas;
- producer packages retain authoring-input normalization and immediate API-usage validation;
- consumer packages retain validation of runtime state and subsystem-specific operational constraints;
- direct schemas receive the same canonical validation as schemas emitted by Fluid;
- malformed schemas fail with deterministic, path-aware validation errors rather than incidental traversal or numeric errors.

This document records consolidation opportunities. It is intentionally a maintenance specification rather than an implementation plan and may be combined with other repository cleanup work before scheduling.

## Boundary definition

### Validation that belongs in `@web-audio/schema`

Validation belongs in the schema package when it describes an invariant of the canonical serialized representation, regardless of which package produced or consumes it. Examples include:

- discriminated-union variants and their required fields;
- record, array, primitive, and nullability shapes;
- finite numeric values and serialized numeric ranges;
- cross-field invariants within one schema object;
- cross-reference integrity between canonical schema objects;
- constraints needed to traverse or execute a direct schema safely.

### Validation that should remain local

Validation should remain in the owning package when it describes authoring syntax, fluent builder state, runtime state, or a subsystem API rather than the canonical schema. This includes:

- Fluid overload and tuple detection in `packages/fluid/src/utils/validate.ts`;
- flexible `loadSamples()` authoring-shape guards and normalization;
- builder normalization such as trimming bus names or resolving aliases;
- invalid fluent-method combinations such as `duration()` with `chop()`;
- user-facing aliases such as sampler directions `"for"`, `"rev"`, and `"alt"`;
- scheduler configuration invariants such as the MIDI dispatch horizon;
- runtime event rejection in `MidiOutputScheduler`;
- validation at the public API boundary of `@web-audio/midi`.

Small validation logic need not be shared merely to avoid duplication. For example, Fluid and MIDI may both validate a channel argument immediately while schema separately validates a serialized MIDI object.

## Consolidation opportunities

### 1. Parameter and pattern schemas

**Relevant code:**

- `packages/audio-engine/src/resolvers/random-resolver.ts`
- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/patterns/src/random-cycle.ts`

AudioEngine assumes parameter-schema invariants that direct `DromeSchema` callers can bypass. Malformed values can lead to modulo-by-zero, undefined indexing, undefined segment access, invalid numeric output, or late generic errors.

Shared validation should cover at least:

- valid `static` and `random` discriminators;
- non-empty static cycles where required by runtime resolution;
- valid bar arrays and the policy for empty bars;
- finite static `value`, `offset`, and `duration` values;
- valid integer `stepIndex` values;
- non-empty random `segments`;
- finite segment seeds;
- valid positive integer segment lengths when supplied;
- a valid, resolvable random grid;
- supported random `dataType` and `algorithm` values;
- finite range endpoints and any ordering policy;
- `chance` in `[0, 1]` and restricted to binary random schemas;
- valid finite positive quantization values;
- a non-empty, finite `valueMap` when supplied.

Suggested internal validators:

```ts
validateParameterSchema(value, path);
validateStaticSchema(value, path);
validateRandomSchema(value, path);
```

This is the highest-value opportunity because parameter schemas occur throughout instruments, effects, automations, sampler regions, and random scheduling.

### 2. Full effect and automation schemas

**Relevant code:**

- `packages/schema/src/validate-signal-graph.ts`
- Fluid effect and automation builders
- AudioEngine parameter and effect resolution

The signal-graph validator currently checks only whether effect discriminators are `filter` or `gain`. It does not validate the selected effect's required fields or recursively validate its parameter sources. A graph can therefore pass validation and fail later during effect construction.

Shared validation should cover:

- supported effect discriminators;
- valid filter types;
- required filter frequency, Q, detune, and gain fields;
- required gain-effect parameter fields;
- recursive `AudioParamSchema` validation;
- finite envelope minimum and valid envelope mode;
- valid envelope parameter fields;
- valid LFO ID, outputs, speed, waveform, phase, and boolean flags;
- valid MIDI CC parameter schemas.

Suggested internal validators:

```ts
validateEffectSchema(value, path);
validateAudioParamSchema(value, path);
validateEnvelopeSchema(value, path);
validateLfoSchema(value, path);
validateMidiCcSchema(value, path);
```

`validateSignalGraph()` should delegate effect validation instead of owning a shallow discriminator check.

### 3. Bank and sample variation schemas

**Relevant code:**

- `packages/fluid/src/utils/sample-utils.ts`
- `packages/audio-engine/src/instruments/sample-buffer-store.ts`
- `packages/audio-engine/src/instruments/sampler.ts`

Fluid performs structural checks while normalizing flexible `loadSamples()` inputs, but AudioEngine accepts canonical `BankSchema` objects directly. Canonical bank validation should not depend on the schema having passed through Fluid.

Shared validation should cover:

- `banks` and nested `samples` as non-null, non-array records;
- sample entries as normalized source-key records;
- valid source-key strings representing finite supported MIDI keys;
- sample variation arrays and whether empty variation arrays are permitted;
- `file` and `sprite` discriminators;
- non-empty string `src` values;
- finite sprite bounds satisfying `0 <= start < end <= 1`.

Suggested internal validators:

```ts
validateBankSchema(value, path);
validateSampleVariationSchema(value, path);
```

Fluid should retain `normalizeSampleBank()` and its guards because those validate flexible authoring formats rather than canonical `BankSchema`.

### 4. Sampler schema and regions

**Relevant code:**

- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.ts`

Fluid validates or normalizes several sampler constraints that direct AudioEngine callers can bypass. AudioEngine clamps or skips some invalid resolved regions, but malformed schema structure can still fail incidentally.

Shared validation should cover:

- required sampler strings such as bank and sample names;
- valid variation and notes parameter schemas;
- positive integer `fit.bars`;
- supported `clipMode` and `direction` values;
- non-empty finite `sourceKeys` with any required integer/range policy;
- valid static-region discriminators and fields;
- exactly one of static region `end` or `duration`;
- valid region parameter schemas;
- valid chop slice arrays;
- finite chop bounds satisfying `0 <= start < end <= 1`;
- valid chop sequence parameter schemas.

Suggested internal validator:

```ts
validateSamplerSchema(value, path);
validateRegionSchema(value, path);
```

Builder-state checks such as prohibiting `duration()` together with `chop()` should remain in Fluid. Schema should validate only the normalized result.

### 5. MIDI schemas embedded in `DromeSchema`

**Relevant code:**

- `packages/fluid/src/midi.ts`
- `packages/midi/src/inputs.ts`
- `packages/midi/src/outputs.ts`
- `packages/audio-engine/src/midi-output-scheduler.ts`

Repeated MIDI protocol checks exist across public API boundaries. That duplication is often appropriate, but canonical `MidiCcSchema` and `MidiOutSchema` objects still require shared schema validation.

Shared validation should cover:

- MIDI channel integers in `[1, 16]`;
- CC integers in `[0, 127]`;
- finite range endpoints and default values;
- supported range curves;
- positive endpoints for exponential ranges;
- the canonical policy for reversed range endpoints;
- default values within the effective range;
- optional device selectors as strings.

Suggested internal validators:

```ts
validateMidiCcSchema(value, path);
validateMidiOutSchema(value, path);
```

Fluid and `@web-audio/midi` should continue validating their own method arguments immediately rather than depending on a later schema-validation pass.

### 6. Instrument unions and common instrument fields

The signal-graph validator traverses each instrument but does not validate the instrument discriminator or most common fields.

Shared validation should cover:

- an instrument discriminator of `synthesizer` or `sampler`;
- boolean `muted`;
- valid gain envelope, detune parameter, and effects array;
- valid notes source and optional mask;
- synthesizer waveform and optional MIDI output;
- sampler-specific fields through the sampler validator;
- exhaustive handling when new instrument variants are added.

Suggested internal validators:

```ts
validateInstrumentSchema(value, path);
validateSynthesizerSchema(value, path);
validateNotesSchema(value, path);
```

## Proposed public architecture

Introduce a top-level runtime-boundary validator:

```ts
validateDromeSchema(schema: DromeSchema): void;
```

Although its TypeScript signature accepts `DromeSchema`, it should defensively treat its input as unknown internally so calls from untyped JavaScript fail structurally.

A possible internal composition is:

```text
validateDromeSchema
├── validateBpm
├── validateBanks
├── validateBuses
├── validateInstruments
│   ├── validateParameterSchema
│   ├── validateAudioParamSchema
│   ├── validateEffectSchema
│   ├── validateMidiSchema
│   └── validateRegionSchema
└── validateSignalGraphReferences
```

`validateSignalGraph()` may remain exported as a focused graph-fields validator, but AudioEngine should normally call `validateDromeSchema()` at its public update boundary. Fluid may call the same top-level validator after assembling its complete canonical schema.

The implementation should avoid turning schema validation into normalization. Validators must not trim, clamp, default, reorder, or mutate canonical schemas.

## Error model

The signal-graph work introduces `SignalGraphValidationError`. Broader validation would be more coherent with a general error such as:

```ts
class SchemaValidationError extends Error {
  readonly path: string;
  readonly code?: string;
}
```

Requirements for the error model:

- every malformed value fails with a schema-specific error rather than an incidental `TypeError`;
- errors identify the exact canonical path;
- traversal and first-error selection are deterministic;
- messages describe the violated invariant without relying on producer-specific terminology;
- Fluid and AudioEngine expose the same canonical invariant failures;
- graph-specific errors may extend the general error if preserving a focused API is useful.

## Runtime-boundary behavior

The intended AudioEngine boundary is:

1. validate enough structure on the caller value to fail safely;
2. clone the accepted plain-data value;
3. run full canonical validation on the owned snapshot;
4. replace pending state only after clone and validation succeed.

This preserves the signal-processing plan's transactional update behavior while expanding protection beyond graph fields.

Fluid should:

1. validate and normalize fluent authoring input at method boundaries where useful;
2. assemble the complete canonical schema;
3. call the shared top-level validator;
4. return the validated schema without relying on AudioEngine to repair it.

## Suggested implementation order

1. Parameter, static, and random schema validation.
2. Full effect and automation validation.
3. Bank and sample variation validation.
4. Sampler and region validation.
5. MIDI schema validation.
6. Remaining instrument-union and top-level fields.
7. Replace boundary-specific partial calls with `validateDromeSchema()`.

This ordering follows dependency depth: parameter validation is reused by effects, envelopes, notes, variation, regions, and random scheduling.

## Non-goals

- Replacing TypeScript schema interfaces with a third-party decoding framework solely for this cleanup.
- Moving Fluid authoring normalization into schema.
- Making schema depend on Fluid, AudioEngine, Patterns, or MIDI implementations.
- Sharing every small numeric helper across packages.
- Silently repairing old or malformed schemas.
- Changing existing musical semantics while introducing validation.
- Validating browser or Web Audio runtime objects as part of serialized schema validation.

## Completion criteria

This cleanup is complete when:

- `@web-audio/schema` provides one authoritative top-level validator for canonical `DromeSchema` values;
- nested schema unions are validated recursively and exhaustively;
- direct AudioEngine schemas cannot bypass canonical invariants enforced on Fluid output;
- malformed schema data fails with deterministic path-aware schema errors;
- validators do not mutate, normalize, or default their inputs;
- Fluid retains authoring-specific normalization and immediate API feedback;
- runtime packages retain operational and runtime-state validation;
- duplicated schema-invariant checks are removed from consumers where the shared boundary makes them redundant;
- focused tests cover malformed values at every nested schema boundary;
- package and workspace check, lint, format, test, and build commands pass.
