# Sampler Patterning Implementation Plan

## Context

This plan implements `plans/sampler-patterning/spec.md` in two independently shippable PRs:

1. **Variation-derived implicit sampler onsets**, with no public schema change.
2. **Patternable sample names**, with one atomic public schema migration.

The prerequisite in `plans/sampler-patterning/hit-based-pattern-resolution-spec.md` is complete. Synthesizers and samplers now resolve event-addressed values from bar-local hit indices while retaining grid `stepIndex` as onset geometry metadata. This plan must build on that behavior rather than introducing a second event counter or restoring grid-indexed value lookup.

The target onset hierarchy is:

```txt
explicit notes/rhythm, chop, or fit
> explicit sample-name pattern
> explicit variation pattern
> default one event per bar
```

After onset authority has selected geometry:

```txt
final masks select surviving onsets
→ surviving onsets receive consecutive bar-local hit indices
→ note, sample name, variation, and other event lanes resolve independently
→ grid offsets and durations determine timing
```

Synthesizer behavior is outside this plan.

## Audited current state

The implementation should begin from these existing boundaries:

- `packages/schema/src/index.ts`
  - `SamplerSchema.sample` is one `string`.
  - `SamplerSchema.sourceKeys` is one `number[]`.
  - Numeric static patterns use `StaticSchema` and `StaticSchemaValue`; those types must remain numeric.
- `packages/fluid/src/index.ts`
  - `Drome.sample(nameOrToken: string, variation?: number)` requires a scalar string.
  - Scalar `"name:variation"` parsing happens only in this constructor.
- `packages/fluid/src/instruments/sampler.ts`
  - The sampler stores one `_sample: string` and one `_variation: Parameter`.
  - `_explicitNotes` only records `.notes()`; inherited rhythm and transform methods do not record semantic onset intent.
  - Chop and generated fit notes already have dedicated precedence branches.
  - Generated notes use the fixed sample's lowest `sourceKeys` value.
- `packages/fluid/src/instruments/sampler-utils.ts`
  - Numeric geometry-copying helpers already exist for chop and fit.
  - `getSourceKeys()` resolves one bank/sample pair and falls back to `[0]` with a warning.
- `packages/patterns`
  - `PatternCycle<T>` is internally generic, but its public static schema serializers are intentionally numeric.
  - Sample-name patterns should not weaken those numeric schema types or require a general pattern-language redesign.
- `packages/audio-engine/src/instruments/sampler.ts`
  - `resolveNoteEvents()` already supplies `hitIndex`, `gridStepIndex`, offsets, durations, and grouped chord voices.
  - Variation, region, gain, detune, and effects are already hit-addressed.
  - The runtime resolves source key before variation and is currently bound to one schema-level sample name.
  - `scheduleBar()` currently returns early when the fixed sample's initial buffer is unavailable.
- `packages/audio-engine/src/instruments/sample-buffer-store.ts`
  - One store is bound to one bank/sample pair.
  - Its local key is currently `sourceKey + variation`.
  - The shared engine cache already deduplicates fetch/decode work by URL.
  - Fallback-buffer reuse already checks bank/sample identity.
- `packages/audio-engine/src/index.ts`
  - `prepare()` preloads `sourceKeys × statically knowable variations` for one fixed sample.
  - Hot-swap fallback is selected by instrument position and delegated to the previous sampler.
- Existing sampler tests already cover hit-based masks, failed intended hits, source-key selection, variation fallback, sprites, regions, chop, fit, loop, clip modes, reverse/alternate direction, cache deduplication, and generated multi-bar fit/chop behavior.
- No production visualizer or demo currently reads `SamplerSchema.sample` or `sourceKeys` directly. Engine and Fluid fixtures are the main atomic schema consumers, but a workspace-wide search and typecheck is still required in PR 2.

## Key design decisions

### Onset authority stays in Fluid

Fluid decides which schema supplies implicit note geometry. The audio engine remains a policy-free consumer of `notes`, sample-name values, and other event lanes.

Do not serialize an onset-authority enum or explicit-intent flags.

### Explicit intent is semantic, not inferred from geometry length

The Fluid sampler will track these independently:

- explicitly authored notes;
- explicitly authored onset/rhythm intent;
- explicitly authored variation;
- explicitly authored sample name.

The constructor's internal default variation `0` is not explicit variation intent. A required scalar sample constructor establishes identity but is not explicit name-pattern onset intent.

Calling an onset or rhythm method is explicit intent even when it leaves the default one-step geometry apparently unchanged. Do not implement precedence by comparing cycle lengths before and after a call.

### Preserve existing chop and fit composition

Existing chop and fit branches remain stronger than name and variation fallback geometry. Their generated timing, authored sequence behavior, region behavior, and fit-rate semantics must not be rewritten around the new identity lanes.

A configured `.fit()` blocks name- or variation-derived retriggers even when an explicit region suppresses fit's generated default chop region.

### Sample names get a dedicated typed static schema

PR 2 will add a string-safe `SampleNameSchema`; it will not put strings into numeric `StaticSchema`, use a numeric indirection table, or cast through `any`.

The canonical shape is:

```ts
interface SampleNameSchemaValue {
  value: string;
  offset: number;
  duration: number;
  stepIndex: number;
}

interface SampleNameSchema {
  type: "static";
  cycle: SampleNameSchemaValue[][];
}
```

Fixed and patterned names use this one representation. Do not retain `string | SampleNameSchema` after migration.

### Sample-name parsing is local and static

Fluid should use a small dedicated sample-name pattern builder rather than redesigning `@web-audio/patterns`. It owns:

- one-bar array versus multi-bar variadic syntax;
- evenly distributed static geometry;
- string validation;
- canonical `SampleNameSchema` serialization.

Random sample names remain unsupported.

### Runtime sample-name resolution is hit-based

The engine resolves a name using `(barIndex, hitIndex)`. Name-bar wrapping and value wrapping are independent from notes and variation. The numeric `_resolve()` API remains numeric; use a typed static-name resolver rather than widening it to return `number | string`.

### Buffer identity includes sample name

The runtime store remains scoped to one bank but becomes capable of holding multiple sample names. Every local playback identity includes:

```txt
sample name + source key + requested variation
```

The existing shared URL cache remains URL-keyed so files and sprites shared across names still fetch and decode once.

### Fallback buffers never cross sample names

A hot-swap fallback may continue to bridge loading for the same bank and initial resolved sample name. It must never be exposed under another name merely because source key and variation match.

### Missing one name must not suppress other names

Once names vary by hit, sampler readiness cannot be a bar-wide gate based only on the initial identity. Playback lookup and failure handling must happen per intended hit so one unavailable name does not prevent later names in the bar from playing or alter their hit indices.

`isReady()` may continue to report readiness of the initial identity for lifecycle/tests, but `scheduleBar()` must not return early solely because that identity is unavailable.

### Preloading is conservative

For a static name pattern, preload the Cartesian product of:

- every distinct referenced name;
- every source key recorded for that name;
- every statically knowable variation index under existing variation-preload rules.

Deduplicate network work by URL, not by logical identity.

## PR boundaries

### PR 1 — Variation-derived implicit onsets

Includes:

- explicit variation-intent tracking;
- explicit onset-intent tracking for sampler note/rhythm APIs;
- variation-schema geometry copied into fallback notes;
- static and random variation geometry;
- precedence, call-order, regression, documentation, and verification coverage.

Does not include:

- public schema changes;
- `.name()`;
- optional or array sample constructors;
- multi-name source keys or buffer storage;
- engine scheduler changes.

### PR 2 — Patternable sample names

Includes:

- `SampleNameSchema` and per-name `sourceKeys`;
- `.name()` and new constructor forms;
- name validation and precedence;
- per-name generated notes when name is onset authority;
- engine name resolution, source-key lookup, storage, preloading, fallback safety, and playback integration;
- atomic migration of schema consumers, fixtures, docs, and examples.

PR 2 begins only after PR 1 is merged or rebased as its baseline.

---

# PR 1 — Variation-derived implicit onsets

## Phase 1 — Lock onset-authority intent

Tracer bullet: the Fluid sampler can distinguish its default identity pattern from user-authored variation and can recognize explicit rhythmic intent without counting generated steps.

### Step 1.1 — Characterize current default and explicit geometry

**Files:**

- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`

Add focused pre-change characterization for:

- `d.sample("bd")` producing one default note;
- `.var([0, 1, 2, 3])` currently retaining one default note;
- `.notes([0, 0, 0])` producing three source events;
- `.euclid()`, `.xox()`, `.hex()`, and `.sequence()` preserving their current masks and timing;
- `.fast()`, `.slow()`, `.stretch()`, and `.reverse()` preserving current transformed geometry;
- chop-generated and fit-generated notes;
- fit combined with explicit region or explicit notes;
- patterned gain, detune, start/end/duration, envelopes, and effects not affecting note geometry.

Keep geometry assertions separate from variation-value assertions. The production change should alter only eligible implicit note geometry.

**Acceptance criteria:**

- [ ] The old one-note variation behavior is captured before changing it.
- [ ] Existing explicit rhythm, chop, and fit geometry has regression ownership.
- [ ] Non-onset parameter patterns are covered as non-authoritative.
- [ ] Static and random variation fixtures expose their complete geometry.

### Step 1.2 — Track explicit variation intent

**Files:**

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/index.ts`
- corresponding Fluid tests

Add a private explicit-variation flag that is set by public `.variation()` and `.var()` calls. Construct the internal default `Parameter(0)` without setting it.

The existing constructor forms that explicitly provide variation must continue to call the public variation path and therefore count as explicit variation intent:

```ts
d.sample("bd", 1);
d.sample("bd:1");
```

Their one-step geometry remains one event, but their intent is semantically explicit.

**Acceptance criteria:**

- [ ] Default variation `0` does not establish fallback onset authority.
- [ ] `.variation()` and `.var()` establish explicit variation intent.
- [ ] Scalar constructor variation forms retain equivalent schemas.
- [ ] No explicit-intent field appears in public schema.

### Step 1.3 — Track explicit onset intent across inherited APIs

**Files:**

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/instrument.test.ts`

Keep `_explicitNotes` for existing chop/fit distinctions, and add a separate sampler-level onset-intent flag.

Override the inherited APIs that semantically author or transform onset geometry and delegate to `super` with unchanged inputs:

- `notes()`;
- `euclid()`;
- `xox()`;
- `hex()`;
- `sequence()`;
- `fast()`;
- `slow()`;
- `stretch()`;
- `reverse()`.

`chop()` and `fit()` are already explicit stronger authorities through their own state and branches; they may share a private authority predicate rather than relying only on the flag.

Do not mark these as onset intent:

- `root()` or `scale()`;
- gain, ADSR, detune, region, direction, loop, clip, effects, routing, or sends.

The flag is monotonic for the sampler builder. It records authored intent and is not cleared merely because a later call replaces cycle content.

**Acceptance criteria:**

- [ ] Every precedence-listed rhythm or transform method establishes explicit onset intent.
- [ ] A rhythm method counts even when applied to a one-step default pattern.
- [ ] Value-only methods do not establish onset intent.
- [ ] Existing method return values and chaining types are preserved.
- [ ] Existing `_explicitNotes`-dependent chop and fit behavior remains distinct from general rhythm intent.

## Phase 2 — Derive fallback notes from variation geometry

Tracer bullet: an explicit variation pattern creates matching sampler events only when no stronger onset authority exists.

### Step 2.1 — Add a geometry-copying note helper

**Files:**

- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/index.test.ts`

Add a typed helper that derives a numeric note schema from a variation `ParameterSchema` and one generated note value.

For static variation:

- preserve every bar;
- preserve every step's `offset`, `duration`, and grid `stepIndex`;
- replace only `value` with the generated note value;
- retain empty bars if the source schema can represent them.

For random variation:

- copy geometry from `variation.grid`;
- replace grid values with the generated note value;
- do not copy random variation state into notes;
- do not treat random zero values as note rests, because the grid describes candidate event geometry rather than resolved variation values.

Do not mutate the variation schema.

**Acceptance criteria:**

- [ ] Static one-bar geometry is copied exactly apart from note value.
- [ ] Static multi-bar geometry and empty bars are preserved.
- [ ] Random variation uses `grid` geometry.
- [ ] Random default one-step grids remain one event per bar.
- [ ] Input schemas are not mutated.

### Step 2.2 — Apply the precedence predicate during note generation

**Files:**

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/index.test.ts`

Refactor `_getNotes()` around an explicit authority order without disturbing existing chop and fit branches:

1. Preserve current chop note-generation and authored chop timing behavior.
2. Preserve current generated-fit note behavior.
3. If explicit notes/rhythm intent exists, use the authored `_cycle` schema.
4. If `.fit()` is configured but its generated defaults are suppressed by explicit notes/region/chop composition, still block variation-derived retriggers.
5. Otherwise, if variation was explicitly authored, derive notes from variation geometry.
6. Otherwise use the current one-note default.

The generated note value is:

```ts
sourceKeys[0] ?? 0;
```

Do not replace or rewrite `this._cycle.getMask()`. A final explicit mask remains the onset filter, and runtime variation lookup remains hit-based.

**Acceptance criteria:**

- [ ] `.var([0, 1, 2, 3])` serializes four evenly distributed note events.
- [ ] `.var(0, 1, 2, 3)` serializes four one-event bars.
- [ ] Static offsets, durations, bar count, and `stepIndex` values match variation geometry.
- [ ] Random variation serializes note geometry from its grid.
- [ ] Pitched multisamples use their lowest source key for generated notes.
- [ ] The default variation still yields one default note.
- [ ] Existing masks remain attached to `NotesSchema.mask`.

### Step 2.3 — Prove precedence and call-order invariance

**Files:**

- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`

Add paired call-order tests and explicit event-count/timing assertions for:

```ts
d.sample("bd").notes([0, 0]).var([0, 1, 2, 3]);
d.sample("bd").var([0, 1, 2, 3]).notes([0, 0]);

d.sample("bd").euclid(2, 4).var([0, 1, 2, 3]);
d.sample("bd").var([0, 1, 2, 3]).euclid(2, 4);
```

Cover each stronger category selectively:

- explicit static and random notes;
- Euclidean, XOX, hex, and sequence rhythm;
- fast/slow/stretch/reverse intent;
- authored and generated chop;
- generated fit;
- fit with explicit region;
- fit with explicit notes.

Also assert that gain, detune, regions without fit, duration, envelopes, and effects do not create events.

For sparse masks, assert both:

- original mask offsets and grid `stepIndex` values;
- runtime expectation that variation values advance by active hit, already owned by audio-engine tests.

**Acceptance criteria:**

- [ ] Explicit notes and variation are call-order independent.
- [ ] Explicit rhythm and variation are call-order independent.
- [ ] Every precedence-listed stronger authority blocks variation-derived event counts.
- [ ] `fit()` never gains variation-derived retriggers.
- [ ] Non-onset value patterns remain non-authoritative.

## Phase 3 — PR 1 integration, documentation, and closeout

### Step 3.1 — Add end-to-end Fluid schema cases

**Files:**

- `packages/fluid/src/index.test.ts`
- audio-engine tests only if a missing regression is discovered; no production engine changes expected

Use full Drome schemas, not only private sampler state, to cover:

- static one-bar variation;
- static multi-bar variation;
- random variation with explicit steps;
- random variation with default grid;
- user-bank pitched multisamples;
- explicit masks over variation-derived notes;
- static variation preloading remaining unchanged.

Confirm no public schema field changes and no synth schema changes.

**Acceptance criteria:**

- [ ] Variation-derived notes survive `push()` and `Drome.getSchema()` unchanged.
- [ ] Existing audio engine scheduling consumes the generated notes without policy changes.
- [ ] Existing static variation preload tests continue to pass.
- [ ] Synth schemas are byte-for-byte unaffected in representative fixtures.

### Step 3.2 — Document variation onset authority

**Files:**

- `docs/concepts/patterns.md`
- `docs/concepts/glossary.md`
- `packages/fluid/README.md`

Document:

- variation may provide implicit sampler onset geometry;
- `[0, 1, 2, 3]` means four steps in one bar;
- `0, 1, 2, 3` means one step in each of four bars;
- explicit notes/rhythm, chop, and fit retain precedence;
- precedence is independent of call order;
- gain, detune, regions, envelopes, and effects do not create onsets;
- masks preserve timing while surviving hits advance variation values.

Do not document `.name()` or array sample constructors as available until PR 2.

**Acceptance criteria:**

- [ ] Public examples explain the intentional behavior change for variation-only samplers.
- [ ] The stronger-onset hierarchy is visible to users.
- [ ] Bar syntax and hit-based variation advancement are not conflated.
- [ ] PR 2 features are not presented as shipped.

### Step 3.3 — Verify PR 1

Run:

```sh
pnpm --filter @web-audio/schema check
pnpm --filter @web-audio/schema lint
pnpm --filter @web-audio/schema test:ci

pnpm --filter @web-audio/patterns check
pnpm --filter @web-audio/patterns lint
pnpm --filter @web-audio/patterns test:ci

pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/fluid test:ci

pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine test:ci

git diff --check
```

Then run workspace verification:

```sh
pnpm check
pnpm lint
pnpm test
pnpm format
git diff --check
```

Do not run a development server or browser without permission.

**Acceptance criteria:**

- [ ] Focused package checks pass.
- [ ] Workspace checks pass.
- [ ] Formatting and `git diff --check` pass.
- [ ] The PR contains no schema or engine production changes.
- [ ] Any manual review confirms changed event counts only for eligible explicit variation patterns.

---

# PR 2 — Patternable sample names

## Phase 4 — Introduce the canonical sample-name schema and API

Tracer bullet: Fluid can represent fixed and patterned sample names with one typed schema while preserving every existing scalar constructor form.

### Step 4.1 — Add typed sample-name schema fields

**Files:**

- `packages/schema/src/index.ts`
- schema test/type fixtures if useful

Add and export:

- `SampleNameSchemaValue`;
- `SampleNameSchema`.

Migrate `SamplerSchema` atomically:

```ts
sample: SampleNameSchema;
sourceKeys: Record<string, number[]>;
```

Keep numeric `StaticSchemaValue` unchanged. `SampleNameSchema` is static only and does not include `RandomSchema` or an untyped numeric value map.

Do not add a compatibility union.

**Acceptance criteria:**

- [ ] Fixed and patterned names have one canonical public representation.
- [ ] Sample-name values remain statically typed as strings.
- [ ] Numeric pattern schemas remain numeric.
- [ ] `SamplerSchema.sourceKeys` is keyed by authored sample name.
- [ ] Schema exports compile without `any` casts.

### Step 4.2 — Add a dedicated Fluid sample-name pattern builder

**Files:**

- new focused file such as `packages/fluid/src/patterns/sample-names.ts`
- focused tests or `packages/fluid/src/index.test.ts`
- `packages/fluid/src/types.ts`

Define the public input shape conceptually as:

```ts
type SampleNameInput = (string | string[])[];
```

The builder must serialize:

```ts
name(["bd", "sd"]); // one bar, two steps
name("bd", "sd"); // two bars, one step each
```

For every bar:

- distribute steps evenly across one bar;
- set `offset`, `duration`, and bar-local `stepIndex` deterministically;
- preserve authored string values exactly;
- return a fresh schema without exposing mutable internal arrays.

Keep this implementation local to Fluid. Do not widen `ValueCycle`, `StaticSchema`, or `@web-audio/patterns` exports solely for string serialization.

**Acceptance criteria:**

- [ ] One-bar and multi-bar syntax serialize correctly.
- [ ] Duplicate names are preserved in the value pattern.
- [ ] Geometry uses bar-local step indices.
- [ ] No random-name input is accepted.
- [ ] No numeric schema type is weakened.

### Step 4.3 — Add `.name()` and constructor overloads

**Files:**

- `packages/fluid/src/index.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/types.ts`
- `packages/fluid/src/index.test.ts`

Add typed overloads for:

```ts
d.sample();
d.sample("bd");
d.sample("bd", 1);
d.sample("bd:1");
d.sample(["bd", "sd"]);
```

Add:

```ts
name(...input: SampleNameInput): this;
```

Rules:

- a scalar constructor creates a one-step fixed-name schema but does not mark name-pattern onset intent;
- an array constructor delegates to the explicit name-pattern path;
- `.name()` replaces prior name selection and marks explicit name intent;
- scalar constructor colon parsing remains unchanged;
- `.name()` and array names treat colons literally;
- `d.sample()` is allowed as a builder but must have a valid eventual name before schema generation.

Use overloads and narrowing rather than broad casts.

**Acceptance criteria:**

- [ ] Existing scalar constructor source remains valid.
- [ ] Array constructor and `.name(array)` are schema-equivalent.
- [ ] `.name()` is fluent and last-write-wins for name values.
- [ ] Colon shorthand applies only to the scalar constructor.
- [ ] Calling `d.sample()` without a later valid name throws during schema generation.
- [ ] Synthesizer APIs are unchanged.

### Step 4.4 — Validate authored names

**Files:**

- sample-name builder/validation module
- `packages/fluid/src/index.test.ts`

Reject with sampler-specific errors:

- `.name()` with no values;
- an empty array bar;
- an empty string;
- a whitespace-only string;
- malformed runtime input outside `string | string[]` bars;
- `d.sample()` with no eventual name.

Do not trim accepted names. For example, `" bd "` remains exactly `" bd "` and will follow normal missing-sample warning behavior rather than silently resolving `"bd"`.

Validation may happen when `.name()` is authored, except the intentionally incomplete `d.sample()` builder must be rejected by `getSchema()` if never completed.

**Acceptance criteria:**

- [ ] Every invalid shape has a clear deterministic error.
- [ ] Valid names preserve exact authored bytes.
- [ ] Missing-but-well-formed names warn rather than throw.
- [ ] Validation does not normalize lookup keys.

## Phase 5 — Implement Fluid name precedence and per-name source metadata

Tracer bullet: name patterns select implicit geometry and natural generated notes when eligible, while stronger onset sources continue to win.

### Step 5.1 — Collect distinct names and source keys

**Files:**

- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/index.test.ts`

Replace the fixed source-key lookup with a helper that:

1. reads all values in `SampleNameSchema.cycle`;
2. deduplicates names while preserving deterministic first-seen order for work and warnings;
3. resolves sorted source keys for each distinct name in the selected bank;
4. emits `[0]` for each missing bank/name under existing warning semantics;
5. returns `Record<string, number[]>`.

Duplicate name steps must not duplicate bank lookup work or warnings.

A missing bank may produce one bank-level warning rather than repeating it for every name, but every returned name must still have a `[0]` entry.

**Acceptance criteria:**

- [ ] Every distinct referenced name has a source-key entry.
- [ ] Mixed unpitched and pitched names retain independent key lists.
- [ ] Source keys remain numerically sorted.
- [ ] Duplicate names do not duplicate work or warnings.
- [ ] Missing names retain resilient `[0]` fallback behavior.

### Step 5.2 — Derive notes from name geometry when name is authoritative

**Files:**

- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/index.test.ts`

Add a typed name-to-note geometry mapper. For each sample-name step, preserve its bar, offset, duration, and `stepIndex`, and set:

```ts
value: sourceKeys[name]?.[0] ?? 0;
```

Apply complete onset precedence:

1. existing explicit/generated notes, rhythm, chop, or fit;
2. explicit name pattern;
3. explicit variation pattern;
4. default one event per bar.

When stronger onset geometry exists, do not replace it with name geometry. Name remains an independently resolved value lane at runtime.

When variation is authoritative under a fixed scalar name, obtain its generated note value from that fixed name's source-key entry.

Keep existing generated chop/fit note behavior based on the initial/fixed fallback identity; do not make lower-priority name values rewrite stronger generated geometry in this PR.

**Acceptance criteria:**

- [ ] Mixed name patterns generate per-step natural source notes when name is authoritative.
- [ ] Name geometry wins over variation geometry regardless of call order.
- [ ] Explicit notes/rhythm win over name geometry regardless of call order.
- [ ] Chop and fit event counts remain unchanged.
- [ ] Variation fallback from PR 1 remains active when no explicit name pattern exists.
- [ ] Masks remain separate and preserve grid timing.

### Step 5.3 — Lock the Fluid precedence matrix

**Files:**

- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`

Cover at least:

| Stronger geometry | Name pattern | Variation pattern | Expected geometry     |
| ----------------- | ------------ | ----------------- | --------------------- |
| none              | none         | none              | one default event     |
| none              | none         | 4 steps           | 4 variation steps     |
| none              | 2 steps      | 4 steps           | 2 name steps          |
| none              | 4 steps      | 2 steps           | 4 name steps          |
| 3 explicit notes  | 4 steps      | 2 steps           | 3 note steps          |
| Euclid 2/4        | 4 steps      | 4 steps           | Euclidean mask timing |
| chop 8            | 4 steps      | 4 steps           | existing chop timing  |
| fit 2             | 4 steps      | 4 steps           | existing fit timing   |

For every relevant pair, test both method orders.

Also cover:

- scalar `.name("sd")` establishing one-event name precedence;
- scalar constructor name not blocking variation fallback;
- array constructor establishing name precedence;
- random variation remaining a lower-priority value lane under explicit name.

**Acceptance criteria:**

- [ ] The hierarchy is proven without a longest-pattern rule.
- [ ] Call order does not affect selected geometry.
- [ ] Constructor intent distinctions are explicit in tests.
- [ ] Multi-bar name and variation geometry retain their own bar counts.

## Phase 6 — Migrate buffer storage and preloading to multi-name identity

Tracer bullet: every referenced sample identity can be prepared and retrieved without sacrificing URL deduplication or hot-swap safety.

### Step 6.1 — Refactor `SampleBufferStore` identity

**Files:**

- `packages/audio-engine/src/instruments/sample-buffer-store.ts`
- `packages/audio-engine/src/instruments/sample-buffer-store.test.ts`

Keep the store scoped to one bank, but remove its fixed sample-name binding. Introduce a typed logical target/identity carrying:

```ts
{
  sample: string;
  sourceKey: number;
  variationIndex: number;
}
```

Update:

- local buffer keys to include sample name;
- entry and URL resolution to receive sample name;
- playback-buffer and playback-source lookup to receive sample name;
- warning messages to identify the resolved name;
- preload input to accept all required logical targets;
- initial/fallback identity bookkeeping to include the initial sample name.

Do not change the engine-wide resolved/promise caches from URL keys.

**Acceptance criteria:**

- [ ] Two names with the same source key/variation cannot collide locally.
- [ ] Two logical identities with one URL share one fetch/decode promise.
- [ ] Variation `0` fallback occurs within the resolved name and source key.
- [ ] Reverse preparation covers every loaded logical target.
- [ ] Existing fixed-name store behavior remains covered through one-name targets.

### Step 6.2 — Protect fallback identity across schema replacement

**Files:**

- `packages/audio-engine/src/instruments/sample-buffer-store.ts`
- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/index.ts`
- corresponding store, sampler, and engine tests

Resolve the initial sample name at `(barIndex: 0, hitIndex: 0)` for initial readiness and hot-swap fallback matching.

Requirements:

- previous and next samplers must have the same bank and initial resolved sample name before a fallback is offered;
- a fallback is exposed only through the new store's initial identity;
- later patterned names never receive that fallback;
- existing temporary fallback behavior for the same sample name remains intact even if requested variation changes;
- patterned schemas with different initial names do not reuse the old buffer.

**Acceptance criteria:**

- [ ] Same-name hot swaps can still use a fallback.
- [ ] Different-name hot swaps cannot reuse it.
- [ ] A later hit with another name cannot receive the initial fallback.
- [ ] Source-key/variation equality alone is insufficient for fallback matching.

### Step 6.3 — Centralize conservative preload targets

**Files:**

- a focused utility such as `packages/audio-engine/src/utils/sampler-preload.ts`
- `packages/audio-engine/src/utils/preload-variations.ts`
- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/index.ts`
- `packages/audio-engine/src/engine.test.ts`
- `packages/audio-engine/src/instruments/sample-buffer-store.test.ts`

Build one target enumerator from `SamplerSchema`:

```txt
Object.entries(sourceKeys)
× preloadVariationIndices(schema)
```

Use it in both:

- `AudioEngine.prepare()` URL discovery;
- runtime `Sampler.load()` store population.

Preserve existing `preloadVariationIndices()` rules for static patterns, random value maps, bounded integer ranges, and initial values. Name patterning does not broaden unknown random-variation preloading.

**Acceptance criteria:**

- [ ] Every name/source-key/known-variation target is enumerated.
- [ ] Duplicate names do not create duplicate logical targets.
- [ ] Shared file and sprite URLs fetch and decode once.
- [ ] Out-of-range known variations still preload their resolved variation-0 URL.
- [ ] Forward-only samplers avoid reverse-buffer work.
- [ ] Reverse/alternate samplers prepare every loaded buffer for reverse playback.

### Step 6.4 — Remove initial-name bar gating

**Files:**

- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/instruments/sample-buffer-store.test.ts`

Stop returning from `scheduleBar()` solely because the initial identity is unavailable. Resolve each intended hit and let store lookup independently play, lazy-load, warn, or skip its current name.

Keep:

- `isReady()` as an initial-identity readiness signal if still useful;
- hit assignment before lookup failure;
- alternate direction advancing only after successful voice emission;
- URL promise deduplication for repeated misses while loading.

Update fixed-name warning tests only as required by the move from a bar-level readiness warning to per-identity playback warnings. Do not add a policy that suppresses valid later names.

**Acceptance criteria:**

- [ ] A missing first name does not suppress a loaded second name.
- [ ] A missing middle name does not shift later name/variation values.
- [ ] Lazy loading remains deduplicated.
- [ ] Alternate direction remains success-based.
- [ ] Fixed-name loading and skip behavior remains understandable and covered.

## Phase 7 — Resolve patterned names during sampler scheduling

Tracer bullet: every intended hit resolves name, source key, variation, entry, and playback modes in the specified order.

### Step 7.1 — Add a typed static sample-name resolver

**Files:**

- a focused internal helper or `packages/audio-engine/src/instruments/sampler.ts`
- focused helper tests or sampler tests

Resolve `SampleNameSchema` by:

1. wrapping `barIndex` by `cycle.length`;
2. selecting that name bar;
3. wrapping `hitIndex` by the selected bar's value count;
4. returning the authored string unchanged.

Do not route names through numeric `_resolve()` or `RandomResolver`.

Fluid validation guarantees non-empty cycles and bars, but the helper should either fail clearly for malformed direct schemas or rely on a narrow schema-boundary invariant documented in code; do not silently return an unrelated name.

**Acceptance criteria:**

- [ ] Name bars and per-bar values wrap independently.
- [ ] Sparse grid `stepIndex` values do not affect name lookup.
- [ ] Names are not trimmed or normalized.
- [ ] Numeric resolver types remain unchanged.

### Step 7.2 — Reorder sampler identity resolution

**Files:**

- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

For each `ResolvedNoteEvent`, resolve once per onset:

```txt
sample name at barIndex + hitIndex
→ source-key list for that name
→ nearest source key for each note voice
→ variation at barIndex + hitIndex
→ sample entry and buffer for name/key/variation
→ region or chop window
→ pitch and fit rates
→ voice scheduling
```

Requirements:

- all chord voices share the resolved name and variation because they share one hit;
- each chord voice may choose a different nearest source key from that name's key list;
- missing `sourceKeys[name]` defensively falls back to `[0]` without mutating schema;
- variation fallback remains delegated to sample-entry resolution;
- regions, chop, gain, detune, and effects retain the event's original hit context;
- grid offsets and durations remain untouched.

Refactor `_nearestSourceKey()` to accept the resolved key list. It must handle the defensive `[0]` fallback rather than reducing an empty array.

**Acceptance criteria:**

- [ ] A four-step name pattern schedules the four expected names.
- [ ] Explicit three-step notes consume only the first three name values.
- [ ] Name and variation patterns wrap independently.
- [ ] Chords share name/variation while retaining per-voice pitch selection.
- [ ] Event timing remains owned by resolved note geometry.

### Step 7.3 — Cover masks, multi-bar cycles, and failed hits

**Files:**

- `packages/audio-engine/src/instruments/sampler.test.ts`

Add deterministic runtime cases for:

- Euclidean/static sparse masks: grid positions `0` and `2` use names `0` and `1`;
- random-mask misses not consuming names or variations;
- name bars and variation bars with different cycle lengths;
- per-bar hit indices restarting while bar selection continues;
- a missing name before a valid name;
- an invalid region or unavailable reverse buffer between valid names;
- out-of-range variation falling back within the currently resolved name;
- alternate direction across changing names and failures.

Assert buffers or entry windows, start times, playback rates, and parameter values—not only source counts.

**Acceptance criteria:**

- [ ] Rests and mask misses consume neither names nor variations.
- [ ] Failed intended hits retain their assigned hit indices.
- [ ] Later names and variations do not slide backward after failure.
- [ ] Out-of-range fallback cannot cross into another name.
- [ ] Alternate direction changes only after successful emission.

### Step 7.4 — Compose names with every sampler playback family

**Files:**

- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/instruments/sample-buffer-store.test.ts`

Use a selective matrix rather than duplicating every existing test:

| Sample family        | Required patterned-name assertion                         |
| -------------------- | --------------------------------------------------------- |
| File samples         | Different names select different files                    |
| Sprite names         | Different names select different windows in a shared file |
| Pitched multisamples | Each name uses its own nearest source-key list            |
| Pitched sprites      | Name, source key, and sprite entry compose correctly      |
| Static region        | Region is applied inside the resolved name's entry        |
| Duration region      | Duration is relative to the resolved entry                |
| Chop                 | Slice is applied after name/entry selection               |
| Fit                  | Rate uses the current resolved source window duration     |
| Loop                 | Loop points belong to the current source window           |
| Clipped/one-shot     | Duration policy uses the current source                   |
| Reverse/alternate    | Reversed buffer belongs to the current name               |

Include at least one case where names have different source durations so fit-rate correctness cannot pass accidentally.

**Acceptance criteria:**

- [ ] Every playback family uses the currently resolved name.
- [ ] Shared URLs still deduplicate while sprite metadata remains name-specific.
- [ ] Fit rates can differ by resolved name without changing event count.
- [ ] Loop, clip, region, chop, and direction behavior retain existing semantics.

## Phase 8 — Atomic schema-consumer migration and integration hardening

Tracer bullet: no fixed-string sampler assumptions remain in production or fixtures, and Fluid-to-engine tests exercise the complete canonical schema.

### Step 8.1 — Migrate all schema fixtures and direct consumers

**Files:**

- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/instruments/sample-buffer-store.test.ts`
- `packages/audio-engine/src/engine.test.ts`
- any additional files found by workspace search

Replace fixed fixture fields:

```ts
sample: "bd";
sourceKeys: [0];
```

with canonical one-step name schema and per-name source-key records.

Add small fixture helpers to keep large test files readable, but ensure tests that inspect serialized shape still assert the full canonical representation.

Search for and migrate:

- `schema.sample` string assumptions;
- direct `sourceKeys` array loops or mutation;
- fallback matching by fixed sample;
- warning strings that capture a constructor-bound name;
- fixtures constructing `SamplerSchema` manually.

Do not hide migration gaps with `as never`, `as any`, or a compatibility union.

**Acceptance criteria:**

- [ ] Every production consumer compiles against canonical name schemas.
- [ ] Manual sampler fixtures use the new shape.
- [ ] No permanent string/schema union remains.
- [ ] No `sourceKeys` array assumption remains on `SamplerSchema`.
- [ ] Workspace search finds no stale fixed-name access in sampler production paths.

### Step 8.2 — Add Fluid-to-engine integration coverage

**Files:**

- `packages/fluid/src/index.test.ts`
- `packages/audio-engine/src/engine.test.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

Cover complete schemas produced from representative Fluid snippets:

```ts
d.sample(["bd", "sd", "bd", "sd"]);
d.sample().name("bd", "sd");
d.sample().name(["bd", "piano"]).var([0, 1]).euclid(2, 4);
d.sample().name(["loopA", "loopB"]).fit(2);
```

At least one integration case should pass Fluid's emitted sample-name schema, source-key map, banks, notes, and variation through actual engine sampler scheduling rather than rebuilding an equivalent test schema by hand.

**Acceptance criteria:**

- [ ] Constructor and `.name()` paths round-trip through `Drome.getSchema()`.
- [ ] The engine consumes the exact emitted schema shape.
- [ ] Mixed name/source-key metadata survives graph cloning and commit.
- [ ] End-to-end tests assert selected buffers and timing.

### Step 8.3 — Run a stale-assumption audit

**Files:** all changed production, tests, docs, and plans

Search for:

- `sample: string` in sampler schema declarations;
- `schema.sample` used as a scalar;
- `sourceKeys: number[]` on samplers;
- loops directly over `schema.sourceKeys`;
- sample buffer keys missing sample name;
- sample lookup before runtime name resolution;
- name lookup using `gridStepIndex` or serialized `stepIndex`;
- `string | SampleNameSchema` compatibility unions;
- string schemas cast through numeric `StaticSchema`;
- comments describing variation as the only sampler identity lane.

Record any intentional remaining scalar sample argument, such as `resolveSampleEntry({ sample })`, as a resolved runtime lookup key rather than schema-level fixed identity.

**Acceptance criteria:**

- [ ] Every remaining scalar `sample` value is local resolved identity, not stale schema policy.
- [ ] Name values resolve only from hit index.
- [ ] Buffer keys include name.
- [ ] Public string type safety is intact.
- [ ] `git diff --check` passes.

## Phase 9 — Documentation, compatibility, and closeout

### Step 9.1 — Document patterned names and precedence

**Files:**

- `docs/concepts/patterns.md`
- `docs/concepts/glossary.md`
- `packages/fluid/README.md`
- `plans/sampler-patterning/spec.md` only if implementation uncovers a necessary clarification

Document:

- `.name()` one-bar and multi-bar syntax;
- `d.sample()` and array constructor forms;
- scalar colon shorthand remaining constructor-only;
- explicit onset over name over variation precedence;
- call-order independence;
- independent name and variation wrapping;
- masks consuming identity values by surviving hit;
- fixed bank scope with per-name source keys;
- missing-name warning behavior;
- random sample names remaining unsupported.

Update glossary entries to link sample name and variation back to the onset-authority explanation in public pattern docs.

Do not expose internal source-key maps as an API users need to manage manually.

**Acceptance criteria:**

- [ ] Every new constructor and `.name()` form has an example.
- [ ] The longest-pattern misconception is explicitly rejected.
- [ ] Sparse rhythm examples show names advancing by hit.
- [ ] Multi-bar wrapping is explained.
- [ ] Random-name selection is clearly out of scope.

### Step 9.2 — Verify PR 2

Run focused checks:

```sh
pnpm --filter @web-audio/schema check
pnpm --filter @web-audio/schema lint
pnpm --filter @web-audio/schema test:ci

pnpm --filter @web-audio/patterns check
pnpm --filter @web-audio/patterns lint
pnpm --filter @web-audio/patterns test:ci

pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/fluid test:ci

pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine test:ci

git diff --check
```

Then run workspace verification:

```sh
pnpm check
pnpm lint
pnpm test
pnpm format
git diff --check
```

The patterns package has no expected production change, but its checks guard numeric pattern/schema boundaries.

Do not run a development server or browser without permission.

**Acceptance criteria:**

- [ ] All focused checks pass.
- [ ] Workspace check, lint, tests, and formatting pass.
- [ ] `git diff --check` passes after formatting.
- [ ] No package relies on compatibility casts or stale schema unions.

### Step 9.3 — Manual compatibility review

With permission for manual playback, verify representative Fluid snippets for:

- variation-only implicit onsets from PR 1;
- one-bar and multi-bar name patterns;
- name-over-variation precedence in both call orders;
- Euclidean/XOX masks with name and variation patterns;
- mixed drum and pitched sample names;
- shared sprites;
- regions and duration regions;
- generated and authored chop;
- fit with names of different durations;
- loop, clipped, and one-shot playback;
- forward, reverse, and alternate direction;
- a missing name between valid names.

Record intentional audible changes separately from regressions:

- PR 1 intentionally adds events only for eligible explicit variation patterns.
- PR 2 intentionally changes sample identity per hit where names are patterned.
- Explicit onset timing, event count, and geometry must otherwise remain stable.

**Acceptance criteria:**

- [ ] Manual review confirms documented precedence.
- [ ] Sparse rhythms retain onset timing while names advance by hit.
- [ ] Missing names skip locally without shifting later identity values.
- [ ] Playback modes use the resolved name's source window.
- [ ] Any differences are explained by the two documented feature changes.

## Completion criteria

Sampler patterning is complete when:

- explicit variation supplies fallback onset geometry only when no stronger authority exists;
- explicit sample-name patterns outrank variation but not explicit/generated onset geometry;
- precedence is independent of method call order;
- fixed and patterned names share one canonical typed schema;
- scalar constructor compatibility and colon shorthand remain intact;
- name arrays and `.name()` support one-bar and multi-bar static cycles;
- invalid or missing authored names produce clear Fluid behavior;
- source keys are recorded per distinct name;
- the engine resolves name and variation independently by `(barIndex, hitIndex)`;
- rests and random-mask misses consume neither names nor variations;
- chords share identity values for one hit;
- buffer addressing includes sample name, source key, and variation;
- URL-level fetch/decode deduplication remains intact;
- preloading covers all names, their source keys, and statically knowable variations;
- fallback buffers never cross resolved sample names;
- missing or invalid playback does not renumber later intended hits;
- regions, chop, fit, loop, clip modes, pitch, reverse, and alternate direction all use the current resolved sample entry;
- synth behavior and non-identity onset policy remain unchanged;
- docs and examples describe the final onset hierarchy;
- focused and workspace verification pass.

## Recommended commit sequence

### PR 1

1. **Characterize variation and explicit onset geometry**
2. **Track sampler onset and variation intent**
3. **Derive notes from static/random variation geometry**
4. **Lock precedence and call-order regressions**
5. **Document variation-derived onsets and verify**

### PR 2

1. **Add canonical sample-name schema and Fluid pattern builder**
2. **Add `.name()` and constructor forms with validation**
3. **Implement name precedence and per-name source keys in Fluid**
4. **Refactor buffer identity and preload targets for multiple names**
5. **Resolve names in hit-based sampler scheduling**
6. **Harden masks, failures, playback modes, and fallback safety**
7. **Migrate all schema consumers and add end-to-end coverage**
8. **Document patterned names and verify the workspace**

Keep each PR independently green. In particular, do not begin the canonical schema migration in PR 1, and do not carry a transitional schema union through PR 2.
