# Program IR Interchange Spike PRD

## Status

Proposed experimental spike. This PRD does not finalize the production Program IR, its Lexicon NSIDs, or a migration of `live.drome.sketch`.

## Context

Drome currently publishes Fluid source code in `live.drome.sketch`. The web app evaluates that source in a worker, Fluid resolves it into `DromeSchema`, and AudioEngine consumes the schema:

```text
Fluid source → DromeSchema → AudioEngine
```

`DromeSchema` is an execution schema. It deliberately resolves defaults and lowers authoring concepts such as roots, scales, pattern transformations, sampler fit, and chopping into concrete engine instructions. That is appropriate for AudioEngine, but it is not an ideal portable composition format:

- third-party authoring interfaces would need to publish Fluid JavaScript;
- direct network playback requires evaluating untrusted source;
- reconstructing useful Fluid source from `DromeSchema` loses authoring concepts that have already been lowered;
- the runtime schema is unversioned and has no runtime validator.

The proposed direction introduces a semantic, versioned Program IR between authoring interfaces and `DromeSchema`:

```text
Fluid source ─────┐
Visual editor ────┼→ Program IR V1 ─→ compileProgram() ─→ DromeSchema ─→ AudioEngine
Third-party UI ───┘        ↕
                         AT Proto
                            │
                            └→ programToFluid() → canonical Fluid source
```

The Program IR becomes the portable composition format. Fluid code is one authoring projection of it, and `DromeSchema` remains the fully resolved execution plan.

Before committing to a production IR or changing the published Lexicon, build a small interactive spike that allows moving between Fluid source, Program IR, and `DromeSchema`. The spike should make the lossiness, readability, variable behavior, AT-compatible encoding, and lowering semantics visible in practice.

## Goals

- Test whether a semantic Program IR is understandable and pleasant to edit directly.
- Test whether canonical Fluid generated from the IR remains useful for continued code-based authoring.
- Preserve meaningful Fluid concepts that are currently lost in `DromeSchema`, including roots, scales, pattern sources, ordered transformations, automations, and effect structure.
- Represent reusable authoring variables as named IR bindings and references.
- Prototype a structural AT-compatible representation instead of storing the complete IR as stringified JSON.
- Encode general numeric values as canonical decimal strings so the representation remains valid under the AT Protocol data model, which does not permit floats.
- Lower Program IR into the current `DromeSchema` without changing AudioEngine.
- Compare the schema produced from original Fluid source with the schema produced from its translated IR.
- Play both paths so behavioral differences can be heard, not only inspected.
- Learn enough from the spike to design the production Program IR and Lexicon deliberately.

## Non-goals

- Do not change `live.drome.sketch` in this spike.
- Do not publish records to AT Protocol.
- Do not migrate existing sketches or database rows.
- Do not support all JavaScript syntax.
- Do not preserve comments, formatting, loops, branches, helper functions, or arbitrary JavaScript control flow.
- Do not preserve mutable JavaScript execution state.
- Do not replace `DromeSchema` or modify AudioEngine's schema contract.
- Do not implement a production-ready general JavaScript compiler.
- Do not finalize Program IR NSIDs or publish a Lexicon.
- Do not optimize large sample-bank payloads in the first slice.
- Do not promise that spike APIs or file locations are stable.

## Terminology

### Fluid source

JavaScript written in the Drome REPL using the fluent `d.*` API.

### Program IR

A semantic, versioned, structurally serializable representation of a composition. It preserves domain-level authoring concepts and is intended to become the portable network contract.

### AT wire representation

The AT-compatible representation of Program IR. In the spike, Program IR should itself be designed to satisfy AT data-model constraints where practical, including numeric-string encoding and explicit union discriminators.

### DromeSchema

The existing fully resolved execution schema in `@web-audio/schema`. AudioEngine consumes this representation directly.

### Binding

A named, immutable Program IR value that can be referenced from multiple locations. Bindings are the IR equivalent of retained authoring variables.

## Architectural principles

### Program IR is semantic, not a JavaScript AST

The IR should preserve Fluid concepts, not arbitrary JavaScript implementation details. For example:

```js
const notes = [0, 2, 4, 6];

d.synth("saw").root("c4").scale("minor").notes(notes).euclid(5, 8).push();
```

The IR should retain the named `notes` binding, root, scale, base pattern, and Euclidean transform. It does not need to retain whitespace or recreate the exact JavaScript statement layout.

A loop that creates several instruments may become several instrument nodes. A conditional may become only the branch that executed. This is acceptable for the spike.

### Program IR and DromeSchema have different responsibilities

Program IR preserves authoring intent. `DromeSchema` resolves that intent for deterministic execution. AudioEngine must remain unaware of Program IR concepts such as variable names, scale aliases, or pattern transformation syntax.

### Program versions have immutable semantics

Program IR must include a version from the beginning:

```json
{
  "version": 1,
  "bindings": [],
  "instruments": []
}
```

If omitted IR fields rely on defaults, the V1 compiler's interpretation of those defaults must not change later. Changed semantics require a new version or an explicit migration. Otherwise an old network composition could sound different under a newer compiler.

### Every valid production IR should eventually have a Fluid projection

The production design should either:

- constrain Program IR to concepts expressible by Fluid; or
- provide a low-level Fluid escape hatch for valid IR constructs that have no ergonomic fluent syntax.

The spike can report unsupported constructs, but it should reveal where this invariant becomes difficult.

## Variables and bindings

### Motivation

Variables are an important authoring mechanism because they:

- give musical concepts meaningful names;
- let one edit affect several references;
- preserve shared objects such as LFOs, envelopes, filters, and random patterns;
- map naturally to controls in graphical interfaces;
- make generated Fluid source easier to understand.

### Runtime limitation

Ordinary JavaScript erases scalar variable provenance when it calls Fluid:

```js
const cutoff = 800;
d.lpf(cutoff);
```

At runtime, `d.lpf()` receives only `800`; it cannot know that the value came from a variable named `cutoff`. Variable preservation therefore requires source analysis or an explicit variable API. It cannot be recovered from current Fluid builder state alone.

### V1 spike scope

The spike should use constrained source analysis to preserve:

- top-level immutable `const` declarations;
- string, boolean, and finite-number literals;
- arrays and object literals composed from supported values;
- direct identifier references;
- variables holding supported Fluid objects such as random patterns, LFOs, envelopes, filters, or gain effects;
- references to those variables from supported fluent calls.

The spike may reject or resolve to literals:

- `let` and reassignment;
- closures and function parameters;
- values produced by arbitrary function calls;
- destructuring;
- computed property access;
- control-flow-dependent assignments;
- complex JavaScript expressions.

Simple unary, binary, or template expressions are optional follow-up scope. If omitted, the UI must report that variable provenance was flattened rather than silently claiming a lossless translation.

### Binding shape

Bindings need a stable ID distinct from the display/source name. This allows safe renaming and avoids source-name collisions.

Illustrative shape:

```json
{
  "bindings": [
    {
      "id": "cutoff-1",
      "name": "cutoff",
      "value": {
        "$type": "live.drome.program#numberValue",
        "value": "800"
      }
    },
    {
      "id": "melody-1",
      "name": "melody",
      "value": {
        "$type": "live.drome.program#listValue",
        "items": [
          { "$type": "live.drome.program#numberValue", "value": "0" },
          { "$type": "live.drome.program#numberValue", "value": "2" },
          { "$type": "live.drome.program#numberValue", "value": "4" },
          { "$type": "live.drome.program#numberValue", "value": "6" }
        ]
      }
    }
  ]
}
```

A use site references the binding by ID:

```json
{
  "$type": "live.drome.program#reference",
  "binding": "melody-1"
}
```

The exact `$type` values are provisional until the production Lexicon is designed.

### Binding behavior

- Binding IDs must be unique within a program.
- Binding names should preserve valid author names when known.
- The source printer must sanitize invalid names and resolve collisions deterministically.
- Bindings must be emitted in dependency order.
- Circular bindings must fail validation.
- Editing a binding value in the IR must affect every reference after recompilation.
- Shared builder objects must remain shared. A referenced LFO should compile into one logical shared modulation source rather than independent copies.
- The spike only needs to retain author-declared bindings that contribute to the composition. Preserving unused JavaScript declarations is not required.

## Structural AT-compatible representation

### Rationale

Storing Program IR as a nested structural object makes records:

- inspectable without parsing an opaque inner JSON string;
- more useful to third-party applications;
- partially enforceable through Lexicon schemas;
- easier to evolve through explicit object and union variants.

The theme-record example motivating this PRD demonstrates the desired quality: semantic values remain visible in their natural object hierarchy, even when domain values such as CSS sizes are strings.

### Numeric values

AT Protocol does not allow floats in records. Program IR should encode general numeric values as canonical decimal strings:

```json
{
  "bpm": "127",
  "gain": "0.75",
  "phase": "0.25",
  "frequency": "800"
}
```

Encoding should use the canonical JavaScript string representation for finite numbers:

```ts
String(value);
```

Decoding must:

1. validate the accepted numeric grammar;
2. convert with `Number(value)`;
3. reject non-finite results;
4. reject unsupported values such as `NaN` and infinities;
5. define whether negative zero is canonicalized to `0`.

The spike should use a single shared numeric codec. Call sites must not parse numbers ad hoc.

### Integers

Values that are inherently structural or protocol-level integers may remain AT integers, including:

- Program IR version;
- MIDI channel and CC number;
- random seeds;
- step, bar, and slice counts;
- indexes and ordering fields.

Values modeled as general musical numbers should use numeric strings even when a particular example happens to be integral. This includes notes, BPM, gain, detune, frequencies, ranges, offsets, durations, and sample boundaries.

### Dynamic maps

The current runtime schema uses arbitrary maps such as:

```ts
Record<string, BankSchema>;
Record<string, NormalizedSampleSchema>;
```

Lexicon object properties are declared rather than modeled as typed arbitrary maps. A structural Program IR should represent dynamic maps as entry arrays:

```json
{
  "banks": [
    {
      "name": "acoustic",
      "samples": [
        {
          "name": "piano",
          "sources": []
        }
      ]
    }
  ]
}
```

The spike's first slice may omit banks, but the sampler follow-up must test this representation.

### Union variants

Program variants such as synth/sampler, static/random, literal/reference, and envelope/LFO should use explicit discriminators compatible with Lexicon union conventions. The prototype may use provisional `$type` strings, but should not rely on TypeScript-only discriminated unions that cannot later be represented in Lexicon.

### Runtime validation remains necessary

Lexicon validation alone cannot enforce every semantic rule, including:

- decimal-string grammar;
- finite decoded values;
- binding reference integrity;
- cycle detection;
- cross-field constraints;
- supported Program IR version;
- resource and collection limits.

The Program IR implementation must therefore have a runtime validator independently of generated Lexicon types.

## Spike user experience

### Route

Add an unlinked experimental route in the existing web app:

```text
/lab/program-ir
```

Using a route rather than a new application keeps the spike small and allows reuse of the existing editor and audio infrastructure. It must not appear in production navigation.

### Layout

The route should present three primary panes:

```text
┌──────────────────┬──────────────────┬──────────────────┐
│ Fluid source     │ Program IR       │ DromeSchema      │
│ editable         │ editable JSON    │ read-only        │
└──────────────────┴──────────────────┴──────────────────┘

[Code → IR] [IR → Code] [Compare] [Play Code] [Play IR]
```

On narrow screens, panes may become tabs or stack vertically.

### Conversion controls

Conversions should be explicit rather than continuously synchronized:

- **Code → IR** parses supported Fluid source into Program IR.
- **IR → Code** validates Program IR and prints canonical Fluid source.
- **Compare** lowers both paths and reports schema equivalence.
- **Play Code** uses the existing code evaluation path.
- **Play IR** validates and compiles Program IR, then feeds the resulting `DromeSchema` directly to AudioEngine.

Explicit controls make lossy or unsupported transitions visible and prevent one pane from unexpectedly overwriting another while the user is experimenting.

### Diagnostics

The route must visibly report:

- unsupported JavaScript syntax;
- Program IR JSON parse failures;
- Program IR validation failures;
- unresolved or circular binding references;
- lowering failures;
- source-generation failures;
- schema comparison mismatches;
- playback failures.

Errors should identify the relevant source range or IR path where practical.

### Schema comparison

The comparison result should show one of:

- `Equivalent`;
- `Equivalent after normalization`;
- `Different`, with a readable diff or first differing path;
- `Unable to compare`, with the relevant error.

Comparison must normalize nondeterministic LFO IDs while preserving their aliasing graph. Two independent LFOs must not compare equal to one shared LFO merely because their values match. Object-key ordering should not affect comparison.

## Initial Fluid subset

The first slice should support enough functionality to test the core architecture without becoming a full language implementation.

### Required

- top-level supported `const` bindings;
- `d.bpm()`;
- `d.synth()` and waveform aliases;
- `.root()`;
- `.scale()`;
- `.notes()` with scalar notes, arrays, chords, and rests;
- `.gain()` with static values;
- `.adsr()`;
- `.euclid()`;
- `.fast()`;
- `.reverse()`;
- `d.env()`;
- `d.lfo()` with speed, waveform, phase/offset, normalization, and inversion;
- `d.filter()` and the LPF/HPF/BPF aliases;
- `d.gain()` effects;
- `.fx()` with ordered effects;
- `.mute()`;
- `.push()`;
- named variables containing supported literals and builder objects;
- shared LFO/envelope/effect references.

### Optional if inexpensive

- `.hex()`;
- `.xox()`;
- `.sequence()`;
- `.slow()`;
- `.stretch()`;
- static MIDI output and MIDI CC descriptors;
- random patterns and their basic configuration.

### Deferred to the sampler follow-up

- `d.loadSamples()`;
- `d.sample()`;
- custom and built-in banks;
- variation;
- fit;
- start/end;
- chopping;
- looping and clip mode;
- sprite and multisample definitions.

### Unsupported source behavior

Unsupported syntax must fail descriptively in **Code → IR**. It must not silently emit incomplete IR. The existing REPL may continue evaluating that source normally; the limitation applies only to the experimental translation path.

## Starter fixture

The lab should open with a fixture that exercises scalar, list, and builder-object variables:

```js
const root = "c4";
const cutoff = 800;
const melody = [0, 2, 4, 6];
const wobble = d.lfo(cutoff, 2400).speed(0.5).norm();

d.bpm(127);

d.synth("saw")
  .root(root)
  .scale("minor")
  .notes(melody)
  .euclid(5, 8)
  .fx(d.lpf(wobble))
  .push();
```

Expected canonical source does not need to preserve formatting, quote style, aliases, or line breaks. It should preserve meaningful binding names and equivalent Fluid semantics.

## Prototype implementation boundaries

### Location

Keep the initial implementation explicitly experimental under the web app, for example:

```text
apps/web/src/lib/program-ir/
apps/web/src/routes/lab/program-ir/
```

This avoids prematurely establishing a production package dependency direction. After the spike, reusable parts can move to a dedicated `@web-audio/program` package if the architecture is accepted.

### Suggested prototype modules

```text
program-ir/
  types.ts          — Program IR prototype types
  numeric.ts        — canonical numeric-string codec
  validate.ts       — runtime validation and reference checks
  parse-fluid.ts    — constrained Fluid source analysis
  print-fluid.ts    — canonical Fluid source printer
  compile.ts        — Program IR → current DromeSchema adapter
  canonicalize.ts   — comparison normalization
  compare.ts        — equivalence and diff reporting
  fixtures.ts       — representative source/IR fixtures
```

### Source parser

Use a real JavaScript parser rather than regular expressions. Parser selection is an implementation detail, but any new dependency must be installed with the package manager rather than manually added to `package.json`.

The parser should operate on a documented subset and return structured diagnostics for unsupported syntax.

### Prototype lowering

The spike may lower Program IR by invoking existing Fluid builders internally. It does not need to extract all current `getSchema()` logic into a production compiler yet.

This adapter is intentionally temporary. A production implementation should establish a clean dependency graph where Fluid emits Program IR and the Program compiler lowers it without a circular `Fluid ↔ Program` dependency.

### Direct schema playback

Expose or prototype an `AudioPlayer.playSchema(schema)` path so IR playback does not serialize generated source and send it back through `new Function`. This validates the intended production security and data flow.

## Conversion behavior

### Code to IR

1. Parse source into an AST.
2. Collect supported top-level `const` bindings.
3. Interpret supported `d.*` fluent expressions and references.
4. Preserve ordered instrument and effect declarations.
5. Preserve base patterns and ordered transformations rather than lowering them.
6. Encode musical numeric values as canonical numeric strings.
7. Validate the resulting Program IR.
8. Display the structural IR as formatted JSON.

### IR to code

1. Parse the JSON pane.
2. Validate Program IR and supported version.
3. Topologically sort bindings.
4. Assign deterministic valid JavaScript names.
5. Print binding declarations.
6. Print canonical Drome declarations and fluent chains.
7. Format the generated source consistently.
8. Replace the source pane only after successful generation.

### IR to DromeSchema

1. Validate Program IR.
2. Resolve bindings and reject cycles.
3. Decode numeric strings through the shared codec.
4. Apply V1 defaults.
5. Lower pattern sources and ordered transformations using existing pattern behavior.
6. Materialize instruments, automations, effects, and defaults into `DromeSchema`.
7. Validate enough runtime invariants to avoid feeding malformed data to AudioEngine.

## Test strategy

### Unit tests

Cover:

- canonical number encoding and decoding;
- malformed, non-finite, and non-canonical numeric strings;
- binding name preservation;
- reference resolution;
- shared builder references;
- circular and missing references;
- source parser supported and unsupported syntax;
- canonical source generation;
- deterministic source generation;
- Program IR validation;
- comparison normalization for LFO IDs and key ordering;
- pattern transform ordering.

### Round-trip tests

Required invariants:

```text
Fluid source → Program IR → canonical Fluid source → Program IR
```

should preserve semantic Program IR for the supported subset.

```text
Fluid source → current DromeSchema
Fluid source → Program IR → compiled DromeSchema
```

should produce behaviorally equivalent execution schemas.

```text
Program IR JSON → validate → compile → AudioEngine
```

should not execute generated JavaScript.

### Fixture tests

Include fixtures for:

- no variables;
- scalar variables;
- array variables;
- shared LFOs;
- envelopes reused in multiple locations;
- ordered effects;
- chords and rests;
- root/scale plus transformations;
- unsupported loop or conditional with a clear diagnostic;
- malformed IR references;
- numeric-string edge cases.

The sampler follow-up should use representative examples from `notes/snippets.js`.

## Delivery slices

### Slice 1: Structural IR and one-way lowering

- Add the experimental route and three-pane layout.
- Define the prototype Program IR for BPM, bindings, synths, static notes, gain, and push.
- Implement numeric-string encoding/decoding and runtime validation.
- Implement Program IR → `DromeSchema`.
- Add direct schema playback.
- Allow editing IR and playing the result.

This slice tests the structural representation before source parsing becomes a distraction.

### Slice 2: Fluid source translation and variables

- Add AST-based parsing for the required Fluid subset.
- Preserve top-level `const` bindings and references.
- Implement canonical Program IR → Fluid source generation.
- Add Code → IR and IR → Code controls.
- Add schema equivalence reporting and round-trip tests.

### Slice 3: Automations, effects, and pattern transformations

- Add envelopes, LFOs, shared references, filters, gain effects, and ordered effect chains.
- Preserve base patterns and ordered transforms.
- Expand comparison and fixture coverage.

### Slice 4: Sampler stress test

Only proceed after reviewing the first three slices.

- Add a minimal sampler, bank-entry arrays, variation, fit, and chop representation.
- Measure structural IR and eventual CBOR/JSON payload sizes.
- Test file and sprite sample boundaries encoded as numeric strings.
- Evaluate built-in bank references versus fully embedded bank data.

### Slice 5: Production design recommendation

Produce a short follow-up decision document covering:

- whether Program IR should become canonical;
- final package boundaries;
- final variable and expression model;
- final structural Lexicon shape and NSIDs;
- inline versus blob-backed size policy;
- Program V1 defaults and evolution rules;
- migration plan from source-publishing records;
- which spike code should be retained, rewritten, or discarded.

## Acceptance criteria

### Core spike

- `/lab/program-ir` provides editable Fluid source and Program IR panes plus a read-only `DromeSchema` pane.
- The starter fixture translates to structural Program IR.
- General musical numeric values appear as strings in Program IR.
- Structural integers remain integers according to the documented policy.
- Program IR can be edited, validated, lowered, and played without evaluating generated JavaScript.
- The current Fluid source path and Program IR path can be played independently.
- The UI reports whether their lowered schemas are behaviorally equivalent.

### Variables

- A supported top-level scalar `const` is represented as a named binding.
- A supported array `const` is represented as a named binding.
- A supported LFO, envelope, or effect `const` is represented as a named binding.
- Multiple references point to the same binding ID.
- Editing one binding changes every compiled reference.
- IR → Fluid source preserves usable binding names.
- Missing and circular references fail validation descriptively.

### Translation

- Supported source never silently drops instruments, effects, or transforms.
- Unsupported JavaScript produces an explicit diagnostic.
- Generated Fluid source parses and evaluates successfully.
- Source formatting differences are not treated as semantic differences.
- Shared LFO identity is preserved through comparison and reconstruction.

### AT compatibility exploration

- The prototype IR contains no floating-point AT data values.
- Numeric strings decode through one shared validated codec.
- Union variants use explicit discriminators suitable for a future Lexicon.
- The sampler follow-up represents dynamic maps as entry arrays rather than relying on typed arbitrary object keys.
- The final spike report identifies any remaining values that cannot be expressed cleanly in Lexicon.

## Risks

### Source analysis expands into a JavaScript compiler

Preserving every variable and expression would require modeling much of JavaScript. Mitigate this by enforcing a narrow documented subset and treating Program IR as semantic composition data rather than a complete JavaScript AST.

### IR becomes too verbose

`$type` discriminators, references, entry arrays, and numeric strings add payload and visual noise. The lab must make this visible. The sampler slice must measure representative payloads before the Lexicon is finalized.

### Authoring semantics and execution semantics drift

A second compiler path could diverge from current Fluid behavior. Round-trip schema comparison and shared pattern utilities are required. Production implementation should consolidate lowering rather than maintain duplicate behavior indefinitely.

### Defaults change old compositions

A semantic IR may omit values currently materialized in `DromeSchema`. Program version semantics and defaults must be immutable or explicitly migrated.

### Third-party IR exceeds Fluid's expressive surface

A visual editor may create valid Program IR that canonical Fluid cannot represent ergonomically. The production design must either constrain the IR or provide a low-level source escape hatch.

### Structural Lexicon limitations emerge late

Dynamic maps, unions, nested references, and record size may make the structural representation awkward. The prototype should follow Lexicon-compatible conventions early, and the sampler slice must test the hardest data shapes before publication.

## Open questions to resolve through the spike

- Is preserving top-level `const` variables sufficient, or are expression nodes necessary for useful authoring?
- Should bindings be allowed to contain all IR nodes or only reusable value/automation nodes?
- Should author-declared but unused bindings be retained?
- How much pattern transformation history should be preserved versus canonicalized?
- Should aliases such as `saw` versus `sawtooth` be preserved or normalized?
- Should Program IR contain explicit defaults or rely on immutable versioned compiler defaults?
- Is `$type` verbosity acceptable when viewing and editing the IR directly?
- Which numeric values should remain structural integers versus numeric strings?
- Can built-in banks be represented by immutable references without sacrificing reproducibility?
- At what payload size should Program IR move from inline record data to a blob-backed variant?
- Should production Fluid source evaluation combine runtime builder execution with AST metadata, or move toward a dedicated source-to-IR compiler?
- What is the clean production package dependency graph between Fluid, Program IR, Patterns, Schema, and AudioEngine?

## Expected outcome

The spike is successful even if it demonstrates that the first IR shape is wrong. Its deliverable is evidence about:

- whether semantic IR improves interoperability;
- whether retained bindings materially improve authoring;
- whether structural numeric-string encoding is practical;
- whether canonical Fluid reconstruction feels natural;
- where source translation becomes too complex;
- and what production contract should sit between authoring tools and AudioEngine.

No production Lexicon should be published until these findings are reviewed.
