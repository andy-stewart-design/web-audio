# Pattern IR Redesign

## Status

Superseded by [`spec.md`](./spec.md). This document is retained as design history and does not describe the current implementation plan. In particular, the current design uses one shared `PatternExpression<T>` model for structured and shorthand input rather than the separate shorthand-AST lowering described below. Where this document differs from the specification or [`plan.md`](./plan.md), those documents are authoritative.

## Central idea

Structured pattern input and shorthand syntax represent the same musical concepts. They should converge to the same semantic intermediate representation before pattern compilation.

```text
structured input ──> normalizeStructuredInput() ──┐
                                                   ├─> PatternIR
shorthand string ─> parse AST ─> lowerShorthand() ─┘
                                                         ↓
                                                   PatternCompiler
                                                         ↓
                                             existing schema structures
```

The compiler should not need to know whether a pattern originated from JavaScript arrays or shorthand syntax.

## AST versus IR

Shorthand still needs an AST because its syntax contains sequences, groups, alternation, rests, and postfix operators:

```ts
Shorthand AST
  → structural evaluation
  → PatternIR
```

Structured input does not need to be converted into the shorthand AST. It can be normalized directly:

```ts
structured arrays and values
  → PatternIR
```

The shared representation should therefore be a semantic IR, not necessarily a common syntax tree. The AST preserves authoring syntax; the IR preserves the resulting musical structure.

## Proposed PatternIR

The exact types are intentionally open, but the representation needs to express the following:

- bars and repeating cycles;
- sequential events;
- simultaneous voices/chords;
- rests;
- structural offsets and durations;
- relative weighting;
- alternation results;
- common-grid alignment where required;
- enough source information for useful diagnostics.

A possible shape is:

```ts
type PatternIR<T> = {
  cycle: PatternBar<T>[];
};

type PatternBar<T> = {
  events: PatternEvent<T>[];
  structuralGrid?: StructuralCell<T>[];
};

type PatternEvent<T> = {
  values: T[]; // simultaneous voices; one event may contain a chord
  offset: Rational;
  duration: Rational;
};
```

The final structure may use a grid, event spans, or both. A grid is useful for alignment and rest availability, while event spans are necessary when structural duration differs from the number of grid cells.

## Important timing caveat

A plain grid is not always sufficient. For example:

```text
0@3 2 3
```

The first event is still one event, but occupies three times the relative duration of the others. If this is represented only as padded `null` cells, the compiler may lose the original duration semantics.

Therefore, `PatternIR` must preserve structural spans or weights in addition to any flattened grid. `ShorthandGrid` from the shorthand specification is useful as a lowering/alignment representation, but it may not be the complete PatternIR.

## Target-specific atom conversion

The structural evaluator should not decide what an atom means. Fluid should supply target-specific conversion:

```ts
lowerShorthand(ast, parseNoteAtom);
lowerShorthand(ast, parseSampleName);
lowerShorthand(ast, parseVariation);
```

This keeps the shorthand package generic while allowing Fluid to enforce target-specific rules:

- notes must become finite numeric values;
- sample names must satisfy sample-name validation;
- variations must become finite numeric values;
- XOX values must become binary values.

Conceptually:

```text
Shorthand AST
  → generic structural lowering
  → target atom conversion
  → typed PatternIR<T>
```

Structured inputs should use the same target conversion boundary so that both input styles produce equivalent typed IR.

## Relationship to the current design

The current path for a simple static note pattern is approximately:

```text
Instrument.notes()
  → AuthoredPitches
  → MaskedCycle
  → candidate timing
  → compileNoteEvents()
  → Synthesizer schema
```

This is more machinery than a basic static pattern requires. `MaskedCycle` currently combines several concerns:

- source values;
- trigger-grid masks;
- rest handling;
- source-reference alignment;
- transformations;
- timing derivation.

The PatternIR could replace or substantially narrow that role. Avoid introducing an additional chain such as:

```text
Shorthand AST
  → ShorthandGrid
  → AuthoredPitches
  → MaskedCycle
  → compileNoteEvents()
```

That would preserve the existing accidental complexity. Both shorthand and structured inputs should instead produce the canonical IR consumed by the compiler.

## Compiler responsibilities

`PatternCompiler` should consume PatternIR and handle semantic compilation, including:

- choosing or combining event timing;
- applying explicit rhythm ownership rules;
- aligning notes, sample names, and variations by hit;
- filtering rests and unavailable values;
- compiling static and random value patterns;
- producing the existing schema types.

The compiler should not parse shorthand, inspect JavaScript array nesting, or manage fluent authoring state.

The existing schema and audio-engine packages remain unchanged. The IR is an internal boundary inside the patterns/Fluid redesign; the compiler continues to emit the current `SynthEventPattern`, `SamplerEventPattern`, and related schema structures.

## Package ownership

### `@web-audio/patterns`

Owns generic structural behavior:

- shorthand lexing and parsing;
- public shorthand AST types;
- immutable shorthand values;
- structural evaluation;
- rational expansion;
- generic PatternIR types and lowering helpers;
- generic cycle/grid utilities.

It should not decide whether an atom is a note, sample name, or variation.

### `@web-audio/fluid`

Owns authoring and target integration:

- `d.shorthand()` and `d.sh()`;
- structured-input normalization;
- target-specific atom conversion and validation;
- fluent setter state;
- `PatternCompiler` orchestration;
- conversion from PatternIR to the existing schema.

### `@web-audio/schema` and `@web-audio/audio-engine`

Remain unchanged for the initial redesign. They continue to consume the existing stable schema representation.

## Desired invariants

The most important invariant is semantic equivalence:

```ts
compileStructured(input) === compileShorthand(equivalentShorthand);
```

Equivalence should include:

- timing;
- rests;
- chords and voice order;
- cycle length;
- transforms;
- explicit rhythm interaction;
- note/name/variation alignment;
- final schema output.

For example, an equivalent structured pattern and shorthand expression should produce identical schema event patterns, not merely similar playback.

## Suggested migration path

1. Define and test a minimal PatternIR for static values, rests, chords, bars, and structural spans.
2. Add structured-input normalization without changing public behavior.
3. Lower shorthand ASTs into the same PatternIR.
4. Route static synth notes through a new pure compiler while preserving existing schema output.
5. Add sample names and variation lanes using the same IR and alignment logic.
6. Add random patterns and explicit timing policies.
7. Narrow or remove `MaskedCycle` once its responsibilities are covered by the IR/compiler.
8. Keep the existing Fluid and audio-engine tests as the behavioral contract throughout the migration.

The redesign should be incremental rather than a simultaneous rewrite of patterns, Fluid, schema, and the audio engine.
