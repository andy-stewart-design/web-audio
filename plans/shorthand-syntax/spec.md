# Shorthand Syntax and Event Pattern Architecture

## Status

Proposed. PRs 1–4 are complete; native state and compilation remain isolated from the legacy production path. The standalone [Fluid package reorganization](../fluid-package-reorg/plan.md), including test-directory moves in both Fluid and patterns, is implemented and must be merged before PR 5's production cutover. Implementation locations below use the reorganized paths; shorthand parsing and public shorthand dispatch remain planned.

This specification defines both:

1. a compact shorthand syntax for event patterns; and
2. the event-pattern architecture that structured input and shorthand share.

It supersedes the implementation direction in [`pattern-ir-redesign.md`](./pattern-ir-redesign.md). The active delivery sequence is [`direct-cutover-plan.md`](./direct-cutover-plan.md); the adapter-first [`plan.md`](./plan.md) and [`plan-outline.md`](./plan-outline.md) are superseded historical references.

The syntax is intentionally a subset of Tidal/Strudel mini-notation and is called **shorthand**, not mini-notation.

## Goals

- Add compact syntax for notes, sample names, variations, and XOX rhythm.
- Give structured input and shorthand one shared expression model and one canonical state representation.
- Simplify the event-pattern pipeline rather than adding shorthand in front of the existing chain.
- Preserve established behavior unless this specification identifies an intentional change.
- Keep the existing schema and audio-engine event model stable.
- Make future event-pattern features, including `legato()`, possible without another foundational redesign.

## Non-goals

- Processing patterns such as gain, detune, envelopes, effects, and sample regions do not move to the new event-cycle representation.
- The first version does not add shorthand to `.hex()`, `.euclid()`, `.sequence()`, chop sequences, or processing parameters.
- The first version does not add note-name parsing to `.notes()`.
- The first version does not add combined `sampleName:variation` atoms to `.name()`.
- The first version does not add a public `.legato()` method.
- The event-cycle IR is not a public extension API.
- The schema and audio engine do not parse or retain shorthand syntax.

## Central model

Shorthand is an event-pattern authoring syntax, not a separate playback semantic.

```text
structured values ─> decode and validate ─┐
                                           ├─> PatternExpression<TAtom>
shorthand source ──> parse ───────────────┘
                                                      ↓
                                evaluatePatternExpression(interpretAtom)
                                                      ↓
                                               EventCycle<T>
                                                      ↓
                                           InstrumentEventState
                                                      ↓
                                               EventCompiler
                                                      ↓
                                        existing event-pattern schema
```

Structured decoding interprets method arguments, arrays, explicit bars, rests, and simultaneous voices. Shorthand parsing interprets text, grouping, alternation, and operators. Both produce the same expression-tree model, and one evaluator owns allocation, rational geometry, rests, continuations, operators, and expansion limits.

Structured values are already typed and validated. Shorthand atoms remain text until evaluation, when the consuming method supplies target-specific interpretation. Random sources retain their separate event-cycle branch rather than being forced into artificial expression nodes.

Notes, sample names, variations, and explicit rhythm are distinct event lanes built from the same structural primitives. Value lanes use `EventCycle<T>`; fixed timing uses `StaticEventCycle<1>`. Fluid coordinates those lanes, selects timing, applies availability, and emits the existing schema.

Processing parameters remain hit-addressed value patterns. They consume final hits but do not create or filter event timing.

## Public API

### Creating reusable shorthand

Fluid exposes the canonical constructor and concise alias:

```ts
const pattern = d.shorthand("0 <1 2>");
const concise = d.sh("0 <1 2>");

d.sample("bd").var(pattern);
```

`d.shorthand()` and `d.sh()` parse immediately. Syntax errors therefore occur at the shorthand call site.

The returned value is immutable, target-independent, and reusable:

```ts
interface Shorthand {
  readonly type: "shorthand";
  readonly source: string;
  readonly expression: PatternExpression<string>;
}
```

The returned object is ordinary frozen data. Its `expression` is enumerable, inspectable, source-aware, and fully typed. There is no separate public shorthand AST representation: the parser directly produces the same expression model used by structured input.

Fluid exports `Shorthand`. Expression and supporting types are exported from package roots only when demonstrated consumers need those names; fully typed, inspectable data does not require a named export for every constituent type. `d.shorthand()` and `d.sh()` remain the public parser entry points; a separate `parseShorthand()` function is not part of the REPL-facing API.

### Direct strings

Supported consumers also accept a single shorthand string directly:

```ts
d.synth().notes("60 [64 67]");
d.sample().name("bd sd");
d.sample("bd").var("0 <1 2>");
d.sample("bd").xox("1!4 0!4");
```

Direct strings and `d.sh()` values use exactly the same parser and evaluation path.

### Argument dispatch

A single string passed to a supported consumer is shorthand:

```ts
.name("bd sd");
.var("0 <1 2>");
.notes("60 [64 67]");
.xox("1!4 0!4");
```

Existing structured forms remain structured:

```ts
.name("bd", "sd"); // two bars
.name(["bd", "sd"]); // one bar with two steps
.notes(60, 64); // two bars
.notes([60, 64]); // one bar with two steps
```

A `Shorthand` value must be the sole argument:

```ts
.name(d.sh("bd sd"));

// Invalid:
.name(d.sh("bd"), "sd");
```

This dispatch intentionally means that `.name("bd sd")` is two shorthand atoms, not one sample name containing a space.

## Supported consumers

The first implementation supports shorthand in:

- `.notes()`;
- `.name()`;
- `.var()` and `.variation()`;
- `.xox()`.

Each consumer supplies target-specific atom interpretation to the shared expression evaluator.

## Syntax

### Expression model

Both frontends produce one inspectable, readonly expression model. These definitions describe its shape, not a required list of package-root exports:

```ts
type PatternExpression<T> = {
  readonly type: "pattern-expression";
  readonly patterns: readonly PatternNode<T>[];
  readonly range?: PatternRange;
};

type PatternNode<T> =
  | PatternAtom<T>
  | PatternRest
  | PatternSequence<T>
  | PatternGroup<T>
  | PatternParallel<T>
  | PatternAlternate<T>
  | PatternModifier<T>;

type PatternRange = {
  readonly start: number;
  readonly end: number;
};

type PatternAtom<T> = {
  readonly type: "atom";
  readonly value: T;
  readonly range?: PatternRange;
};

type PatternRest = {
  readonly type: "rest";
  readonly range?: PatternRange;
};

type PatternSequence<T> = {
  readonly type: "sequence";
  readonly children: readonly PatternNode<T>[];
  readonly range?: PatternRange;
};

type PatternGroup<T> = {
  readonly type: "group";
  readonly child: PatternNode<T>;
  readonly range?: PatternRange;
};

type PatternParallel<T> = {
  readonly type: "parallel";
  readonly children: readonly PatternNode<T>[];
  readonly range?: PatternRange;
};

type PatternAlternate<T> = {
  readonly type: "alternate";
  readonly children: readonly PatternNode<T>[];
  readonly range?: PatternRange;
};

type PatternModifier<T> = {
  readonly type: "modifier";
  readonly operator: "repeat" | "accelerate" | "slow" | "weight";
  readonly amount: string;
  readonly child: PatternNode<T>;
  readonly range?: PatternRange;
};
```

`patterns` represents explicit authored bars. Structured method arguments populate it directly. A shorthand source initially contains one root pattern; alternation and slowdown may produce a multi-pattern cycle during evaluation.

The shorthand parser produces `PatternExpression<string>` and populates source ranges. User-authored atom and operator-amount lexemes remain strings. Structured decoding produces typed expressions and may omit text ranges. Target interpretation and rational interpretation happen during evaluation without constructing a converted expression-tree copy.

Examples:

```txt
[0 2]
→ grouped sequence

[0,2]
→ simultaneous voices

<0 1>
→ cycle alternation

0!3
→ structural repetition
```

### Lexical rules

Whitespace separates sequential items. Spaces, tabs, and newlines have the same meaning. Newlines do not create bars.

The following characters are structural or reserved:

```txt
[ ] < > , ! * / @ ~ ? | ( ) :
```

Unsupported constructs are syntax errors rather than ordinary atoms. In particular, `?`, `|`, parentheses, and `:` are reserved for future language decisions.

A standalone `~` is a rest. `-` is not a rest token; it is available as the sign of a numeric atom or operator amount.

Empty expressions and structures are invalid:

```txt
""
[]
<>
[0,,2]
```

Use `~` for explicit silence.

### Sequences

Whitespace-separated nodes form a sequence. Children receive equal allocation unless changed by `@` or another structural operator.

```txt
0 2 4
```

creates three sequential events within one bar.

### Groups

Square brackets allocate their contents within one parent slot:

```txt
a [b c] d
```

The outer sequence has three equal allocations. `b` and `c` divide the middle allocation, producing conceptual durations:

```txt
a → 1/3
b → 1/6
c → 1/6
d → 1/3
```

Nesting is recursive.

### Polyphony

Commas create simultaneous voices and are valid only inside square groups:

```txt
[0,2,4]       // one event with three voices
[0,2] [4,5]   // two sequential polyphonic events
0,2,4         // invalid
```

Voice order and duplicates are preserved. A square group is either a sequential group or a simultaneous voice group; commas and whitespace sequencing cannot be mixed at the same bracket level:

```txt
[0 1,2] // invalid
[0,1 2] // invalid
```

Nest the structures when a sequence should contain a chord:

```txt
[0 [1,2]] // 0 followed by the chord [1,2]
```

A rest is not valid as one voice of a simultaneous group:

```txt
[0,~] // invalid
```

Operators applied to a polyphonic group operate on the group as one event:

```txt
[0,2]!2
[0,2]*2
[0,2]@2
```

### Alternation

Angle brackets choose deterministic alternatives across cycles:

```txt
<0 1 2>
```

selects `0`, `1`, and `2` on successive cycles and then wraps. Alternation is not random choice and does not sequence its children within one cycle.

Nested alternation composes deterministically:

```txt
<0 <2 3>>
```

produces:

```txt
cycle 0 → 0
cycle 1 → 2
cycle 2 → 0
cycle 3 → 3
```

Independent alternations repeat over their combined finite period. All variants of one shorthand expression are rationally normalized so unequal variants retain compatible structural alignment.

### Rests

`~` consumes structural allocation without producing an onset or value:

```txt
0 ~ 2
[~ 2]
~@2
~!2
```

Rests may be repeated, slowed, accelerated, or weighted. They cannot be used as simultaneous voices.

### Structural repetition: `!`

`!n` duplicates a node as sibling structure:

```txt
60!3 67
```

is equivalent to:

```txt
60 60 60 67
```

The count must be a positive whole number.

### Acceleration: `*`

`*n` accelerates a node inside its existing parent allocation:

```txt
60*3 67
```

The accelerated `60` pattern repeats three times within the first parent allocation. It remains one parent item for surrounding relative allocation.

This differs from `!`, which inserts siblings before the parent allocates time.

### Slowdown: `/`

`/n` is semantically equivalent to applying the existing `.slow(n)` transform to its operand. It slows event progression by distributing the node's existing steps across more cycles without implicitly extending their gate durations.

```txt
60/2
```

produces:

```txt
bar 0: [60]
bar 1: [~]
```

The `60` lasts one bar; it does not sustain across both bars.

```txt
[0 2 4 6]/2
```

produces:

```txt
bar 0: [0 ~ 2 ~]
bar 1: [4 ~ 6 ~]
```

This has the same onset positions as structured `.notes([0, 2], [4, 6])`, but the slowed events retain quarter-bar durations rather than expanding to half-bar durations.

A slowed child retains its allocation within an unslowed parent sequence:

```txt
60/2 1
```

produces:

```txt
bar 0: [60 1]
bar 1: [~  1]
```

In both bars, the first and second child allocations are half a bar. `60` occurs in the first half of bar 0 with duration `1/2`; the first half of bar 1 is silent. `1` occurs in the second half of both bars with duration `1/2`.

A shorthand slowdown and the corresponding fluent transform therefore remain equivalent:

```ts
.var("1/2");
.var(1).slow(2);
```

Both evaluate to the same authored pattern: an event bar followed by a silent bar. When another lane owns timing, the slowed rest filters candidates in both forms. `.var([1], [null])` has the same two-bar event/rest geometry.

V1 rejects a slowdown if preserving an existing gate would make it cross a bar boundary. This can occur with ordinary weighted input, without requesting `legato()`:

```txt
[~ 60@3]/2
```

Before slowdown, `60` starts at `1/4` and lasts `3/4` of a bar. Slowdown moves its onset to `1/2` while preserving its `3/4` gate, so it would end at `5/4`, across the next bar boundary. V1 cannot represent that leading continuation and throws rather than truncating the gate, retriggering the note, or silently changing its duration. The same restriction applies to the corresponding fluent `.slow(2)` transform.

A future cross-bar `legato()` may convert slowdown gaps into continuations. For example, `.notes(60).slow(2).legato()` would sustain `60` across two bars. Cross-bar legato is not part of v1.

### Relative weight: `@`

`@n` changes relative structural allocation without creating additional onsets:

```txt
0@3 2 3
```

allocates durations in the ratio `3:1:1`.

Conceptually, this is a normalized event plus continuation representation:

```txt
event(0), continuation, continuation, event(2), event(3)
```

It is equivalent to padded structured input after a future legato operation:

```ts
.notes([0, null, null, 2, 3]).legato(); // future API
```

The first implementation supports the IR semantics required by this equivalence but does not add `.legato()`.

`@` is target-independent, but its allocation unit comes from its parent structure:

- within a sequence, weighting changes relative within-pattern allocation and event duration;
- within an alternation, weighting changes selection frequency in whole-cycle units.

Weighted alternation retriggers the selected alternative once per selected bar rather than sustaining one event across those bars:

```txt
<0@2 2 3>
→ bar 0: 0
  bar 1: 0
  bar 2: 2
  bar 3: 3
```

Acceleration then groups those selected bars in order:

```txt
<0@2 2 3>*2
→ bar 0: [0 0]
  bar 1: [2 3]
```

The two `0` values are distinct retriggers. This differs from `0@2 2` in a sequence, where `0` is one event with a larger within-pattern duration.

### Operator composition

Postfix operators apply to the immediately preceding node in written order.

An uninterrupted chain of `*` and `/` operators on the same node is accumulated as one exact rational rate before structural expansion:

```txt
[0 2]*2/2
```

has a net rate of `1` and is exactly equivalent to `[0 2]`, including event durations. The evaluator does not first shorten gates for `*2` and then apply the non-gate-extending slowdown behavior to that materialized result.

This cancellation guarantee applies to one composable speed chain. If another structural operator forces the intermediate result to be materialized, a later inverse speed operator is not required to reconstruct the pre-materialized structure.

`*`, `/`, and `@` accept positive finite amounts representable under bounded rational rules. `!` accepts only a positive integer. Unsupported or excessive expansion is rejected rather than rounded or truncated.

## Canonical event-cycle representation

### Scope

The canonical IR is internal and covers event-forming or event-filtering concerns:

- static note lanes;
- static sample-name lanes;
- static variation lanes;
- fixed rhythm lanes;
- random note and variation sources;
- random timing conditions;
- cycles, patterns, steps, voices, rests, continuations, and event durations.

It does not replace `Parameter`, `ValueCycle`, envelopes, LFOs, or other processing-value representations.

### Terminology

The representation reuses Drome's existing structural terms:

```txt
cycle   → one or more repeating patterns
pattern → one bar
step    → one normalized subdivision within a pattern
```

A note, sample-name, or variation **lane** contains an `EventCycle<T>`. A fixed timing lane contains a `StaticEventCycle<1>`. A lane describes its role in an instrument; it is not another structural level.

`EventPattern<T>` does overlap in name with the existing schema `EventPattern`. During migration, code that imports both should alias the schema type as `CompiledEventPattern` rather than inventing different musical terminology for the IR.

### Static cycle shape

A conceptual representation is:

```ts
type EventCycle<T> =
  | StaticEventCycle<T>
  | (number extends T ? RandomEventCycle : never);

type StaticEventCycle<T> = {
  readonly type: "static-event-cycle";
  readonly patterns: readonly EventPattern<T>[];
};

type RandomEventCycle = {
  readonly type: "random-event-cycle";
  readonly candidateCycle: StaticEventCycle<1>;
  readonly settings: RandomEventSettings;
};

type EventPattern<T> = readonly EventStep<T>[];

type EventStep<T> =
  | {
      readonly type: "event";
      readonly values: readonly [T, ...T[]];
    }
  | { readonly type: "rest" }
  | { readonly type: "continuation" };
```

The exact random settings and container syntax may change, but the cycle/pattern/step levels and static step variants are required. Random event cycles are numeric-only in v1 and preserve generation settings rather than pretending to contain static numeric values.

The random branch retains fixed candidate geometry because counts alone cannot express sparse or transformed onsets and gate lengths. `candidateCycle` contains timing onsets with exactly one value of `1`, plus rests and continuations; generated numeric values are not materialized. Per-pattern value counts are derived from its event steps rather than stored redundantly. `RandomEventSettings` contains readonly `dataType`, `segments`, optional `range`, optional `quantValue`, `algorithm`, optional `valueMap`, and `order`, retaining the existing numeric generation semantics. Runtime timing chance remains separate in Fluid timing state.

Invariants:

- an event step has at least one value, representing simultaneous voices;
- every step in a normalized pattern has equal structural width;
- in v1, a continuation belongs to the nearest preceding event and cannot begin a pattern or follow a rest; future cross-bar legato may allow a pattern-leading continuation linked to the previous pattern;
- an event's duration includes its event step and immediately following continuation steps;
- when a cycle owns timing, only event steps create candidates; rests and continuations do not;
- an entirely silent pattern remains explicit;
- cycle, pattern, step, event, and voice counts are bounded.

No separate `resolution` property is needed. A pattern's resolution is its length (`pattern.length`). For a step at index `i`:

```txt
offset = i / pattern.length
```

An event's duration is the number of structural steps from its event step through its contiguous continuations, divided by the pattern length.

The evaluator may use rational offsets and durations transiently while composing nested syntax. Normalization converts the completed result to the smallest bounded equal-step pattern that represents those rational positions exactly.

### Concrete normalization examples

Structured input with explicit rests:

```ts
.notes([0, null, null, 2, 3]);
```

normalizes to:

```ts
{
  type: "static-event-cycle",
  patterns: [
    [
      { type: "event", values: [0] },
      { type: "rest" },
      { type: "rest" },
      { type: "event", values: [2] },
      { type: "event", values: [3] },
    ],
  ],
}
```

The events have offsets `0`, `3/5`, and `4/5`, each with duration `1/5`.

Weighted shorthand:

```ts
.notes("0@3 2 3");
```

normalizes to the same five-step pattern shape, but with continuations rather than rests:

```ts
{
  type: "static-event-cycle",
  patterns: [
    [
      { type: "event", values: [0] },
      { type: "continuation" },
      { type: "continuation" },
      { type: "event", values: [2] },
      { type: "event", values: [3] },
    ],
  ],
}
```

The offsets remain `0`, `3/5`, and `4/5`, while the durations become `3/5`, `1/5`, and `1/5`.

This distinction is why a raw `Array<Array<T[] | null>>` is insufficient: `null` cannot distinguish an explicit rest from an occupied continuation.

### Why offsets and durations are derived

`PatternExpression<T>` exists only at the input boundary. Both frontends evaluate it into `EventCycle<T>`, and instrument state stores only event cycles. No expression tree is retained alongside canonical state.

Storing `offset` and `duration` on every step would duplicate information already represented exactly by step order and continuation runs. Deriving them at the compiler boundary prevents those fields from drifting out of sync and avoids floating-point arithmetic inside the canonical IR.

If an implementation needs rationals during shorthand evaluation, they are transient normalization data, not a second persistent convention.

### Structured input decoding

Structured input is decoded and validated into `PatternExpression<T>` before using the shared evaluator.

Existing dimensions remain:

```txt
method arguments → bars
array entries    → sequential slots
nested arrays    → simultaneous voices
null/undefined   → whole-slot rest
```

Examples:

```ts
.notes([60, [64, 67], null]);
.name([["bd", "hh"], "sd"]);
.var([[0, 1], null, [2, 3]]);
```

Structured slots receive equal allocation. Empty structured bars normalize to explicit silent bars according to existing consumer behavior. Empty simultaneous voice groups remain invalid for names, variations, and shorthand. Legacy structured notes accept empty and null-only chords: the decoder emits a rest, never an empty event group, while Fluid retains their note-value-slot provenance for compatibility.

### Shared expression evaluation

All setter inputs are patterns. Scalars and one-element arrays are simply one-step repeating patterns; there is no constant-versus-patterned classification.

These forms produce the same one-step authored pattern:

```ts
.var(1);
.var([1]);
.var("1");
.var(d.sh("1"));
```

Sequential and simultaneous structure remains distinct:

```ts
.var([1, 2]); // two sequential events
.notes([60, 64]); // two sequential notes
.var([[1, 2]]); // one simultaneous group
.notes([[60, 64]]); // one chord
```

The evaluator consumes either typed structured atoms or shorthand text atoms. For shorthand, the consumer interprets each atom at the point it is evaluated:

```text
PatternExpression<string>
  + interpretAtom(sourceText, range)
  → evaluatePatternExpression()
  → EventCycle<T>
```

The callback may interpret an atom as an event value or a rest, which lets XOX map `0`, `o`, and `.` to rests without a converted expression-tree copy. Geometry still evaluates in written operator order, including speed-chain cancellation.

Expressions remain at the input boundary. A setter evaluates its expression immediately and stores only the resulting event cycle. Fluent transforms operate on event cycles directly.

### Random lanes

Random numeric notes and variations remain distinct cycle variants. They retain random-generation settings and per-pattern shape rather than being expanded into fake static steps.

Random timing remains fixed candidate geometry plus at most one runtime chance condition. Fixed lane availability is applied before the condition reaches the engine. Runtime chance misses do not consume event or processing values.

## Fluid event-pattern state

Fluid owns coordinated synth and sampler event state instead of separate authored classes that compile through one another.

Conceptually:

```ts
type NonEmptyGroup<T> = readonly [T, ...T[]];

type EventSource<T> =
  | {
      readonly intent: "default";
      readonly fallback: NonEmptyGroup<T>;
      readonly cycle: StaticEventCycle<T>;
    }
  | {
      readonly intent: "authored";
      readonly cycle: EventCycle<T>;
    };

type StaticEventSource<T> =
  | {
      readonly intent: "default";
      readonly fallback: NonEmptyGroup<T>;
      readonly cycle: StaticEventCycle<T>;
    }
  | {
      readonly intent: "authored";
      readonly cycle: StaticEventCycle<T>;
    };

type TimingState = {
  readonly intent: "implicit" | "explicit";
  readonly cycle: StaticEventCycle<1>;
  readonly condition?: ChanceCondition;
};

type SynthEventState = {
  readonly type: "synth";
  readonly notes: EventSource<number>;
  readonly timing: TimingState;
};

type SamplerEventState = {
  readonly type: "sampler";
  readonly notes: EventSource<number>;
  readonly sampleNames?: StaticEventSource<string>;
  readonly variation: EventSource<number>;
  readonly timing: TimingState;
};

type InstrumentEventState = SynthEventState | SamplerEventState;
```

Pitch transforms and unrelated sampler configuration are omitted from the conceptual types.

Intent is colocated with the source it qualifies rather than stored in a parallel metadata object. A constructor default is therefore distinguishable from an authored timing candidate without maintaining two properties that can disagree.

Authored sources are always patterns. Their rests may filter externally owned candidates, and their continuations remain transparent. Default sources are fallbacks:

- they do not compete with authored sources for timing;
- they never filter externally owned timing;
- their nonempty fallback group fills every surviving hit;
- fallback values never create hits or turn a silent timing bar into an active one;
- the default cycle may supply fallback timing only when no explicit, generated, or authored source supplies it.

A setter always replaces a default source with an authored source, even when the setter supplies the same value:

```ts
d.sample("bd").slow(2).xox([1, 1]);
// Default name supplies "bd" for every surviving hit.

d.sample().name("bd").slow(2).xox([1, 1]);
// Authored name rests introduced by slowdown can suppress hits.
```

Generated chop/fit timing is derived from sampler configuration and passed to the compiler as an optional timing override. It is not stored alongside authored timing in `InstrumentEventState`. This preserves the underlying implicit or explicit timing state if sampler configuration changes whether generated timing applies.

The conceptual source types above omit compatibility provenance. Fluid may retain readonly availability cycles, transparent inherited-timing gaps, shared materialization identities, zero-width empty-bar flags, and structured note-value-slot provenance alongside authored cycles. These distinguish authored rests from timing gaps and preserve existing materialization/wrapping behavior without adding offsets, durations, value modes, or empty groups to generic event steps. The original-one-slot note-source materialization exemption is transition provenance, not scalar broadcasting.

Generated overrides retain readonly schema timing geometry outside v1 event cycles when existing chop/fit gates cross bars; this does not relax the v1 continuation invariant for authored lanes.

Fluent speed transforms are immediate state operations; legacy getter-sensitive speed cancellation is intentionally not preserved. Reading state or compiling a schema never changes later transform behavior. This follows the immediate-transition and pure-getter architecture, without deferred speed state or observation boundaries.

The intended end state removes or substantially replaces:

- `MaskedCycle`;
- `AuthoredPitches`;
- `AuthoredEventValues`;
- `AuthoredTiming`;
- duplicated availability and materialization helpers.

The fluent `Instrument` and `Sampler` remain mutable authoring facades. Their internal state transitions should use pure structural functions and a pure compiler. Getters must not secretly apply pending transformations.

## Event compilation

### Compiler responsibilities

The event compiler:

1. selects candidate timing;
2. expands participating lane cycles to a bounded common cycle length;
3. applies fixed availability by candidate ordinal;
4. emits static or random value patterns addressed by final hit index;
5. applies note root/scale conversion;
6. preserves simultaneous voices and voice order;
7. emits the existing `SynthEventPattern` or `SamplerEventPattern` schema.

It does not:

- parse shorthand;
- inspect JavaScript input nesting;
- mutate fluent authoring state;
- implement audio-engine scheduling;
- compile processing parameters.

### Timing ownership

The existing ownership policy remains authoritative.

Explicit rhythm and generated chop/fit timing are stronger than inferred event-lane timing.

Synthesizers infer timing from notes when no explicit rhythm exists.

Samplers without explicit/generated timing use the existing inferred policy:

1. authored fixed rests in notes or variation retain their current priority;
2. otherwise the candidate with greatest average active density wins;
3. density ties resolve as notes, then sample names, then variation;
4. constructor defaults do not compete as authored intent and are used for timing only when no stronger source exists.

This policy should be represented as a small declarative selection function, not distributed across lane classes.

### Candidate-ordinal availability

Once timing is selected, it produces an ordered list of fixed candidates in each bar. Non-owning event lanes filter those candidates by ordinal, not by resampling their offsets into the lane's structural regions.

For example:

```ts
d.sample("bd").var([0, null, 2]).xox([1, 1, 1, 1]);
```

The variation lane wraps over candidate ordinals as:

```txt
candidate:     0      1      2      3
lane step:     0      ~      2      0
available:    yes     no    yes    yes
```

The final timing is at offsets `0`, `1/2`, and `3/4`, and variations resolve as `0`, `2`, `0`.

Rules:

- candidate ordinals count fixed active timing candidates, not raw rhythm-pattern steps;
- each authored lane maps every candidate ordinal to one of its steps, wrapping independently;
- a mapped event step is available;
- a mapped explicit rest suppresses the candidate;
- a mapped continuation is transparent: it occupies and counts as that ordinal, but the candidate remains available;
- default sources do not filter candidates and provide their fallback group to surviving hits;
- availability from multiple authored event lanes is intersected;
- the selected timing lane is not redundantly reapplied as a filter;
- fixed filtering happens before runtime chance;
- surviving hits are renumbered consecutively within each bar.

This is an intentional change for sampler note and variation lanes. It standardizes them with sample-name lanes and synth notes.

Continuation transparency is visible when rests and continuations coexist:

```ts
d.synth().notes("60 [~ 67]").xox([1, 1, 1, 1]);
```

The note cycle normalizes to:

```txt
event(60), continuation, rest, event(67)
```

The four XOX candidates map to all four steps in order. The continuation keeps candidate 1, the explicit rest removes candidate 2, and candidate 3 remains. Final hit-index resolution uses the active note groups `[60]` and `[67]`, producing:

```txt
time:  0     1/4         3/4
note:  60    67          60
```

All three durations come from XOX and are `1/4`.

### Hit-addressed values

After fixed availability and runtime chance, static and random values resolve by final `(barIndex, hitIndex)`.

A suppressed fixed candidate or random miss consumes no values from any lane:

```ts
d.sample().name(["bd", null, "sd"]).var([0, 1, 2]).xox([1, 1, 1, 1]);
```

produces conceptually:

```txt
time:       0          1/2        3/4
name:       bd         sd         bd
variation:  0          1          2
```

Authored value lanes continue to wrap independently. Default lanes use their nonempty fallback group for every surviving hit. Sampler voice groups continue to pair using existing longest-group wrapping behavior in the engine.

### Event duration

When an event lane owns inferred timing, event duration is derived from the event step and its contiguous continuation steps.

When explicit or generated timing owns timing:

- its offsets and durations remain authoritative;
- other lanes supply values and candidate-ordinal availability;
- their intrinsic durations do not replace explicit durations.

When another source owns timing, continuation steps are transparent and do not suppress its candidates. Intrinsic weighting therefore affects duration only when the weighted cycle owns timing; explicit/generated timing replaces those durations.

### Silent bars

Entirely silent value patterns remain explicit in the event cycle. Compilation emits the existing schema convention:

- empty timing bar;
- `[null]` for a static event-value bar;
- zero random values for a random bar.

No stage silently deletes bars from a cycle.

## Transform and setter semantics

Existing call-order behavior remains part of the compatibility contract:

- value setters replace only their own lane and always mark the replacement authored, even when its value equals the default;
- all authored static sources are patterns; transforms may introduce rests that filter externally owned timing;
- default fallback groups remain available under externally owned timing, while transforms still affect their cycle when it supplies fallback timing;
- later setters are not retroactively transformed;
- explicit rhythm remains after a later value setter;
- fixed rhythm methods compose in call order;
- `fast`, `slow`, `stretch`, and `reverse` retain their event behavior, except legacy deferred/getter-sensitive speed cancellation;
- generated chop/fit timing remains exempt where it is today;
- processing patterns remain independent from event timing.

Global event transforms should be implemented as centralized `InstrumentEventState` transitions. If current behavior requires materializing lane relationships against selected timing, that materialization happens once in the state operation rather than independently inside authored wrapper classes.

The implementation should not retain an open-ended operation log. Each method updates canonical state immediately through pure transformations.

Successive fluent `.fast()` and `.slow()` calls operate on the already-materialized result of the preceding call. They are not an uninterrupted expression speed chain and need not cancel. For example, a one-event note cycle transformed by `.fast(2).slow(2)` becomes two bars, each with an onset at `0` and a gate of `1/2`; the gate is not extended back to one bar. Intermediate reads or schema compilation cannot affect this result. Generated timing remains exempt from event transforms, but that exemption does not defer transforms of the underlying stored lanes.

This does not change the shorthand evaluator's exact cancellation guarantee for an uninterrupted `*`/`/` chain on one expression node.

Authored availability also survives synth note materialization. Slowdown-created within-bar rests filter replacement timing by candidate ordinal, while inherited timing gaps remain transparent. **Approved compatibility exception:** legacy synth compilation compacted materialized note values and lost this rest filtering; native compilation follows the same specified availability policy as samplers. For example, `.synth().notes([60, 64]).slow(2).xox(rand().bin().steps(4).chance(1))` emits offsets `0` and `1/2` in both bars, each with duration `1/4`, rather than the legacy four quarter-bar hits per bar. This exception preserves the corrected PR 2 goldens unchanged and requires no repair of the superseded implementation.

## Target-specific atom interpretation

### Notes

```ts
d.synth().notes("60 64 -2 1.5");

d.synth().root("a3").scale("min").notes("0 2 4 -1");
```

These are valid examples. Note atoms may be signed or fractional but must be strict finite numeric text. Negative values remain valid scale degrees, including `-1` in the second example.

Shorthand does not add note-name parsing; `.root()` retains existing note-name behavior. Root and scale conversion occurs after structural normalization and does not change event geometry.

### Variations

```ts
d.sample("bd").var("0 1.5 -2");
```

Variation atoms must be strict finite numeric text. Engine rounding and positive variation wrapping remain unchanged.

### Sample names

```ts
d.sample().name("bd sd hh");
```

For the first version, sample aliases must match:

```txt
[A-Za-z0-9]+
```

This convention applies consistently to:

- sampler constructor names after constructor shorthand is resolved;
- `.name()` structured and shorthand input;
- sample-bank keys;
- direct schema validation.

URLs remain unrestricted.

Spaces cannot be part of a sample alias. `:` is reserved and rejected by `.name()` rather than treated as a literal character.

Constructor shorthand remains supported:

```ts
d.sample("bd:2"); // sample name "bd", variation 2
```

Combined selectors are not added to `.name()` in v1:

```ts
d.sample().name("bd:2"); // invalid
```

The syntax remains reserved for a future design that can define its interaction with independent variation lanes and polyphonic groups.

### XOX

`.xox()` supports both legacy compact strings and general shorthand.

Legacy strings containing only `x`, `o`, `.`, and whitespace retain current behavior:

```ts
.xox("xoxo");
.xox("x o . x");
```

They are decoded into the same `PatternExpression` model as all other fixed rhythm input. This compatibility decoder applies to both direct strings and a reusable `Shorthand.source` when consumed by `.xox()`; it does not add XOX-specific behavior to the generic parser or evaluator.

General shorthand supports:

```ts
.xox("1!4 0!4");
.xox("1 0 1");
.xox(d.sh("1!4 0!4"));
```

XOX atoms accept:

- `1` and `x` as onsets;
- `0`, `o`, `.`, and `~` as rests.

Polyphonic groups and other atom values are invalid. Structural operators, including generic `@`, retain their normal timing meaning.

## Package ownership

### `@web-audio/patterns`

Owns generic event-pattern mechanics:

- the public readonly `PatternExpression` model;
- shorthand lexing and parsing directly into that model;
- source-aware syntax errors;
- shared rational expression evaluation;
- static event-cycle primitives;
- generic transforms and expansion limits;
- immutable shorthand creation support;
- existing random-pattern primitives.

It does not decide whether an atom is a note, sample name, variation, or XOX value.

The parsed expression is public through the returned shorthand value so users and tooling can inspect it. The evaluated event-cycle IR remains an internal implementation boundary, not a Fluid extension API. Patterns has one curated root entry point with explicit direct re-exports justified by actual cross-package consumers; it does not expose an `/internal` subpath or re-export schema-owned types.

Current generic foundations live in `packages/patterns/src/expressions/`, `packages/patterns/src/events/`, and `packages/patterns/src/math/`. Fluent/random/processing cycle support remains in `packages/patterns/src/cycles/`, with rhythm generators in `packages/patterns/src/rhythm/`. Domain-local `__tests__/` directories hold unit suites, including `packages/patterns/src/events/__tests__/` and `packages/patterns/src/cycles/operations/__tests__/`. Future shorthand modules and their unit tests belong under `packages/patterns/src/shorthand/` and its `__tests__/` directory.

### `@web-audio/fluid`

Owns authoring semantics:

- `d.shorthand()` and `d.sh()`;
- direct-string dispatch;
- structured-input decoding and validation into `PatternExpression<T>`;
- target-specific atom interpretation during shared evaluation;
- synth and sampler event state with colocated authored intent;
- timing-selection policy;
- transform/setter call order;
- event compilation to schema.

#### Implementation locations

The reorganized layout preserves the existing public API and is not itself a production cutover:

- `packages/fluid/src/index.ts` directly re-exports the existing default `Drome` from `packages/fluid/src/drome.ts`; internal host type imports target `drome.ts`, while public API suites exercise the entry point.
- `packages/fluid/src/instruments/` owns fluent facades, sampler helpers, and `sampler-event-timing.ts` for fit/chop configuration and the external generated-timing bridge.
- `packages/fluid/src/events/state.ts`, `geometry.ts`, `snapshot.ts`, `transitions.ts`, and `compiler.ts` own native event state and emission. Native helpers do not import instrument classes, legacy authored wrappers, or test support.
- `packages/fluid/src/inputs/` owns structured/random/XOX decoding, guards, waveform interpretation, and cycle input unions. Future target atom interpreters belong here, not in the legacy `patterns/` directory.
- `packages/fluid/src/parameters/parameter.ts` owns processing `Parameter` and audio-parameter input/source types; envelope ADSR stays in `packages/fluid/src/automations/envelope.ts`.
- `packages/fluid/src/pitch/` owns note types, scale aliases, and MIDI conversion; `packages/fluid/src/samples/` owns manifest types, normalization, the built-in registry, and bank data under `banks/`.
- `packages/fluid/src/midi/builders.ts` owns the existing MIDI authoring/schema builders, not Web MIDI runtime behavior.
- `packages/fluid/src/patterns/authored-*`, `packages/fluid/src/patterns/event-timing.ts`, and `packages/fluid/src/instruments/event-compiler.ts` remain temporary legacy implementations until PR 5's verified coverage transfer.

Unit tests use the owning domain's `__tests__/`. Complete-schema integration suites live under `packages/fluid/src/__tests__/event-schemas/`; corrected fixtures, native regression fixtures, and independent replay drivers live in its `support/` directory. These are test-only modules, never production dependencies or package exports. Tests remain included in TypeScript checking. Schema-owned types are imported directly from `@web-audio/schema`; no root type bucket, folder barrels, or new package subpaths are introduced.

### `@web-audio/schema` and `@web-audio/audio-engine`

The schema event model remains unchanged: it continues to contain explicit timing and hit-addressed event-value patterns, with no shorthand or event-cycle IR. Schema validation is tightened only for the documented sample-alias convention. The audio engine remains unchanged.

## Compatibility policy

Existing behavior is preserved unless listed below.

### Intentional changes

1. Sampler note and variation rests filter explicit or competing timing by candidate ordinal rather than offset-based positional resampling.
2. Authored scalar and one-step sources are ordinary patterns. Rests introduced by transforms filter externally owned timing; there is no authored scalar-broadcast exception.
3. Constructor defaults become explicit fallback sources: they do not compete with or filter authored timing, and their nonempty fallback group fills surviving hits without creating hits.
4. A single string passed to a supported method is shorthand.
5. Sample aliases adopt the notation-safe alphanumeric convention.
6. `:` is rejected in `.name()` and sample-bank keys; constructor `name:variation` shorthand remains supported.
7. Fluent transforms materialize immediately and reads are side-effect-free. Legacy deferred speed cancellation that depended on getter calls is not preserved, including deferred changes to implicit stored rhythm used by later fixed rhythm setters. Shorthand's uninterrupted expression speed-chain cancellation remains required.
8. Synth note materialization preserves authored availability, including slowdown-created rests filtering replacement timing. Legacy synth compilation's loss of this filtering is not preserved; inherited timing gaps remain transparent.

Each change requires focused tests and release documentation. The specification is authoritative when legacy behavior conflicts with it; do not repair superseded implementations or add native machinery solely to reproduce a legacy defect. Existing corrected golden fixtures remain unchanged unless a specific, reviewed specification change requires a new expectation.

### Preserved behavior

- explicit rhythm priority;
- generated chop/fit priority;
- sampler inferred-timing density and tie policy;
- final hit-index value resolution;
- fixed and random rests consuming no final values;
- random chance as one timing condition;
- setters replacing defaults with authored sources, even when the value is unchanged;
- transform call order;
- note root/scale behavior;
- sampler voice pairing and duplicate voices;
- silent-bar schema conventions;
- default fallback groups filling surviving hits without activating silent timing;
- schema and engine playback behavior.

## Errors and limits

Errors remain eager at the earliest meaningful boundary:

- syntax errors occur in `d.sh()`, `d.shorthand()`, or direct-string method dispatch;
- target atom interpretation errors occur when a shorthand value is consumed;
- structured target validation remains at the setter;
- expansion-limit errors occur during evaluation or transformation;
- missing sample resources retain existing warning behavior.

Diagnostics should include the shorthand source range and target method where available.

Existing cycle limits remain authoritative. The implementation must also bound:

- expression node count and nesting depth;
- cumulative raw structured-input slots, including sparse holes and omitted nullable voices, reserved by array length before traversal;
- alternation period;
- rational denominator and normalized pattern length;
- total steps, events, voices, patterns, and cycles;
- combined cycle length during compilation.

Nothing is silently truncated, rounded to a nearby structure, or partially evaluated.

## Migration plan

Follow [`direct-cutover-plan.md`](./direct-cutover-plan.md). The redesign lands before shorthand integration, with no production adapter, dual-written state, or mixed legacy/native event lanes. The adapter-first sequence in `plan.md` and `plan-outline.md` is superseded.

### PRs 1–2 — Characterize and correct behavior

- Capture complete public-API schema fixtures for timing ownership, rests, transforms, random sources, silent bars, voices, and setter order.
- Land candidate-ordinal filtering, authored pattern semantics, and default fallback semantics as independently reviewable corrections.
- Freeze the corrected PR 2 goldens as the compatibility authority; do not rewrite them to accommodate cutover regressions.

### PR 3 — Build isolated native foundations

- Implement readonly expressions, canonical static/random event cycles, exact evaluation, structured decoding, and generic transforms.
- Test these foundations independently without changing production Fluid wiring.
- Foundation completion is not full corrected-baseline parity; PR 4 must prove representation feasibility and complete native replay.

### PR 4 — Prove native state, transitions, and compilation

- Build immutable instrument event state, pure setter/transform transitions, and a pure compiler beside the legacy production path.
- Resolve empty-bar timing-priority provenance, zero-width empty-bar compression, legacy empty-note-chord acceptance, and authored availability versus materialized timing gaps across subsequent setters.
- Replay every corrected fixture through native construction, decoding, evaluation, transitions, and compilation using production-intended helpers.
- Compare independently initialized legacy/native paths only in tests, including reproducibly generated operation sequences.
- Block production cutover until all representation questions and complete-schema mismatches are resolved. Any necessary behavior change requires separate review, not altered cutover expectations.

### Standalone package reorganization — before PR 5

- Complete and merge the behavior-preserving [Fluid package reorganization](../fluid-package-reorg/plan.md) separately from native production wiring.
- Retain the default `Drome` export, authoring API, validations, limits, bank data, golden expectations, and all useful coverage; do not delete legacy implementations in the cleanup.
- Use the reorganized owners and test/support paths in the active cutover inventory. Historical alternative plans remain historical.

### PR 5 — Cut all structured event lanes over atomically

- Switch notes, timing, sample names, variations, transforms, and synth/sampler schema generation together.
- Keep setter, transform, schema, and deletion commits separately reviewable, but merge only the complete native production path.
- Run existing public-API goldens unchanged.
- Record and verify coverage transfer before deleting superseded wrappers, compiler helpers, and legacy tests.
- Remove temporary differential wiring with legacy deletion; retain native replay and explicit regressions. Leave processing parameters unchanged.
- Use the current assertion-level inventory in [Step 5.4](./direct-cutover-plan.md#step-54--delete-superseded-event-infrastructure): retain `packages/fluid/src/__tests__/event-schemas/compatibility.test.ts`, `native-replay.test.ts`, and their `support/`; remove only the obsolete `legacy-comparison.test.ts` suite and temporary legacy-oracle portions of `packages/fluid/src/events/__tests__/transitions.test.ts` after verified coverage transfer. Retain the native materialization suite at `packages/fluid/src/events/__tests__/materialization.test.ts`.

### PR 6 — Add shorthand parsing and prove equivalence

- Parse directly into the shared expression model and extend its existing evaluator with alternation and operators.
- Interpret target atoms during evaluation, decode compact XOX through the same model, and prove structured/shorthand cycle and schema equivalence.
- Keep public shorthand dispatch disconnected until this proof passes.

### PR 7 — Expose shorthand and finish documentation

- Add eager immutable `d.shorthand()`/`d.sh()` values and direct-string consumer dispatch.
- Enforce and document sample-alias compatibility changes.
- Finish examples, diagnostics, and cleanup; confirm no shorthand or event-cycle concepts enter schema or the audio engine.

## Testing requirements

### Expression evaluation and cycle normalization

Cover:

- atoms, rests, sequences, groups, and nesting;
- polyphony, duplicate voices, invalid rest voices, and invalid mixed forms such as `[0 1,2]`;
- alternation and nested alternation;
- `!`, `*`, `/`, and `@`;
- structured decoding and shorthand parsing producing the same expression-node model;
- atom interpretation during evaluation without a converted-tree copy;
- exact pattern equivalence between `"1/2"` and `.var(1).slow(2)` under inferred and external timing;
- scalar and sibling slowdown, including the exact `60/2 1` result;
- uninterrupted `*`/`/` rate cancellation without duration drift;
- weighted-alternation retriggering before and after acceleration;
- derived event durations versus explicit rests and continuations;
- unequal alternation pattern lengths;
- silent bars and multi-bar cycles;
- expansion and nesting failures.

### Structured/shorthand equivalence

For syntax with a structured equivalent, compare typed lanes and final schema output:

- notes, names, variations, and XOX;
- rests and chords;
- repetitions and flattened groups;
- direct strings versus `d.sh()` values;
- target atom interpretation errors;
- single versus multiple method arguments.

`@` tests should compare exact continuation steps, derived durations, and schema timing. They do not require the future public `.legato()` method.

### Compiler compatibility

Cover:

- explicit and inferred timing ownership;
- density and tie selection;
- candidate-ordinal availability for every event lane;
- continuations occupying ordinals without suppressing external candidates;
- intersections of rests from multiple lanes;
- random timing and random values;
- chance misses consuming no values;
- default fallback versus authored pattern intent;
- authored slowed rests filtering externally owned timing;
- default transformed cycles not filtering externally owned timing;
- fallback groups never creating hits or activating silent timing bars;
- setters replacing defaults with authored sources even for equal values;
- voice order, duplicate voices, and wrapping;
- root/scale transforms;
- transform and setter call order;
- immediate fluent speed chains, with intermediate reads having no effect;
- chop/fit timing overrides;
- silent bars and cycle LCM limits.

### Intentional-change fixtures

Include explicit before/after coverage such as:

```ts
d.sample("bd").var([0, null, 2]).xox([1, 1, 1, 1]);
```

The accepted result has candidates at `0`, `1/2`, and `3/4`, with values `0`, `2`, and `0`.

Also include the intentional authored/default contrast:

```ts
d.sample("bd").slow(2).xox([1, 1]);
d.sample().name("bd").slow(2).xox([1, 1]);
```

The first uses `bd` as a default fallback for every surviving hit. The second is an authored pattern whose slowed rest bar can suppress hits.

### Regression verification

Run focused package checks throughout migration and the complete repository suite before completion:

```sh
pnpm check
pnpm lint
pnpm test
pnpm format
git diff --check
```

## Completion criteria

The work is complete when:

- structured event inputs and shorthand produce one expression model and use one evaluator;
- evaluated expressions are discarded and instrument state stores only event cycles;
- shorthand does not pass through the legacy authored-class chain;
- sampler event lanes use candidate-ordinal availability consistently;
- event timing and values compile to the existing schema;
- transforms and setter ordering retain characterized behavior;
- old event-pattern infrastructure is removed or has a clearly narrower remaining responsibility;
- the readonly parsed `PatternExpression<string>` is publicly inspectable while the evaluated event-cycle IR remains internal;
- all compatibility changes are documented and tested.
