# @web-audio/patterns

Generic pattern mechanics used by Fluid: fluent array cycles, readonly expressions, canonical event cycles, rhythm generators, and bounded numeric support.

The expression and event-cycle foundations are tested independently; production Fluid event authoring has not yet cut over to native event state. Shorthand parsing is still planned, not implemented.

## Source map

```text
src/
├── index.ts         # Curated package API
├── limits.ts        # Shared bounds and cycle validation
├── expressions/     # Readonly model, validation, and shared evaluation
├── events/          # Canonical cycles, transforms, and derived grid geometry
├── cycles/          # Fluent cycle classes, local types, and schema serialization
│   └── operations/  # Array-cycle construction, masking, and transforms
├── rhythm/          # Euclid, hex, sequence, and XOX generators
└── math/            # Exact rationals and compatibility speed-ratio resolution
```

Tests live beside their implementations. Not every existing cycle class is disposable legacy code: random and processing-value primitives remain useful beyond the event cutover.

## Ownership and exports

- Patterns owns generic structure, evaluation, geometry, transforms, and limits. Fluid owns target validation, authored intent, lane coordination, timing selection, and event compilation.
- Schema owns schema types; import them directly from `@web-audio/schema`.
- `src/index.ts` is the only code entry point, using explicit named re-exports directly from owning modules. There are no internal subpaths, wildcard exports, or folder barrels.
- Root exports require demonstrated cross-package consumers, including integration tests. Add a name when a real consumer needs it, not for hypothetical future use.
- Inspectable, inferred expression data does not require a named root export for every constituent type. Event-cycle integration exports are not a Fluid extension API.
- Internal imports go directly to owning modules. Source files are not supported deep-import entry points.

The reorganization intentionally narrows the import API without changing musical behavior, validation, or limits. See the [reorganization record](../../plans/patterns-package-reorg/plan.md) for removed exports and the [active shorthand plan](../../plans/shorthand-syntax/direct-cutover-plan.md) for remaining compatibility gates.

## Development

From the repository root:

```sh
pnpm --filter @web-audio/patterns build
pnpm --filter @web-audio/patterns check
pnpm --filter @web-audio/patterns lint
pnpm --filter @web-audio/patterns test:ci
pnpm --filter @web-audio/patterns format
```
