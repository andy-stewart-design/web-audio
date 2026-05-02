# Extract Schema Package

Extract schema types into a dedicated `@web-audio/schema` package to formalize the contract between fluid (producer) and audio-engine (consumer).

## Motivation

- `SynthesizerSchema` is currently inferred via `ReturnType<>` — fragile and implicit
- The engine depends on `@web-audio/fluid` just to get type definitions — an executor shouldn't depend on the builder layer
- Schema types are scattered across packages (`patterns` owns `StaticSchema`, fluid infers `SynthesizerSchema`, engine locally aliases `ParameterSchema`)

## Package Structure

```
packages/schema/
  package.json
  tsconfig.json
  src/
    index.ts
```

Pure types, no runtime code, no build step. Exports source directly.

## Types Owned by Schema

| Type                | Currently lives in        | Notes                                           |
| ------------------- | ------------------------- | ----------------------------------------------- |
| `StaticSchema`      | `@web-audio/patterns`     |                                                 |
| `StaticSchemaValue` | `@web-audio/patterns`     |                                                 |
| `RandomSchema`      | `@web-audio/patterns`     | Includes `valueMap?: number[]`                  |
| `ParameterSchema`   | local alias in engine     | `StaticSchema \| RandomSchema`                  |
| `SynthesizerSchema` | inferred in fluid         | Becomes explicit interface                      |
| `DromeSchema`       | `@web-audio/audio-engine` | Becomes explicit interface                      |
| `Waveform`          | `@web-audio/fluid`        | Redefined as explicit string union (no DOM dep) |

## Types Staying in Patterns

`Cycle`, `NoteInput`, `Nullable`, `ScheduledValue`, `Chord` — internal to pattern cycle machinery, not part of the schema contract.

## Dependency Graph After

```
@web-audio/schema       ← pure types, no deps
@web-audio/patterns     → schema
@web-audio/fluid        → schema, patterns
@web-audio/audio-engine → schema, clock
```

Key win: engine drops dependencies on both `@web-audio/fluid` and `@web-audio/patterns`.

## Implementation

### 1. Create `@web-audio/schema` package

- `package.json` with `"exports": { ".": "./src/index.ts" }`, zero dependencies
- `tsconfig.json`
- `src/index.ts` with all type definitions

### 2. Update `@web-audio/patterns`

- Remove `StaticSchema`, `StaticSchemaValue`, `RandomSchema` from `src/types.ts`
- Import and re-export them from `@web-audio/schema`
- Add `@web-audio/schema` as dependency

### 3. Update `@web-audio/fluid`

- Remove `Waveform` definition from `src/types.ts`, import from schema
- Remove `SynthesizerSchema` inferred type, import from schema
- Annotate `Synthesizer.getSchema(): SynthesizerSchema`
- Annotate `Drome.getSchema(): DromeSchema`
- Add `@web-audio/schema` as dependency

### 4. Update `@web-audio/audio-engine`

- Remove `DromeSchema` from `audio-engine.ts`, import from schema
- Remove `@web-audio/fluid` and `@web-audio/patterns` from dependencies
- Import all schema types from `@web-audio/schema`
- Add `@web-audio/schema` as dependency
