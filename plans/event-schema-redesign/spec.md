# Event Schema Redesign Specification

## Status

Proposed.

This specification replaces the assumption that note patterns must also define event timing. It is foundational work for sampler variation and sample-name patterning.

## Summary

The current schema was designed around synthesizers:

```txt
notes say when an event happens
and
notes say which pitch to play
```

That becomes awkward for samplers. A sampler event may need:

- zero or more target notes;
- one or more sample names;
- one or more variation indices;
- shared gain, detune, regions, effects, and playback settings.

A sampler name or variation pattern may also be the clearest source of timing when no rhythm was written.

The new schema separates two questions:

```txt
TimingSchema       → when can events happen?
ValuePattern<T>    → what values do those events use?
```

Fluid compiles user calls into this playback plan. The audio engine does not choose timing priority or interpret Fluid method intent.

## Core principles

### The schema is a compiled playback plan

`DromeSchema` does not preserve an authoring recipe. Fluid decides:

- which pattern supplies timing;
- how fixed rests affect timing;
- how rhythm methods compose;
- how event transforms change the pattern;
- how chop and fit generate timing.

The schema contains the result of those decisions. It does not contain flags such as “notes were explicit” or “names won timing.”

### The engine stays policy-free

The engine:

- selects bars;
- evaluates an optional random timing condition;
- numbers surviving events;
- resolves values by bar and hit number;
- resolves sample entries and buffers;
- schedules Web Audio and MIDI work.

The engine does not decide which Fluid pattern should create events.

### Timing is separate from values

Timing is the only serialized data that contains offsets and durations.

Static and random value patterns do not contain:

- offsets;
- durations;
- grid step numbers.

### Only timing creates events

Numeric zero is always data outside timing:

- note `0` is a valid target note;
- variation `0` is a valid variation;
- gain `0` is a valid gain value;
- a random binary zero is still a value.

Only a failed timing condition or an absent timing entry prevents an event.

Fluid may accept rests in authoring patterns, but it compiles those rests into timing before serialization.

### Event values remain independent

Notes, sample names, variations, and processing values keep their own bar cycles and wrapping behavior.

Rests and failed random timing conditions do not consume their values. Surviving events receive consecutive hit numbers starting at zero in each bar.

## Target schema

Names may change during implementation, but the following shapes and responsibilities are required.

### Static values

```ts
interface StaticValuePattern<T> {
  type: "static";
  cycle: T[][];
}
```

The dimensions are:

```txt
cycle
→ bars
→ values consumed by successive hits
```

Examples:

```ts
// Gain
const gain: StaticValuePattern<number> = {
  type: "static",
  cycle: [[0.5, 1]],
};

// Two note groups in one bar
const notes: StaticValuePattern<number[]> = {
  type: "static",
  cycle: [[[60], [64, 67, 71]]],
};

// Two sample-name groups in one bar
const sampleNames: StaticValuePattern<string[]> = {
  type: "static",
  cycle: [[["bd", "hh"], ["sd"]]],
};
```

That means:

```txt
hit 0 → bd and hh together
hit 1 → sd
```

### Random numbers

```ts
interface RandomNumberPattern {
  type: "random-number";
  valuesPerBar: number[];
  dataType: "float" | "integer" | "binary";
  segments: { seed: number; len?: number }[];
  range?: { min: number; max: number };
  quantValue?: number;
  algorithm: "xor" | "mulberry";
  valueMap?: number[];
  order: "forward" | "reverse";
}
```

`valuesPerBar` replaces the current timed random grid. It tells the engine how many values belong to each random bar.

A random number pattern returns one scalar for each addressed hit. When used for notes or variation indices, that scalar becomes a one-value voice group and broadcasts if another static field creates more voices.

A zero count is allowed only for a whole silent bar that cannot be reached by timing. Schema validation enforces that relationship.

### Shared numeric patterns

```ts
type NumberPattern = StaticValuePattern<number> | RandomNumberPattern;
```

Gain, envelope fields, detune, region values, effect values, and LFO bounds use value-only numeric patterns.

### Event timing

```ts
interface TimingStep {
  offset: number;
  duration: number;
}

interface ChanceCondition {
  type: "chance";
  probability: number;
  segments: { seed: number; len?: number }[];
  algorithm: "xor" | "mulberry";
  order: "forward" | "reverse";
}

interface TimingSchema {
  cycle: TimingStep[][];
  condition?: ChanceCondition;
}
```

`TimingSchema.cycle` contains candidate events.

A fixed rhythm has no condition. A random XOX rhythm has one chance condition that runs once per candidate event.

A chance condition applies to the entire event, not separately to its voices.

Fluid simplifies constant conditions:

```txt
chance 1 → omit the condition
chance 0 → emit empty timing bars
```

### Timing validation

A timing cycle contains at least one bar. A bar may be empty.

Within each non-empty bar:

- offsets are finite;
- offsets satisfy `0 <= offset < 1`;
- offsets are strictly increasing and unique;
- durations are finite and greater than zero.

Durations may cross bar boundaries. Do not require `offset + duration <= 1`.

The engine does not sort or merge timing entries.

### Event value patterns

```ts
type StaticNotePattern = StaticValuePattern<number[] | null>;

type NotePattern = StaticNotePattern | RandomNumberPattern;

type SampleNamePattern = StaticValuePattern<string[] | null>;

type StaticVariationIndexPattern = StaticValuePattern<number[] | null>;

type VariationIndexPattern = StaticVariationIndexPattern | RandomNumberPattern;
```

A serialized `null` may appear only as the sole value of a whole silent bar:

```ts
{
  type: "static",
  cycle: [
    [null],
    [[60]],
    [[67]],
  ],
}
```

It may not appear:

- inside a voice group;
- beside an active value in the same bar;
- in a bar where timing has any candidate event.

A pattern containing silent bars must align one-to-one with the matching timing cycle. This avoids open-ended cross-cycle absence rules.

### Instrument events

```ts
interface SynthEventSchema {
  timing: TimingSchema;
  notes: NotePattern;
}

interface SamplerEventSchema {
  timing: TimingSchema;
  notes?: NotePattern;
  sampleNames: SampleNamePattern;
  variationIndices?: VariationIndexPattern;
}
```

Synth notes are required. Fluid serializes the default note `60` explicitly.

Sampler notes are optional:

```txt
notes present → use target notes to choose source keys and pitch rates
notes absent  → use each sample's lowest source key at playback rate 1
```

Sampler variation indices are optional:

```txt
variationIndices absent → variation 0
```

Sample names are required. A sampler pattern must contain at least one real name somewhere in its cycle, even if other bars are silent.

### Shared instrument schema

```ts
interface InstrumentSchema<TEvents> {
  events: TEvents;
  gain: EnvelopeSchema;
  detune: AudioParamSchema;
  effects: EffectSchema[];
  muted: boolean;
  route: string;
  sends: Record<string, number>;
}

interface SynthesizerSchema extends InstrumentSchema<SynthEventSchema> {
  type: "synthesizer";
  waveform: Waveform;
  notesOut?: MidiOutSchema;
}

interface SamplerSchema extends InstrumentSchema<SamplerEventSchema> {
  type: "sampler";
  bank: string;
  fit: FitSchema | null;
  region: RegionSchema | null;
  loop: boolean;
  clipMode: ClipMode;
  direction: SampleDirection;
}
```

Gain, detune, effects, regions, and playback settings remain outside `events`. They are shared by every voice in one event.

### Removed schema concepts

The final schema does not contain:

- `NotesSchema`;
- `StaticSchemaValue`;
- timed static parameter values;
- `RandomSchema.grid`;
- `polyphonic` flags;
- serialized grid `stepIndex`;
- `SamplerSchema.sourceKeys`;
- scalar top-level sampler `sample`;
- top-level sampler `variation`;
- top-level instrument `notes`.

## Polyphony

### Static voice groups

Notes, sample names, and variation indices may contain several simultaneous values at one hit.

```txt
bars
→ sequential hits
→ simultaneous values
```

Example:

```ts
sampleNames: {
  type: "static",
  cycle: [[
    ["bd", "hh"],
    ["sd"],
  ]],
}
```

### Voice pairing

At each hit:

1. Resolve notes, sample names, and variation indices.
2. Normalize random scalar results to one-value arrays.
3. Treat absent sampler notes as natural-pitch values determined later.
4. Treat absent variations as `[0]`.
5. Set voice count to the longest resolved array.
6. Wrap every shorter array to that voice count.

Example:

```txt
notes:             [0]
sample names:      [bd, sd]
variation indices: [0, 1, 2]
```

produces:

```txt
voice 0 → note 0, bd, variation 0
voice 1 → note 0, sd, variation 1
voice 2 → note 0, bd, variation 2
```

Static active voice groups must be non-empty. Random note and variation patterns produce one scalar per hit and broadcast. They do not implicitly generate one random value per voice.

### Shared processing

All voices in one event share:

- timing condition result;
- event start and requested gate duration;
- gain and envelope values;
- detune;
- effects;
- regions and chop index;
- direction mode;
- loop and clip mode;
- routing and sends.

Shared settings are applied separately to each selected source. Region windows, nearest source keys, pitch rates, fit rates, and actual stop times may differ by voice.

## Fluid authoring API

### Sampler construction

Valid forms:

```ts
d.sample();
d.sample("bd");
d.sample("bd", 2);
d.sample("bd:2");
```

Invalid forms:

```ts
d.sample(["bd", "sd"]);
d.sample("bd", [2, 4]);
```

`d.sample()` is valid while building, but schema generation fails unless `.name()` later supplies at least one real sample name.

The constructor accepts only a scalar name and optional scalar variation. Patterning belongs to `.name()` and `.var()`/`.variation()`.

### Strict colon shorthand

Accept one unambiguous numeric suffix:

```ts
d.sample("bd:2");
d.sample("bd:-1");
d.sample("bd:1.5");
```

Reject:

- invalid numeric suffixes;
- more than one colon;
- a colon variation combined with the second constructor argument;
- non-finite variation values.

Names passed to `.name()` treat colons literally.

### Name and bank normalization

Fluid trims authored sample and bank names. Empty and whitespace-only names are invalid.

Bank normalization also trims sample and bank keys. It rejects collisions created by trimming instead of silently overwriting entries.

Compiled schemas contain only normalized names. The engine performs exact lookup.

### Pattern input dimensions

Notes, names, and variations use consistent dimensions:

```txt
outer arguments → bars
array entries   → sequential hits
nested arrays   → simultaneous values
null            → explicit rest
```

Examples:

```ts
.name(["bd", "sd"]);
// one bar, two sequential hits

.name("bd", "sd");
// two bars, one hit in each bar

.name([["bd", "hh"]]);
// one bar, one hit with two sample names

.var([[0, 1], [2], [3, 4]]);
// one bar, three hits with varying voice counts

.name(["bd", null, "sd"]);
// one bar with active positions 0 and 2

.name([], ["sd"]);
// one silent bar followed by one active bar
```

`null` is allowed as a whole hit rest, not inside a simultaneous voice group.

Zero-argument calls are invalid:

```ts
.notes();
.name();
.var();
.variation();
```

### Replacement behavior

`.name()` completely replaces the constructor name or previous name pattern. The replaced name has no serialized, preload, or fallback role.

Repeated `.notes()`, `.name()`, and `.variation()` calls replace only their own value pattern.

## Choosing sampler timing

Fluid chooses timing. It serializes only the result.

### Strong timing sources

Existing chop and fit composition remains stronger than name and variation fallback timing. Existing explicit/generated chop, fit, note, and rhythm behavior must be audited and preserved except where this specification explicitly changes it.

Explicit rhythm methods define or modify timing directly:

- `.euclid()`;
- `.xox()`;
- `.hex()`;
- `.sequence()`.

Once explicit rhythm exists, later `.notes()`, `.name()`, and `.var()` calls do not clear it. These value setters are treated consistently.

Fixed rhythm methods continue composing in call order.

A random `.xox()` is a reset point:

- it replaces earlier candidate timing and random condition;
- a later random `.xox()` replaces it again;
- later fixed rhythm calls may reshape its candidates while retaining its one chance condition.

### Explicit rests

Explicit rests in notes, sample names, or variation indices are compiled into fixed timing gaps.

When an explicit rhythm exists, rests from all authored core event patterns filter its candidates before serialization.

A rhythm modifier cannot create an event where an authored core event pattern explicitly has no value.

### Inferred timing

When no explicit rhythm or stronger chop/fit rule supplies timing, Fluid compares the current explicitly authored note, name, and variation shapes.

A pattern containing explicit rests or silent bars takes priority over density so that authored silence is preserved. If several such patterns compete, use:

```txt
notes > sample names > variation indices
```

Otherwise, the pattern with the highest average number of sequential hits per bar supplies timing.

For a shape with `H` hit groups across `B` bars:

```txt
density = H / B
```

Compare densities with integer cross-multiplication rather than floating point.

Simultaneous values count as one hit group.

Tie priority is:

```txt
notes > sample names > variation indices
```

Only timing-capable event patterns participate. Gain, detune, effects, envelopes, regions, and other processing patterns do not.

Root and scale may cause sampler notes to be serialized, but do not supply timing by themselves.

If no timing-capable pattern was explicitly authored, use one default event per bar.

### Density examples

```ts
d.sample("bd").notes(60).var([0, 1, 2]);
```

produces three hits per bar:

```txt
notes:     1 / 1 = 1 hit per bar
variation: 3 / 1 = 3 hits per bar
```

```ts
d.sample("bd").notes([60, 64]).var(0, 1, 2);
```

produces two hits per bar over a three-bar combined phrase:

```txt
notes:     2 / 1 = 2 hits per bar
variation: 3 / 3 = 1 hit per bar
```

Resolved output:

```txt
bar 0 → 60/variation 0, 64/variation 0
bar 1 → 60/variation 1, 64/variation 1
bar 2 → 60/variation 2, 64/variation 2
```

A denser lower-priority pattern beats a less-dense higher-priority pattern. Field priority applies only to ties and competing explicit silence.

## Pattern transforms

### Procedural behavior

`.fast()`, `.slow()`, `.stretch()`, and rhythmic `.reverse()` remain procedural.

They affect the ordinary event patterns and explicit timing state that exist when called. A later setter replaces its field with a new untransformed pattern.

### What transforms affect

Transforms apply to:

- ordinary event timing;
- notes;
- sample names;
- variation indices.

They do not transform:

- gain or envelopes;
- detune;
- effects;
- regions;
- routing and sends;
- loop, clip, or direction settings.

Generated chop and fit timing remains exempt in these PRs. Preserve its current special behavior.

### Static and random behavior

Static event combinations move together under transforms.

For example, reversing:

```txt
bd/variation 0, sd/variation 1
```

produces:

```txt
sd/variation 1, bd/variation 0
```

Random patterns transform their generation shape instead of repeating already resolved output.

`fast(2)` creates twice as many random values and timing-condition decisions. It does not resolve one phrase and repeat its random results.

`stretch()` repeats static source values but produces fresh random values and chance decisions in each generated random bar.

`reverse()` reverses:

- finite bar order;
- hit order within each bar;
- generated random values within each bar;
- chance decisions within each bar.

It does not reverse random seed/ribbon progression across absolute playback time.

Transforms never reorder simultaneous voices within one hit.

### Fast and slow

Speed changes compose as rates:

```txt
fast(n) → multiply by n
slow(n) → divide by n
```

Examples:

```ts
.fast(4).slow(2); // equivalent to fast(2)
.fast(1.5);       // equivalent to fast(3).slow(2)
.fast(0.5);       // equivalent to slow(2)
```

Accept positive finite values that can be represented as reasonably small rational numbers. Do not silently round.

Fluid rejects rates or composed expansions that cannot be represented within documented tolerance and size limits.

### Stretch

`.stretch(bars, steps = 1)` requires positive integer arguments.

```ts
.notes(60, 67).stretch(2, 4);
```

is equivalent to:

```ts
.notes(
  [60, 60, 60, 60],
  [60, 60, 60, 60],
  [67, 67, 67, 67],
  [67, 67, 67, 67],
);
```

Reject zero, negative, fractional, and non-finite stretch counts.

## Runtime event resolution

### Shared timing resolution

The engine first resolves timing:

```ts
interface ResolvedTimingEvent {
  barIndex: number;
  hitIndex: number;
  offset: number;
  duration: number;
}
```

For each bar:

1. Select the timing bar by wrapping `barIndex`.
2. Generate one chance result per candidate if a condition exists.
3. Skip failed candidates.
4. Assign consecutive hit numbers to surviving candidates.

A failed chance condition consumes no event values.

### Synth events

```ts
interface ResolvedSynthEvent extends ResolvedTimingEvent {
  notes: number[];
}
```

Static note groups resolve directly. Random notes resolve one scalar and normalize to a one-note group.

Every voice in a synth chord shares one hit number and event processing values.

### Sampler events

```ts
interface ResolvedSamplerVoice {
  note?: number;
  sampleName: string;
  requestedVariationIndex: number;
}

interface ResolvedSamplerEvent extends ResolvedTimingEvent {
  voices: ResolvedSamplerVoice[];
}
```

The engine resolves complete voice objects before sample lookup.

For each surviving hit:

1. Resolve static or random note values when notes exist.
2. Resolve sample names.
3. Resolve static or random variation indices when they exist.
4. Apply longest-array voice count and inner wrapping.
5. Fill absent variation with `0`.
6. Leave absent note as natural-pitch selection.

### Hit stability across failures

An event receives its hit number before:

- sample lookup;
- variation wrapping;
- buffer lookup or loading;
- reverse-buffer lookup;
- region validation;
- voice creation.

Missing or invalid playback never renumbers later events.

For a multi-voice event, available voices may play while failed voices skip.

## Sampler source resolution

For each resolved sampler voice:

```txt
sample name
→ source keys derived from normalized bank data
→ target note or natural lowest key
→ nearest source key
→ rounded and wrapped variation index
→ sample entry
→ URL buffer
→ region/chop window
→ pitch and fit rates
→ voice scheduling
```

### Source keys

`sourceKeys` is not serialized.

The engine derives sorted numeric keys from the selected bank and sample name and may cache that result by bank/name.

When sampler notes are absent, choose the lowest source key and use the same key as the target note. Playback rate is therefore `1` before fit.

When notes exist, choose the nearest source key separately for each voice. Preserve deterministic lower-key tie behavior unless implementation audit reveals a documented different rule.

### Variation selection

Resolve a numeric variation value, round it with `Math.round()`, then wrap it with positive modulo by the selected source key's variation count.

For four variations:

```txt
0 → 0
1 → 1
2 → 2
3 → 3
4 → 0
5 → 1
-1 → 3
```

Do not use “out of range falls back to zero.”

If no variation entries exist, the voice is missing and skips.

### Missing resources

A valid but missing bank or sample name does not invalidate the graph.

Fluid warns when it can detect the missing resource. Runtime lookup warns and skips only the affected voice.

Later events retain their values and hit numbers.

## Direction and duration

### Alternate direction

Direction is resolved once per event.

All voices in one event use the same forward or reverse direction.

For alternate direction:

```txt
no voices emitted  → do not advance
one or more emitted → advance exactly once
```

Cancellation and playback reset restore the next alternate direction to forward.

### Requested and actual duration

`TimingStep.duration` is the requested event or gate duration.

Synth actual duration equals timing duration.

Sampler voices share start time and requested gate duration, but each computes actual duration from its own:

- source entry;
- region or chop window;
- pitch rate;
- fit rate;
- loop state;
- clip mode.

One-shot and clipped voices in one event may stop at different times. Shared envelope values are scheduled against each voice's actual duration.

### Chop and fit

Preserve current chop and fit composition.

Plain `.fit(4)` generates four one-bar events selecting source quarters.

Explicit chop counts remain distributed over fit length:

```txt
.chop(1).fit(4) → one four-bar event
.chop(2).fit(4) → two two-bar events
.chop(8).fit(4) → eight half-bar events
```

Shared region and chop settings are applied separately to each voice's selected source. Fit rate is calculated per voice.

Do not redesign generated chop/fit transform behavior in these PRs.

## Buffer loading

### One shared URL cache

Remove the per-sampler logical buffer map.

The engine owns shared caches:

```txt
resolved URL → AudioBuffer
loading URL  → Promise<AudioBuffer | null>
AudioBuffer  → reversed AudioBuffer
```

A sampler resolves its logical identity to a sample entry and URL, then asks the shared cache for that URL.

Sprite metadata remains on the resolved entry. Several entries may safely share one decoded buffer.

### No approximate hot-swap fallback

Remove old-buffer substitution across updates.

Only an exact URL already present in the shared cache is reused immediately. A new variation never temporarily plays an older variation.

Remove initial-identity bookkeeping and sampler-wide `isReady()`.

### Preloading

Preload the smallest variation set that is provably complete. Otherwise preload every available variation.

For every statically referenced sample name:

1. Derive every source key from the bank.
2. Determine possible rounded and wrapped variation indices.
3. Resolve each target to its URL.
4. Deduplicate URLs.
5. Fetch and decode each URL once.
6. Prepare reversed buffers when direction may require them.

Static value sets and small finite random ranges may narrow preload work. Broad or unknown random variation results must preload every available variation.

### Lazy loading

If an exact buffer is unavailable at scheduling time:

- start or share a background load;
- skip that voice on time;
- do not play it late;
- do not substitute another buffer;
- allow later hits to play it once loaded.

Failed loads warn and remain retryable according to existing cache policy.

## Future random choice

Random sample names are not implemented in these three PRs.

The design must allow a future typed pattern such as:

```ts
d.sample("bd").name(d.choice(["bd", "sd", "hh"]).steps(8));
```

A likely future type is:

```ts
interface RandomChoicePattern<T> {
  type: "random-choice";
  valuesPerBar: number[];
  choices: T[];
  segments: { seed: number; len?: number }[];
  algorithm: "xor" | "mulberry";
  order: "forward" | "reverse";
}
```

Then:

```ts
type SampleNamePattern =
  | StaticValuePattern<string[] | null>
  | RandomChoicePattern<string>;
```

This future addition must not require another timing redesign. Its `valuesPerBar` can participate in density and timing inference, and its finite choices can be preloaded.

## Validation boundary

`validateDromeGraph()` is authoritative.

Fluid validates its own compiled result. `AudioEngine.update()` clones and validates direct input before committing it.

Validation covers:

- timing shape, order, ranges, and duration;
- chance probability and random configuration;
- static and random cycle presence;
- voice-group non-emptiness;
- legal whole-bar `null` placement;
- zero random counts only where timing is unreachable;
- normalized non-empty bank and sample names;
- required sampler name existence somewhere in the pattern;
- finite numeric values where required;
- routing and existing graph invariants;
- safe compiled expansion limits.

Validation does not require referenced banks, samples, URLs, MIDI devices, or audio resources to be available.

After validation, the engine assumes structural correctness. It remains defensive only around runtime resources and Web Audio operations.

## Compatibility changes

### Preserved public behavior

Keep these forms:

```ts
d.sample("bd");
d.sample("bd", 2);
d.sample("bd:2");
```

Preserve:

- bar syntax;
- note and chord syntax;
- fixed rhythm composition;
- hit-based value lookup;
- rests and random timing misses consuming no values;
- synth MIDI output;
- gain, envelopes, detune, effects, regions, loop, clip, routing, and MIDI CC behavior;
- current chop and fit composition except where separately specified.

### Intentional public changes

- `d.sample()` becomes valid when `.name()` later supplies a real name.
- Array sample constructors remain invalid.
- `.name()` adds static sequential, multi-bar, polyphonic, and rest syntax.
- `.var()`/`.variation()` add simultaneous variation groups and explicit rests.
- Without explicit rhythm, timing uses explicit silence and then highest average hit density.
- Pattern modifiers cannot be cleared by later note, name, or variation setters.
- Event transforms apply to ordinary notes, names, variations, and timing.
- Random values remain fresh under fast, slow, and stretch.
- Fractional speed rates use bounded rational semantics instead of integer rounding.
- Invalid stretch counts throw instead of rounding.
- Variation indices wrap instead of falling back to variation zero.
- Alternate sample direction advances once per event instead of once per emitted voice.
- Names and bank keys are trimmed.
- Constructor colon shorthand is validated strictly.
- Approximate hot-swap buffers and sampler-wide readiness are removed.

### Intentional schema break

The old and new event schemas are not compatible. Do not add:

- old/new schema unions;
- compatibility flags;
- migration casts through `any`;
- engine branches that accept both forms.

All schema producers, consumers, tests, fixtures, docs, and examples migrate atomically in the foundation PR.

## Pull request boundaries

### PR 1 — Event schema foundation

Implement the shared representation:

- timing and chance schemas;
- value-only static and random number patterns;
- generic instrument event schemas;
- synth and sampler schema migration;
- fixed and random mask compilation;
- shared timing and typed event resolvers;
- removal of grid step fields, polyphonic flags, random grids, and serialized source keys;
- URL-only buffer caching;
- removal of approximate fallback and readiness state;
- atomic fixture, validation, and documentation migration.

Keep musical behavior as close to current behavior as the new representation allows. Record every unavoidable difference.

### PR 2 — Variation timing and event-pattern behavior

Implement and verify:

- explicit variation timing;
- note-versus-variation density selection;
- rests and silent variation bars;
- simultaneous variation indices;
- event-wide static transforms and fresh transformed randomness;
- bounded rational speed;
- strict stretch validation;
- modulo variation wrapping;
- alternate direction per event;
- chop/fit compatibility under the new compiler.

This PR uses one fixed sample name.

### PR 3 — Sample-name patterning

Implement and verify:

- `.name()`;
- optional unnamed sampler builder;
- static name bars, hits, simultaneous values, and rests;
- name participation in silence and density rules;
- normalized names and strict validation;
- per-name natural pitch and source-key lookup;
- multi-name preload and runtime playback;
- files, sprites, multisamples, regions, chop, fit, loop, clip, and direction coverage;
- documentation for the final model;
- extension points for future `RandomChoicePattern<string>` without implementing it.

Each PR must be independently green.

## Acceptance criteria

The redesign is complete when:

- synths and samplers share one explicit timing model;
- Fluid owns all timing policy;
- the engine receives a validated playback plan;
- static values contain no timing fields;
- random values use counts rather than timed grids;
- fixed rests are absent from serialized timing candidates;
- random timing uses one specialized chance condition;
- hit numbers are consecutive after all timing filters;
- notes, names, variations, and processing values resolve by final hit;
- static notes, names, and variations support simultaneous values;
- scalar random values broadcast across simultaneous voices;
- sampler notes and variations have explicit absence defaults;
- source keys are derived from bank data rather than serialized;
- variation values round and wrap within the selected source;
- missing resources skip only affected voices;
- alternate direction is event-based;
- static transforms preserve event combinations;
- transformed random patterns generate fresh values;
- generated chop and fit behavior remains compatible;
- URL caching and preloading remain safe;
- no compatibility schema remains;
- future typed random sample choice can be added without changing timing again.

## Final mental model

```txt
Fluid builds independent event-value patterns.

Explicit rhythm chooses candidate times when present.
Otherwise, explicit rests are preserved and the densest authored
note, sample-name, or variation pattern supplies timing.

Fluid compiles all fixed timing decisions into TimingSchema.
The engine applies one optional chance condition and numbers the
surviving events from zero within each bar.

At each hit, synths resolve note voices.
Samplers resolve note, sample-name, and variation arrays, wrap them
to one voice count, and then resolve each voice's source.

Timing says when.
Event patterns say what starts.
Processing patterns say how it sounds.
The engine does not decide authoring policy.
```
