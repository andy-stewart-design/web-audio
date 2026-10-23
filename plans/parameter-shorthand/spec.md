# Parameter Pattern Shorthand Specification

## Status

- Readiness: Ready for planning
- Blocking decisions: None
- Delivery state: Specification only; implementation has not started as part of this work.
- Source: The parameter-shorthand design discussion and focused interview preceding this specification. The existing [shorthand specification](../completed/shorthand-syntax/spec.md) and [direct-cutover plan](../completed/shorthand-syntax/direct-cutover-plan.md) provide the syntax foundation and event/processing boundary, not a mandate to migrate processing through event cycles.
- Delivery constraint: One PR, provided normalization cleanup remains behavior-preserving. A later implementation plan owns sequencing and verification commands.
- Approved compatibility exception: positional `adsr(a, d, s, r)` fields intentionally simplify from `number | number[] | shorthand` to `number | shorthand`. Number arrays are rejected by TypeScript and runtime for this positional API; individual envelope setters retain their existing structured-array/random/shorthand capabilities. This is a scoped breaking decision, not a general multi-argument numeric API rule.
- Decision provenance: The syntax subset, separate value evaluator, compatibility boundary, LFO first-value-plus-warning behavior, and shorthand-only envelope overload were explicitly agreed. The subsequent feedback review also adopted the expansion limits/accounting, failure isolation including all-or-nothing ADSR updates, and schema-time once-per-endpoint-per-LFO-instance warning lifecycle below. These are requirements, not pending inferred defaults.

## Problem and intended outcome

Users can compose notes, sample names, variations, and XOX timing with shorthand, but must use structured numeric inputs for processing parameters. Extending each setter independently would duplicate parsing, normalization, and modulation-source dispatch.

Users should be able to compose numeric parameter values with a useful subset of the existing language: sequences, square grouping, structural repetition, and deterministic bar alternation. Ordinary parameters continue consuming values by hit order, not musical offset. The existing structured API remains compatible apart from the approved positional ADSR array exception.

The enabling cleanup establishes a shared numeric-input boundary before shorthand is connected. It does not redesign parameter scheduling or the event-pattern pipeline.

## Scope

Included:

- Behavior-preserving standardization of numeric parameter input normalization and audio-parameter source dispatch.
- Direct shorthand strings and reusable `d.sh()` / `d.shorthand()` values in the numeric-pattern slots listed below.
- Finite numeric atoms, whitespace sequences, sequential `[ ]` groups, `!` repetition, and `< >` alternation across bars.
- A separate value-sequence evaluator consuming the existing parser's expression model and producing bounded numeric bars.
- Explicit handling of shorthand-only envelope construction, positional ADSR fields, LFO endpoints, noise color selectors, factories, aliases, and chop sequences.
- LFO warnings when static endpoint bars contain values beyond the first.
- Compatibility, public typing, negative-case, and expression-expansion coverage, plus documentation of the parameter-specific subset.

Non-goals:

- Rests, simultaneous numeric groups, acceleration, slowdown, weighting, or continuous/time-addressed parameter automation.
- New shorthand grammar, a second parser, or a second expression-tree representation.
- Changes to event evaluation, timing ownership, event transforms, or event compilation semantics.
- Converting processing parameters to `EventCycle` or instrument event state.
- New schema formats or audio-engine scheduling/resolution behavior.
- A diagnostics framework, repository-wide validation/default cleanup, defensive-copy policy migration, or cycle-class hierarchy redesign.
- Adding shorthand to every numeric argument or every array-shaped API. Timing generators, LFO speed/waveform lists, and scalar configuration fields remain outside scope.

## Current behavior and evidence

The following findings come from static source/test inspection, not execution during specification authoring:

- [`Parameter`](../../packages/fluid/src/parameters/parameter.ts) retains a `RandomCycle`, or turns scalar arguments into singleton bars and array arguments into within-bar values before constructing `ValueCycle`.
- [`ValueCycle`](../../packages/patterns/src/cycles/value-cycle.ts) emits `StaticPattern<number>` and rejects empty bars/non-finite values during serialization. Full-graph validation supplies additional checks. Legacy validation/default behavior is not uniform and is not being broadly corrected here.
- [`AudioParamInput`](../../packages/fluid/src/parameters/parameter.ts) also accepts an envelope, LFO, or MIDI CC as a sole source. Equivalent dispatch is repeated in instruments, filters, and gain effects.
- [`Lfo._toParameter()`](../../packages/fluid/src/automations/lfo.ts) spreads an endpoint's numeric array into separate bars, unlike ordinary parameter arrays. The engine resolves endpoints with value index zero on bar updates.
- [`Envelope`](../../packages/fluid/src/automations/envelope.ts) treats each positional ADSR argument independently. Historically, an array in one field was one bar of that field's values; the approved positional API now rejects those arrays. Its minimum is scalar; individual ADSR setters retain their pattern capabilities.
- [`Instrument.noise()`](../../packages/fluid/src/instruments/instrument.ts) reserves a leading `"white"` or `"pink"` for color and defaults omitted gain to `1`.
- [`Sampler`](../../packages/fluid/src/instruments/sampler.ts) uses parameters for region values and chop sequences. Chop sequence lengths also participate in generated timing through [`sampler-event-timing.ts`](../../packages/fluid/src/instruments/sampler-event-timing.ts) and [`sampler-utils.ts`](../../packages/fluid/src/instruments/sampler-utils.ts).
- The existing [`parser`](../../packages/patterns/src/shorthand/parser.ts), [`expression model`](../../packages/patterns/src/expressions/model.ts), and [`shorthand values`](../../packages/patterns/src/shorthand/create.ts) already represent the required syntax. Existing event evaluation additionally interprets temporal allocation, rests, continuations, and polyphony; that evaluation is not appropriate for numeric value sequences.
- [`ValuePatternResolver`](../../packages/audio-engine/src/patterns/value-pattern-resolver.ts) resolves static values as `cycle[barIndex % cycle.length][hitIndex % bar.length]`. Numeric shorthand must produce the same schema shape, not require a new resolver.
- Existing characterization sources include `packages/fluid/src/parameters/__tests__/parameter.test.ts`, `automations/__tests__/lfo.test.ts`, `automations/__tests__/envelope.test.ts`, effect/instrument tests, and `inputs/__tests__/shorthand-equivalence.test.ts`.

Deliberate changes are the new numeric shorthand input forms including a shorthand-only envelope overload, their target-specific validation, centralized interpretation/dispatch, the LFO warning, and the approved positional ADSR array removal. Existing individual-setter structured patterns, modulation sources, defaults, and event behavior remain the compatibility baseline.

## Requirements and invariants

- **R1 — Structured compatibility:** Existing valid structured inputs retain their numeric bar/value shapes, defaults, random settings, modulation semantics, consumer-specific adaptations, and emitted schema behavior, except for the approved positional ADSR array removal above. Cleanup must not incidentally change legacy validation timing, caller-array ownership, or default/reset semantics.
- **R2 — Shared numeric boundary:** Ordinary numeric-pattern consumers use one normalization/value-evaluation boundary. Audio-parameter source selection is shared rather than reimplemented per setter. Explicit consumer adapters may translate public argument shapes but must not implement shorthand operators themselves.
- **R3 — Input alternatives:** Each supported numeric-pattern slot accepts its existing input forms or one direct string or one reusable shorthand value. Shorthand is a whole-pattern alternative; it cannot be mixed into structured bars, combined with a random/modulation source, or supplied as several strings for one slot. The envelope factory and constructor additionally accept a sole leading shorthand as maximum with minimum defaulted to zero; a leading shorthand forbids additional arguments.
- **R4 — Numeric atoms:** Shorthand atoms must use the existing strict finite-decimal interpretation, including signed decimals and scientific notation. Zero is a value, not silence. Invalid/non-finite numbers are errors, not coercible defaults.
- **R5 — Sequences and grouping:** Whitespace sequences concatenate values within the current bar. Sequential square groups preserve scope but flatten into ordered values; they do not create bars, rests, durations, subdivisions, or simultaneous values.
- **R6 — Alternation:** Angle groups select deterministic choices across bars. Nested choices advance on their own selections; sibling cycles align by bounded least-common-multiple expansion. Alternation never advances merely because another hit occurs.
- **R7 — Repetition:** `!n` structurally repeats a value or grouped expression using the existing positive-whole-number amount rules. Repetition directly attached to an alternation choice repeats that choice in the bar-selection schedule. Other repetition duplicates sibling value structure.
- **R8 — Unsupported constructs:** Parameter evaluation rejects rests, parallel/comma groups, `*`, `/`, and `@` wherever they occur. Unsupported constructs must not be silently flattened, converted to zero, or discarded, including inside an alternate branch.
- **R9 — Bounded evaluation:** Source, expression, repetition, choice schedules, bar-period, and numeric-value expansion are bounded as specified below. Intermediate numeric-cycle results have independent bar/value budgets, not a cumulative evaluator-lifetime value budget. Unsafe arithmetic or excessive expansion fails before oversized allocation rather than wrapping, truncating, or rounding.
- **R10 — Processing independence:** Numeric shorthand preserves existing bar/hit lookup and has no event timing ownership or filtering authority. The existing chop exception remains: sequence shape affects generated chop timing exactly as equivalent structured input already does.
- **R11 — Source preservation:** Random patterns and supported envelope/LFO/MIDI sources retain their existing separate paths and contextual schema behavior. Numeric shorthand does not grant modulation-source support to slots that do not currently accept it.
- **R12 — LFO behavior:** Static LFO endpoint patterns are accepted even when a bar contains multiple values. Playback uses the first value in that bar; schema serialization warns about ignored values once per affected endpoint per LFO instance. The pattern is neither rejected nor changed to introduce per-hit LFO endpoint updates.
- **R13 — Failure isolation:** New shorthand syntax, numeric-atom interpretation, unsupported-construct, and expansion errors fail synchronously during the receiving call, before replacing previously valid affected parameter configuration. Multi-field calls must not partially apply because a later shorthand field fails. No fallback pattern is installed. Existing consumer domain checks, such as sampler region range validation, retain their current validation stage.
- **R14 — Coverage and typing:** Every included slot and alias below exposes the new input alternative in its public TypeScript contract and runtime dispatch. Unsupported mixtures remain type errors where expressible and runtime errors when JavaScript bypasses those types.
- **R15 — Reusable input isolation:** Reusable shorthand remains immutable and target-neutral. Parameter validation/evaluation must not mutate it, install shared playback cursors, or affect its subsequent use by another parameter or an event consumer.
- **R16 — Explainable contract:** Public documentation distinguishes value-sequence grouping from event subdivisions, bar alternation from per-hit selection, supported versus rejected operators, and LFO/chop special behavior.

## Behavior and contracts

### Input and output

For an ordinary variadic numeric-pattern slot:

```ts
.gain(0.2, 0.8)       // Existing: [[0.2], [0.8]]
.gain([0.2, 0.8])     // Existing: [[0.2, 0.8]]
.gain("0.2 0.8")      // New:      [[0.2, 0.8]]
.gain("<0.2 0.8>")    // New:      [[0.2], [0.8]]
.gain(d.sh("0.2 0.8")) // Same numeric pattern as the direct string
```

The comments describe the numeric pattern, not the enclosing instrument-gain envelope or effect schema. Static evaluation yields the existing shape:

```ts
{ type: "static", cycle: number[][] }
```

A successful shorthand pattern has at least one bar, every bar is nonempty, and every value is finite. Random patterns remain the existing `random-number` variant; no shorthand random-choice operator is introduced.

Whole-pattern alternatives apply per logical slot, not necessarily per public call. Thus `adsr("0.01 0.02", 0, "<0.5 1>", 0.1)` contains four independent fields, and `noise("pink", "0.2 0.8")` contains a color plus one gain slot. Conversely, `.gain("0.2", 0.8)`, `.gain("0.2", "0.8")`, and `.gain(["0.2", 0.8])` are invalid.

A reusable shorthand value is parsed by the existing general language. For example, `d.sh("0.2 ~ 0.8")` may be constructed and used by an event consumer, but a parameter consumer must reject its rest. Parameter restrictions must not narrow `d.sh()` globally.

### Envelope construction overloads

The factory and envelope constructor share these forms; shorthand patterns only the maximum, never the minimum:

```ts
d.env("0.2 0.8"); // Minimum 0, maximum [[0.2, 0.8]]
d.env(d.sh("0.2 0.8")); // Same
d.env(0.1, "0.2 0.8"); // Minimum 0.1, maximum [[0.2, 0.8]]
d.env(0.1); // Existing: minimum 0.1, maximum [[1]]
```

The same dispatch applies to `new Envelope(...)`. A sole leading string or reusable shorthand supplies maximum and defaults minimum to `0`. It must be the sole argument: reject `d.env("0.2 0.8", 0.5)` and `d.env(d.sh("0.2 0.8"), 0.5)` in public types and at runtime. Invalid shorthand is rejected synchronously during either factory or constructor call.

A leading number remains the minimum. Existing `d.env()`, `d.env(undefined)`, and explicit-`undefined` minimum calls retain their behavior; for example, `d.env(undefined, "0.2 0.8")` uses minimum `0`. Minimum does not become patternable, and numeric structured maximum arguments retain their existing bar semantics. With an explicit minimum, shorthand is still the sole maximum-pattern argument.

### Included consumer matrix

Every included numeric-pattern slot accepts both a direct string and a reusable shorthand value. Existing nonnumeric alternatives remain as narrow as they are today.

| Public surface                                                                               | Included slot / preserved adaptation                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instrument `.detune(...)`                                                                    | Numeric pattern; retain existing envelope/LFO/MIDI alternatives. Applies to synths and samplers.                                                                                                                                                                                                                     |
| Instrument `.gain(...)`                                                                      | Envelope maximum pattern; an explicit envelope continues replacing the envelope, while numeric input preserves its other settings. Do not add LFO/MIDI alternatives here.                                                                                                                                            |
| Instrument `.noise(...)`                                                                     | Noise gain pattern; retain existing modulation alternatives and leading color selector.                                                                                                                                                                                                                              |
| Instrument and envelope `.adsr(a, d, s, r)`                                                  | Each positional field independently accepts a scalar number or shorthand. Positional number arrays are intentionally rejected; individual `.a()`, `.d()`, `.s()`, and `.r()` setters retain their existing pattern capabilities. Do not add extra positional bars or random/modulation alternatives to these fields. |
| Envelope `.max(...)`, `.a(...)`, `.d(...)`, `.s(...)`, `.r(...)`                             | Numeric patterns, retaining existing random support and method-specific no-argument behavior.                                                                                                                                                                                                                        |
| `d.env(...)` and corresponding envelope constructor                                          | Maximum pattern only. A sole string/reusable shorthand defaults minimum to `0`; numeric/undefined minimum plus maximum remains supported. Minimum stays numeric-only; reject extra arguments after leading shorthand.                                                                                                |
| `d.gain(...)` / gain-effect constructor                                                      | Numeric pattern; retain existing envelope/LFO/MIDI alternatives.                                                                                                                                                                                                                                                     |
| `d.filter(type, ...frequency)`, `d.lpf(...)`, `d.hpf(...)`, `d.bpf(...)`, filter constructor | Frequency pattern after the filter type where applicable; retain existing modulation alternatives.                                                                                                                                                                                                                   |
| Filter `.q(...)`, `.detune(...)`, `.gain(...)`                                               | Numeric patterns; retain existing modulation alternatives.                                                                                                                                                                                                                                                           |
| Unison `.voices(...)`, `.spread(...)`, `.width(...)`                                         | Numeric patterns; only spread/width retain modulation alternatives. Voice-count interpretation is unchanged.                                                                                                                                                                                                         |
| Sampler `.start(...)`, `.end(...)`, `.duration(...)`, `.dur(...)`                            | Region numeric patterns; retain existing range validation, region-mode behavior, and chop incompatibilities. Alias and canonical method have identical new input support.                                                                                                                                            |
| Sampler `.chop(sliceCount, ...sequence)`                                                     | Sequence only. Slice count stays a scalar positive integer, omitted sequence retains automatic generation, and shape continues affecting generated timing.                                                                                                                                                           |
| `d.lfo(outputA, outputB)` and LFO constructor                                                | Each endpoint independently accepts its existing scalar/array/random source or shorthand. Structured arrays remain separate bars; new shorthand produces its explicitly described bars.                                                                                                                              |

Excluded slots include LFO `.speed(...)` and `.wave(...)`, scalar envelope minimum, LFO phase, fit length, chop slice count, routing/send/duck amounts, and timing-generator arguments (`euclid`, `hex`, `sequence`). These do not become shorthand consumers merely because a shared generic input type changes.

### Numeric language

The existing decimal atom rule applies:

```text
^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$
```

The parsed number must also be finite. Examples accepted as values include `0`, `-2`, `+.5`, `1.`, and `1e-3`. Reject `NaN`, `Infinity`, `1e999`, hexadecimal forms, underscores, and nonnumeric names.

The following table is normative. Output is shown as numeric bars, independent of the receiving parameter's enclosing schema:

| Source                | Numeric bars                                       |
| --------------------- | -------------------------------------------------- |
| `0.2 0.8`             | `[[0.2, 0.8]]`                                     |
| `0.2 [0.4 0.6] 0.8`   | `[[0.2, 0.4, 0.6, 0.8]]`                           |
| `[0.2]`               | `[[0.2]]`                                          |
| `0.2!3 0.8`           | `[[0.2, 0.2, 0.2, 0.8]]`                           |
| `[0.2 0.8]!2`         | `[[0.2, 0.8, 0.2, 0.8]]`                           |
| `1!2!3`               | `[[1, 1, 1, 1, 1, 1]]`                             |
| `<0.2 0.8>`           | `[[0.2], [0.8]]`                                   |
| `<[0.2 0.8] [0.4 1]>` | `[[0.2, 0.8], [0.4, 1]]`                           |
| `0.2 <0.5 0.8>`       | `[[0.2, 0.5], [0.2, 0.8]]`                         |
| `<0 <2 3>>`           | `[[0], [2], [0], [3]]`                             |
| `<0 1> <2 3 4>`       | `[[0, 2], [1, 3], [0, 4], [1, 2], [0, 3], [1, 4]]` |
| `<1 2>!2`             | `[[1, 1], [2, 2]]`                                 |
| `[<1 2>]!2`           | `[[1, 1], [2, 2]]`                                 |
| `<1!3 2>`             | `[[1], [1], [1], [2]]`                             |
| `<[1!3] 2>`           | `[[1, 1, 1], [2]]`                                 |

Square groups are transparent to value concatenation but retain operator scope. They must not be erased before distinguishing an alternation choice from repetition inside a grouped choice. Their intentional difference from event shorthand is the absence of temporal subdivision.

For a sequence of child cycles, output period is their least common multiple; each output bar concatenates the corresponding child bar with independent wrapping. For an alternation, direct choice repetition creates consecutive entries in its choice schedule. Each choice advances through its own child cycle only when selected. Emit enough complete schedule rounds for all child-cycle positions to return to their starting positions. Structurally identical occurrences do not share mutable cursors.

`!` retains the existing language's postfix adjacency and positive-whole-number amount interpretation; `0`, negative counts, and fractional counts are invalid. Chained repeats compose structurally. Existing whitespace/delimiter rules remain unchanged. Empty input, `[]`, and `<>` are errors; there is no empty/rest parameter shorthand.

Every branch must be validated, even if its selection occurs in a later bar. Reject examples include `0.2 ~ 0.8`, `[0.2,0.8]`, `0.2*2`, `0.2/2`, `0.2@3`, and `<0.2 [0.8 ~]>`. Reserved/malformed syntax remains governed by the shared parser; no bar separator such as `|` is added.

### Lookup, defaults, and consumer adaptations

Ordinary static lookup remains bar-index wrapping followed by surviving-hit-index wrapping. Hit indexing restarts each bar. Runtime chance misses do not consume ordinary parameter values. Repetition does not stretch a note, grouping does not divide the bar, and alternation does not create note events. Existing instrument event transforms continue to leave parameter patterns independent.

Defaults and reset behavior are preserved, including omitted envelope maximum becoming `1`, noise gain defaulting to `1`, instrument-specific gain-envelope settings, filter defaults, and unison defaults. Existing differences in no-argument setter behavior are not normalized into a new global policy.

Only exact leading noise colors `"white"` and `"pink"` are selectors. After removing a selector, apply the numeric/source contract to the remaining gain slot. Without a selector, direct numeric shorthand means white noise. Unknown/nonnumeric strings remain invalid; exact legacy error wording is not a compatibility requirement for newly dispatched string inputs.

A shorthand chop sequence must generate the same sequence schema and timing as its structured equivalent. For example, `.chop(4, "0 2 1 3")` is one sequence bar of four hits; `.chop(4, "<0 2 1 3>")` is four sequence bars of one hit each. Existing fit interaction is preserved: fit bars affect automatically generated chop sequences, not redistribution of an explicitly authored sequence. No new timing authority is conferred on other numeric parameters.

### LFO first-value behavior and warning

Existing endpoint arrays retain their separate-bar interpretation:

```ts
d.lfo([0.2, 0.8], 1); // [[0.2], [0.8]]; no ignored static values
d.lfo("<0.2 0.8>", 1); // Same bars; no ignored static values
d.lfo("0.2 0.8", 1); // [[0.2, 0.8]]; uses 0.2 and warns
```

Each affected static endpoint emits a warning identifying the endpoint and explaining that only the first value of each bar is used. It is not an error, does not drop the LFO, and must not change the serialized numeric bars or any other endpoint.

Emit a local warning through the existing `console.warn` convention during schema serialization, not audio playback. Deduplication is once per affected endpoint per LFO instance, not once per ignored value, bar, destination, or audio hit. Exact wording and diagnostic infrastructure are not part of this feature's API. This new warning applies only to static patterns. Existing random-endpoint behavior and diagnostics remain unchanged; this feature does not introduce warnings by interpreting random metadata as concrete static values.

### Bounds and failure behavior

Use the existing shared parser/expression budgets and explicit numeric expansion budgets:

| Resource                                                                       | Maximum                                  |
| ------------------------------------------------------------------------------ | ---------------------------------------- |
| Shorthand source length                                                        | 65,536 UTF-16 code units                 |
| Tokens                                                                         | 16,384                                   |
| Expression nodes                                                               | 16,384                                   |
| Expression depth                                                               | 128, using the shared expression checker |
| Alternation choice-schedule entries                                            | 1,024                                    |
| Bars in each evaluated numeric cycle, including intermediate results           | 1,024                                    |
| Numeric values in each evaluated numeric cycle, including intermediate results | 16,384                                   |
| Entries in a structurally expanded sequence child list                         | 16,384                                   |

Expansion accounting is defined independently of traversal, caching, or array sharing:

1. For alternation choice `i`, let `c_i` be its positive selection count after direct choice repetition, and `p_i` the number of bars in its evaluated child cycle. The choice-schedule length is `S = sum(c_i)`. Check `S <= 1,024` before allocating the schedule.
2. The required number of complete schedule rounds is `R = lcm_i(p_i / gcd(p_i, c_i))`. Compute this with bounded arithmetic. The expanded output must satisfy `S * R <= 1,024` before allocating its bar array; cap intermediate LCM growth against `floor(1,024 / S)` rather than computing an unsafe product first.
3. Before allocating a result's numeric output, calculate its total value count. Each occurrence in that result counts, including repeated/shared child values. Alternation emits `c_i * R / p_i` complete copies of child `i`'s cycle; use that multiplicity to preflight its value contribution. Sequences similarly account for each child cycle's wrapping through their common bar period; repetition accounts for every repeated value.
4. Every intermediate numeric-cycle result independently obeys the same 1,024-bar / 16,384-value limits. Do not sum values across child and parent results, repeated visits, or the lifetime of evaluation. Transparent grouping does not double-charge its contents. Storage sharing does not exempt repeated values in a parent's logical output.
5. Structurally expanded sequence child lists are limited to 16,384 entries; alternation schedules use the separate 1,024-entry budget. Check repetition/list growth before allocation, including chained repeats. No evaluator-wide cumulative work/value counter is part of the acceptance contract.

The following boundary fixtures are normative:

| Source          | Expected outcome                                                                          |
| --------------- | ----------------------------------------------------------------------------------------- |
| `<1!1024>`      | Accept: 1,024 schedule entries, one round, 1,024 bars.                                    |
| `<1!1025>`      | Reject: choice schedule exceeds 1,024 entries.                                            |
| `<<1 2> 3!511>` | Accept: 512 schedule entries times two rounds equals 1,024 bars.                          |
| `<<1 2> 3!512>` | Reject before output allocation: 513 schedule entries times two rounds equals 1,026 bars. |
| `[1!16384]`     | Accept: one bar with 16,384 values; grouping does not double-charge the child result.     |
| `[1!16384]!2`   | Reject: the parent result would contain 32,768 values, even if child storage is shared.   |

These are adopted safety limits, not measured performance guarantees. Event voice limits and rational timing grids must not be imposed on flattened numeric patterns. These shorthand bounds do not impose a new blanket size policy on unchanged legacy structured inputs.

New shorthand errors are synchronous at the receiving method/constructor. A failed setter leaves its affected parameter configuration unchanged; a failed ADSR call leaves all four fields unchanged. Existing structured-input validation stages and consumer-specific domain checks, such as sampler region constraints, remain compatible rather than becoming a separate validation redesign.

Syntax errors retain shared-parser source diagnostics. Target errors identify the receiving numeric slot and offending atom/construct; include the existing half-open UTF-16 source range when available. Do not promise a new error taxonomy, warning bus, exact message text, or recovery fallback. A caller can recover by submitting a valid replacement; no cancellation/background evaluation is involved.

## Ownership and boundaries

The shorthand lexer/parser, reusable shorthand values, and `PatternExpression` remain shared syntax infrastructure. Numeric parameters receive a separate value-sequence evaluator; event consumers retain their existing event evaluator. Syntax support in the shared parser does not imply support in every target.

The numeric input boundary owns input-form selection, finite numeric interpretation, value grouping/repetition/alternation, bounds, and the resulting numeric bars or existing random source. Audio-parameter resolution owns distinguishing numeric patterns from already-supported modulation sources. Consumer adapters own positional argument interpretation and consumer-specific restrictions/defaults; they do not own alternate parsers or operator implementations.

Expressions are transient input data; evaluated numeric bars, existing cycle objects, and modulation sources remain parameter state. Parameter state must not be added to `InstrumentEventState`. Numeric evaluation must not import or invoke event timing compilation, build event geometry as an intermediate representation, or use event rests/continuations as value placeholders.

Small syntax-independent helpers may be shared with the event evaluator where appropriate. Any such refactor must preserve event behavior. No event migration redo, temporary event adapter, schema extension, or audio-engine rewrite is required.

## Acceptance criteria

All verification below is proposed implementation acceptance, not evidence that tests have been executed while authoring this spec. Prefer domain-local `__tests__/` suites and retain public typing coverage under TypeScript checking.

| ID   | Requirement(s)        | Starting condition / action                                                                                                                                                                 | Expected outcome                                                                                                                                                                                                                                     | Verification approach                                                       |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| AC1  | R1, R2, R11           | Serialize characterized existing structured/static/random/modulation inputs before and after normalization cleanup, including defaults and contextual MIDI fields.                          | Equivalent numeric/source schemas and consumer behavior; no new source capabilities or incidental validation/default changes.                                                                                                                        | Explicit compatibility fixtures plus focused source-boundary review.        |
| AC2  | R3, R14               | For every included matrix slot and alias, supply a direct string and equivalent reusable shorthand using a supported overload; compare with structured input where expressible.             | Both forms compile and agree. Where structured equivalents exist, numeric schemas match them; otherwise assert the explicit expected schema, warning, and playback behavior, including multivalue LFO endpoint bars.                                 | Table-driven public API tests and type checks.                              |
| AC3  | R3, R14               | Supply multiple shorthand arguments for one slot, mix shorthand with a numeric bar/source, or nest strings/shorthand in structured arrays.                                                  | Invalid mixtures are rejected by public types where expressible and at runtime; independent positional slots and selector prefixes remain allowed.                                                                                                   | Negative type/runtime cases.                                                |
| AC4  | R4                    | Evaluate zero, signed/fractional/scientific decimal atoms and invalid/non-finite numeric spellings.                                                                                         | Valid atoms retain their finite numeric values; zero is retained; invalid atoms fail without coercion.                                                                                                                                               | Value-evaluator cases with source locations.                                |
| AC5  | R5, R7                | Evaluate every non-alternating sequence/group/repeat example in the normative table.                                                                                                        | Exactly the listed numeric bars, with no timing cells or extra bars.                                                                                                                                                                                 | Explicit evaluator fixtures.                                                |
| AC6  | R6, R7                | Evaluate nested/adjacent alternations, repeated alternations, direct repeated choices, and grouped repeated choices from the normative table.                                               | Exactly the listed bar schedules; nested child progression and LCM periods are deterministic.                                                                                                                                                        | Explicit evaluator fixtures, including repeated evaluation.                 |
| AC7  | R8, R13               | Supply each rejected construct, including inside later alternation branches, to an already-configured parameter.                                                                            | Receiving call fails synchronously and retains the prior valid configuration.                                                                                                                                                                        | Negative evaluator and setter integration tests.                            |
| AC8  | R9                    | Evaluate source/tree boundaries and every normative expansion-budget fixture, including schedule length, child-cycle rounds, and grouped/repeated value limits.                             | Accepted boundary fixtures succeed independently of cumulative traversal/allocation counts; excessive schedules, expanded bars, or per-result values fail before oversized allocation.                                                               | Shared-parser regression and numeric expansion boundary tests.              |
| AC9  | R10                   | Use a numeric shorthand pattern with more/fewer values than surviving hits, multiple bars, event transforms, and runtime chance misses.                                                     | Existing independent wrapping and final-hit consumption remain; ordinary parameters neither create nor filter events.                                                                                                                                | Public schema invariants and existing resolver/timing integration coverage. |
| AC10 | R1, R10, R14          | Compare one-bar and multi-bar chop shorthand with equivalent structured sequences, including with `.fit(...)`; omit sequence or use invalid slice count/domain combinations.                | Generated sequence and timing match structured behavior; fit does not redistribute explicitly authored sequences; existing generated defaults and restrictions remain.                                                                               | Sampler integration fixtures.                                               |
| AC11 | R1, R3, R14           | Use numeric shorthand noise gain with and without `"white"`/`"pink"`, preserve existing source inputs, and omit gain.                                                                       | Correct color/source selection; omitted gain remains `1`; numeric strings are not misclassified as colors; invalid strings fail.                                                                                                                     | Noise API and typing tests.                                                 |
| AC12 | R1, R3, R13, R14      | Mix scalar and shorthand ADSR fields, reject positional number arrays, then submit a call whose last field contains invalid shorthand.                                                      | Valid fields are independent; positional arrays fail at the type and runtime boundaries, and an invalid call leaves all prior ADSR fields unchanged.                                                                                                 | Envelope and instrument public API tests.                                   |
| AC13 | R1, R12               | Compare LFO endpoint structured arrays, single-value-per-bar shorthand, and multi-value-per-bar shorthand.                                                                                  | Existing array bar interpretation survives; multi-value static bars remain accepted and serialized intact; LFO still uses only index zero.                                                                                                           | LFO schema fixtures and existing bar-update resolution coverage.            |
| AC14 | R12                   | Serialize a shared LFO with ignored static values through multiple destinations and repeatedly serialize it.                                                                                | Affected endpoint warns once per LFO instance; no warning for one-value static bars; no per-hit spam or new random-metadata warnings.                                                                                                                | Warning spies and shared-instance cases.                                    |
| AC15 | R11, R14              | Exercise existing random, envelope, LFO, and MIDI alternatives and attempt them in slots that do not support those sources.                                                                 | Existing supported alternatives preserve semantics; unsupported alternatives are not newly admitted.                                                                                                                                                 | Source-dispatch fixtures and negative type coverage.                        |
| AC16 | R15                   | Reuse one `d.sh()` value across several parameters and an event consumer; reject it in a numeric target when it contains event-only syntax.                                                 | Expression/source remain unchanged; no shared progression state; event use retains its established behavior.                                                                                                                                         | Input immutability and cross-consumer tests.                                |
| AC17 | R2, R10, R15          | Review the resulting dependency flow and run existing event equivalence coverage after any shared-helper changes.                                                                           | Operator handling is centralized; numeric evaluation does not enter event state/compiler/evaluation; existing event schemas and semantics remain unchanged.                                                                                          | Boundary review and event regression fixtures.                              |
| AC18 | R1, R3, R13, R14, R16 | Review public types/runtime/docs against the matrix, including factory/constructor shorthand-only envelopes, explicit/default/undefined minimum, trailing arguments, and invalid shorthand. | Both envelope entry points accept sole shorthand with minimum 0 and preserve numeric-only minimum calls; leading-shorthand trailing arguments and invalid shorthand reject synchronously. Other included/excluded slots and docs match the contract. | Type/runtime checks and documentation review.                               |

## Assumptions

- The consumer inventory and compatibility findings are based on static inspection; baseline execution is still required. A newly discovered consumer with a different semantic clock requires an explicit adapter rather than silent widening.
- Existing deterministic scheduling helpers may be reusable without event geometry; implementation must validate any such reuse against the normative examples and event regressions.

The expansion limits/accounting, failure isolation including all-or-nothing ADSR updates, and schema-time once-per-endpoint-per-LFO-instance warning policy have been explicitly adopted and are not assumptions. Failure isolation for new shorthand does not promise transactional cleanup of every historical invalid structured-input path.

## Risks and open decisions

- Blocking: None. This specification is ready for implementation planning, not authorization to implement or release.
- Non-blocking: Square grouping looks identical to event subdivision syntax but intentionally has value-only semantics here. Explicit contrasting documentation and fixtures are necessary.
- Non-blocking: Nested alternation and repetition can produce large periods or subtle scheduling differences. Normative schedule examples and preallocation bounds constrain this risk.
- Non-blocking: Standardizing input dispatch can accidentally widen APIs, change contextual MIDI handling, or erase consumer defaults. Characterization and per-slot typing coverage must precede reliance on the new boundary.
- Non-blocking: Legacy validation and mutable cycle behavior are inconsistent. Preserve them rather than silently incorporating a broader cleanup; materially incompatible findings should be reported before expanding PR scope.
- Non-blocking: Local warning behavior will eventually need to fit the planned diagnostics overhaul. Keep warning text/infrastructure noncontractual and avoid designing that overhaul here.

## Deferred work

- Unified diagnostics/error handling, including any structured warning API or lifecycle-wide deduplication policy.
- Time-addressed/continuous numeric patterns, rests/hold policies, weighting, acceleration/slowdown, or per-hit LFO endpoint updates. Revisit only with a separate semantic and schema/runtime proposal where needed.
- Cycle-class simplification, defensive-copy policy, uniform legacy validation/default behavior, and unification of LFO/envelope structured argument shapes.
- Shorthand adapters for timing generators or raw LFO speed/waveform lists. These require their own input/clock contract rather than automatic adoption of numeric parameter types.
