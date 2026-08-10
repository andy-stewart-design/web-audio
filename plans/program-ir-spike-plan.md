# Program IR Interchange Spike Implementation Plan

## Context

This plan implements [`program-ir-spike-prd.md`](program-ir-spike-prd.md) as tracer-bullet vertical slices. Each phase adds one inspectable path through structural Program IR, validation, lowering, source translation, schema comparison, playback, tests, and manual review.

The spike explores this architecture without changing the published sketch record or AudioEngine contract:

```text
Fluid source ─────┐
Visual editor ────┼→ Program IR V1 ─→ compileProgram() ─→ DromeSchema ─→ AudioEngine
Third-party UI ───┘        ↕
                         AT Proto
                            │
                            └→ programToFluid() → canonical Fluid source
```

The first tracer bullet is intentionally IR-first: manually editable structural IR lowers to a synth `DromeSchema` and plays without evaluating generated JavaScript. Source analysis, retained variables, canonical source generation, richer Fluid features, and sampler stress testing layer onto that proven path.

This is an experimental implementation. Keep prototype code isolated under `apps/web` until the final review establishes the production package dependency graph. Do not modify `live.drome.sketch`, publish a Program Lexicon, or migrate network/database data during this plan.

## Key design decisions

- Program IR is a semantic composition representation, not a complete JavaScript AST.
- `DromeSchema` remains the execution schema and AudioEngine remains unaware of Program IR.
- Program IR has a required integer `version` from the first prototype.
- V1 compiler defaults are treated as immutable semantics for comparison during the spike.
- General musical numeric values use canonical decimal strings; inherently structural/protocol integer fields remain AT integers.
- Numeric encoding and decoding go through one shared codec. No parser/compiler call site uses ad hoc `Number()`, `parseFloat()`, or string interpolation for domain numbers.
- Structural union variants use provisional `$type` discriminators shaped for eventual Lexicon unions.
- Dynamic maps are represented as entry arrays in the sampler slice.
- Retained source variables are top-level immutable `const` bindings with stable IDs and separate display/source names.
- The source translator supports a documented JavaScript subset and fails explicitly for unsupported syntax. It never silently drops a statement, instrument, effect, reference, or transform.
- Use a real JavaScript parser. Add it with a package-manager command rather than editing package manifests manually.
- Bindings are resolved through a validated dependency graph. Missing and circular references are errors.
- Shared builder bindings such as LFOs are memoized by binding ID during lowering so sharing is not accidentally duplicated.
- Canonical Fluid source is deterministic but does not preserve whitespace, quote style, comments, aliases, or exact statement layout.
- Schema comparison normalizes nondeterministic LFO IDs while preserving identity relationships; arrays remain ordered and object-key ordering is ignored.
- Program IR playback calls a direct schema playback path. It does not generate source and route it through `new Function`.
- The lab uses explicit conversion buttons rather than automatic two-way synchronization.
- The experimental route is unlinked and does not appear in application navigation.
- The sampler phase is gated on a review of the synth/variable spike. It is a stress test, not permission to finalize the network contract.

---

## Phase 1: Lab infrastructure and direct schema playback

Tracer bullet: the web app has an unlinked three-pane lab where source can still use the existing evaluator and a supplied `DromeSchema` can be played directly without source evaluation.

### Step 1.1 — Extend the shared editor for lab panes

**Files:** `packages/editor/package.json`, `packages/editor/src/index.ts`, `packages/editor/tests/index.test.ts`, `apps/web/src/components/code-editor/index.svelte`

Add JSON language support with the package manager:

```sh
pnpm --filter @web-audio/editor add @codemirror/lang-json
```

Extend `CreateCodeMirrorOptions` with the minimum reusable controls needed by the lab:

```ts
type EditorLanguage = "javascript" | "json";

interface CreateCodeMirrorOptions {
  parent: HTMLElement;
  doc?: string;
  language?: EditorLanguage;
  readOnly?: boolean;
  onChange?: (doc: string) => void;
  onRun?: (doc: string) => void;
  onStop?: () => void;
}
```

Requirements:

- default language remains JavaScript so existing REPL behavior does not change;
- JSON language uses `@codemirror/lang-json` rather than treating JSON as a JavaScript block;
- read-only mode uses CodeMirror state/editability extensions while preserving selection and scrolling;
- run/stop keybindings remain available only where callbacks are provided;
- expose a narrow way to replace the whole document after construction without reconstructing the editor;
- external document replacement must not invoke an infinite Svelte binding loop;
- external replacement should preserve focus and put the selection at a valid location;
- `CodeEditor` adds `language`, `readOnly`, and external-value synchronization while keeping existing defaults;
- the current REPL editor behavior and tests remain unchanged.

**Acceptance criteria:**

- [ ] `@web-audio/editor` creates JavaScript and JSON editor states with the requested language.
- [ ] Read-only editors cannot mutate content but remain selectable and scrollable.
- [ ] Replacing a mounted editor document updates CodeMirror and does not loop through `onChange`.
- [ ] Existing REPL run/stop shortcuts still work.
- [ ] Editor package build, check, lint, and tests pass.

### Step 1.2 — Separate source compilation from schema playback

**Files:** `apps/web/src/lib/globals/audio-player.svelte.ts`, `apps/web/src/lib/globals/audio-player.svelte.test.ts`

Refactor `AudioPlayer` so source evaluation and schema playback are explicit operations:

```ts
audio.compile(code: string): Promise<DromeSchema>;
audio.playSchema(schema: DromeSchema): Promise<LogEntry>;
audio.play(code: string): Promise<LogEntry>;
```

Requirements:

- `compile()` owns the existing evaluation-worker request/response path;
- `playSchema()` owns engine readiness, `engine.update(schema)`, `engine.prepare()`, and clock startup;
- `play()` composes `compile()` and `playSchema()` while preserving current log/error behavior;
- `playSchema()` does not post source to the evaluation worker;
- a malformed schema is expected to be rejected before this method in the Program IR path, but runtime playback failures still return an error `LogEntry` rather than producing an unhandled rejection;
- concurrent compile requests retain request IDs and resolve/reject independently;
- current MIDI ownership and playback state behavior remain unchanged.

**Acceptance criteria:**

- [ ] Existing `audio.play(code)` behavior is unchanged.
- [ ] `audio.compile(code)` returns the worker-produced `DromeSchema` without starting playback.
- [ ] `audio.playSchema(schema)` updates/prepares the engine without invoking the worker.
- [ ] Compile and direct-play errors become visible error log entries or rejected compile promises as documented.
- [ ] AudioPlayer tests cover source compilation, direct schema playback, and composition through `play()`.

### Step 1.3 — Add the unlinked lab route shell

**Files:** `apps/web/src/routes/lab/program-ir/+page.svelte`, `apps/web/src/lib/program-ir/fixtures.ts`, route/component tests as needed

Create `/lab/program-ir` with three panes:

- editable Fluid source using JavaScript mode;
- editable Program IR JSON using JSON mode;
- read-only `DromeSchema` JSON using JSON mode.

Add controls for:

- Code → IR;
- IR → Code;
- Compare;
- Play Code;
- Play IR;
- Stop.

At this step, translation controls may be disabled with an explicit “not implemented” label. `Play Code` must work through the existing path. The route should initialize from the PRD starter fixture.

Requirements:

- route is not linked from global navigation;
- each pane has a visible title and independent scroll area;
- controls remain visible while pane content scrolls;
- narrow layouts use tabs or a vertical stack without making any pane inaccessible;
- route owns local spike state and does not use the normal `SketchWorkspace` draft/publish flow;
- navigating away stops lab playback and releases route-local state;
- no AT session is required.

**Acceptance criteria:**

- [ ] `/lab/program-ir` renders without authentication.
- [ ] Starter Fluid source is editable and playable.
- [ ] Program IR and schema panes support large scrollable JSON documents.
- [ ] The route is absent from application navigation and publishing controls.
- [ ] Leaving the route stops active playback.

---

## Phase 2: Structural Program IR and one-way lowering

Tracer bullet: a manually edited, validated Program IR containing BPM, bindings, and one synth lowers to the current `DromeSchema` and plays directly.

### Step 2.1 — Define provisional Program IR V1 types

**Files:** `apps/web/src/lib/program-ir/types.ts`, `apps/web/src/lib/program-ir/index.ts`

Define a deliberately narrow first representation. Use provisional fully qualified `$type` strings so the JSON resembles future Lexicon union data, but centralize those constants because final NSIDs are not decided.

Core value nodes should cover:

```ts
type ScalarValue =
  | { $type: NumberValueType; value: string }
  | { $type: StringValueType; value: string }
  | { $type: BooleanValueType; value: boolean }
  | { $type: NullValueType };

type ValueNode =
  | ScalarValue
  | { $type: ListValueType; items: ValueNode[] }
  | { $type: ObjectValueType; entries: { key: string; value: ValueNode }[] }
  | { $type: ReferenceType; binding: string };
```

The first `ProgramV1` should include:

- `version: 1`;
- optional BPM value/reference;
- ordered bindings;
- ordered synth instruments;
- synth waveform;
- root and scale values/references;
- note source values/references;
- gain value/reference;
- optional ADSR values/references;
- ordered pattern transforms;
- mute;
- no sampler or bank fields yet.

Pattern transforms required in this phase:

- Euclidean mask with pulses, steps, and rotation;
- fast;
- reverse.

Use explicit transform variants and preserve transform array order.

Requirements:

- notes can represent scalars, patterns, chords, and rests;
- `null` is the canonical rest representation; array holes/`undefined` are normalized by source translation later;
- binding values may contain ordinary value nodes in this phase;
- IDs and names are separate strings;
- optional authoring values remain omitted in IR rather than materializing all Fluid defaults;
- no runtime `DromeSchema` types leak into Program IR public shapes.

**Acceptance criteria:**

- [ ] Program IR can represent the starter fixture’s BPM, root, cutoff, melody, and synth structure excluding deferred LFO/effect fields.
- [ ] Chords and rests are structurally distinguishable from patterns.
- [ ] Ordered transforms are represented without precomputing a static event cycle.
- [ ] TypeScript rejects raw numeric values in musical value nodes.
- [ ] Program IR types contain no runtime-only AudioNode or builder instances.

### Step 2.2 — Implement the canonical numeric-string codec

**Files:** `apps/web/src/lib/program-ir/numeric.ts`, `apps/web/src/lib/program-ir/numeric.test.ts`

Expose one codec:

```ts
encodeNumeric(value: number): string;
decodeNumeric(value: string): number;
isCanonicalNumeric(value: string): boolean;
```

Requirements:

- encoding accepts only finite numbers;
- encoding uses JavaScript’s shortest round-trippable representation;
- normalize negative zero to `"0"`;
- decoding first validates the complete accepted grammar, then converts;
- reject whitespace, empty strings, hexadecimal syntax, `NaN`, infinities, numeric separators, and trailing characters;
- choose and document whether exponent notation emitted by `String(number)` is accepted; the encoder and validator must agree;
- canonical validation rejects alternate spellings that decode to the same value, such as leading plus signs or unnecessary leading zeroes;
- decoded values must round-trip through `encodeNumeric()` to the original canonical string;
- structural integers do not use this codec.

**Acceptance criteria:**

- [ ] Integers, negative numbers, fractions, very small/large exponent values, and safe edge cases round-trip.
- [ ] `-0` encodes as `"0"`.
- [ ] Non-finite values and malformed numeric strings fail descriptively.
- [ ] No Program IR compiler/validator module parses domain numbers outside this codec.

### Step 2.3 — Add validation, diagnostics, and binding resolution

**Files:** `apps/web/src/lib/program-ir/validate.ts`, `apps/web/src/lib/program-ir/resolve.ts`, `apps/web/src/lib/program-ir/diagnostics.ts`, corresponding tests

Define structured diagnostics suitable for both source ranges and IR paths:

```ts
type ProgramDiagnostic = {
  stage:
    | "parse-source"
    | "parse-ir"
    | "validate"
    | "compile"
    | "print"
    | "compare";
  message: string;
  path?: string;
  from?: number;
  to?: number;
};
```

Validation must operate on `unknown`, not trust a TypeScript cast. It should return a typed result or throw one well-defined error containing diagnostics.

Validate:

- top-level object and exact supported version;
- known `$type` values;
- required fields and field primitive types;
- canonical numeric strings;
- structural integer ranges;
- unique binding IDs;
- non-empty binding names;
- every reference target exists;
- reference/value suitability for each destination;
- binding dependency cycles;
- bounded arrays/nesting for the spike;
- supported waveform/scale/transform values;
- positive transform constraints where Fluid requires them.

Implement a binding resolver that:

- topologically orders bindings;
- resolves references without mutating the source IR;
- memoizes resolved builder values by binding ID;
- reports a full reference path for missing/circular references;
- keeps author order as the tie-breaker among independent bindings.

Requirements:

- unexpected fields may be retained or rejected consistently for the spike; document the choice because production Lexicon evolution will revisit it;
- duplicate object-entry keys in `ObjectValue` must fail rather than silently overwrite;
- diagnostics identify JSON paths such as `bindings[2].value.items[1]`;
- avoid `as any`; narrow unknown values with real guards.

**Acceptance criteria:**

- [ ] Valid Program IR narrows from `unknown` to `ProgramV1`.
- [ ] Unsupported versions, unknown variants, raw floats, malformed numerics, duplicate IDs, missing references, and cycles fail with paths.
- [ ] Independent bindings retain deterministic author order.
- [ ] Editing one binding value changes all resolved use sites.
- [ ] Validator and resolver tests do not require Svelte or browser APIs.

### Step 2.4 — Compile the basic Program IR to DromeSchema

**Files:** `apps/web/src/lib/program-ir/compile.ts`, `apps/web/src/lib/program-ir/compile.test.ts`

Implement the prototype compiler by invoking existing Fluid builders internally. This is an adapter for the spike, not the final package architecture.

Compilation order:

1. validate Program IR;
2. resolve/topologically order bindings;
3. decode domain numeric strings;
4. construct one `Drome` host;
5. apply BPM;
6. construct synths in IR order;
7. apply root, scale, note source, ordered transforms, gain, ADSR, mute, and push;
8. call `d.getSchema()`;
9. return `DromeSchema`.

Requirements:

- resolve waveform and scale aliases through current Fluid behavior rather than duplicating their maps;
- preserve ordered pattern-transform semantics;
- do not materialize or mutate binding values globally when a destination needs a fresh value container;
- report compiler diagnostics with the originating IR path;
- no `new Function`, worker, or source generation in this path;
- Program IR compilation must be deterministic except for runtime identifiers such as LFO IDs introduced in later phases.

**Acceptance criteria:**

- [ ] A manual IR synth compiles into the same notes, waveform, BPM, gain, ADSR, mute, and transform behavior as equivalent Fluid source.
- [ ] Root and scale remain authoring fields in IR but lower to resolved MIDI note values in `DromeSchema`.
- [ ] Transform order changes the schema where current Fluid behavior is order-sensitive.
- [ ] Compiler failures retain useful IR paths.
- [ ] Compiler unit tests cover scalar notes, patterns, chords, rests, references, and defaults.

### Step 2.5 — Wire IR validation, lowering, and playback into the lab

**Files:** `apps/web/src/routes/lab/program-ir/+page.svelte`, `apps/web/src/lib/program-ir/fixtures.ts`

Enable **Play IR** and schema display:

1. parse the Program IR pane with `JSON.parse`;
2. validate it as `ProgramV1`;
3. compile it;
4. replace the read-only schema pane with formatted JSON;
5. call `audio.playSchema(schema)`.

Add a compact diagnostics area associated with the Program IR pane.

Requirements:

- failed parsing/validation/compilation never replaces the last valid schema or starts playback;
- successful compilation clears stale IR diagnostics;
- formatted schema output is stable and uses two-space indentation;
- display the UTF-8 byte size of the Program IR JSON as an early visibility aid;
- editing a binding and pressing Play IR recompiles every reference;
- starter fixture includes a complete manual IR counterpart.

**Acceptance criteria:**

- [ ] The manually editable starter IR plays without source evaluation.
- [ ] Changing BPM, notes, root, scale, gain, or a referenced binding audibly/visibly changes the compiled schema.
- [ ] Invalid JSON and invalid Program IR show distinct diagnostics.
- [ ] The schema pane updates only after successful compilation.
- [ ] The route displays Program IR JSON byte size.

---

## Phase 3: Fluid source analysis and retained variables

Tracer bullet: the starter Fluid source parses into structural Program IR with retained scalar/list variables, then lowers through the same compiler and plays equivalently.

### Step 3.1 — Add a JavaScript parser and source-analysis foundation

**Files:** `apps/web/package.json`, `apps/web/src/lib/program-ir/parse-fluid.ts`, `apps/web/src/lib/program-ir/source-ast.ts`, parser tests

Install Acorn as a direct web dependency:

```sh
pnpm --filter web add acorn
```

Parse with current ECMAScript syntax, source locations/ranges, and script mode matching `new Function` input. Do not use regular expressions to parse JavaScript structure.

Create an internal source-analysis result containing:

- parsed top-level statements;
- supported `const` declarations;
- identifier-to-declaration metadata;
- source ranges;
- diagnostics;
- ordered composition statements.

Supported declarations in this step:

- simple identifier declarators only;
- one or multiple declarators in a `const` statement;
- literal strings, booleans, finite numbers, `null`;
- unary negative numeric literals;
- nested arrays and object literals composed from supported values;
- direct references to earlier supported `const` declarations.

Explicitly reject:

- `let`/`var` when referenced by composition code;
- reassignment/update expressions;
- destructuring;
- spread elements;
- computed object properties;
- getters/setters/method properties;
- forward references if the chosen interpreter cannot preserve JavaScript TDZ semantics;
- functions/classes/import/export;
- loops, branches, and try/catch;
- unsupported top-level expression statements.

Requirements:

- syntax errors retain Acorn source positions;
- unsupported syntax produces the project diagnostic shape rather than an uncaught parser/node error;
- a declaration not reachable from a supported composition statement may be ignored;
- never evaluate source while producing IR;
- parser traversal is exhaustive for supported node kinds and fails closed for unknown kinds.

**Acceptance criteria:**

- [ ] Scalar, nested list/object, negative numeric, and direct-reference declarations parse with ranges.
- [ ] Mutable declarations, spreads, destructuring, loops, and conditionals fail descriptively when relevant.
- [ ] Syntax errors identify their source location.
- [ ] No source analysis test executes the input JavaScript.

### Step 3.2 — Interpret basic Drome fluent chains

**Files:** `apps/web/src/lib/program-ir/parse-fluid.ts`, `apps/web/src/lib/program-ir/fluid-subset.ts`, parser tests

Interpret the required basic composition subset:

- `d.bpm()` and `drome.bpm()` only if both evaluator aliases are intentionally supported;
- `d.synth()`;
- synth `.root()`, `.scale()`, `.notes()`, `.gain()`, `.adsr()`, `.mute()`, and `.push()`;
- `.euclid()`, `.fast()`, and `.reverse()`;
- supported waveform aliases;
- direct/nested binding references in arguments.

Requirements:

- accept only non-computed member access;
- require instrument chains to end in `.push()` before they become Program IR instruments;
- preserve instrument order from source statements;
- preserve ordered transform calls after the active note source;
- model setter/replacement behavior: a later `.notes()` replaces the earlier pattern state and any earlier transforms that current Fluid would no longer retain;
- repeated scalar setters retain only their final effective semantic value;
- repeated `.mute()` follows current replacement semantics;
- unsupported method names, argument counts, or argument node shapes fail at the method range;
- standalone builder values are only retained if referenced by supported composition code;
- method aliases may normalize to one canonical IR value.

Generate deterministic binding IDs from declaration order and sanitized names. IDs are internal identity; semantic comparison must not require the same literal IDs after source regeneration.

**Acceptance criteria:**

- [ ] The basic starter fixture excluding deferred LFO/effect syntax translates into valid Program IR.
- [ ] `root`, `scale`, `notes`, and gain variables remain named bindings and references.
- [ ] Multiple instruments retain source order.
- [ ] Transform order is retained and setter replacement semantics match current Fluid behavior.
- [ ] Unsupported methods and unpushed instruments are reported rather than silently omitted.

### Step 3.3 — Add Code → IR to the lab

**Files:** `apps/web/src/routes/lab/program-ir/+page.svelte`

Enable the **Code → IR** control:

1. parse the source pane through the constrained translator;
2. validate the produced Program IR;
3. format it as JSON;
4. replace the IR pane only after complete success;
5. leave the source pane untouched;
6. show source diagnostics with ranges on failure.

Requirements:

- Code → IR does not call the evaluation worker;
- changing only formatting or quote style should not materially change Program IR;
- report ignored unreachable declarations in a non-blocking informational section if useful, but do not include them as bindings;
- show a clear “supported subset” note in the lab UI;
- successful conversion updates the displayed IR byte size.

**Acceptance criteria:**

- [ ] The supported starter source produces the expected bindings, references, synth, and transforms.
- [ ] Unsupported source leaves the prior IR intact and displays a source-stage diagnostic.
- [ ] Code → IR performs no source execution or playback.
- [ ] Formatting-only source edits result in semantically equivalent IR.

---

## Phase 4: Canonical source generation and equivalence comparison

Tracer bullet: Program IR generates canonical editable Fluid source, reparses to equivalent IR, and reports whether original-source and IR paths lower to behaviorally equivalent schemas.

### Step 4.1 — Implement deterministic Program IR → Fluid source printing

**Files:** `apps/web/src/lib/program-ir/print-fluid.ts`, `apps/web/src/lib/program-ir/print-fluid.test.ts`

Print canonical source without adding a runtime formatting dependency.

Printing order:

1. validate Program IR;
2. topologically order referenced bindings;
3. assign valid unique JavaScript names;
4. emit binding declarations;
5. emit BPM;
6. emit ordered instrument chains.

Requirements:

- preserve valid author binding names where possible;
- sanitize reserved words, invalid identifiers, and collisions deterministically;
- map references to the assigned names;
- emit numeric strings as JavaScript numeric literals through the shared decoder/encoder contract;
- escape string literals safely;
- emit arrays, objects, chords, and rests deterministically;
- use one canonical waveform/scale/method spelling rather than preserving aliases;
- print transforms in IR order;
- omit fluent calls represented only by V1 defaults;
- generated source must fit the parser’s supported subset;
- no binding ID or provisional `$type` string appears in generated Fluid source;
- fail descriptively if an otherwise valid IR construct has no Fluid projection.

**Acceptance criteria:**

- [ ] Printing the same Program IR twice produces byte-identical source.
- [ ] Valid binding names survive; invalid/colliding names receive stable replacements.
- [ ] Numeric, string, boolean, null, list, object, chord, and reference values print safely.
- [ ] Generated source parses through Code → IR.
- [ ] IR → source → IR is semantically stable after binding-ID normalization.

### Step 4.2 — Canonicalize and compare Program IR

**Files:** `apps/web/src/lib/program-ir/canonicalize.ts`, `apps/web/src/lib/program-ir/compare.ts`, comparison tests

Add semantic Program IR canonicalization for round-trip tests:

- alpha-rename binding IDs by deterministic first/dependency order;
- preserve binding names as meaningful authoring data;
- normalize provisional aliases already canonicalized by parser/printer;
- preserve array/instrument/effect/transform order;
- sort only object fields where order has no semantics;
- normalize absent optional fields and explicit default fields according to one documented rule.

Return a useful comparison result:

```ts
type ComparisonResult =
  | { status: "equivalent" }
  | { status: "equivalent-after-normalization" }
  | { status: "different"; path: string; left: unknown; right: unknown }
  | { status: "unable"; diagnostics: ProgramDiagnostic[] };
```

**Acceptance criteria:**

- [ ] Different binding IDs alone do not make programs unequal.
- [ ] Different binding names do make programs meaningfully different.
- [ ] Instrument, effect, and transform reordering is detected.
- [ ] The first differing path/value pair is deterministic and readable.
- [ ] Explicit/omitted defaults follow the documented comparison policy.

### Step 4.3 — Canonicalize and compare DromeSchema

**Files:** `apps/web/src/lib/program-ir/canonicalize-schema.ts`, `apps/web/src/lib/program-ir/compare-schema.test.ts`

Normalize execution schemas for behavioral comparison:

- recursively canonicalize object key order;
- preserve every array order;
- strip properties whose value is `undefined` in the same way JSON transport does;
- alpha-rename LFO IDs by first occurrence;
- preserve repeated-ID relationships so one shared LFO is not equal to two independent LFOs;
- retain banks, source URLs, notes, offsets, durations, effects, MIDI fields, and every other behavioral value;
- do not use fuzzy numeric comparison for values generated by the same JavaScript numeric operations unless a documented concrete mismatch requires it.

Compare:

```text
original source → audio.compile() → DromeSchema A
source → Program IR → compileProgram() → DromeSchema B
```

Requirements:

- compilation of source for comparison uses the existing worker but does not start playback;
- schema mismatch reports the first differing normalized path and values;
- comparison errors from either path remain distinguishable;
- LFO identity normalization is tested before adding LFOs to the translator.

**Acceptance criteria:**

- [ ] Equivalent basic synth source/IR schemas compare equal.
- [ ] A changed note, transform, gain, or BPM reports a useful mismatch path.
- [ ] Random UUID differences alone do not fail comparison.
- [ ] Shared versus duplicated LFO identity fails comparison once LFO support lands.
- [ ] Comparison does not start playback.

### Step 4.4 — Enable IR → Code and Compare in the lab

**Files:** `apps/web/src/routes/lab/program-ir/+page.svelte`, browser tests as appropriate

Enable:

- **IR → Code:** validate, print, then replace source after full success;
- **Compare:** compile original source and IR independently, compare schemas, and display status/diff;
- a separate semantic IR round-trip status after IR → Code → IR where practical.

Requirements:

- no failed operation overwrites the last valid pane;
- conversion stages show a pending/disabled state to prevent accidental concurrent replacements;
- status distinguishes exact equivalence, normalized equivalence, difference, and inability to compare;
- users can play Code and Play IR after either conversion;
- compare output is reset when either source or IR changes so stale success is not displayed.

**Acceptance criteria:**

- [ ] The starter Program IR generates editable canonical Fluid source.
- [ ] Generated source reparses into semantically equivalent Program IR.
- [ ] Compare reports equivalent execution schemas for the supported starter fixture.
- [ ] Editing either pane invalidates the prior comparison result.
- [ ] Mismatches display a path and both values.

---

## Phase 5: Automations, effects, and richer pattern semantics

Tracer bullet: the complete PRD starter fixture retains named/shared LFOs and ordered effects, round-trips through canonical source, and lowers equivalently to current Fluid.

### Step 5.1 — Extend Program IR variants

**Files:** `apps/web/src/lib/program-ir/types.ts`, `validate.ts`, `resolve.ts`, related tests

Add structural variants for:

- envelopes with min, max, ADSR, and mode;
- LFOs with output A/B, speed, waveform, phase, normalization, and inversion;
- filters with type, frequency, Q, detune, and gain;
- gain effects;
- effect/reference unions;
- envelope/LFO/reference audio-parameter unions;
- binding values containing supported automation/effect builders.

Also add required richer transforms/features from the PRD:

- filter aliases normalize to one filter type;
- `.fx()` preserves effect order and accumulation;
- LFO waveform/speed arrays if supported by current Fluid surface;
- shared automation references;
- optional low-cost transforms (`hex`, `xox`, `sequence`, `slow`, `stretch`) only after required features pass.

Requirements:

- every general numeric automation/effect field is a numeric string or reference;
- structural mode/type values are constrained strings;
- LFO sharing comes from binding references, not serialized runtime UUIDs;
- nested reference type compatibility is validated before compilation;
- default omission semantics are documented per variant.

**Acceptance criteria:**

- [ ] The full starter fixture is representable, including `wobble` as a named LFO binding.
- [ ] One LFO binding can be referenced by multiple effect/parameter destinations.
- [ ] Envelope and effect fields reject incompatible binding values.
- [ ] Program IR still contains no float data values.

### Step 5.2 — Extend compiler lowering with shared builder memoization

**Files:** `apps/web/src/lib/program-ir/compile.ts`, compiler tests

Lower the new variants through existing Fluid builders.

Requirements:

- binding resolution constructs each builder binding once per compilation and memoizes it by ID;
- two references to one LFO binding receive the same Fluid `Lfo` instance;
- two structurally equal but independently declared LFO bindings remain distinct instances;
- effects compile in IR order;
- omitted filter Q/detune/gain rely on V1 Fluid defaults consistently;
- envelope and LFO pattern values resolve references without mutating reusable IR nodes;
- compiler diagnostics retain nested paths.

**Acceptance criteria:**

- [ ] Shared LFO references produce repeated `LfoSchema.id` values in the lowered instrument.
- [ ] Independent LFO bindings produce different IDs.
- [ ] Envelope, filter, and gain-effect schemas match equivalent Fluid source.
- [ ] Mixed ordered effects compare equivalent to source compilation.

### Step 5.3 — Extend source parsing for builder bindings and nested calls

**Files:** `apps/web/src/lib/program-ir/parse-fluid.ts`, `fluid-subset.ts`, parser tests

Support:

- `const env = d.env(...).adsr(...).mode(...)`;
- `const lfo = d.lfo(...).speed(...).wave(...).offset(...).norm().invert()` and aliases;
- `const filter = d.filter(...)` plus LPF/HPF/BPF aliases and filter setters;
- `const gain = d.gain(...)`;
- nested builder expressions inside `.gain()`, `.detune()`, and `.fx()`;
- builder references as method arguments;
- repeated `.fx()` calls and variadic effects.

Requirements:

- builder variables become bindings only when they contribute to a pushed instrument;
- shared identifier references preserve one binding;
- nested unbound builder calls may inline as IR nodes;
- method replacement/accumulation follows current Fluid semantics;
- invalid builder use reports the originating range;
- parser remains fail-closed for unsupported JavaScript.

**Acceptance criteria:**

- [ ] Full starter source translates into the expected named LFO binding and reference.
- [ ] Reusing one variable in two filters preserves sharing.
- [ ] Two equal inline LFO calls remain independent.
- [ ] Effect order and repeated `.fx()` accumulation are preserved.
- [ ] Invalid method/argument combinations fail before IR replacement.

### Step 5.4 — Extend canonical source printing

**Files:** `apps/web/src/lib/program-ir/print-fluid.ts`, printer/round-trip tests

Print automation/effect bindings before instruments in dependency order. Prefer named declarations for author bindings and inline unbound nodes where readability remains acceptable.

Requirements:

- preserve shared references through variable names;
- use canonical Fluid method names/aliases;
- print ordered `.fx()` arguments/calls deterministically;
- generated builder declarations remain in the parser-supported subset;
- no runtime LFO IDs appear in source;
- full starter source round-trips semantically.

**Acceptance criteria:**

- [ ] Full starter IR prints readable source with `const wobble = ...`.
- [ ] Printed source uses `wobble` at its effect reference site.
- [ ] Source → IR → source → IR preserves automation/effect structure and names.
- [ ] Lowered schemas compare equivalent after LFO-ID normalization.

### Step 5.5 — Optional random and MIDI descriptors

**Files:** Program IR modules/tests affected by selected optional scope

Only take this step if required features are complete without compromising the spike schedule.

Potential additions:

- random pattern bindings with type, ribbon segments, range, quantization, algorithm, step mask, and transforms;
- synth MIDI output;
- MIDI CC descriptors in direct supported parameter slots.

Requirements:

- random seeds/step counts remain integers;
- random ranges and quantization values use numeric strings;
- deterministic random semantics survive lowering;
- MIDI protocol values remain structural integers while ranges/defaults use numeric strings;
- source printer/parser support the same selected subset.

**Acceptance criteria:**

- [ ] Selected optional variants round-trip and compare against current Fluid.
- [ ] Random determinism and MIDI integer/numeric-string boundaries are tested.
- [ ] Any omitted optional scope is recorded in the final decision report rather than partially implemented.

---

## Phase 6: Sampler and structural-record stress test

Gate: begin only after reviewing Phases 1–5 in the lab. The review should confirm that the IR is readable, binding retention is useful, generated source is acceptable, and schema equivalence is trustworthy.

Tracer bullet: one representative built-in sampler and one custom sprite/multisample program use entry-array banks and numeric-string boundaries, round-trip through Fluid source where supported, and produce measured payloads.

### Step 6.1 — Define semantic sampler and bank-entry IR

**Files:** `apps/web/src/lib/program-ir/types.ts`, validation/resolution tests

Add provisional variants for:

- sampler instrument;
- bank reference versus embedded bank declaration;
- bank entry arrays;
- sample entry arrays;
- source-key entry arrays;
- file and sprite variations;
- variation pattern;
- fit;
- static start/end region;
- chop count and sequence;
- loop and clip mode;
- sampler notes/root/scale and ordered note transforms.

Illustrative dynamic data shape:

```json
{
  "banks": [
    {
      "name": "acoustic",
      "samples": [
        {
          "name": "piano",
          "sources": [
            {
              "key": "45",
              "variations": [
                {
                  "$type": "live.drome.program#fileVariation",
                  "src": "https://example.com/a2.wav"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

Requirements:

- dynamic names/keys are array entries, not arbitrary typed object maps;
- source pitch keys are musical numeric strings because the runtime model permits general note numbers, even if authoring commonly uses integer MIDI keys;
- sprite start/end values are numeric strings;
- slice, fit, and step counts remain positive integers;
- URLs are strings and prototype validation rejects clearly non-portable `blob:` URLs;
- duplicate bank/sample/source entry keys fail validation;
- built-in bank references are distinguishable from embedded custom bank data;
- exact production asset permanence rules remain deferred.

**Acceptance criteria:**

- [ ] One simple file bank, multisample bank, and sprite bank are structurally representable without floats or dynamic typed maps.
- [ ] Duplicate names/source keys and invalid sprite boundaries fail descriptively.
- [ ] Built-in and embedded bank forms are distinguishable.
- [ ] Sampler fit/chop/start/end semantics remain authoring-level fields rather than precomputed runtime regions.

### Step 6.2 — Lower sampler IR through existing Fluid

**Files:** `apps/web/src/lib/program-ir/compile.ts`, sampler compiler tests

Lower embedded banks into supported `d.loadSamples()` authoring shapes where possible, then construct samplers through the current Fluid API.

Requirements:

- convert numeric source keys back into a supported multisample authoring representation only when lossless; otherwise use a narrow prototype adapter or report the limitation explicitly;
- do not silently drop mixed file/sprite data that Fluid cannot currently author in one input shape;
- built-in references rely on existing Fluid built-in banks;
- lower variation, root, scale, notes, transforms, gain/ADSR/effects, fit, region, chop, loop, clip, mute, and push in semantically correct order;
- compare generated `DromeSchema.banks`, `sourceKeys`, notes, region, and variation against source-compiled fixtures;
- record any Program IR construct that cannot be projected into current Fluid.

**Acceptance criteria:**

- [ ] A built-in `tr909` sampler compiles and plays.
- [ ] A custom simple bank compiles to the expected normalized runtime bank.
- [ ] A representative sprite or multisample fixture compiles without numeric precision loss.
- [ ] Fit/chop/source-region behavior compares against equivalent current Fluid source.
- [ ] Unsupported mixed/irregular bank shapes fail explicitly.

### Step 6.3 — Extend source parser and printer for representative sampler fixtures

**Files:** `apps/web/src/lib/program-ir/parse-fluid.ts`, `print-fluid.ts`, fixtures/tests

Support only inline `d.loadSamples({...})` inputs from the documented current authoring shapes. Do not support asynchronous `d.loadSamples(url)` in the spike.

Add sampler fluent methods required by representative `notes/snippets.js` fixtures.

Requirements:

- custom bank declarations become entry arrays;
- source printer reconstructs a valid ergonomic `d.loadSamples()` shape where representable;
- built-in-only programs do not print complete normalized built-in URL manifests;
- sample numeric boundaries preserve canonical string precision through source and back;
- unsupported sample declarations fail explicitly.

**Acceptance criteria:**

- [ ] A built-in drum fixture round-trips without embedding the full built-in bank in canonical source.
- [ ] One custom file fixture and one sprite/multisample fixture round-trip.
- [ ] Chop/fit fixture lowers equivalently to current Fluid.
- [ ] Remote manifest loading reports unsupported spike scope.

### Step 6.4 — Measure payload size and structural verbosity

**Files:** `apps/web/src/lib/program-ir/measure.ts`, lab UI, fixtures/tests

Display measurements for representative Program IR values:

- compact JSON UTF-8 bytes;
- formatted JSON UTF-8 bytes;
- binding/variant/array counts;
- maximum nesting depth;
- optional CBOR measurement only if it can use an appropriate installed AT codec without distorting the spike.

Fixtures:

- basic synth;
- full starter synth with bindings/LFO/effect;
- `tr909` sampler reference;
- embedded simple custom bank;
- representative multisample;
- representative sprite/chop program.

Requirements:

- measurements use `TextEncoder` or an equivalent UTF-8 byte count, not JavaScript UTF-16 string length;
- distinguish IR size from lowered `DromeSchema` size;
- do not claim final record size without including record wrapper/CBOR overhead;
- capture results in the final decision report.

**Acceptance criteria:**

- [ ] Lab displays compact IR byte size and nesting/element metrics.
- [ ] Representative fixture measurements are reproducible in tests or a checked-in report.
- [ ] Report identifies the largest contributors, especially `$type` verbosity and embedded bank data.
- [ ] No unsupported inference is presented as an exact AT record-size guarantee.

---

## Phase 7: Lab hardening, verification, and decision report

### Step 7.1 — Complete diagnostics and interaction states

**Files:** `apps/web/src/routes/lab/program-ir/+page.svelte`, Program IR modules, browser tests

Requirements:

- each operation clears only stale diagnostics/results for its own stage;
- pending operations disable conflicting controls;
- stale comparison success disappears after either pane changes;
- source diagnostics show line/column or source range;
- IR diagnostics show JSON path;
- schema differences show first path plus both normalized values;
- successful operations visibly identify exact versus normalized equivalence;
- Play Code and Play IR clearly indicate which path is active;
- Stop works for either path;
- malformed input never crashes the route.

**Acceptance criteria:**

- [ ] Every PRD diagnostic category is visible in the lab.
- [ ] Rapid repeated conversion/compare clicks cannot apply results out of order.
- [ ] Stale success/error states do not survive relevant edits.
- [ ] Browser tests cover successful conversion and representative parse/validation/mismatch failures.

### Step 7.2 — Required automated verification

Run after all selected spike slices are complete:

- [ ] `pnpm --filter @web-audio/editor build`
- [ ] `pnpm --filter @web-audio/editor check`
- [ ] `pnpm --filter @web-audio/editor lint`
- [ ] `pnpm --filter @web-audio/editor test:ci`
- [ ] `pnpm --filter web check`
- [ ] `pnpm --filter web lint`
- [ ] `pnpm --filter web test`
- [ ] `pnpm check`
- [ ] `pnpm lint`
- [ ] `pnpm test`

### Step 7.3 — Required focused tests

- [ ] Numeric-string round-trip, canonicalization, malformed input, exponent policy, and negative zero.
- [ ] Validation from `unknown` without unsafe casts.
- [ ] Missing, duplicate, forward, shared, and circular binding references.
- [ ] Binding-name sanitization and collision handling.
- [ ] Shared versus independent LFO bindings.
- [ ] Source syntax errors with location data.
- [ ] Unsupported mutable variables, loops, conditionals, spreads, destructuring, and methods.
- [ ] Pattern setter replacement and ordered transform behavior.
- [ ] Effects ordering and accumulation.
- [ ] Fluid source → IR → source → IR semantic stability.
- [ ] Fluid source schema versus Program IR schema behavioral equivalence.
- [ ] LFO ID alpha-renaming that preserves the sharing graph.
- [ ] JSON key-order independence and array-order sensitivity.
- [ ] Program IR direct playback does not invoke source evaluation.
- [ ] Sampler dynamic-entry duplicate detection and numeric boundary precision, if Phase 6 proceeds.
- [ ] Representative payload measurements, if Phase 6 proceeds.

### Step 7.4 — Manual spike review

Use `/lab/program-ir` with the starter fixture and selected additional fixtures.

#### Structural IR feel

- [ ] Program IR is understandable without consulting `DromeSchema`.
- [ ] Numeric strings are tolerable to read and edit.
- [ ] `$type` discriminator verbosity is tolerable or specific alternatives are identified.
- [ ] Editing a named binding feels materially better than editing repeated literals.
- [ ] Transform arrays communicate authoring intent better than lowered static cycles.

#### Source reconstruction

- [ ] Generated Fluid source is readable enough to continue editing.
- [ ] Binding names remain useful and stable.
- [ ] Shared LFO/effect variables are obvious in generated code.
- [ ] Unsupported syntax diagnostics make the subset boundary understandable.
- [ ] Canonicalization losses such as comments/aliases/formatting feel acceptable.

#### Behavioral confidence

- [ ] Play Code and Play IR sound equivalent for the starter fixture.
- [ ] Schema comparison reports equivalence for all supported fixtures.
- [ ] Deliberate note, transform, gain, LFO, and effect changes produce understandable differences.
- [ ] Direct IR playback remains functional when generated source is invalid or absent.

#### Sampler/size review, if Phase 6 proceeds

- [ ] Entry-array bank structure remains understandable.
- [ ] Built-in references are significantly smaller than embedded normalized banks.
- [ ] Numeric-string sprite boundaries preserve exact behavior.
- [ ] Measured payloads remain plausible for AT records or clearly motivate blob/reference work.

### Step 7.5 — Write the production design recommendation

**Files:** `plans/program-ir-spike-findings.md` (new)

Document evidence rather than merely restating the PRD. Include:

- screenshots or textual examples of source, Program IR, and `DromeSchema` for representative fixtures;
- supported and unsupported source syntax discovered in practice;
- whether retained top-level `const` bindings are sufficient;
- whether expression nodes are needed;
- whether bindings should contain arbitrary builder/value nodes;
- IR readability findings;
- generated-source readability findings;
- schema-equivalence results and any unavoidable normalization;
- numeric-string ergonomics and codec rules;
- structural `$type` and entry-array ergonomics;
- representative payload measurements;
- sampler and asset-reference findings if tested;
- final recommendation for package boundaries;
- final recommendation for Fluid → IR production architecture;
- final recommendation for Lexicon definitions/NSIDs and version evolution;
- inline versus blob/reference policy;
- migration outline from source-publishing sketches;
- list of spike files to retain, refactor, extract, or delete.

The report must explicitly answer whether to proceed with Program IR as the canonical published artifact. Do not publish or migrate the Lexicon as part of writing the report.

**Acceptance criteria:**

- [ ] Findings resolve or narrow every open question in the PRD.
- [ ] Recommendation distinguishes observed evidence from future assumptions.
- [ ] Package dependency direction avoids a production `Fluid ↔ Program` cycle.
- [ ] Any proposed Program V1 defaults and evolution policy are explicit.
- [ ] Lexicon publication remains a separate reviewed implementation plan.

---

## Phase 8: Spike closeout

This phase does not implement the production Program IR. It ensures the experiment leaves the repository in an intentional state.

### Step 8.1 — Classify prototype code

Based on `program-ir-spike-findings.md`, classify every module as:

- retain in place temporarily;
- extract to a future `@web-audio/program` package;
- rewrite during production implementation;
- delete because the approach was rejected.

Do not perform a large production extraction in the same change as the findings review unless a separate approved plan authorizes it.

**Acceptance criteria:**

- [ ] No prototype module is mistaken for a stable public API.
- [ ] Experimental route status remains obvious.
- [ ] Follow-up work has an explicit owner/file rather than hidden TODOs.

### Step 8.2 — Create follow-up plans only after the decision

Potential follow-up plans, created only if recommended:

- production `@web-audio/program` package and compiler extraction;
- Fluid builder refactor to emit Program IR;
- source-analysis/metadata integration;
- Program Lexicon and generated types;
- sketch record migration from `code` to Program IR;
- direct Program IR network playback;
- local IndexedDB authoring model updates;
- blob-backed programs and AT-hosted sample assets;
- alternate visual authoring UI.

**Acceptance criteria:**

- [ ] Production work is not smuggled into the spike closeout.
- [ ] Each accepted architectural area has a separately reviewable follow-up scope.
- [ ] Rejected experiments are documented and removable.
