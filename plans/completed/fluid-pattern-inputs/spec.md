# Fluid Pattern Inputs Specification

## Status

- Readiness: Ready for planning
- Blocking decisions: None
- Source: The Fluid API cleanup discussion following PR #67, including the explicit agreement to support both numeric and event patterns with a structured builder, make envelope minimum patternable, and correct single-argument `env()` semantics as prework.
- Delivery state: Specification only; this document does not claim implementation or runtime verification.

## Problem and intended outcome

Fluid currently uses JavaScript arguments for two different purposes: selecting independent settings and describing successive bars of one structured pattern. For example, `.noise("pink", 0.2, 0.1)` has three JavaScript arguments but only two logical inputs: color and a two-bar gain pattern. This makes signatures harder to understand and requires methods to interpret argument boundaries individually.

Shorthand already packages a whole pattern into one value. Structured syntax needs an equivalent representation so users can choose either syntax without allowing a pattern to spill across positional fields.

The intended outcome is:

- Multi-input methods have one JavaScript argument per logical input.
- Both shorthand and structured patterns are first-class, reusable values.
- Single-input setters retain convenient variadic structured syntax.
- Input normalization is shared without erasing consumer-specific pattern semantics.
- Envelope minimum and maximum use consistent argument meanings and numeric pattern behavior.

## Scope

Included:

- Prework correcting `d.env(x)` so one argument always addresses maximum, independent of its type.
- `d.structured()` and its alias `d.str()` for numeric and event structured patterns.
- Builder support across existing structured-pattern consumers, including notes, sample names, variations, and XOX.
- Single-slot pattern inputs for noise, envelope construction, filter construction, sampler chop, LFO endpoints, and positional ADSR.
- Preservation of variadic structured convenience syntax in dedicated single-input methods.
- Patternable envelope minimum throughout Fluid, schema validation, serialization, and audio playback.
- Consistent validation, existing source permissions, reusable-value ownership, and source migration documentation.

Non-goals:

- Patternability or additional shorthand support for timing-generator settings such as `.euclid()`, `.hex()`, and `.sequence()`.
- Expanding LFO speed, waveform, or phase/offset input syntax.
- Expanding scalar configuration, routing, send, ducking, fit length, or chop slice-count inputs.
- Adding compensating setters such as `.noiseGain()` or adding a separate envelope-minimum setter.
- Expanding existing modulation-source permissions or positional ADSR random-source permissions.
- Changing shorthand grammar, event timing, random algorithms, or playback interpretation of existing pattern structures.
- Automatically rewriting saved source sketches or providing a legacy graph compatibility layer.
- Implementation planning, application-code changes, or release execution.

## Current behavior and evidence

The following findings come from static source and existing-test inspection during the discussion, not from tests or live audio run for this specification.

- `packages/fluid/src/drome.ts` exposes `shorthand()` / `sh` and the affected factories. Numeric `env(x)` currently addresses minimum, whereas a sole shorthand input addresses maximum.
- `packages/fluid/src/automations/envelope.ts` stores minimum as a scalar and maximum/ADSR fields as parameters. Positional ADSR accepts numbers or shorthand, rejects arrays and random cycles, and constructs all replacement fields before assignment.
- `packages/fluid/src/instruments/instrument.ts` implements color-plus-variadic-gain noise, numeric gain updates to the existing gain envelope, envelope replacement through `.gain(envelope)`, and instrument ADSR forwarding.
- `packages/fluid/src/effects/filter.ts` accepts type plus variadic frequency. `packages/fluid/src/instruments/sampler.ts` and `sampler-event-timing.ts` accept slice count plus a structured or shorthand chop sequence.
- `packages/fluid/src/automations/lfo.ts` has two positional endpoints. A raw endpoint array currently means separate bars, unlike an array passed as one argument to ordinary numeric setters.
- `packages/fluid/src/inputs/types.ts`, `decode-numeric-input.ts`, and `packages/fluid/src/parameters/resolve-audio-param.ts` already centralize much of numeric decoding and permitted audio-source dispatch.
- `packages/fluid/src/inputs/decode-structured-input.ts` and `decode-xox-input.ts` preserve event-specific geometry and atom rules. XOX also has specialized compact notation.
- The audited numeric slots already accept direct shorthand strings and reusable `d.sh()` values. Event notes, names, variations, and XOX also support shorthand. This feature does not require a further shorthand-coverage expansion for those slots.
- `packages/schema/src/index.ts` represents `EnvelopeSchema.min` as a number. `packages/schema/src/validate-graph.ts` validates it as finite, without requiring `min <= max` or a `[0, 1]` range.
- `packages/audio-engine/src/instruments/instrument.ts` resolves envelope maximum and ADSR values per event using bar/hit indices. `packages/audio-engine/src/parameters/compute-envelope.ts` uses `min + (max - min) * sustain` and allows inverted envelopes.
- Reusable shorthand is immutable in `packages/patterns/src/shorthand/create.ts`. Existing raw numeric arrays can retain caller-owned references; changing their legacy ownership behavior is not part of this feature.
- `plans/completed/parameter-shorthand/spec.md` records the previous feature's contract. Its scalar-only minimum and narrower positional ADSR policy are historical context, not the target contract here.

## Requirements and invariants

- **R1 — Consistent envelope argument meanings:** `env()` uses default bounds; one argument always addresses maximum; two arguments address minimum and maximum. Argument type must not change the selected field. This correction is prework to the broader cleanup.
- **R2 — Explicit structured values:** `d.structured()` and `d.str()` create equivalent reusable whole-pattern values accepted by numeric and event structured-pattern consumers.
- **R3 — Structured semantic parity:** A builder preserves the meaning of the structured argument list it packages, including bars, steps, rests, and simultaneous values where supported. It must not parse its string atoms as shorthand or add an extra array level.
- **R4 — Reuse and ownership:** Reusing a structured value must not allow one consumer's decoding or playback to alter another consumer's pattern. Static input arrays are snapshotted rather than retained as mutable caller-owned pattern data.
- **R5 — One argument per positional slot:** Multi-input methods accept each pattern through a single explicit value. They reject raw array patterns and variadic continuation of a positional pattern slot, rather than reinterpreting or ignoring extra arguments.
- **R6 — Dedicated-setter compatibility:** Existing single-logical-input methods retain their variadic structured syntax and also accept one structured value as an alternative.
- **R7 — Patternable envelope minimum:** Minimum supports the same numeric pattern forms and event lookup semantics as maximum throughout the graph and playback path, without introducing range-order normalization.
- **R8 — Permission preservation:** Accepted atom types, random inputs, and modulation sources remain consumer-specific. Wrapping an input must not bypass a consumer restriction.
- **R9 — Validation and atomicity:** Invalid inputs fail synchronously at the applicable builder/API boundary with useful context, and an invalid replacement leaves all existing affected state unchanged.
- **R10 — Shared normalization boundary:** Consumers share interpretation of whole-pattern wrappers and variadic convenience syntax. Consumer-specific validation, event geometry, and playback ownership remain separate from this syntax normalization.
- **R11 — Explicit breaking changes:** Public typing, canonical graph output, documentation, and migration examples agree with the new contracts. Old positional calls must not silently acquire an unintended partial interpretation.

## Behavior and contracts

### Envelope prework: stable positional meanings

The prework establishes these meanings before the broader signature cleanup:

| Call                    | Minimum | Maximum                  |
| ----------------------- | ------- | ------------------------ |
| `d.env()`               | `0`     | `1`                      |
| `d.env(0.1)`            | `0`     | `0.1`                    |
| `d.env("0.1")`          | `0`     | Pattern containing `0.1` |
| `d.env(0.1, 0.8)`       | `0.1`   | `0.8`                    |
| `d.env(undefined)`      | `0`     | `1`                      |
| `d.env(undefined, 0.8)` | `0`     | `0.8`                    |
| `d.env(0.1, undefined)` | `0.1`   | `1`                      |

Explicit `undefined` uses the corresponding default. `null` is not a numeric bound or a request for a default. The constructor used by `d.env()` must agree with its factory.

The old numeric call `d.env(0.1)` changes meaning deliberately. Preserving its previous bounds requires `d.env(0.1, 1)`.

In the final contract, a sole shorthand, structured value, or other already-permitted numeric-pattern input also addresses maximum. Two supplied fields address minimum and maximum even if one is `undefined`.

### Structured builder

```ts
const alternateBars = d.str(0.2, 0.1);
const valuesWithinOneBar = d.structured([0.2, 0.1]);

instrument.gain(alternateBars);
instrument.noise("pink", alternateBars);

const melody = d.str([60, 64, 67], [62, 65, 69]);
firstInstrument.notes(melody);
secondInstrument.notes(melody);
```

The builder packages the existing structured argument list:

| Input                   | Meaning                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| `d.str(0.2, 0.1)`       | Two successive bars, one value each                                            |
| `d.str([0.2, 0.1])`     | One bar with two sequential values                                             |
| `d.str([60, null, 64])` | One bar with a rest, for event consumers that permit rests                     |
| `d.str([[60, 64], 67])` | Simultaneous notes followed by another note, for a notes consumer              |
| `d.str("bd", "sd")`     | Structured string atoms in separate bars, for consumers permitting those atoms |

Builder contents are interpreted as structured data. For example, `d.str("0.2 0.1")` is not numeric shorthand and must fail when consumed as a numeric pattern. Event consumers retain their own string validation and any existing native XOX interpretation.

A structured value represents the entire pattern input:

- `.gain(d.str(0.2, 0.1))` is valid.
- `.gain(d.str(0.2), 0.1)` is invalid.
- `.gain([d.str(0.2)])` is invalid.
- Builders cannot contain another builder or a reusable shorthand value.
- Empty builder calls are rejected; they do not stand in for an omitted parameter. Existing consumer behavior for explicitly authored empty arrays is not broadened by this feature.

A sole random-cycle input can be packaged only where the corresponding existing structured consumer permits that random input. Mixing a random source with static bars remains invalid. An envelope, LFO, or MIDI controller is an audio source, not structured pattern data, and is passed directly to a slot that permits it rather than placed inside `d.str()`.

Static arrays are recursively copied into the reusable value and cannot be changed through caller-owned arrays or exposed wrapper storage. The wrapper carries no per-consumer playback cursor. Existing random-source configuration semantics are preserved; this feature does not freeze or clone a caller's random builder instance.

### Multi-input API contracts

The table describes logical contracts, not required internal TypeScript type names. A numeric pattern slot accepts a scalar, direct/reusable shorthand, or a structured value, plus any direct random/audio source already permitted for that specific slot.

| API family | Final contract                                                     | Important preserved behavior                                                                                                                    |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Noise      | `.noise()`, `.noise(gain)`, `.noise(color)`, `.noise(color, gain)` | Default color is white; omitted gain is `1`; supported colors and source permissions remain unchanged; calls replace the noise layer as before. |
| Envelope   | `d.env()`, `d.env(max)`, `d.env(min, max)`                         | Default bounds and explicit `undefined` behavior above; both bounds become numeric-pattern slots.                                               |
| Filter     | `d.filter(type, frequency)`                                        | Type remains a scalar selector; existing frequency source permissions and omission behavior are preserved.                                      |
| Chop       | `.chop(sliceCount, sequence?)`                                     | Slice count remains scalar; omission retains generated sequence behavior; explicit sequence retains authored timing authority.                  |
| LFO        | `d.lfo(outputA, outputB)`                                          | Both endpoints use explicit pattern values; existing random permissions and multivalue-bar warnings remain.                                     |
| ADSR       | `.adsr(a, d, s, r)` on instruments and envelopes                   | All four fields accept numbers, shorthand, or permitted static structured values; no raw positional arrays or random/modulation sources.        |

The same contracts apply to the constructors behind these factories. No additional public constructor export is required.

The explicit gain-slot rule applies to noise even when color is omitted. It does not retain a separate variadic gain overload:

```ts
instrument.noise("pink", d.str(0.2, 0.1)); // valid
instrument.noise(d.str(0.2, 0.1)); // valid, white noise

instrument.noise("pink", 0.2, 0.1); // rejected
instrument.noise(0.2, 0.1); // rejected
instrument.noise("pink", [0.2, 0.1]); // rejected
```

Other examples:

```ts
d.env("0 0.1", "0.5 1");
d.env(d.str(0, 0.1), d.str(0.5, 1));
d.filter("lp", d.str(400, 1200));
sampler.chop(4, d.str([0, 2], [1, 3]));
d.lfo(d.str(0.2, 0.8), 1);
instrument.adsr(d.str(0.01, 0.02), 0.1, 0.8, 0.2);
```

Passing a raw array to any pattern field in these multi-input APIs is rejected, including when another field is omitted. Extra arguments are rejected rather than ignored or appended to the last pattern field.

### Single-input consumers

The following retain their existing structured argument lists and gain explicit-wrapper support:

- Instrument `.detune()` and numeric `.gain()`.
- Envelope `.max()`, `.a()`, `.d()`, `.s()`, and `.r()`.
- Filter `.q()`, `.detune()`, and `.gain()`.
- Unison `.voices()`, `.spread()`, and `.width()`.
- Sampler `.start()`, `.end()`, `.duration()` / `.dur()`.
- `d.gain()`, `d.lpf()`, `d.hpf()`, and `d.bpf()` and their applicable constructor input paths.
- Event `.notes()`, sampler `.name()`, `.variation()` / `.var()`, and `.xox()`.

```ts
instrument.gain(0.2, 0.1);
instrument.gain(d.str(0.2, 0.1)); // same structured pattern
```

For shorthand-compatible numeric consumers, equivalence also holds with `.gain("<0.2 0.1>")`. It does not hold with `.gain("0.2 0.1")`, which has two values within one bar.

Existing no-argument behavior, aliases, method chaining, and accepted direct sources remain unchanged for these consumers. `.gain(envelope)` still replaces the gain envelope; numeric gain still changes its maximum without resetting minimum, ADSR, or mode. Builder support must not turn numeric gain into a complete-envelope replacement.

### Envelope minimum: graph and playback behavior

Minimum becomes a numeric pattern field in the canonical envelope graph, using the same `NumberPattern` representation as maximum. Default bounds serialize as constant numeric patterns with values `0` and `1` respectively. Every first-party envelope producer, validator, and consumer must agree on this representation.

At each existing envelope-trigger event:

1. Resolve minimum using the same bar index, hit index, and numeric-pattern lookup rules used for maximum.
2. Resolve maximum and ADSR using their existing rules.
3. Use those resolved bounds for that event's entire envelope, including release back to its resolved minimum.

Independent minimum and maximum patterns wrap independently. Minimum does not introduce a new clock, continuous/audio-rate modulation, or an independently generated rhythm.

Preserve existing envelope math and range behavior:

- Values must satisfy existing finite-number validation.
- Bounds are not limited to `[0, 1]`.
- `min > max` remains valid and produces an inverted envelope.
- Sustain remains `min + (max - min) * s`.
- Do not swap, sort, or clamp bounds when they cross.
- Minimum supports the numeric/random forms permitted for maximum, not nested envelopes, LFOs, or MIDI sources.

Patterned minimum must work both for the instrument's gain envelope and for an envelope used as a supported external audio-parameter source.

### Validation and failure behavior

Public TypeScript signatures must distinguish explicit positional pattern values from legacy variadic argument lists. Negative cases must also be rejected at runtime for JavaScript callers; type checking alone is insufficient.

Wrapper construction validates wrapper-level structure. A consumer validates atoms, geometry, and source permissions against its own contract. Errors identify the relevant API and, for multi-field calls, the failing field where practical; exact message wording is not prescribed.

Invalid replacement calls must not change existing parameters, envelope fields, noise-layer state, or sampler authored-timing state. In particular, all four ADSR inputs are validated before any field is replaced.

A wrapper does not authorize otherwise invalid inputs:

- Numeric consumers reject rests and event-only simultaneous-value structures they do not support.
- Notes, names, variations, and XOX retain their own atom and polyphony rules.
- Positional ADSR rejects random cycles even if packaged in a wrapper.
- Sources invalid for a parameter remain invalid both directly and when improperly wrapped.

### Compatibility and migration

Deliberate breaking changes are documented, not hidden behind heuristic argument interpretation:

| Previous source             | Replacement preserving its previous meaning |
| --------------------------- | ------------------------------------------- |
| `d.env(0.1)`                | `d.env(0.1, 1)`                             |
| `.noise("pink", 0.2, 0.1)`  | `.noise("pink", d.str(0.2, 0.1))`           |
| `.noise(0.2, 0.1)`          | `.noise(d.str(0.2, 0.1))`                   |
| `d.env(0, 0.2, 0.8)`        | `d.env(0, d.str(0.2, 0.8))`                 |
| `d.filter("lp", 400, 1200)` | `d.filter("lp", d.str(400, 1200))`          |
| `.chop(4, [0, 2], [1, 3])`  | `.chop(4, d.str([0, 2], [1, 3]))`           |
| `d.lfo([0.2, 0.8], 1)`      | `d.lfo(d.str(0.2, 0.8), 1)`                 |

The LFO migration is intentionally not `d.str([0.2, 0.8])`: that would express a multivalue bar rather than two bars. Existing first-value-per-bar playback and warnings for LFO multivalue bars remain unchanged.

Old numeric single-argument envelope calls are inherently ambiguous as author intent; no automatic source migration is required. The canonical envelope graph change is also breaking. First-party graph consumers must be updated together; adding a legacy scalar-minimum compatibility adapter is not required by this SOW.

## Ownership and boundaries

- Fluid owns public argument boundaries, structured-wrapper recognition, and conversion into consumer-compatible pattern inputs.
- A shared syntax-normalization boundary owns wrapper extraction and variadic convenience handling. Individual methods must not independently reinterpret wrapper array geometry.
- Numeric and event decoders retain ownership of their different atom semantics and structures. This feature does not require merging them into one universal decoder.
- Schema owns the canonical pattern-valued minimum contract and graph validation. Reusable wrapper objects must not leak into emitted graphs.
- The audio engine owns event-index lookup and scheduling. Builder values must not own playback clocks or mutable per-consumer resolver state.
- Production code must not depend on test fixtures or test-only helpers. Exact module placement and helper names remain implementation choices.

## Acceptance criteria

These are required future checks, not claims that verification has already been performed.

| ID   | Requirement(s) | Starting condition / action                                                                                                                             | Expected outcome                                                                                                                                            | Verification approach                             |
| ---- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| AC1  | R1, R11        | Construct envelopes with no argument, one numeric argument, one shorthand argument, and two numeric arguments.                                          | Bounds match the envelope contract table; a sole numeric and equivalent shorthand address the same maximum field.                                           | Fluid public API and schema assertions            |
| AC2  | R1, R9         | Exercise explicit `undefined` defaults and pass `null` as a bound from JavaScript.                                                                      | `undefined` uses the documented field default; `null` is rejected rather than treated as a default or numeric pattern.                                      | Runtime and public type tests                     |
| AC3  | R2, R3         | Consume `d.str(0.2, 0.1)` and `d.structured([0.2, 0.1])` in a numeric setter.                                                                           | Both aliases work; the first yields two one-value bars and the second one two-value bar. Equivalent shorthand has matching numeric meaning.                 | Builder and numeric-decoder tests                 |
| AC4  | R2, R3, R6     | Supply builders to notes, names, variations and their alias, and XOX using structures valid for each consumer.                                          | Results match equivalent existing structured calls, including permitted rests/chords and specialized XOX behavior.                                          | Event-decoder and public API tests                |
| AC5  | R3, R8, R9     | Consume numeric-looking string atoms inside a structured value; pass invalid event atoms or unsupported rests/polyphony to their consumers.             | Structured strings are not parsed as shorthand; each consumer retains its own rejection rules.                                                              | Decoder negative tests                            |
| AC6  | R4             | Build a static value from nested arrays, mutate the original arrays, and reuse the value in two consumers.                                              | The built value retains its original structure; consuming or playing one instance does not mutate the other.                                                | Ownership and reuse tests                         |
| AC7  | R5, R9         | Exercise every multi-input family with scalar, shorthand, and permitted structured fields; then pass raw arrays or extra continuation arguments.        | Valid single-slot forms work; invalid raw/extra forms are rejected in types and at runtime without partial state changes.                                   | Table-driven public API and type-negative tests   |
| AC8  | R5, R6         | Compare noise with and without a color selector to a dedicated gain setter.                                                                             | Noise requires one explicit gain value in both forms; the dedicated setter still accepts its legacy variadic pattern.                                       | Noise overload and setter regression tests        |
| AC9  | R6, R8         | Exercise all listed single-input consumers, aliases, direct sources, and no-argument calls that already have defined behavior.                          | Legacy semantics remain; wrapper alternatives yield equivalent patterns without resetting unrelated state.                                                  | Existing-suite regression and public API coverage |
| AC10 | R7, R11        | Construct default, constant-bound, and patterned-bound envelopes and serialize/validate their graphs.                                                   | Both bounds use canonical numeric-pattern schemas; validators and first-party consumers accept valid graphs and reject invalid numeric patterns.            | Schema and Fluid integration tests                |
| AC11 | R7             | Trigger envelopes with independently sized minimum/maximum patterns across multiple bars and hits.                                                      | Each bound uses existing independent bar/hit wrapping; scheduled attack/release use that event's resolved minimum.                                          | Resolver and audio-engine scheduling tests        |
| AC12 | R7             | Trigger an envelope whose minimum exceeds maximum, including a crossing produced by patterns.                                                           | Bounds are not reordered or clamped; sustain and inverted ramps follow existing envelope math.                                                              | Envelope computation and scheduling tests         |
| AC13 | R7, R8         | Use patterned-minimum envelopes as instrument gain and as an allowed external audio source.                                                             | Both resolve minimum consistently; unsupported nested modulation sources remain rejected.                                                                   | Audio-source integration tests                    |
| AC14 | R8             | Pass permitted random inputs directly and through builders; attempt positional ADSR random fields and random-plus-static mixtures.                      | Existing random permissions remain; wrapping does not make positional ADSR or mixed random/static inputs valid.                                             | Permission matrix and negative tests              |
| AC15 | R9             | Start with configured ADSR, noise, and sampler timing; submit a replacement with a late invalid field/input.                                            | The call throws and all previous affected state remains unchanged.                                                                                          | Atomicity regression tests                        |
| AC16 | R2, R9, R10    | Pass an empty builder, nested builder, reusable shorthand inside a builder, a builder inside an array, or a builder mixed with other pattern arguments. | Invalid wrapping/composition is rejected rather than silently flattened, appended, or interpreted differently by consumers.                                 | Shared-boundary and public API negative tests     |
| AC17 | R3, R5, R11    | Migrate the documented LFO raw-array call and exercise an intentionally multivalue endpoint bar.                                                        | Migration preserves two bars; intentional multivalue bars retain existing first-value playback and warning behavior.                                        | LFO schema and warning tests                      |
| AC18 | R10, R11       | Review generated graphs, public signatures, docs, and first-party examples after implementation.                                                        | Graphs contain no wrappers; signatures and examples use the same positional rules; all documented breaking migrations preserve the indicated prior meaning. | Integration assertions and documentation review   |

## Assumptions

The following are specification defaults inferred from the agreed direction, not separately user-approved product decisions:

- Explicit `undefined` preserves field defaults, while `null` remains invalid numeric input. This avoids preserving accidental nullish coercion as an API contract.
- Noise uses the same single gain-slot rule with or without color. This follows the method-level cleanup and avoids retaining a second variadic convention within noise.
- Structured values snapshot static arrays, matching the reuse expectations of shorthand. Existing raw variadic arrays retain their previous ownership behavior; random builder configuration retains its existing lifecycle.
- A sole existing random-cycle structured input may be wrapped where its consumer already permits it. This preserves structured-input parity without expanding source permissions. Random configuration is not made immutable by wrapping.
- Empty builders, nested wrappers, and mixing a wrapper with other arguments are rejected. They have no established user-facing behavior to preserve and would undermine the whole-pattern boundary.
- Canonical minimum becomes `NumberPattern` rather than maintaining parallel scalar and pattern graph representations. No persisted-graph compatibility requirement was established in the discussion.

Planning should validate these defaults against the relevant source/tests. A newly discovered material conflict should be surfaced rather than silently changing an agreed requirement.

## Risks and open decisions

- Blocking: None identified from the discussion and static audit.
- Non-blocking: Numeric single-argument `env()` changes behavior without a syntax error. Migration guidance must make the old minimum interpretation conspicuous; source intent cannot be inferred automatically.
- Non-blocking: Envelope minimum touches graph producers, validators, and playback rather than only Fluid decoding. Missing a producer or consumer could leave structurally incompatible graphs.
- Non-blocking: Generic event builders must preserve atom-specific meaning, particularly sample-name strings, nullable/chord structures, and specialized XOX decoding.
- Non-blocking: Snapshot semantics deliberately differ from existing raw-array aliasing. Both behaviors need distinct tests so the cleanup does not accidentally change legacy setter ownership.
- Non-blocking: Raw LFO arrays have special historical bar semantics; migration and tests must avoid adding a nesting level.
- Non-blocking: Generic wrapper typing must retain useful consumer restrictions. Runtime validation remains mandatory for JavaScript and for generic event values that cannot be fully constrained statically.

## Deferred work

- Patternable timing-generator settings, including evaluation cadence and interactions between independently patterned generator inputs. Revisit in a separate SOW after this explicit-slot contract exists.
- Broader shorthand/patternability for LFO speed, waveform, or other currently excluded configuration controls.
- Changes to source permissions, random behavior, or envelope range/order policy beyond making minimum a numeric pattern.
- Automatic saved-source migration, a legacy graph adapter, and any release/deployment procedure. These are not implied by readiness for planning.
