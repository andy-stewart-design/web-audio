# @web-audio/patterns

Generic pattern mechanics used by Fluid: fluent array cycles, readonly expressions, canonical event cycles, rhythm generators, and bounded numeric support.

Production Fluid event authoring now uses the readonly expression evaluator and native event cycles. The obsolete masked cycle and chord serializer have been removed after verified [coverage transfer](../../plans/shorthand-syntax/phase-5-coverage-transfer.md); random and processing-value primitives remain. Shorthand parsing is still planned, not implemented.

## Source map

```text
src/
├── index.ts         # Curated package API
├── limits.ts        # Shared bounds and cycle validation
├── expressions/     # Readonly model, validation, and shared evaluation
│   └── __tests__/
├── events/          # Canonical cycles, transforms, and derived grid geometry
│   └── __tests__/
├── cycles/          # Fluent cycle classes, local types, and schema serialization
│   ├── __tests__/
│   └── operations/  # Array-cycle construction, masking, and transforms
│       └── __tests__/
├── rhythm/          # Euclid, hex, sequence, and XOX generators
│   └── __tests__/
└── math/            # Exact rationals and compatibility speed-ratio resolution
    └── __tests__/
```

Unit tests live in their owning domain's `__tests__/`, including `src/events/__tests__/` and `src/cycles/operations/__tests__/`. Cross-domain integration suites belong in `src/__tests__/`, and test-only fixtures/helpers belong in the relevant suite's `support/`. Tests remain TypeScript-checked; production modules must never import test support. This follows the [repository test convention](../../AGENTS.md), adopted elsewhere incrementally.

Not every existing cycle class is disposable legacy code: random and processing-value primitives remain useful beyond the event cutover.

## Ownership and exports

- Patterns owns generic structure, evaluation, geometry, transforms, and limits. Fluid owns target validation, authored intent, lane coordination, timing selection, and event compilation.
- Schema owns schema types; import them directly from `@web-audio/schema`.
- `src/index.ts` is the only code entry point, using explicit named re-exports directly from owning modules. There are no internal subpaths, wildcard exports, or folder barrels.
- Named pure `euclid`, `hex`, and `sequence` generators are exported for Fluid's rhythm setters. Retained fluent cycle classes support random and processing-value callers; Fluid event setters do not construct them to generate masks.
- Root exports require demonstrated cross-package consumers, including integration tests. Add a name when a real consumer needs it, not for hypothetical future use.
- Inspectable, inferred expression data does not require a named root export for every constituent type. Event-cycle integration exports are not a Fluid extension API.
- Internal imports go directly to owning modules. Source files are not supported deep-import entry points.

The reorganization intentionally narrows the import API without changing musical behavior, validation, or limits. See the [reorganization record](../../plans/completed/patterns-package-reorg/plan.md) for removed exports and the [active shorthand plan](../../plans/shorthand-syntax/direct-cutover-plan.md) for remaining compatibility gates.

## Development

From the repository root:

```sh
pnpm --filter @web-audio/patterns build
pnpm --filter @web-audio/patterns check
pnpm --filter @web-audio/patterns lint
pnpm --filter @web-audio/patterns test:ci
pnpm --filter @web-audio/patterns format
```
