# Shorthand Syntax and Event Pattern Architecture

## Status

Proposed.

This specification defines both:

1. a compact shorthand syntax for event patterns; and
2. the event-pattern architecture that structured input and shorthand share.

It supersedes the implementation direction in [`pattern-ir-redesign.md`](./pattern-ir-redesign.md).

The syntax is intentionally a subset of Tidal/Strudel mini-notation and is called **shorthand**, not mini-notation.

## Goals

- Add compact syntax for notes, sample names, variations, and XOX rhythm.
- Give structured input and shorthand one canonical internal representation.
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
structured values ─> normalizeStructuredInput() ─┐
                                                  ├─> EventCycle<T>
shorthand value ──> ShorthandNode ─> normalizeShorthand() ─┘
                                                         ↓
                                              InstrumentEventState
                                                         ↓
                                                  EventCompiler
                                                         ↓
                                           existing event-pattern schema
```

The normalizer names are intentionally analogous: they identify different input syntaxes but produce the same representation. `normalizeStructuredInput()` is broader than `normalizeArraySyntax()` because method arguments may include scalars, multiple bars, and random sources in addition to arrays.

Notes, sample names, variations, and explicit rhythm are distinct event lanes, each represented by an event cycle built from the same structural primitives. Fluid coordinates those lanes, selects timing, applies availability, and emits the existing schema.

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
  readonly ast: ShorthandNode;
}
```

The returned object is ordinary frozen data. Its `ast` is enumerable, inspectable, and fully typed.

Fluid exports `Shorthand`, `ShorthandNode`, and their supporting readonly AST types. `d.shorthand()` and `d.sh()` remain the public parser entry points; a separate `parseShorthand()` function is not part of the REPL-facing API.

### Direct strings

Supported consumers also accept a single shorthand string directly:

```ts
d.synth().notes("60 [64 67]");
d.sample().name("bd sd");
d.sample("bd").var("0 <1 2>");
d.sample("bd").xox("1!4 0!4");
```

Direct strings and `d.sh()` values use exactly the same parser and normalization path.

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

Each consumer supplies target-specific atom conversion while sharing structural parsing and normalization.

## Syntax

### AST

The parser returns a public, readonly, source-aware AST:

```ts
type ShorthandNode =
  | ShorthandAtom
  | ShorthandRest
  | ShorthandSequence
  | ShorthandGroup
  | ShorthandParallel
  | ShorthandAlternate
  | ShorthandModifier;

type ShorthandRange = {
  readonly start: number;
  readonly end: number;
};

type ShorthandAtom = {
  readonly type: "atom";
  readonly value: string;
  readonly range: ShorthandRange;
};

type ShorthandRest = {
  readonly type: "rest";
  readonly range: ShorthandRange;
};

type ShorthandSequence = {
  readonly type: "sequence";
  readonly children: readonly ShorthandNode[];
  readonly range: ShorthandRange;
};

type ShorthandGroup = {
  readonly type: "group";
  readonly child: ShorthandNode;
  readonly range: ShorthandRange;
};

type ShorthandParallel = {
  readonly type: "parallel";
  readonly children: readonly ShorthandNode[];
  readonly range: ShorthandRange;
};

type ShorthandAlternate = {
  readonly type: "alternate";
  readonly children: readonly ShorthandNode[];
  readonly range: ShorthandRange;
};

type ShorthandModifier = {
  readonly type: "modifier";
  readonly operator: "repeat" | "accelerate" | "slow" | "weight";
  readonly amount: string;
  readonly child: ShorthandNode;
  readonly range: ShorthandRange;
};
```

User-authored atom and operator-amount lexemes remain strings in the AST. Target conversion and rational interpretation happen during normalization.

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

`/n` is semantically equivalent to applying the existing `.slow(n)` transform to its operand. It slows event progression by distributing the node's existing steps across more cycles without implicitly extending their gate durations. The equivalence includes preserving the operand's `valueMode`; it is not limited to pattern geometry.

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

Both begin with a constant value group and preserve that classification through slowdown. Their normalized cycle geometry includes an event bar followed by a silent bar, but under externally owned timing the constant group `[1]` broadcasts into both bars; the generated silent bar does not filter candidates. In contrast, `.var([1], [null])` is authored as patterned and its explicit second silent bar does filter candidates.

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

A note, sample-name, variation, or timing **lane** contains an `EventCycle<T>`. A lane describes the lane's role in an instrument; it is not another structural level.

`EventPattern<T>` does overlap in name with the existing schema `EventPattern`. During migration, code that imports both should alias the schema type as `CompiledEventPattern` rather than inventing different musical terminology for the IR.

### Static cycle shape

A conceptual representation is:

```ts
type EventCycle<T> = StaticValueCycle<T> | RandomEventCycle<T>;

type StaticEventCycle<T> = {
  readonly type: "static-event-cycle";
  readonly patterns: readonly EventPattern<T>[];
};

type StaticValueCycle<T> = StaticEventCycle<T> & {
  readonly valueMode:
    | {
        readonly type: "constant";
        readonly group: readonly [T, ...T[]];
      }
    | {
        readonly type: "patterned";
      };
};

type RandomEventCycle<T> = {
  readonly type: "random-event-cycle";
  readonly valuesPerPattern: readonly number[];
  readonly settings: RandomSettings<T>;
};

type EventPattern<T> = readonly EventStep<T>[];

type EventStep<T> =
  | {
      readonly type: "event";
      readonly values: readonly T[];
    }
  | { readonly type: "rest" }
  | { readonly type: "continuation" };
```

The exact random settings and container syntax may change, but the cycle/pattern/step levels, static step variants, and constant-versus-patterned distinction are required. Random event cycles are numeric-only in v1 and preserve generation settings rather than pretending to contain static steps.

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
  valueMode: { type: "patterned" },
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
  valueMode: { type: "patterned" },
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

There is no separate shorthand IR after parsing. The shorthand AST is syntax-oriented, and `normalizeShorthand()` produces the same `EventCycle<T>` as `normalizeStructuredInput()`.

Storing `offset` and `duration` on every step would duplicate information already represented exactly by step order and continuation runs. Deriving them at the compiler boundary prevents those fields from drifting out of sync and avoids floating-point arithmetic inside the canonical IR.

If an implementation needs rationals during shorthand evaluation, they are transient normalization data, not a second persistent convention.

### Structured input normalization

Structured input normalizes directly to typed event cycles; it does not pass through the shorthand AST.

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

Structured slots receive equal allocation. Empty structured bars normalize to explicit silent bars according to existing consumer behavior. Empty simultaneous voice groups remain invalid.

#### Constant versus patterned classification

`valueMode` describes authored value topology, not the final transformed event grid. Classification therefore happens before timing transforms are materialized.

Structured input is constant when its initial authored shape contains exactly one event with one nonempty simultaneous value group and no authored rests or alternatives. Shorthand uses the same rule after structural sequence, alternation, polyphony, rest, and `!` semantics are known, but before `*`, `/`, and `@` are materialized. Those three operators preserve their operand's classification just like the corresponding fluent timing transforms. The constant event's simultaneous values become `valueMode.group`.

These forms therefore normalize as constant and are semantically equivalent:

```ts
.var(1);
.var([1]);
.var("1");
.var(d.sh("1"));
```

The same rule applies to notes and names. A one-event simultaneous group may contain multiple values:

```ts
.var([[1, 2]]); // constant group [1, 2]
.notes([[60, 64]]); // constant group [60, 64]
```

Sequential values are patterned rather than constant:

```ts
.var([1, 2]);
.notes([60, 64]);
```

Structural repetition also creates authored sequential topology, while speed and weight operators do not:

```ts
.var("1!2"); // patterned; equivalent to .var([1, 1])
.var("1*2"); // constant value group with accelerated intrinsic timing
.var("1/2"); // constant value group with slowed intrinsic timing
```

Once assigned, `valueMode` is semantic state. Transforms preserve it rather than re-inferring it from the transformed patterns. A later setter normalizes and classifies the replacement input afresh.

### Shorthand normalization

A shorthand value remains untyped until consumed:

```text
ShorthandNode
  → structural evaluation
  → target atom conversion
  → normalizeShorthand()
  → typed EventCycle<T>
```

Target conversion does not alter grouping, timing, rests, alternation, or operators. Shorthand evaluation carries `valueMode` alongside pattern geometry: it classifies authored value topology first and then applies `*`, `/`, and `@` without reclassifying the transformed grid.

### Random lanes

Random numeric notes and variations remain distinct cycle variants. They retain random-generation settings and per-pattern shape rather than being expanded into fake static steps.

Random timing remains fixed candidate geometry plus at most one runtime chance condition. Fixed lane availability is applied before the condition reaches the engine. Runtime chance misses do not consume event or processing values.

## Fluid event-pattern state

Fluid owns coordinated synth and sampler event state instead of separate authored classes that compile through one another.

Conceptually:

```ts
type EventSource<T> = {
  readonly intent: "default" | "authored";
  readonly cycle: EventCycle<T>;
};

type StaticEventSource<T> = {
  readonly intent: "default" | "authored";
  readonly cycle: StaticValueCycle<T>;
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

Generated chop/fit timing is derived from sampler configuration and passed to the compiler as an optional timing override. It is not stored alongside authored timing in `InstrumentEventState`. This preserves the underlying implicit or explicit timing state if sampler configuration changes whether generated timing applies.

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
4. constructor defaults do not compete as authored intent.

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
- each patterned lane maps every candidate ordinal to one of its steps, wrapping independently;
- a mapped event step is available;
- a mapped explicit rest suppresses the candidate;
- a mapped continuation is transparent: it occupies and counts as that ordinal, but the candidate remains available;
- a constant value cycle is available at every candidate when it does not own timing, regardless of rests introduced by transforms;
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

Value lanes continue to wrap independently. Sampler voice groups continue to pair using existing longest-group wrapping behavior in the engine.

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

- value setters replace only their own lane;
- transforms preserve a static cycle's `valueMode`; it is never re-inferred from transformed patterns;
- later setters are not retroactively transformed;
- explicit rhythm remains after a later value setter;
- fixed rhythm methods compose in call order;
- `fast`, `slow`, `stretch`, and `reverse` retain their existing event behavior;
- generated chop/fit timing remains exempt where it is today;
- processing patterns remain independent from event timing.

Global event transforms should be implemented as centralized `InstrumentEventState` transitions. If current behavior requires materializing lane relationships against selected timing, that materialization happens once in the state operation rather than independently inside authored wrapper classes.

The implementation should not retain an open-ended operation log. Each method updates canonical state immediately through pure transformations.

## Target-specific conversion

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

They normalize into the same timing-lane representation as all other fixed rhythm input.

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

- shorthand lexing, parsing, and public readonly AST types;
- source-aware syntax errors;
- rational structural evaluation;
- static event-cycle primitives;
- generic transforms and expansion limits;
- immutable shorthand creation and normalization support;
- existing random-pattern primitives.

It does not decide whether an atom is a note, sample name, variation, or XOX value.

The AST is public through the returned shorthand value so users and tooling can inspect parsed syntax. The normalized event-cycle IR remains an internal implementation boundary even if private package exports are required for Fluid integration.

### `@web-audio/fluid`

Owns authoring semantics:

- `d.shorthand()` and `d.sh()`;
- direct-string dispatch;
- structured-input normalization entry points;
- target-specific atom conversion and validation;
- synth and sampler event state with colocated authored intent;
- timing-selection policy;
- transform/setter call order;
- event compilation to schema.

### `@web-audio/schema` and `@web-audio/audio-engine`

Remain unchanged for the initial redesign. They continue to consume explicit timing and hit-addressed event-value patterns.

## Compatibility policy

Existing behavior is preserved unless listed below.

### Intentional changes

1. Sampler note and variation rests filter explicit or competing timing by candidate ordinal rather than offset-based positional resampling.
2. A single string passed to a supported method is shorthand.
3. Sample aliases adopt the notation-safe alphanumeric convention.
4. `:` is rejected in `.name()` and sample-bank keys; constructor `name:variation` shorthand remains supported.

Each change requires focused before/after tests and release documentation.

### Preserved behavior

- explicit rhythm priority;
- generated chop/fit priority;
- sampler inferred-timing density and tie policy;
- final hit-index value resolution;
- fixed and random rests consuming no final values;
- random chance as one timing condition;
- setter replacement semantics;
- transform call order;
- note root/scale behavior;
- sampler voice pairing and duplicate voices;
- silent-bar schema conventions;
- constant value groups remaining available after timing transforms;
- schema and engine playback behavior.

## Errors and limits

Errors remain eager at the earliest meaningful boundary:

- syntax errors occur in `d.sh()`, `d.shorthand()`, or direct-string method dispatch;
- target conversion errors occur when a shorthand value is consumed;
- structured target validation remains at the setter;
- expansion-limit errors occur during normalization or transformation;
- missing sample resources retain existing warning behavior.

Diagnostics should include the shorthand source range and target method where available.

Existing cycle limits remain authoritative. The implementation must also bound:

- AST node count and nesting depth;
- alternation period;
- rational denominator and normalized pattern length;
- total steps, events, voices, patterns, and cycles;
- combined cycle length during compilation.

Nothing is silently truncated, rounded to a nearby structure, or partially evaluated.

## Migration plan

The redesign lands before shorthand integration so the new syntax does not depend on temporary adapters.

### Phase 1 — Characterize and correct behavior

- Preserve focused tests for current timing ownership, rests, transforms, random patterns, silent bars, and setter order.
- Add explicit compatibility fixtures for structured input versus final schema.
- Change sampler note and variation availability to candidate-ordinal filtering in an isolated change.
- Document the intentional behavior difference.

### Phase 2 — Introduce event-cycle primitives

- Implement the static event/rest/continuation representation.
- Add rational normalization and bounded pattern-length utilities.
- Normalize existing structured notes into event cycles.
- Test transformations independently from Fluid classes.

### Phase 3 — Migrate synth event compilation

- Introduce pure event compilation for structured synth notes and explicit rhythm.
- Preserve random note and random XOX behavior.
- Route synth schema generation through the new compiler.

### Phase 4 — Migrate sampler lanes

- Normalize names and variations into the same lane abstraction.
- Centralize sampler timing selection and fixed availability.
- Preserve independent value wrapping, voices, random variation, and default intent.
- Route sampler schema generation through the new compiler.

### Phase 5 — Centralize transforms and remove old infrastructure

- Move event transforms into `InstrumentEventState` operations.
- Preserve call-order characterization tests.
- Remove or narrow `MaskedCycle`, `AuthoredPitches`, `AuthoredEventValues`, and `AuthoredTiming` once no production path depends on them.
- Remove duplicate timing and availability helpers.

### Phase 6 — Add shorthand

- Implement the lexer, parser, public readonly AST types, diagnostics, and immutable shorthand value.
- Normalize shorthand to the same typed event cycles as structured input.
- Add direct-string dispatch and `d.shorthand()`/`d.sh()`.
- Normalize legacy XOX strings through the same rhythm-lane path.

### Phase 7 — Cleanup and documentation

- Remove temporary migration adapters.
- Update public pattern and sampler documentation.
- Document sample-name migration constraints.
- Confirm that no schema or engine shorthand concepts were introduced.

## Testing requirements

### Structural normalization

Cover:

- atoms, rests, sequences, groups, and nesting;
- polyphony, duplicate voices, invalid rest voices, and invalid mixed forms such as `[0 1,2]`;
- alternation and nested alternation;
- `!`, `*`, `/`, and `@`;
- `valueMode` classification before shorthand timing modifiers;
- exact equivalence between `"1/2"` and `.var(1).slow(2)` under inferred and external timing;
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
- target conversion errors;
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
- scalar/default versus authored intent;
- constant versus patterned `valueMode`, including preservation through transforms;
- voice order, duplicate voices, and wrapping;
- root/scale transforms;
- transform and setter call order;
- chop/fit timing overrides;
- silent bars and cycle LCM limits.

### Intentional-change fixtures

Include explicit before/after coverage such as:

```ts
d.sample("bd").var([0, null, 2]).xox([1, 1, 1, 1]);
```

The accepted result has candidates at `0`, `1/2`, and `3/4`, with values `0`, `2`, and `0`.

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

- structured event inputs and shorthand normalize to the same event-cycle representation;
- shorthand does not pass through the legacy authored-class chain;
- sampler event lanes use candidate-ordinal availability consistently;
- event timing and values compile to the existing schema;
- transforms and setter ordering retain characterized behavior;
- old event-pattern infrastructure is removed or has a clearly narrower remaining responsibility;
- the readonly shorthand AST is publicly inspectable while the normalized event-cycle IR remains internal;
- all compatibility changes are documented and tested.
