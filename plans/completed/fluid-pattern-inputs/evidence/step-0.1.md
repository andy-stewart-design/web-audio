# Step 0.1 — Baseline and migration inventory

## Result

**Verified. Phase 0 exit gate satisfied.** The required core baseline commands passed, migration sites are identified, and no new product decision or source-test blocker was found. Step 1.1 has not started.

This is baseline evidence, not acceptance of the new behavior. No application source, dependencies, lockfiles, browser installation, or approved audio references were changed.

## Revision, environment, and scope

- Revision: `548e87f2bb7d8b1c9f115d8180f9ab7383d7286e`.
- Node: `v22.22.2`.
- pnpm: `10.33.2`, matching the repository configuration.
- Working directory: `/Users/andy/Documents/Development/web-audio`.
- Initial `git status --short`: empty. The earlier historical-plan move and feature documents were already committed; there was no uncommitted move to preserve during this step.
- After the baseline commands, only the parent session's plan-status edit was tracked as modified. Builds did not change tracked application files.
- The spec's existing inferred defaults remain in force. Findings and progress belong here; plan changes are limited to status, task checkboxes, and evidence links.

All source paths below are repository-relative. Line references describe this revision and will move during implementation.

## Executed baseline gates

Commands were run from the repository root. Tests/checks ran after the dependency/artifact build, and each command exited successfully.

| Command                                                                                | Result                                   | Scope proved                                                                                           |
| -------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm exec turbo run build --filter=@web-audio/fluid --filter=@web-audio/audio-engine` | Exit 0; 6/6 tasks successful, all cached | Required package/dependency artifacts restored or available through Turbo; **not a fresh compilation** |
| `pnpm --filter @web-audio/fluid test:ci`                                               | Exit 0; 36 files, 1,227 tests passed     | Current Fluid source behavior                                                                          |
| `pnpm --filter @web-audio/schema test:ci`                                              | Exit 0; 1 file, 121 tests passed         | Current graph validation behavior                                                                      |
| `pnpm --filter @web-audio/audio-engine test:ci`                                        | Exit 0; 28 files, 404 tests passed       | Current engine unit/integration behavior, including existing fake-audio seams                          |
| `pnpm --filter @web-audio/fluid check`                                                 | Exit 0                                   | Current Fluid TypeScript contract, including included tests                                            |
| `pnpm --filter @web-audio/schema check`                                                | Exit 0                                   | Current schema TypeScript contract                                                                     |
| `pnpm --filter @web-audio/audio-engine check`                                          | Exit 0                                   | Current engine TypeScript contract                                                                     |

**Total:** 65 test files and 1,752 tests passed, plus all three core package type-checks.

Non-failing warnings:

- Cached build output includes the experimental `tsgo` warning.
- Fluid/audio-engine config loading emits the existing Vite/Vitest warning involving `__dirname` under native config loading.

No baseline failure, workaround, waiver, or accepted deviation was needed. The cached build result must not be described as evidence that tsdown freshly compiled the current packages in this run.

## Native-audio prerequisites: presence only

Read-only inspection found:

- Installed Playwright: `1.59.1`.
- Expected Chromium/headless-shell revision: `1217`; browser version recorded by the installed package: `147.0.7727.15`.
- The expected mac-arm64 headless shell exists and passes an executable-bit check:

  ```text
  /Users/andy/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell
  ```

- The installation's `INSTALLATION_COMPLETE` and `DEPENDENCIES_VALIDATED` markers are present.
- `PLAYWRIGHT_BROWSERS_PATH`, `INIT_CWD`, and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` were unset in the parent shell when checked. Package execution can set its own `INIT_CWD`; no custom executable override was found in `packages/audio-regression/src/runner/with-browser.ts`.
- Static case inventory: **14 cases, 14 complete reference WAV/metadata pairs, and 22 sample files**. No missing case/reference pair or currently declared sample file was found. The explicit pre-envelope-sampler mapping points to the existing sample-tone WAV.
- The audio-regression README's “11 cases” description is stale; the filesystem inventory is the relevant prerequisite evidence. This documentation discrepancy is not a source-test blocker and was not repaired in baseline work.

The binary check used `test -x`; environment overrides were checked with `printenv`. Installed package metadata, browser installation paths, case metadata, resource mappings, and filesystem contents were inspected without launching a browser.

**Not proved:** successful Chromium launch, native-library compatibility, loopback permission, `OfflineAudioContext`, AudioWorklet execution, audio rendering, reference comparisons, or listening approval. No browser was installed or launched and no native test was run. These remain Step 4.2 execution checks, not passed baseline checks.

## API migration inventory

The inventory covers `packages/`, `apps/`, and active `docs/`; historical `plans/completed/` documents are not migration targets. No affected application callsite was found. Preserve already-valid scalar, shorthand, and permitted direct-source calls rather than rewriting every occurrence of a method name.

### Envelope argument prework — Step 1.1

Current dispatch is in:

- `packages/fluid/src/drome.ts:205–217`.
- `packages/fluid/src/automations/envelope.ts:20–42`.

Tests actively characterize numeric-single minimum semantics and/or old maximum argument forms:

- `packages/fluid/src/automations/__tests__/envelope.test.ts:29–56`.
- `packages/fluid/src/__tests__/parameter-compatibility.test.ts:28–41,64–75`.
- `packages/fluid/src/__tests__/parameter-shorthand.test.ts:311–351,442–479`.

Active documentation: `docs/concepts/syntax.md:137–150`.

Distinguish two actions:

1. Tests whose purpose is to define `env(x)` must deliberately change to the new maximum meaning.
2. A caller that needs its existing bounds must become `env(oldMinimum, 1)` rather than silently changing its range.

No single-numeric production sketch call requiring a sound-preserving rewrite was found in the audited application/audio-regression sketches. Existing two-bound envelopes remain two-bound calls. Final removal of variadic maximum/raw-array forms belongs to Step 3.3, not this prework.

### Noise — Step 3.1

Affected implementation and legacy-call coverage:

- `packages/fluid/src/instruments/instrument.ts:266–279` — color/gain dispatch and variadic gain.
- `packages/fluid/src/instruments/__tests__/noise.test.ts:45,51` — raw-array gain with and without color.
- `packages/fluid/src/__tests__/parameter-shorthand.test.ts:80–99,241–247` — structured inputs forwarded through rest arguments; retain direct/reusable shorthand rows.
- `docs/reference/instruments/noise.md:16–27,37` — variadic signature and colored raw-array example.

Preserving two gain bars requires `.noise("pink", d.str(0.2, 0.1))`. Preserving two values within one bar requires `.noise("pink", d.str([0.2, 0.1]))`. The strict gain-slot rule also applies when color is omitted.

### Filter frequency — Step 3.1

Affected files:

- `packages/fluid/src/effects/filter.ts:13–17` — constructor frequency rest input.
- `packages/fluid/src/drome.ts:227–240` — filter factory and dedicated low/high/band-pass forwarders.
- `packages/fluid/src/effects/__tests__/filter.test.ts:47–52` — separate arguments intentionally create separate bars.
- `packages/fluid/src/__tests__/parameter-shorthand.test.ts:99,130–132,169` — raw structured frequency through constructors/factories.

`d.filter("lp", 400, 1200)` becomes `d.filter("lp", d.str(400, 1200))`.

**Do not broadly migrate dedicated factories.** `d.lpf/hpf/bpf` retain variadic pattern sugar. Their existing forwarding into `new Filter(type, ...frequency)` needs an adapter when the constructor becomes strict. `packages/fluid/src/buses/__tests__/bus.test.ts:70–85` also protects this convenience behavior.

### LFO endpoints — Step 3.2

Affected files:

- `packages/fluid/src/automations/lfo.ts` — raw-array endpoint dispatch and warning behavior.
- `packages/fluid/src/automations/__tests__/lfo.test.ts:30–43,141–149` — historical endpoint arrays.
- `packages/fluid/src/__tests__/parameter-shorthand.test.ts:886–888,953` — valid array endpoints and an intentional invalid array/string case.
- `packages/audio-regression/cases/lfo-filter/sketch.js:8` — existing reviewed-case source uses an array endpoint.
- `docs/concepts/syntax.md:158–166` and `docs/concepts/patterns.md:188` — documented array behavior.
- `packages/fluid/src/drome.ts` — public factory arity must be checked before forwarding; it must not discard extra JavaScript arguments.

The sound-preserving migration is `d.lfo(d.str(300, 900), otherEndpoint)`, **not** `d.lfo(d.str([300, 900]), otherEndpoint)`. Old endpoint arrays represent separate bars. Migrate the audio-regression sketch's source without refreshing its approved recordings. Existing invalid cases should remain invalid.

### Chop and event replay — Step 3.3

Affected implementation, calls, and fixtures:

- `packages/fluid/src/instruments/sampler.ts:156`.
- `packages/fluid/src/instruments/sampler-event-timing.ts:51–73`.
- `packages/fluid/src/__tests__/drome.test.ts:1340,1444`.
- `packages/fluid/src/instruments/__tests__/instrument.test.ts:783`.
- `packages/fluid/src/__tests__/parameter-shorthand.test.ts:1024–1050`.
- `packages/fluid/src/__tests__/event-schemas/support/schema-fixtures.ts:24`.
- `packages/fluid/src/__tests__/event-schemas/support/scenario-replay.ts:143–149,209–211`.
- `packages/fluid/src/__tests__/event-schemas/support/native-regression-fixtures.ts:429,443`.
- `packages/fluid/src/__tests__/event-schemas/support/generated-scenarios.ts`.

The replay seam is important: operation argument types derive from `Parameters<Sampler[Method]>`; fixtures store sequence arrays; both replay paths destructure and spread the trailing sequence. Change the fixture representation and both native/public replay paths together, preserving authored timing and valid random cases rather than weakening the new public boundary.

Examples:

- `.chop(4, [0, 2])` becomes `.chop(4, d.str([0, 2]))`.
- `.chop(4, [0, 2], [1, 3])` becomes `.chop(4, d.str([0, 2], [1, 3]))`.

Omitted/generated sequences, slice count, fit behavior, and dedicated sampler region setters are not new patternability work.

### ADSR — Step 3.2

Affected contract and tests:

- `packages/fluid/src/automations/envelope.ts:55–64,110–116`.
- `packages/fluid/src/instruments/instrument.ts:291–297`.
- `packages/fluid/src/inputs/types.ts`.
- `packages/fluid/src/automations/__tests__/envelope.test.ts:118–146`.
- `packages/fluid/src/__tests__/parameter-shorthand.test.ts:501–546,753–776`.
- `packages/fluid/src/__tests__/parameter-compatibility.test.ts`.
- `packages/fluid/src/instruments/__tests__/instrument.test.ts`.
- `docs/concepts/syntax.md`.

Existing four-scalar and scalar/shorthand calls need no migration. Add static structured-wrapper coverage without converting intentional raw-array/random negatives into valid calls. Instrument and envelope boundaries must both enforce arity, and all four replacements must still validate before assignment.

## Envelope minimum reader/writer inventory — atomic Step 2.1

### Canonical graph contract and production paths to migrate

| Responsibility                 | Current source and required boundary                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical schema               | `packages/schema/src/index.ts:175–183`: scalar `EnvelopeSchema.min`; indirectly exposed through audio-parameter and instrument-gain schema unions                       |
| Validation                     | `packages/schema/src/validate-graph.ts:778–798`: scalar finite-number check, adjacent to existing pattern validation for the other fields                               |
| Direct Fluid writer            | `packages/fluid/src/automations/envelope.ts:13–35,92–103`: scalar storage and `getSchema()` output                                                                      |
| Factory/default construction   | `packages/fluid/src/drome.ts:205–217`; `packages/fluid/src/instruments/instrument.ts:61–68` creates the default gain envelope                                           |
| Indirect serialization         | `packages/fluid/src/instruments/synth-base.ts:25–35`, `sampler.ts:286–299`, and `packages/fluid/src/effects/gain.ts:8–22` use the envelope/shared parameter serializers |
| Event resolution               | `packages/audio-engine/src/instruments/instrument.ts:522–534`: resolves maximum/ADSR but currently copies minimum                                                       |
| External detune initialization | `packages/audio-engine/src/instruments/instrument.ts:499–515`: currently initializes from `schema.min`; synth/sampler source initialization consumes that value         |

The last reader is easy to miss: resolving the ordinary gain envelope alone would still leave external detune with an unresolved pattern where a number is required.

### Graph fixtures and canonical expectations to migrate with that contract

- `packages/schema/src/validate-graph.test.ts:46–50,1061–1063`.
- `packages/audio-engine/src/__tests__/support/schema-fixtures.ts:64–74`.
- `packages/audio-engine/src/instruments/__tests__/instrument.test.ts:461–478`.
- `packages/audio-engine/src/instruments/__tests__/synthesizer.test.ts:102–106`.
- `packages/audio-engine/src/instruments/__tests__/pre-envelope-effects.test.ts:101–105`.
- `packages/audio-engine/src/instruments/__tests__/noise.test.ts:129–132,219–223`.
- `packages/audio-engine/src/instruments/__tests__/sampler.test.ts:112–116`.
- `packages/fluid/src/automations/__tests__/envelope.test.ts:14–50`.
- `packages/fluid/src/effects/__tests__/gain.test.ts:35–39`.
- `packages/fluid/src/__tests__/parameter-compatibility.test.ts:31–75`.
- `packages/fluid/src/__tests__/parameter-shorthand.test.ts:307–351,424–427,460–462`.
- `packages/fluid/src/__tests__/drome.test.ts:242–380,2438–2442`.

### Resolved scalar values and unrelated fields that must stay scalar

- `packages/audio-engine/src/parameters/types.ts:8–16,25–33`: resolved envelope minimum and `EnvelopeParams.min` remain numbers.
- `packages/audio-engine/src/parameters/compute-envelope.ts:5–24`: arithmetic consumes resolved numbers and retains existing interpolation/inversion behavior.
- Existing computation fixtures for resolved envelopes, including `compute-envelope.test.ts`, remain scalar-input tests.
- Scheduling in `packages/audio-engine/src/instruments/instrument.ts:548–566` uses resolved scalar minimum for attack/release.
- Random ranges, MIDI ranges, event pitch ranges, sample regions, and other unrelated `min` properties do not become envelope patterns.

No direct app-owned envelope-minimum reader or writer was found. The web evaluation worker uses Fluid indirectly, and `AudioEngine.update()` clones/validates the current graph. Audited sketch database persistence stores source code (`apps/web/src/lib/server/db/schema.ts`), not a saved envelope graph; no legacy persisted-graph adapter was found in that path.

## Inferred-default review

| Spec default                                       | Baseline observation                                                                                                  | Disposition                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| One argument always selects envelope maximum       | Numeric single currently selects minimum; shorthand single selects maximum                                            | Deliberate prework change, not an unresolved contradiction                                                 |
| `undefined` defaults; `null` rejects               | Constructor currently uses `minOrMax ?? 0`, and a nullish legacy case is covered in `parameter-shorthand.test.ts:351` | Explicitly replace accidental null coercion; add the new default/rejection tests rather than preserving it |
| Noise has one gain slot even without color         | Both existing overload forms permit variadic structured gain                                                          | Apply the agreed method-level rule uniformly; keep dedicated setters variadic                              |
| Builders snapshot static arrays                    | Legacy numeric setters can retain caller-owned array references                                                       | New wrapper ownership must be tested without changing legacy setter ownership                              |
| Sole random may be wrapped where already permitted | Existing numeric/event consumers have distinct sole-random/source restrictions; ADSR rejects positional random        | Preserve each permission, including invalid random/static mixtures and ADSR negatives                      |
| Empty/nested/mixed wrappers reject                 | No structured builder exists yet                                                                                      | New boundary behavior, with no legacy wrapper contract to preserve                                         |
| Canonical minimum uses `NumberPattern`             | Current schema/writer/readers are scalar; resolved runtime math is also scalar but remains so                         | Planned atomic migration; no newly discovered compatibility requirement                                    |

No new material decision is required. The differences above are the intended changes or already-recorded inferred defaults, not waivers of existing tests.

## Gate assessment and next boundary

- Required baseline command outcomes are recorded and green.
- First-party positional callers, replay adapters, graph producers/readers, and fixtures are identified at the recorded revision.
- No unexpected tracked application or reference changes occurred.
- Native prerequisites are present on disk, with launch/render capability explicitly unverified.
- The stale README count and non-failing tooling warnings do not prevent interpreting source checks.

**Phase 0 is complete; Step 1.1 is ready but remains pending.** No feature acceptance criterion is claimed satisfied by this baseline alone.

Not run in Step 0.1: package/workspace lint, full workspace tests/checks, fresh forced builds, built API feature smoke tests, browser launch, native audio regression, listening, or implementation tests for behavior that does not exist yet.
