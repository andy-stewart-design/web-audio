# Step 3.3 — Fixed envelope and chop slots / Phase 3 integration

## Result

**Step 3.3 verified. Phase 3 exit gate satisfied.** All six positional families now enforce their amended explicit-value contracts, while dedicated variadic setters and aliases retain their intended behavior.

Final parent verification:

- Prescribed focused suites: **122 tests / 6 files**.
- Cross-family positional matrix: **7 tests / 1 file**, exercising 23 slot/boundary rows across noise, filter, LFO, ADSR, envelope construction, and chop, plus exact optional-signature type assertions.
- Full Fluid suite: **1,325 tests / 39 files**.
- Schema suite: **134 tests / 1 file**.
- Audio-engine suite: **410 tests / 28 files**.
- All three core packages' `check` and `lint` commands passed.
- Exact-path formatting and `git diff --check` passed.
- Dependency/artifact build: **6 successful tasks**; Fluid compiled fresh, five upstream/engine tasks restored from cache.
- Built-package envelope/chop, rollback, scalar-zero timing, and lazy random-fit smoke passed using the existing TS-capable runner.

Starting revision: `46605e5938f1157a99386ccaf00650ccb0de1fcc`. The worktree was clean when Step 3.3 began; the overnight pause retained the same uncommitted patch/revision. This record applies to the final working-tree patch relative to that revision.

No accepted waiver or remaining blocker exists for this step. Phase 4 and native confirmation have not started.

## Current authority and envelope contract

The approved [single-undefined/defaults amendment](step-1.1-envelope-defaults.md), [static shared structured values](step-1.2-patterns-ownership.md), [required noise/filter inputs and simplification](step-3.1.md), and [LFO/ADSR restrictions](step-3.2.md) remain authoritative.

Envelope constructor and factory each have one named optional-parameter signature, with no overload declarations:

```ts
constructor(minOrMax?: NumericPatternValue, maximum?: NumericPatternValue)
env(minOrMax?: NumericPatternValue, maximum?: NumericPatternValue)
```

Call presence is checked at runtime. These simple TypeScript signatures allow explicit `undefined`; they deliberately do not encode the one-/two-bound distinction through overloads or extra types.

- `env()` and `env(undefined)` → canonical minimum `[[0]]`, maximum `[[1]]`.
- One numeric/shorthand/reusable/static structured/direct-random value always selects maximum.
- Exactly two values select minimum and maximum. **Both must be supplied explicitly; every multi-field `undefined` is rejected at runtime.**
- Null bounds, raw arrays, extra arguments/legacy maximum continuations, unsupported sources, and malformed numeric wrapper data are rejected synchronously.
- Minimum remains `NumberPattern` in the canonical graph; runtime resolution/arithmetic is unchanged.

The old `EnvelopeArguments` rest tuple, `constructor(...args)`, maximum-tail forwarding, duplicated bound classifier, and value-or-array conversion helper are removed. Constructor/factory arity checks run before forwarding; no pattern spills across bound fields or changes field meaning by type.

During development, an incorrect attempt reinstated the original spec's two-field undefined defaults. Review rejected that attempt and restored the amended runtime contract and negative tests. It is not an accepted deviation.

### Signature simplicity correction

The initial Step 3.3 review then wrongly called two envelope/chop overloads necessary to encode call presence in TypeScript. The user rejected this verbosity: simplicity takes precedence over compile-time encoding of omitted versus explicitly undefined optional fields. The final patch removes all three overload sets, not just their rest implementations. Runtime rejection is unchanged.

The complete uncommitted patch was re-audited. Duplicate factory bound checks, constructor null checks already handled by the numeric validator, mutable/conditional chop forwarding, redundant readonly wrappers, a chop-specific fixture tuple type, and conditional test-input reconstruction were removed. Public chop owns call-presence policy; its internal helper simply accepts an optional sequence. Replay uses the normal `Parameters<Sampler[Method]>` tuple rather than a special chop type.

Exact `expectTypeOf` assertions now lock the optional parameter tuples for the constructor, factory, and chop. Reintroducing the former required-last overloads fails TypeScript checking. Future reviews must inspect the actual signatures and forwarding code, not accept green behavioral tests as proof of simplicity.

Dedicated `.max()` remains variadic, resets to one with no input, preserves unrelated minimum/ADSR/mode, and validates static replacement candidates before assignment. Its direct random source remains live without eager serialization. Dedicated `.a/.d/.s/.r` and other single-input setters are unchanged.

## Chop contract and timing

Sampler exposes one named optional-sequence signature, without overload declarations:

```ts
chop(sliceCount: number, sequence?: NumericPatternValue)
```

- Omission selects generated/distributed sequence behavior.
- An explicitly provided undefined sequence is invalid, not omission.
- Authored sequence is one scalar, direct/reusable shorthand, static structured numeric value, or direct random cycle.
- Raw arrays, continuation arguments, null/rest/string atoms inside wrappers, nested voices/chords, malformed data, audio modulation sources, and internal Parameter objects are rejected.
- Existing positive-integer slice validation and the 16,384-slice boundary remain intact.
- The public method checks arity/presence, then forwards directly to the helper. The helper treats an absent/undefined sequence as generated; public explicit-undefined calls never reach it. Static sequence validation finishes before releasing authored state or publishing configuration.

The internal timing helper uses named optional sequence input and inferred return data, not rest inputs, a normalization pipeline, result-type scaffolding, non-null assertions, or permission-option flags.

### Generated versus authored

Tests distinguish:

- `chop(4).fit(2)`: four generated hits distributed across two bars, two half-bar hits per bar.
- `chop(4, 0).fit(2)`: one authored scalar-zero event, one bar of duration `1`, not a falsy request for generation. Equivalent `d.str(0)` matches.
- `chop(4, d.str([0, 2], [1], [3, 2, 1]))`: exact nonuniform authored bar widths and onsets/durations survive `fit()` before or after chop.
- Explicit random `[2, 0, 3]` counts retain all three authored bars, including the empty middle bar.
- Existing default random `[1]` special distribution remains: four slices with `fit(2)` produce `[2, 2]` counts.

Existing transform/region/voice behavior stays covered by the full Fluid suite and replay fixtures. Sampler `.start/.end/.duration/.dur` remain dedicated variadic inputs. Existing region restrictions and out-of-range index warnings are retained; warnings happen during serialization and do not clamp or rewrite authored indices.

### Lazy fit ownership correction

Review identified a pre-existing eager read in `setSamplerEventFit()`: it called `getGeneratedSamplerTiming()` only to decide whether generated timing existed. For a random chop sequence this unnecessarily invoked `getRandomSchema()` and could materialize pending configuration.

That boolean decision now uses timing ownership directly: a configured chop owns timing; otherwise fit can own timing when notes are not authored and no region owns playback. Actual timing is still generated in the existing schema/transform paths. No new rhythm, random algorithm, or source clock was introduced.

Regression spies prove zero random-schema calls through both `chop(random).fit()` and `fit().chop(random)` setter orders. Configuration added afterward matches an equivalent control source, and final event counts/sequence metadata retain the existing rules.

## Atomicity, migration, and Phase 3 matrix

Bad chop replacements are tested against a configured sampler with prior chop, fit, and region. Every failure preserves `_eventState`, `_chop`, `_fit`, `_region`, and the complete schema. Internal helper tests use authored state and snapshot prior configuration to check that failed validation does not release or mutate it.

Migrated first-party callers preserve their old geometry:

```ts
// Old: env(0.1, [0.75, 1.25], [0.25, 0.5])
d.env(0.1, d.str([0.75, 1.25], [0.25, 0.5]));

// Old: chop(4, [0, 2], [1, 3])
sampler.chop(4, d.str([0, 2], [1, 3]));
```

Unlike the old special LFO endpoint arrays, an old single chop array meant one bar. New wrappers preserve that distinction.

Affected envelope/chop tests and event-schema fixtures use explicit values. Replay forwarding now distinguishes generated one-argument chop from authored two-argument chop and passes one sequence value to production methods; it no longer spreads arbitrary continuation tails. Expected bars/counts and compiled projections remain covered by full source/replay tests.

Independent caller audit found no active application or audio-regression sketch relying on removed envelope/chop forms. Remaining raw arrays belong to negative tests or deliberately variadic dedicated setters/aliases. Historical notes and user-owned docs/README/spec/overview were not edited or counted as implementation migration.

The new package-level `src/__tests__/positional-pattern-inputs.test.ts` covers all six families, including applicable constructors/factories and all four ADSR fields. It rejects raw/nested arrays, direct null, invalid undefined slots, malformed wrappers, and extra valid arguments that must not be silently dropped. Sole envelope undefined is tested as the explicit exception; extra arguments for a sole-envelope case use three arguments so they cannot accidentally be a valid two-bound call.

The matrix also checks required slots, typed negative calls, fixed formal arity, exact simple optional type signatures, valid explicit values, source permissions, and retained dedicated gain/max/filter/region sugar. Explicit-undefined rejection is runtime-only for optional fields; raw-array, extra-argument, null, and forbidden-source type boundaries remain checked. Existing detailed per-family suites remain in place. Type probes are uninvoked; runtime probes use reflection without `as any`/`as never`.

## Verification

Parent ran against the final source/test patch with default workers and no warning suppression:

```sh
pnpm --filter @web-audio/fluid exec vitest run src/automations/__tests__/envelope.test.ts src/instruments/__tests__/sampler-event-timing.test.ts src/instruments/__tests__/sampler-utils.test.ts src/__tests__/parameter-compatibility.test.ts src/__tests__/parameter-shorthand.test.ts src/__tests__/structured-inputs.test.ts
# 122 tests / 6 files

pnpm --filter @web-audio/fluid exec vitest run src/__tests__/positional-pattern-inputs.test.ts
# 7 cross-family tests / 1 file

pnpm --filter @web-audio/fluid test:ci
# 1,325 tests / 39 files
pnpm --filter @web-audio/schema test:ci
# 134 tests / 1 file
pnpm --filter @web-audio/audio-engine test:ci
# 410 tests / 28 files

pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/schema check
pnpm --filter @web-audio/schema lint
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint

pnpm exec turbo run build --filter=@web-audio/fluid --filter=@web-audio/audio-engine
# 6 successful tasks; Fluid fresh, 5 cached
```

Prettier checked all changed/new TypeScript paths plus plan/evidence; `git diff --check` passed. Generated declarations expose exactly one optional-parameter signature each for Envelope construction, `env`, and `chop`, with no overload declarations or legacy maximum/sequence rest forms. Existing Vite `__dirname` and experimental `tsgo` notices remain non-failing.

### Supplemental built-package proof

This passed after the build through the existing TS-capable runner:

```sh
pnpm --filter @web-audio/audio-regression exec tsx --eval '
import assert from "node:assert/strict";
import Drome from "@web-audio/fluid";
const d = new Drome();
assert.deepEqual(d.env().getSchema(), d.env(undefined).getSchema());
assert.deepEqual(d.env(0.3).getSchema().max, {type:"static",cycle:[[0.3]]});
const Envelope = d.env().constructor;
for (const args of [[undefined, 0.8], [0.1, undefined], [undefined, undefined], [[0, 1]], [0, [0.2, 0.8]], [0, 0.2, 0.8]]) {
  assert.throws(() => Reflect.apply(d.env, d, args));
  assert.throws(() => Reflect.construct(Envelope, args));
}
d.loadSamples({bank:"local",samples:{bd:["/bd.wav"]}});
const sample = d.sample("bd").bank("local").chop(4, d.str([0, 2], [1])).fit(2);
assert.deepEqual(sample.getSchema().region.sequence, {type:"static",cycle:[[0,2],[1]]});
const before = sample.getSchema();
for (const args of [[4, undefined], [4, [0, 1]], [4, d.str(null)], [4, 0, 1]]) {
  assert.throws(() => Reflect.apply(sample.chop, sample, args));
  assert.deepEqual(sample.getSchema(), before);
}
const authored = d.sample("bd").bank("local").chop(4, 0).fit(2);
assert.deepEqual(authored.getSchema().eventPattern.timing.cycle, [[{offset:0,duration:1}]]);
const random = d.rand();
const control = d.rand();
const live = d.sample("bd").bank("local").chop(4, random).fit(3);
random.int().steps(2, 0, 3).range(0, 3);
control.int().steps(2, 0, 3).range(0, 3);
assert.deepEqual(live.getSchema().region.sequence, control.getRandomSchema());
assert.deepEqual(live.getSchema().eventPattern.timing.cycle.map(bar=>bar.length), [2,0,3]);
sample.push();
assert.equal(d.getSchema().instruments.length, 1);
console.log("Built fixed envelope/chop slots, rollback, scalar-zero timing, and lazy random fit passed.");
'
```

The sample URL is graph metadata only; this did not fetch assets, start Chromium/the native harness, or render audio. This is not bare-Node compatibility or native/listening acceptance. The previous source-exported schema/bare-Node limitation remains a Phase 4 runner constraint.

## Completion boundary

**Phase 3 is complete under the approved amendments.** All six positional families have their final explicit-value contracts, defaults/permissions/atomicity are accounted for, and deliberate single-input variadic APIs remain intact.

No Phase 4 work, native rendering, audio-reference changes, schema/engine/Patterns/worklet source edits, user documentation edits, dependency/lockfile changes, installs, dev servers, commits, publication, or deployment occurred. Step 4.1 and later acceptance remain pending.
