# Sampler Patterning Implementation Plan — Plain-Language Version

## Context

Implement `plans/sampler-patterning/spec.md` in two pull requests that can ship separately:

1. **Let variation patterns create sampler events.** No public schema change.
2. **Let sample names be patterned.** One complete schema change.

Hit-based pattern lookup is already done. A sampler numbers only the notes that actually play. If a four-step rhythm plays on steps 1 and 3, those notes use hit numbers 0 and 1—not step numbers 0 and 2. The original step numbers stay in the pattern so masks and timing work, but later scheduling code does not receive them.

Do not add another event counter or use grid positions to choose event values.

Sampler timing follows this order:

```txt
explicit notes or rhythm, chop, or fit
> explicit sample-name pattern
> explicit variation pattern
> one default event per bar
```

After timing is chosen, masks remove events. The remaining events are numbered from zero within each bar. Notes, names, variations, and other changing values use those hit numbers.

Synthesizer behavior is out of scope.

## Audited current state

- `packages/schema/src/index.ts`
  - `SamplerSchema.sample` is one string.
  - `sourceKeys` is one number array.
  - Existing static pattern schemas are numeric and must stay numeric.
- `packages/fluid/src/index.ts`
  - `Drome.sample()` currently requires one name.
  - Only this constructor understands `"name:variation"`.
- `packages/fluid/src/instruments/sampler.ts`
  - The sampler stores one name and one variation pattern.
  - It records `.notes()`, but not every user-written rhythm choice.
  - Chop and fit already have stronger timing rules.
  - Generated notes use the fixed sample's lowest source key.
- `packages/fluid/src/instruments/sampler-utils.ts`
  - Helpers already copy timing for chop and fit.
  - Missing source-key lookup warns and returns `[0]`.
- `packages/patterns`
  - Internal pattern cycles are generic, but public static schemas are numeric.
  - Do not redesign this package for sample names.
- `packages/audio-engine/src/instruments/sampler.ts`
  - `resolveNoteEvents()` returns hit number, timing, and chord notes.
  - Variation, regions, gain, detune, and effects already use hit numbers.
  - Runtime lookup still assumes one sample name.
  - A missing initial buffer currently skips the whole bar.
- `packages/audio-engine/src/instruments/sample-buffer-store.ts`
  - One store is tied to one bank and sample name.
  - Its local key omits sample name.
  - Shared URL caches already prevent duplicate fetch and decode work.
  - Fallback reuse already checks bank and sample.
- `packages/audio-engine/src/index.ts`
  - `prepare()` preloads known source-key and variation combinations for one name.
  - Hot swaps may reuse a previous sampler's fallback buffer.
- Existing tests cover masks, failures, source keys, variation fallback, sprites, regions, chop, fit, looping, clip modes, direction, shared downloads, and multi-bar chop/fit.
- Fluid and audio-engine fixtures are the main schema users. PR 2 must still search and typecheck the whole workspace.

## Key design decisions

### Fluid chooses what creates events

Fluid chooses the pattern that supplies timing. The audio engine only schedules what Fluid provides. Do not add this choice to the public schema.

### Record what the user asked for

Do not infer intent from pattern length. Record whether the user explicitly wrote:

- notes;
- rhythm or timing;
- variation;
- sample names.

The built-in variation `0` is not explicit. A required single constructor name identifies the sample but is not an explicit name pattern. A rhythm method is explicit even if it leaves a one-step result.

### Keep current chop and fit behavior

Chop and fit stay ahead of names and variations. Keep their event counts, timing, regions, and playback rates. Calling `.fit()` must block name- or variation-created retriggers even when another region setting suppresses fit's normal generated region.

### Give sample names their own schema

PR 2 adds:

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

Use it for fixed and patterned names. Do not put strings in numeric schemas, cast through `any`, or keep a `string | SampleNameSchema` transition type.

### Build name patterns inside Fluid

Add a small Fluid helper for:

- one array as several steps in one bar;
- several arguments as one value in each bar;
- even spacing and string validation.

Random names are out of scope.

### Choose sample names by hit number

Resolve a name with `(barIndex, hitIndex)`. Name, note, and variation patterns wrap independently. Keep the numeric resolver numeric; add a typed name resolver.

### Include sample name in buffer identity

Keep one store per bank, but identify a loaded target by:

```txt
sample name + source key + requested variation
```

Keep shared download and decode caches keyed by URL.

### Never share fallback buffers between names

A hot-swap fallback may be reused only for the same bank and first resolved name. It must not appear under any other name.

### One missing name must not skip the whole bar

Check readiness per hit. A missing name must not stop later names or change their hit numbers. `isReady()` may still describe the first sample, but `scheduleBar()` must not use it to skip the bar.

### Preload everything known in advance

Preload every known combination of distinct name, source key, and variation. Deduplicate network work by URL.

## PR boundaries

### PR 1 — Variation-derived implicit onsets

Includes explicit-intent tracking, notes copied from static or random variation timing, priority tests, docs, and verification.

Does not include schema changes, `.name()`, new constructors, multi-name storage, or audio-engine production changes.

### PR 2 — Patternable sample names

Includes the name schema and API, validation, timing priority, per-name source keys, runtime name lookup, storage, preloading, fallbacks, playback, migration, docs, and tests.

Start PR 2 from the finished PR 1 baseline.

---

# PR 1 — Variation-derived implicit onsets

## Phase 1 — Record which timing the user wrote

Tracer bullet: Fluid can tell defaults apart from user-written variations and rhythms.

### Step 1.1 — Capture current behavior in tests

**Files:**

- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`

Capture current behavior for:

- one default note from `d.sample("bd")`;
- one note from `.var([0, 1, 2, 3])` before the change;
- explicit notes, Euclidean, XOX, hex, and sequence rhythms;
- fast, slow, stretch, and reverse;
- generated chop and fit notes;
- fit with explicit notes or regions;
- gain, detune, regions, envelopes, and effects not creating notes.

Test timing separately from variation values.

**Acceptance criteria:**

- [ ] Current variation-only behavior is captured before it changes.
- [ ] Existing rhythm, chop, and fit timing is protected.
- [ ] Value-only patterns are shown not to create events.

### Step 1.2 — Record explicit variation choices

**Files:**

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/index.ts`
- related Fluid tests

Add a private flag set by `.variation()` and `.var()`. The built-in `Parameter(0)` must not set it.

These constructor forms still count as explicit variation:

```ts
d.sample("bd", 1);
d.sample("bd:1");
```

**Acceptance criteria:**

- [ ] Built-in variation `0` is not explicit.
- [ ] Public variation calls and constructor variation forms are explicit.
- [ ] No intent flag appears in the public schema.

### Step 1.3 — Record explicit note and rhythm choices

**Files:**

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/instrument.test.ts`

Keep `_explicitNotes` for current chop/fit rules. Add a second private flag for user-written timing. Set it in overrides of:

- `notes()`;
- `euclid()`, `xox()`, `hex()`, and `sequence()`;
- `fast()`, `slow()`, `stretch()`, and `reverse()`.

Then call `super` unchanged. Do not set it for root, scale, gain, ADSR, detune, region, direction, loop, clip, effects, routing, or sends. Once set, it stays set.

**Acceptance criteria:**

- [ ] Every listed timing method sets the flag, even for a one-step result.
- [ ] Value-only methods do not set it.
- [ ] Chaining, types, and current chop/fit behavior stay intact.

## Phase 2 — Use variation timing when no stronger timing exists

Tracer bullet: variation creates events only when notes, rhythm, chop, and fit have not already chosen timing.

### Step 2.1 — Copy variation timing into generated notes

**Files:**

- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/index.test.ts`

Add a typed helper that copies bars, offsets, durations, and step numbers from a variation schema while replacing each value with one generated note.

For random variation, copy timing from `variation.grid`. Do not copy random state or treat variation value zero as a rest. Keep empty bars and do not mutate the input.

**Acceptance criteria:**

- [ ] Static one-bar, multi-bar, and empty-bar timing is copied.
- [ ] Random variation uses its grid.
- [ ] Inputs remain unchanged.

### Step 2.2 — Apply the timing priority in `_getNotes()`

**Files:**

- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/index.test.ts`

Use this order:

1. Current chop behavior.
2. Current generated-fit behavior.
3. User-written notes or rhythm.
4. Any remaining `.fit()` case still blocks variation retriggers.
5. Explicit variation timing.
6. Current one-note default.

Generated notes use `sourceKeys[0] ?? 0`. Keep the existing mask separate.

**Acceptance criteria:**

- [ ] `.var([0, 1, 2, 3])` creates four notes in one bar.
- [ ] `.var(0, 1, 2, 3)` creates one note in each of four bars.
- [ ] Random timing, pitched source keys, masks, and the default case work as specified.

### Step 2.3 — Test priority and method order

**Files:**

- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`

Test both method orders for notes plus variation and rhythm plus variation. Cover static/random notes, all listed rhythm transforms, chop, fit, fit with a region, and fit with notes.

Also prove that gain, detune, ordinary regions, duration, envelopes, and effects do not add events. For sparse masks, check original positions and timing; audio-engine tests already cover hit-based value lookup.

**Acceptance criteria:**

- [ ] Method order does not change the chosen timing.
- [ ] Every stronger timing source blocks variation-created events.
- [ ] Value-only patterns remain unable to create events.

## Phase 3 — Finish, document, and verify PR 1

### Step 3.1 — Add complete Fluid schema tests

**Files:**

- `packages/fluid/src/index.test.ts`
- audio-engine tests only if a missing regression is found

Test schemas for one-bar and multi-bar static variation, random variation with explicit/default grids, pitched user-bank samples, masks, and preloading.

**Acceptance criteria:**

- [ ] Generated notes survive `push()` and `Drome.getSchema()`.
- [ ] Existing engine scheduling and preload behavior still work.
- [ ] Public schemas and synth output do not change.

### Step 3.2 — Document variation-created events

**Files:**

- `docs/concepts/patterns.md`
- `docs/concepts/glossary.md`
- `packages/fluid/README.md`

Explain one-bar array syntax, multi-bar argument syntax, timing priority, method-order independence, non-timing parameters, and masks consuming variation values only for surviving hits. Do not document PR 2 yet.

**Acceptance criteria:**

- [ ] Examples explain the intentional variation-only change.
- [ ] Timing priority and bar syntax are clear.
- [ ] PR 2 features are not shown as shipped.

### Step 3.3 — Verify PR 1

Run package checks for schema, patterns, Fluid, and audio engine:

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

Then run:

```sh
pnpm check
pnpm lint
pnpm test
pnpm format
git diff --check
```

Do not run a server or browser without permission.

**Acceptance criteria:**

- [ ] Package and workspace checks pass.
- [ ] Formatting and `git diff --check` pass.
- [ ] PR 1 has no schema or audio-engine production changes.

---

# PR 2 — Patternable sample names

## Phase 4 — Add the sample-name schema and public API

Tracer bullet: Fluid supports fixed and patterned names without breaking existing calls.

### Step 4.1 — Add typed sample-name schema fields

**Files:**

- `packages/schema/src/index.ts`
- schema tests or type fixtures if useful

Add and export `SampleNameSchemaValue` and `SampleNameSchema`. Change `SamplerSchema` in one migration:

```ts
sample: SampleNameSchema;
sourceKeys: Record<string, number[]>;
```

Keep numeric schemas numeric. Do not add random names or a compatibility union.

**Acceptance criteria:**

- [ ] Fixed and patterned names use one string-safe schema.
- [ ] Source keys are stored by name.
- [ ] Numeric schemas stay numeric without `any` casts.

### Step 4.2 — Build sample-name patterns in Fluid

**Files:**

- a new file such as `packages/fluid/src/patterns/sample-names.ts`
- focused tests or `packages/fluid/src/index.test.ts`
- `packages/fluid/src/types.ts`

Use:

```ts
type SampleNameInput = (string | string[])[];
```

Support:

```ts
name(["bd", "sd"]); // two steps in one bar
name("bd", "sd"); // one step in each of two bars
```

Space steps evenly, restart step numbers in each bar, preserve exact strings, and return fresh data. Keep this helper in Fluid.

**Acceptance criteria:**

- [ ] One-bar and multi-bar forms serialize correctly.
- [ ] Repeated names and exact string values are preserved.
- [ ] Random names and weakened numeric types are avoided.

### Step 4.3 — Add `.name()` and constructor forms

**Files:**

- `packages/fluid/src/index.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/types.ts`
- `packages/fluid/src/index.test.ts`

Support:

```ts
d.sample();
d.sample("bd");
d.sample("bd", 1);
d.sample("bd:1");
d.sample(["bd", "sd"]);
```

Add `name(...input: SampleNameInput): this`.

A scalar constructor name is a default identity, not explicit name timing. Array constructors and `.name()` are explicit. The last `.name()` wins. Colon shorthand works only in the scalar constructor; colons elsewhere are literal. An unfinished `d.sample()` fails when its schema is requested.

**Acceptance criteria:**

- [ ] Existing scalar calls still work.
- [ ] Array and `.name()` forms are typed, fluent, and equivalent where expected.
- [ ] Colon and unfinished-builder rules are enforced without broad casts.

### Step 4.4 — Validate names

**Files:**

- sample-name builder or validation module
- `packages/fluid/src/index.test.ts`

Reject no values, empty bars, empty or whitespace-only names, invalid runtime shapes, and an unfinished `d.sample()`. Do not trim accepted names. A valid but missing name should warn later, not throw during authoring.

**Acceptance criteria:**

- [ ] Invalid input has clear, stable errors.
- [ ] Valid names remain byte-for-byte unchanged.
- [ ] Missing valid names follow normal warning behavior.

## Phase 5 — Choose timing from names and store source keys by name

Tracer bullet: a name pattern can supply timing, and each generated note uses that name's source keys.

### Step 5.1 — Gather names and source keys

**Files:**

- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/index.test.ts`

Read every name, remove duplicates in first-seen order, find sorted source keys for each, and return `Record<string, number[]>`. Missing names use `[0]` with existing warning behavior. Repeated names must not repeat work or warnings.

**Acceptance criteria:**

- [ ] Every distinct name has its own sorted key list.
- [ ] Repeated names do not repeat lookup or warnings.
- [ ] Missing names and banks return usable `[0]` entries.

### Step 5.2 — Use name timing when names take priority

**Files:**

- `packages/fluid/src/instruments/sampler-utils.ts`
- `packages/fluid/src/instruments/sampler.ts`
- `packages/fluid/src/index.test.ts`

Map each name step to a note step with the same bar, offset, duration, and step number. Use:

```ts
sourceKeys[name]?.[0] ?? 0;
```

Apply this order:

1. notes, rhythm, chop, or fit;
2. explicit name pattern;
3. explicit variation pattern;
4. one default event.

A lower-priority name pattern may still choose sample values at runtime; it simply does not change timing. Keep current chop/fit generated-note behavior.

**Acceptance criteria:**

- [ ] Name-created notes use each name's natural source key.
- [ ] Priority is independent of method order.
- [ ] Masks, chop, fit, and PR 1 variation behavior stay intact.

### Step 5.3 — Test the full timing priority table

**Files:**

- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`

Cover:

| Stronger timing | Names   | Variation | Result              |
| --------------- | ------- | --------- | ------------------- |
| none            | none    | none      | one default event   |
| none            | none    | 4 steps   | 4 variation steps   |
| none            | 2 steps | 4 steps   | 2 name steps        |
| none            | 4 steps | 2 steps   | 4 name steps        |
| 3 notes         | 4 steps | 2 steps   | 3 note steps        |
| Euclid 2/4      | 4 steps | 4 steps   | Euclidean timing    |
| chop 8          | 4 steps | 4 steps   | current chop timing |
| fit 2           | 4 steps | 4 steps   | current fit timing  |

Test both method orders. Also cover scalar `.name()`, scalar constructor defaults, array constructors, random variation, and multi-bar patterns.

**Acceptance criteria:**

- [ ] Priority does not depend on pattern length or call order.
- [ ] Constructor defaults and explicit name patterns differ as intended.
- [ ] Name and variation bar counts remain independent.

## Phase 6 — Store and preload buffers for several names

Tracer bullet: all known names can be loaded without duplicate downloads or unsafe fallback reuse.

### Step 6.1 — Include sample name in `SampleBufferStore`

**Files:**

- `packages/audio-engine/src/instruments/sample-buffer-store.ts`
- `packages/audio-engine/src/instruments/sample-buffer-store.test.ts`

Keep one store per bank, but use this target:

```ts
{
  sample: string;
  sourceKey: number;
  variationIndex: number;
}
```

Pass sample name through keys, lookup, preload, warnings, and initial/fallback tracking. Keep shared caches keyed by URL.

**Acceptance criteria:**

- [ ] Different names cannot collide.
- [ ] Shared URLs still share fetch/decode work.
- [ ] Variation fallback and reverse preparation stay within each target.

### Step 6.2 — Keep hot-swap fallbacks within one name

**Files:**

- `packages/audio-engine/src/instruments/sample-buffer-store.ts`
- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/index.ts`
- related tests

Use the name at bar 0, hit 0 for initial readiness and fallback matching. Require the same bank and initial name. Expose the fallback only to that initial identity; later names cannot use it. Preserve same-name variation fallback behavior.

**Acceptance criteria:**

- [ ] Same-name hot swaps still work.
- [ ] Different names never share a fallback.
- [ ] Matching source key and variation alone is not enough.

### Step 6.3 — Build preload targets in one place

**Files:**

- a helper such as `packages/audio-engine/src/utils/sampler-preload.ts`
- `packages/audio-engine/src/utils/preload-variations.ts`
- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/index.ts`
- `packages/audio-engine/src/engine.test.ts`
- `packages/audio-engine/src/instruments/sample-buffer-store.test.ts`

Create one helper for every name/source-key pair crossed with every variation known before playback. Use it in `AudioEngine.prepare()` and `Sampler.load()`. Keep current rules for known static and random variations.

**Acceptance criteria:**

- [ ] Every known target is included once.
- [ ] Shared URLs and variation-zero fallbacks remain correct.
- [ ] Reverse work happens only for samplers that need it.

### Step 6.4 — Do not skip a bar because its first name is missing

**Files:**

- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/instruments/sample-buffer-store.test.ts`

Remove the whole-bar readiness return. Resolve each hit and let that name play, load, warn, or skip.

Keep hit assignment before lookup failure, alternate direction changing only after successful playback, and deduplicated lazy loads. Update warning tests as needed.

**Acceptance criteria:**

- [ ] A missing first or middle name does not block or shift later hits.
- [ ] Lazy loading remains deduplicated.
- [ ] Alternate direction remains based on successful playback.

## Phase 7 — Choose sample names while scheduling

Tracer bullet: each hit chooses name, key, variation, and playback settings in a fixed order.

### Step 7.1 — Add a typed sample-name resolver

**Files:**

- a focused helper or `packages/audio-engine/src/instruments/sampler.ts`
- focused helper tests or sampler tests

Wrap `barIndex` around name bars, then wrap `hitIndex` around names in that bar. Return the exact string. Do not use grid position or the numeric resolver. Reject malformed empty schemas clearly or document the validated boundary.

**Acceptance criteria:**

- [ ] Bars and values wrap independently.
- [ ] Sparse grid positions do not change name lookup.
- [ ] Names and numeric resolver types remain unchanged.

### Step 7.2 — Resolve identity in a fixed order

**Files:**

- `packages/audio-engine/src/instruments/sampler.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

For each event:

```txt
name from bar + hit
→ source keys for that name
→ nearest source key for each chord note
→ variation from bar + hit
→ entry and buffer
→ region or chop
→ pitch and fit rates
→ schedule
```

Chord notes share name and variation but may choose different source keys. Missing key lists use `[0]`. Keep variation fallback in entry lookup. Keep regions, gain, detune, effects, and event timing unchanged.

**Acceptance criteria:**

- [ ] Name patterns choose expected buffers and wrap independently from variations.
- [ ] Chords share identity values and choose keys per note.
- [ ] Explicit note timing does not change.

### Step 7.3 — Test masks, several bars, and failed hits

**Files:**

- `packages/audio-engine/src/instruments/sampler.test.ts`

Test sparse and random masks, different name/variation bar counts, per-bar hit reset, missing names, invalid regions, missing reverse buffers, variation fallback, and alternate direction. Assert buffers, windows, times, rates, and parameter values.

**Acceptance criteria:**

- [ ] Rests and mask misses consume no names or variations.
- [ ] Failed hits keep their number and do not shift later values.
- [ ] Fallback and alternate direction remain name-safe and success-based.

### Step 7.4 — Test every sampler playback type

**Files:**

- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/instruments/sample-buffer-store.test.ts`

Use a focused test set covering:

| Feature            | Required proof                                 |
| ------------------ | ---------------------------------------------- |
| Files              | Names choose different files                   |
| Sprites            | Names choose different windows                 |
| Pitched samples    | Each name uses its own keys                    |
| Pitched sprites    | Name, key, and window work together            |
| Regions            | Region is inside the chosen entry              |
| Chop               | Slice applies after name and entry lookup      |
| Fit                | Rate uses the chosen source duration           |
| Loop/clip/one-shot | Duration and loop points use the chosen source |
| Reverse/alternate  | Reversed buffers belong to the chosen name     |

Use names with different durations in the fit test.

**Acceptance criteria:**

- [ ] Every playback feature uses the current name.
- [ ] Shared URLs stay deduplicated without mixing sprite details.
- [ ] Existing region, chop, fit, loop, clip, and direction rules remain intact.

## Phase 8 — Update every schema user and harden integration

Tracer bullet: no production code assumes one fixed sample string, and real Fluid output runs in the engine.

### Step 8.1 — Update schema users and test fixtures

**Files:**

- `packages/fluid/src/index.test.ts`
- `packages/fluid/src/instruments/instrument.test.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`
- `packages/audio-engine/src/instruments/sample-buffer-store.test.ts`
- `packages/audio-engine/src/engine.test.ts`
- any other files found by search

Replace fixed `sample` strings and `sourceKeys` arrays with the new name schema and key record. Update scalar `schema.sample` uses, array loops, fallback checks, warnings, and hand-written fixtures.

Small fixture helpers are fine, but serialized-shape tests must show the full public schema. Do not hide gaps with `as never`, `as any`, or compatibility unions.

**Acceptance criteria:**

- [ ] Production code and fixtures use the new shape.
- [ ] No sampler treats `sourceKeys` as one array.
- [ ] Workspace search finds no old fixed-name assumptions.

### Step 8.2 — Add Fluid-to-engine tests

**Files:**

- `packages/fluid/src/index.test.ts`
- `packages/audio-engine/src/engine.test.ts`
- `packages/audio-engine/src/instruments/sampler.test.ts`

Cover examples such as:

```ts
d.sample(["bd", "sd", "bd", "sd"]);
d.sample().name("bd", "sd");
d.sample().name(["bd", "piano"]).var([0, 1]).euclid(2, 4);
d.sample().name(["loopA", "loopB"]).fit(2);
```

At least one test must schedule the exact schema emitted by Fluid instead of rebuilding it by hand.

**Acceptance criteria:**

- [ ] Constructors and `.name()` survive `Drome.getSchema()`.
- [ ] Graph cloning and commit preserve names and source keys.
- [ ] The engine schedules exact Fluid output with expected buffers and timing.

### Step 8.3 — Search for old assumptions

**Files:** all changed code, tests, docs, and plans

Search for old scalar `schema.sample` and array `sourceKeys` uses, buffer keys without names, lookup before name resolution, grid-based name lookup, compatibility unions, strings forced through numeric schemas, and comments that treat variation as the only changing sample value.

A scalar `sample` argument is still valid after the name has been chosen for a hit.

**Acceptance criteria:**

- [ ] Remaining scalar sample values are resolved runtime names.
- [ ] Name lookup uses hit number and buffer keys include name.
- [ ] String types stay safe and `git diff --check` passes.

## Phase 9 — Document and finish PR 2

### Step 9.1 — Document name patterns and timing priority

**Files:**

- `docs/concepts/patterns.md`
- `docs/concepts/glossary.md`
- `packages/fluid/README.md`
- `plans/sampler-patterning/spec.md` only if clarification is needed

Document `.name()`, constructor forms, colon rules, timing priority, method-order independence, separate name/variation wrapping, masks, per-name source keys, missing names, and the lack of random names. Do not make users manage source-key maps.

**Acceptance criteria:**

- [ ] Every public form has an example.
- [ ] Docs reject “longest pattern wins” and explain sparse rhythms.
- [ ] Multi-bar wrapping and random-name limits are clear.

### Step 9.2 — Verify PR 2

Run the same focused package checks as PR 1, then:

```sh
pnpm check
pnpm lint
pnpm test
pnpm format
git diff --check
```

The patterns package should still be checked even though production changes are not expected there. Do not run a server or browser without permission.

**Acceptance criteria:**

- [ ] Package and workspace checks pass.
- [ ] Formatting and `git diff --check` pass.
- [ ] No compatibility casts or temporary schema unions remain.

### Step 9.3 — Manually review playback

With permission, listen to variation-created events, one- and multi-bar names, name/variation priority, sparse masks, mixed drum and pitched names, sprites, regions, chop, fit, loop and clip modes, direction changes, and a missing name between valid names.

Expected changes:

- PR 1 adds events only when explicit variation is allowed to supply timing.
- PR 2 changes sample identity per hit when names are patterned.

Everything else should keep its previous timing and event count.

**Acceptance criteria:**

- [ ] Playback follows the documented priority.
- [ ] Missing names skip only their own hit.
- [ ] Playback settings use the current sample, and all audible changes are explained.

## Completion criteria

Sampler patterning is complete when:

- timing follows notes/rhythm/chop/fit, then names, then variation, then default;
- method order does not change that result;
- fixed and patterned names share one typed schema;
- old scalar constructors and colon shorthand still work;
- name patterns support one or several bars and reject bad input clearly;
- source keys and buffer identity include the current name;
- the engine chooses names and variations independently by bar and hit;
- rests and mask misses consume neither;
- chord notes share one name and variation;
- preloading covers all known targets without duplicate URL work;
- fallback buffers never cross names;
- failed hits do not shift later values;
- all sampler playback features use the current name;
- synth behavior stays unchanged;
- docs and all checks pass.

## Recommended commit sequence

### PR 1

1. **Capture current variation and rhythm behavior**
2. **Record explicit timing and variation choices**
3. **Create notes from variation timing**
4. **Test priority and method order**
5. **Document and verify**

### PR 2

1. **Add the name schema and Fluid builder**
2. **Add `.name()` and constructors with validation**
3. **Add name timing and source keys by name**
4. **Store and preload several names**
5. **Choose names while scheduling**
6. **Test masks, failures, playback, and fallbacks**
7. **Update schema users and add end-to-end tests**
8. **Document and verify**

Keep both PRs independently passing. Do not start the public schema migration in PR 1 or keep a temporary schema union in PR 2.
