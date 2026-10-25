# Step 4.1 — Public evaluation and artifact integration

## Status and boundary

**Technical gates verified; Step 4.1 remains in progress because its user-owned documentation gate is pending.** No documentation waiver was requested or inferred.

Starting revision: `a93b05ae0769a44d18b806e8bbd5a5761c96e180`; worktree was clean. The user committed the completed Phase 3 patch before authorizing this step.

Delivered:

- Both evaluated aliases, `d` and `drome`, cover all six positional families using direct shorthand, reusable shorthand, and static structured values.
- Reused numeric/event values, patterned bounds, consumer-specific geometry, source permissions, and malformed compositions are exercised through the public evaluator.
- Actual graphs are checked for wrappers before any JSON comparison.
- Built runtime self-import, generated declaration inference, and web type consumption pass.
- Active-caller/dispatch audit found no necessary production change.

The [Step 3.3 simplicity correction](step-3.3.md#signature-simplicity-correction) remains intact: one named optional-parameter signature each for Envelope construction, `env`, and `chop`. Optional TypeScript fields permit explicit undefined; two-bound envelope and authored chop calls still reject it at runtime. No overloads, normalizers, or alternative signature machinery were introduced.

The [documentation ownership amendment](step-1.1-envelope-defaults.md#decision-and-authority) remains in force. User-owned docs, READMEs, spec, overview, and historical notes were not edited or counted as verified.

## Test changes

- `packages/fluid/src/__tests__/evaluate-source.test.ts`: six new integration cases, bringing that suite to 17 tests.
- `packages/fluid/src/__tests__/support/pattern-input-evaluation.ts`: shared string-only sketch fixtures, reused by source tests and the built smoke. This support file imports no production internals or Vitest runtime.

Each alias runs:

1. Equivalent direct/reusable/static structured programs using patterned envelope minimum/maximum, both Envelope and Instrument ADSR, noise, strict filter, LFO, and chop.
2. Direct permitted random/audio sources: random envelope maximum/chop sequence, LFO noise, and MIDI detune/filter frequency.
3. A 27-program malformed-call matrix: raw arrays and excess arguments for all six families, invalid undefined presence, literal/wrong atoms, mixed/nested wrappers, random wrapping, and forbidden direct sources. An empty subsequent evaluation verifies isolation.

Canonical comparisons ignore only generated LFO IDs. They retain all bounds, fields, event geometry, timing, and sample metadata. The original graph is first traversed with structured/shorthand guards and plain-object/array prototype checks, so serialization cannot hide a wrapper or source instance.

Geometry is asserted explicitly:

- Envelope bounds are two distinct bars: minimum `[[0.1], [0.2]]`, maximum `[[0.8], [0.9]]`.
- Synth notes `[60, 64]` form two half-bar events in one bar.
- Chop sequence `[[0], [2], [1], [3]]` forms four one-hit bars.
- The same reusable note value is also consumed by that sampler; chop owns its one-hit-per-bar geometry, so each bar uses the first note step. Reuse does not require different consumers to emit identical rhythms.
- Both `structured()` and `str()` appear in the evaluated fixture.
- Local sample URLs are graph metadata only, never fetched.

Existing structured/compatibility/shorthand and positional suites supply dedicated-setter/alias, immutability, detailed consumer, type-negative, and exact simple-signature coverage. They were retained rather than duplicating that full matrix through a second test framework.

## Verification

All technical checks below passed against this step:

| Check                                          | Result                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Prescribed four public suites                  | **80 tests / 4 files**                                                 |
| Full Fluid regression                          | **1,331 tests / 39 files**                                             |
| Fluid `check`, including tests/support         | Passed                                                                 |
| Fluid `lint`                                   | Passed, zero-warning gate                                              |
| Changed-file formatting and `git diff --check` | Passed                                                                 |
| Fluid/engine dependency-artifact build         | **6 successful tasks**, Fluid fresh, five upstream/engine tasks cached |
| `pnpm --filter web check`                      | **0 errors, 0 warnings**                                               |
| Built export/evaluation smoke                  | **6 matrix combinations, 2 permission programs, 42 rejected programs** |
| Generated declaration type probe               | Passed positive inference and negative type boundaries                 |

Commands:

```sh
pnpm --filter @web-audio/fluid exec vitest run src/__tests__/structured-inputs.test.ts src/__tests__/evaluate-source.test.ts src/__tests__/parameter-compatibility.test.ts src/__tests__/parameter-shorthand.test.ts
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm exec turbo run build --filter=@web-audio/fluid --filter=@web-audio/audio-engine
pnpm --filter web check
```

The existing Vite `__dirname` and experimental `tsgo` notices were not suppressed. No full-workspace/native gate is claimed by these commands.

### Built public export smoke

Run from the repository root after building. The runner resolves the real `@web-audio/fluid` package export to `packages/fluid/dist/index.mjs`; shared fixtures provide strings only, not a source implementation of Fluid.

The original graphs are inspected for class instances, functions, and symbol keys before JSON comparison. Only LFO IDs are normalized in the comparison copy.

```sh
pnpm --filter @web-audio/audio-regression exec tsx --eval '
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import Drome, { evaluateSource } from "@web-audio/fluid";
import { aliases, evaluatedMatrixSketch, allowedSourcesSketch } from "../fluid/src/__tests__/support/pattern-input-evaluation.ts";

const entry = createRequire(process.cwd() + "/package.json").resolve("@web-audio/fluid");
assert(entry.endsWith("/packages/fluid/dist/index.mjs"), entry);
const direct = new Drome();
direct.synth().gain(direct.str(0.2, 0.1)).push();
assert.equal(direct.getSchema().instruments.length, 1);

function wrapperFree(graph) {
  const pending = [graph];
  while (pending.length) {
    const value = pending.pop();
    assert.notEqual(typeof value, "function");
    if (value === null || typeof value !== "object") continue;
    assert.equal(Object.getPrototypeOf(value), Array.isArray(value) ? Array.prototype : Object.prototype);
    assert.equal(Object.getOwnPropertySymbols(value).length, 0);
    pending.push(...Object.values(value));
  }
}
const comparable = graph => JSON.parse(JSON.stringify(graph, function(key, value) {
  return key === "id" && this.type === "lfo" ? "<lfo>" : value;
}));
let matrices = 0;
let permissions = 0;
let rejected = 0;
for (const api of aliases) {
  const baseline = evaluateSource(evaluatedMatrixSketch(api, "direct"));
  wrapperFree(baseline);
  for (const representation of ["direct", "reusable", "structured"]) {
    const graph = evaluateSource(evaluatedMatrixSketch(api, representation));
    wrapperFree(graph);
    assert.deepEqual(comparable(graph), comparable(baseline));
    assert.deepEqual(graph.instruments[0].gain.min, {type:"static",cycle:[[0.1],[0.2]]});
    assert.deepEqual(graph.instruments[0].gain.max, {type:"static",cycle:[[0.8],[0.9]]});
    assert.deepEqual(graph.instruments[1].region.sequence, {type:"static",cycle:[[0],[2],[1],[3]]});
    matrices++;
  }
  const allowed = evaluateSource(allowedSourcesSketch(api));
  wrapperFree(allowed);
  assert.equal(allowed.instruments[0].gain.max.type, "random-number");
  assert.equal(allowed.instruments[0].noise.gain.type, "lfo");
  assert.equal(allowed.instruments[0].effects[0].frequency.type, "midi-cc");
  assert.equal(allowed.instruments[1].region.sequence.type, "random-number");
  permissions++;
  for (const source of [
    `${api}.synth().noise([0.2,0.4])`,
    `${api}.synth().noise("pink",0.2,0.4)`,
    `${api}.filter("lp",[400,800])`,
    `${api}.filter("lp",400,800)`,
    `${api}.lfo([0,1],1)`,
    `${api}.lfo(0,1,2)`,
    `${api}.synth().adsr([0.1,0.2],0.2,0.8,0.1)`,
    `${api}.synth().adsr(0.1,0.2,0.8,0.1,0.3)`,
    `${api}.env([0,1])`,
    `${api}.env(0,1,2)`,
    `${api}.env(undefined,0.8)`,
    `${api}.env(0.1,undefined)`,
    `${api}.env(undefined,undefined)`,
    `${api}.sample("bd").chop(4,[0,1])`,
    `${api}.sample("bd").chop(4,0,1)`,
    `${api}.sample("bd").chop(4,undefined)`,
    `${api}.synth().adsr(${api}.rand(),0.2,0.8,0.1)`,
    `${api}.env(${api}.lfo(0,1))`,
    `${api}.structured(${api}.rand())`,
    `${api}.env(${api}.str("0.2"))`,
    `${api}.synth().notes(${api}.str(60),62)`,
  ]) {
    assert.throws(() => evaluateSource(source), source);
    rejected++;
  }
}
console.log(JSON.stringify({entry, matrices, permissions, rejected}));
'
```

Output identified the built entry and reported `matrices: 6`, `permissions: 2`, `rejected: 42`.

This uses the existing TS-capable runner because bare Node still encounters the previously recorded source-exported schema extensionless-import limitation. It is a built runtime/export smoke, not an installed/packed-package, bare-Node, browser, or audio-rendering claim. No unrelated packaging repair was attempted.

### Generated declaration inference

A temporary `built-types.mts` imported the emitted Fluid entry directly and was checked using:

```sh
pnpm --filter @web-audio/fluid exec tsc --ignoreConfig --noEmit --strict --module esnext --moduleResolution bundler --target esnext /tmp/<temporary>/built-types.mts
```

Probe contents:

```ts
import Drome, {
  evaluateSource,
} from "/Users/andy/Documents/Development/web-audio/packages/fluid/dist/index.mjs";

const d = new Drome();
const levels = d.str(0.2, 0.8);
const notes = d.structured([60, 64], [62, 65]);
const envelope = d.env(d.str(0, 0.1), levels).adsr(levels, 0, 1, 0.1);
const lfo = d.lfo(levels, d.sh("0.4 0.9"));
d.synth()
  .notes(notes)
  .gain(envelope)
  .noise("pink", levels)
  .fx(d.filter("lp", lfo));
d.sample("bd").chop(4, levels);
d.env(d.rand(), levels);
d.sample("bd").chop(4, d.rand());
d.env(undefined, 0.8);
d.sample("bd").chop(4, undefined);
evaluateSource("d.synth().push();");

// @ts-expect-error Inferred string wrappers are not numeric envelopes.
d.env(d.str("0.2"));
// @ts-expect-error Raw arrays are not fixed frequency slots.
d.filter("lp", [400, 800]);
// @ts-expect-error ADSR does not accept direct random sources.
d.synth().adsr(d.rand(), 0, 1, 0.1);
// @ts-expect-error Chop does not accept audio modulation sources.
d.sample("bd").chop(4, lfo);
// @ts-expect-error Fixed envelope construction does not accept continuation arguments.
d.env(0, 0.2, 0.8);
```

This checks adjacent generated `index.d.mts` inference, including numeric versus string wrappers and source permissions. Runtime export-map resolution is separately proven above. The temporary file/directory was removed afterward; source checks gained no new build prerequisite. There is no packed/installed consumer claim.

## Caller and cleanup audit

The first-party source/evaluated-case search found no active caller relying on removed signatures:

- `packages/audio-regression/cases/bends/sketch.js` and `lfo-filter/sketch.js` already preserve old LFO separate-bar geometry through explicit wrappers.
- The raw array in the bends case's `lpf()` call is deliberate dedicated alias sugar, not a removed strict filter form.
- Audio-regression noise/unison evaluated source uses valid required noise inputs and two explicit LFO endpoints.
- Apps have no direct affected calls; the web evaluation worker delegates to the public evaluator.
- Remaining invalid-looking calls in Fluid tests are deliberate runtime/type-negative probes.
- Historical `notes/` snippets remain classified as inactive scratch/history, not executable migration targets.

No old `EnvelopeArguments`, LFO array dispatcher, `_toParameter`, maximum-tail forwarding, or deleted single-slot normalizer remains. Existing numeric/audio-source permissions, event geometry, and dedicated variadic dispatch are still needed. No further production deletion was justified; no production file changed.

## User-owned documentation handoff

**Not verified.** Active docs still contain superseded contracts. Paths/line anchors from this audit:

| User-owned file                                                | Required correction                                                                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/concepts/syntax.md:28–31`                                | Introduce `structured/str`; distinguish successive bars from same-bar arrays.                                                                                 |
| `docs/concepts/syntax.md:142–168`                              | Correct sole numeric maximum, patterned minimum, two-bound undefined rejection, static ADSR restrictions, required noise/filter inputs, and raw LFO examples. |
| `docs/concepts/patterns.md:186–190`                            | Replace raw LFO endpoint arrays with explicit structured values preserving separate bars.                                                                     |
| `docs/reference/instruments/noise.md:16–37,58`                 | Remove omitted/default/variadic gain and raw-array forms; show one required gain value with optional color.                                                   |
| `packages/fluid/README.md:177–181`                             | Remove accepted `noise()` / `noise("pink")` claims.                                                                                                           |
| `plans/fluid-pattern-inputs/spec.md:86–98,144–146,270,292–293` | Reconcile approved amendments: only sole undefined defaults; required noise gain/filter frequency; single optional signatures use runtime presence checks.    |
| `plans/fluid-pattern-inputs/overview.md:84–100,117–138`        | Explicitly state required noise/filter values and two-bound undefined rejection.                                                                              |

Minimal migration guidance:

| Previous call / intent                   | Current form                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Old numeric `env(0.1)` intending minimum | `env(0.1, 1)`; current `env(0.1)` means maximum                                    |
| `noise("pink", 0.2, 0.1)`                | `noise("pink", d.str(0.2, 0.1))`                                                   |
| `noise()` / `noise("pink")`              | Supply gain explicitly: `noise(1)` / `noise("pink", 1)`                            |
| `filter("lp", 400, 1200)`                | `filter("lp", d.str(400, 1200))`; omission also requires an explicit frequency     |
| `chop(4, [0,2], [1,3])`                  | `chop(4, d.str([0,2], [1,3]))`                                                     |
| `lfo([0.2,0.8], 1)`                      | `lfo(d.str(0.2,0.8), 1)`, **not** `str([0.2,0.8])`                                 |
| Raw arrays in ADSR positional fields     | One static `d.str(...)` value per field, preserving its original bar/step geometry |

Also retain: static-only wrapper construction, literal wrapped strings, direct permitted live sources, ADSR's random/audio restriction, existing LFO multivalue warnings/first-value runtime behavior, and unchanged dedicated `gain/max/a/d/s/r/start/end/duration/dur/lpf/hpf/bpf` sugar. No probability/Euclidean API or timing-clock redesign is included.

## Completion boundary

The implementation/public/evaluation/artifact/web portions of Step 4.1 pass. The documentation checkbox and full Step 4.1 completion gate remain pending user work; neither Phase 4 nor overall acceptance is verified.

No production APIs, signatures, exports, shared normalization, schema/engine/Patterns/worklet sources, apps, approved references, thresholds, dependencies, or lockfiles changed. No installs, development server, publication, deployment, commits, or native/browser workflows ran. **Step 4.2 remains pending.**
