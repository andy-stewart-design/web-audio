# Bus Schema Hardening and Canonicalization Plan

## Goal

Turn the proven bus/routing MVP format into one required, canonical graph contract shared by Schema, Fluid, and AudioEngine without changing audible routing behavior.

After this work, every `DromeSchema` explicitly contains a bus map and every instrument explicitly contains its primary route and send map:

```ts
{
  buses: {},
  instruments: [
    {
      route: "main",
      sends: {},
      // existing instrument fields
    },
  ],
}
```

AudioEngine accepts a validated clone of each update. Invalid input, clone failure, or later caller mutation cannot replace or alter the last valid pending graph.

## Principles

- This is schema and update-boundary hardening, not a routing feature.
- Preserve the MVP's existing signal topology and runtime ownership.
- Keep one graph validator rather than allowing Fluid and AudioEngine rules to drift.
- Make defaults explicit at schema-production boundaries instead of repeatedly inferring them at runtime.
- Perform the repository fixture migration mechanically; do not combine it with unrelated refactors.
- Assign pending engine state only after cloning and validation both succeed.
- Preserve last-write-wins for valid updates and last-valid-write behavior when an update fails.

## Canonical contract

### Drome schema

Change the graph fields from optional to required:

```ts
interface DromeSchema {
  buses: Record<string, BusSchema>;
  // existing fields
}

interface InstrumentSchema {
  route: string;
  sends: Record<string, number>;
  // existing fields
}
```

Canonical defaults are:

```ts
buses: {
}
route: "main";
sends: {
}
```

`main` remains conceptual and does not need an entry in `buses` when its gain is unity. If present, its existing MVP restrictions continue to apply.

### Fluid output

Fluid remains ergonomic for callers. Users are not required to call `.bus()`, `.route()`, or `.send()`, but `getSchema()` always emits the canonical fields.

Examples:

```ts
// User input
 d.synth().push();

// Canonical graph output
{
  buses: {},
  instruments: [{ route: "main", sends: {}, /* ... */ }],
}
```

### Direct AudioEngine input

Direct callers must provide the canonical required fields. AudioEngine no longer supplies compatibility defaults for missing `buses`, `route`, or `sends` after the repository migration is complete.

This is an intentional schema-contract hardening change. It must produce clear type errors at compile time and clear validation errors for untyped runtime input.

## Shared graph validation

Place graph validation in the Schema package so both Fluid and AudioEngine consume the same domain rules without depending on one another.

The validator should remain narrow, for example:

```ts
validateDromeGraph(schema);
```

It should validate the graph additions and supported MVP bus processors, not become a general decoder for every existing Drome field.

### Bus names

Validate that each bus name:

- is non-empty;
- is already trimmed/canonical;
- does not normalize to a different name;
- is unique by object-key semantics;
- uses `main` only for the persistent main configuration.

Do not silently trim or rewrite direct schemas. Fluid builders may normalize user input before serialization, but the accepted schema itself must already be canonical.

### Bus values and effects

Validate that:

- every bus gain is finite and `>= 0`;
- `main` has no effects;
- named buses contain only currently supported gain and filter effects;
- each bus effect parameter resolves to exactly one finite constant static value;
- dynamic, random, envelope, LFO, MIDI, and multi-step bus parameters remain rejected;
- validation errors identify the bus, effect index, and parameter field.

The existing temporary constant-effect validation should move or be consolidated rather than duplicated. Runtime construction may retain a small extraction helper, but acceptance rules must come from the shared validator.

### Routes

For every instrument, validate that:

- `route` is non-empty and canonical;
- `main` is always a valid primary route;
- every other route references a declared named bus;
- choosing a named route remains exclusive and does not imply a dry main path.

### Sends

For every send, validate that:

- the target name is non-empty and canonical;
- the target references a declared named bus;
- the target is not `main`;
- the amount is finite and in `[0, 1]`.

Object maps already provide one value per target, preserving the existing last-write-wins builder behavior.

### Error contract

Shared validation should produce stable, package-neutral errors. Tests in Fluid and AudioEngine should assert the same messages or structured error details rather than maintaining package-specific wording for identical failures.

Do not silently clamp numeric values or repair malformed references.

## Defensive engine updates

### Accepted update flow

`AudioEngine.update(schema)` should build a candidate without touching `_pending`:

```text
caller schema
  → defensive clone
  → shared graph validation of clone
  → assign validated clone to _pending
```

Cloning first ensures validation operates on the exact isolated value that may later commit. `_pending` is assigned only after both operations succeed.

Use the smallest cloning mechanism that faithfully supports the schema's documented plain-data values. Keep it behind a focused helper so behavior and failures are directly testable. Do not add a serialization framework.

### Caller mutation isolation

After a successful update, mutations to the caller-owned object must not affect:

- pending buses;
- routes;
- sends;
- bus gains or effect parameters;
- instruments or banks;
- the graph eventually committed at prebar.

The clone must be deep enough for all nested schema data, not only the new graph fields.

### Last-valid-write behavior

Required state transitions:

```text
valid A                     → pending A
valid A, then valid B       → pending B
valid A, then invalid B     → pending A
valid A, then clone-fail B  → pending A
active A, then invalid B    → active A remains active
no pending, invalid B       → no pending graph
```

Validation and clone failures should throw synchronously from `update()` while preserving prior pending and active state.

This SOW does not add commit-error containment or transactional Web Audio construction; those remain part of the later engine-update-safety SOW.

## Implementation slices

### Slice 1 — Canonical schema types and Fluid defaults

**Purpose:** Establish the required representation at the producer boundary.

- Make `DromeSchema.buses` required.
- Make every instrument variant's `route` and `sends` required.
- Initialize Fluid's graph with `buses: {}`.
- Initialize every Fluid instrument with `route: "main"` and `sends: {}`.
- Ensure builder calls continue to overwrite those defaults as today.
- Add focused serialization tests for instruments with and without explicit routing.

**Acceptance criteria:**

- [x] Fluid always emits `buses`, `route`, and `sends`.
- [x] Existing user-facing builder syntax remains unchanged.
- [x] An unrouted instrument serializes to `route: "main"` and `sends: {}`.
- [x] Explicit routes and sends serialize identically to the MVP behavior.
- [x] No runtime topology code changes in this slice.

### Slice 2 — Mechanical repository migration

**Purpose:** Move all checked-in schemas to the canonical required type.

Update repository fixtures, tests, examples, app state, and manually authored schemas to include explicit graph fields.

Requirements:

- Keep migration edits mechanical.
- Do not change expected routing or sound behavior.
- Avoid casts that bypass the new contract.
- Separate incidental cleanup from the migration.

**Acceptance criteria:**

- [ ] Schema, Fluid, AudioEngine, applications, and tests compile with required fields.
- [ ] No production consumer still relies on absent graph fields.
- [ ] Existing tests retain their prior behavioral assertions.
- [ ] Repository search finds no obsolete compatibility fixtures unless explicitly testing runtime rejection.

### Slice 3 — Shared graph validator

**Purpose:** Give Fluid and AudioEngine one acceptance contract.

- Add and export the focused validator from Schema.
- Move/consolidate name, reference, range, and constant bus-effect rules.
- Call it from Fluid's completed-schema path.
- Call it from AudioEngine's update boundary.
- Remove duplicated validation only after parity tests exist.
- Keep runtime effect-value extraction local and minimal.

**Acceptance criteria:**

- [ ] Fluid and AudioEngine reject the same malformed graph cases.
- [ ] Error paths identify the exact bus, instrument, send, effect, and field where applicable.
- [ ] Forward bus declarations in Fluid still work because validation occurs on the completed graph.
- [ ] Direct AudioEngine schemas receive equivalent validation.
- [ ] Main effects and dynamic bus parameters remain rejected.
- [ ] No generic runtime decoding or parameter manager is introduced.

### Slice 4 — Defensive cloning and last-valid-write

**Purpose:** Isolate pending engine state from callers and failed updates.

- Add a focused schema clone helper.
- Clone before validating the candidate accepted by AudioEngine.
- Assign `_pending` only after clone and validation succeed.
- Preserve an earlier pending schema on invalid input or clone failure.
- Preserve the active graph in all update-boundary failure cases.
- Retain valid-update last-write-wins behavior.

**Acceptance criteria:**

- [ ] Mutating the caller schema after `update()` does not alter the committed graph.
- [ ] Nested instruments, buses, sends, effects, and banks are isolated.
- [ ] Invalid updates throw and preserve the prior pending schema.
- [ ] Clone failures throw and preserve the prior pending schema.
- [ ] Invalid updates with no pending schema do not create one.
- [ ] Valid B still replaces valid pending A.
- [ ] Existing prebar commit and graph retirement behavior remains unchanged.

### Slice 5 — Integration and closeout

Cover a canonical direct schema and equivalent Fluid-produced schema for the reference topology:

```ts
d.bus("main").gain(0.9);
d.bus("drums").gain(0.8).fx(d.lpf(8_000));
d.bus("verb").gain(0.5);

d.sample("bd").route("drums").send("verb", 0.1).push();
d.sample("sd").route("drums").send("verb", 0.4).push();
d.synth().send("verb", 0.2).push();
```

Verify both inputs produce the same canonical graph meaning and existing runtime connections.

**Acceptance criteria:**

- [ ] Fluid and direct schemas pass the same shared validator.
- [ ] Canonicalization does not introduce dry duplication or change send taps.
- [ ] Main remains the only node connected directly to destination.
- [ ] Caller mutation after acceptance cannot change the committed topology.
- [ ] Invalid updates preserve the last valid pending and active state.
- [ ] Public documentation describes required direct-schema fields and Fluid defaults.
- [ ] Changed-package and workspace verification passes.

## Focused test matrix

### Schema

- empty canonical graph;
- valid main and named buses;
- empty, whitespace, and non-canonical names;
- missing route/send targets;
- send to main;
- negative, non-finite, and out-of-range numbers;
- main effects;
- unsupported bus effects;
- non-constant and non-finite bus effect parameters;
- precise error paths.

### Fluid

- default canonical fields;
- route and send builder output;
- forward declarations;
- shared-validator parity;
- repeated sends remain last-write-wins;
- existing builder-time ergonomic errors where they provide earlier feedback.

### AudioEngine

- valid direct canonical schemas;
- shared-validator parity;
- valid-update last-write-wins;
- invalid-update last-valid-write;
- clone-failure last-valid-write;
- deep caller-mutation isolation;
- unchanged prebar commit timing;
- unchanged routing, send, main-gain, retirement, Stop, MIDI, and sampler behavior.

## Documentation changes

Document:

- required direct-schema graph fields;
- canonical default values;
- Fluid's automatic default emission;
- graph validation rules;
- the engine's defensive cloning behavior;
- last-valid-write semantics for failed updates;
- unchanged MVP limitations for bus effects and topology.

Do not imply that this SOW adds transactional graph construction or general update recovery.

## Explicit non-goals

- Runtime topology changes
- Transactional Web Audio graph construction
- Commit-error containment or clock error reporting
- Bus automation
- Patterned sends
- Ducking
- Reverb or tail-aware retirement
- Main effects
- Bus-to-bus routing
- General schema decoding
- Parameter-management extraction
- A universal resource ledger

## Required verification after each slice

Run formatting and changed-package commands:

```sh
pnpm --filter @web-audio/schema check
pnpm --filter @web-audio/schema lint

pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/fluid build

pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine build
```

Run only commands relevant to changed packages during each slice. At closeout, run:

```sh
pnpm check
pnpm lint
pnpm test
```

Do not start a development server without explicit permission.

## Reassessment gates

Pause and split or revise the SOW if implementation starts requiring:

- changes to audible routing or send tap placement;
- changes to active/retiring graph ownership;
- a general runtime schema decoder;
- transactional graph construction;
- commit-error containment or scheduler changes;
- instrument parameter, LFO, MIDI, voice, or sampler refactors;
- automation support for buses;
- broad non-mechanical fixture rewrites.

## Completion criteria

This SOW is complete when:

- `buses`, `route`, and `sends` are required and emitted canonically;
- repository schemas and fixtures use that representation;
- Fluid and AudioEngine share one graph validator;
- accepted engine updates are deeply isolated from caller mutation;
- invalid updates and clone failures preserve the last valid pending and active state;
- valid updates retain last-write-wins behavior;
- existing audible routing and lifecycle behavior is unchanged;
- focused package and workspace verification passes.
