# @web-audio/fluid

Fluid language for constructing scheduled Web Audio schemas.

## Source map

```text
src/
├── index.ts              # Sole code entry point; default export from ./drome
├── drome.ts              # Host/factory API and schema graph assembly
├── __tests__/            # Public API and cross-domain integration suites
│   └── event-schemas/    # Complete-schema compatibility and native replay
│       └── support/      # Shared fixtures, native regressions, replay drivers
├── instruments/          # Instrument facades and sampler-specific helpers
│   └── __tests__/
├── events/               # Native state, geometry, snapshots, transitions, compiler
│   └── __tests__/
├── inputs/               # Structured/random/XOX decoding, guards, waveform aliases
│   ├── types.ts          # Cycle and nullable input unions
│   └── __tests__/
├── parameters/           # Processing Parameter and audio-parameter input types
│   └── __tests__/
├── automations/          # Envelope (including ADSR) and LFO
│   └── __tests__/
├── effects/              # Filter and gain effects
│   └── __tests__/
├── buses/                # Bus authoring
│   └── __tests__/
├── midi/                 # MIDI schema builders, not the Web MIDI runtime
│   └── __tests__/
├── pitch/                # Scale aliases, note types, and MIDI conversion
└── samples/              # Manifest types, normalization, and built-in bank registry
    ├── banks/            # Built-in bank data
    └── __tests__/
```

Production instruments use one native event state for notes, timing, sample names, and variations. Structured setters and shorthand values decode into the shared expression model, evaluate immediately into event cycles, and update state through pure transitions; both schema getters use the native `events/` compiler. The legacy authored wrappers, compiler, and temporary comparison oracle have been removed after verified [assertion-level coverage transfer](../../plans/shorthand-syntax/phase-5-coverage-transfer.md).

Hex, Euclid, and sequence setters call named pure generators from the patterns entry point, then decode and compose their transient masks through native timing transitions. They do not construct timing-cycle wrappers.

Native event helpers do not import instrument classes, legacy wrappers, or test support. Sampler fit/chop configuration stays in `instruments/sampler-event-timing.ts`, outside authored event state. Processing parameters remain separate from event lanes.

Import internal modules directly from their owners; source paths are not supported package subpaths. `src/index.ts` exposes only the existing default `Drome` export, with no folder barrels or compatibility re-export shims. Schema-owned types come directly from `@web-audio/schema`.

Unit tests live in domain-local `__tests__/`; cross-domain suites live in `src/__tests__/`, with fixture/replay helpers in the relevant suite's `support/`. Tests remain TypeScript-checked, and production modules never import test support. See the [reorganization record](../../plans/completed/fluid-package-reorg/plan.md) and [active shorthand plan](../../plans/shorthand-syntax/direct-cutover-plan.md) for the cutover and coverage-transfer gates.

## Compiled event model

Fluid separates authoring patterns into three playback concerns:

- `eventPattern.timing` describes candidate offsets and durations;
- instrument event patterns describe notes, sample names, and variations;
- processing value patterns describe gain, detune, envelopes, effects, and regions.

Fixed rhythm masks and rests are compiled into timing and do not cross the engine boundary. Random rhythm becomes one optional timing chance condition. After chance filtering, the engine numbers surviving hits consecutively and resolves all event and processing values with that final hit index. Chord voices share one hit index.

Static value patterns contain raw values only; random numeric patterns contain per-bar value counts and random-generation settings. Neither carries offsets, durations, masks, or serialized step indices.

Samplers may be unnamed while they are being built. A name must be supplied before schema generation, either with the constructor or with `.name()`. Natural-pitch samplers omit `eventPattern.notes`, and an absent `eventPattern.variationIndices` field means variation `0`.

## Event-pattern compatibility changes

These are intentional changes to structured event authoring (not new shorthand syntax):

- **Candidate-ordinal rests:** sampler note and variation rests now filter the ordered hits in a bar, wrapping by hit ordinal rather than resampling their offsets. For example, `.var([0, null, 2]).xox([1, 1, 1, 1])` keeps hits at offsets `0`, `1/2`, and `3/4` with variations `0`, `2`, and `0`. Sample-name rests already followed this rule.
- **Authored scalars are patterns:** values set with `.notes()`, `.name()`, or `.var()` behave like one-step arrays. `.var(1).slow(2)` has an event bar followed by a rest bar; that rest suppresses hits when another lane owns timing. Replace an authored scalar after a transform if you want an untransformed repeating one-step pattern.
- **Constructor defaults are fallbacks:** a constructor sample name, the default pitch, and the default variation `0` do not compete with or filter externally owned timing. Their values fill surviving hits, never create hits in a silent bar, and their transformed cycles provide timing only when no stronger source exists. Calling a setter replaces the default with an authored pattern even if its value is unchanged. For example, `.sample("bd").slow(2)` retains fallback `bd`, while `.sample().name("bd").slow(2)` has an authored rest bar under stronger timing.

- **Immediate event transforms and pure reads:** fluent speed transforms operate on the result of each preceding call. `.notes(60).fast(2).slow(2)` produces two event bars with half-bar gates, rather than cancelling to the original one-bar gate. Calling `getSchema()` between transforms does not change the outcome; uninterrupted shorthand `*`/`/` chains still cancel during expression evaluation.
- **Synth availability survives materialization:** slowdown-created note rests continue filtering replacement timing by candidate ordinal. For example, `.notes([60, 64]).slow(2).xox(d.rand().bin().steps(4).chance(1))` keeps offsets `0` and `1/2` in both bars with quarter-bar gates. Inherited timing gaps remain transparent. This intentionally replaces the legacy synth behavior that lost those rests during materialization.

## Shorthand patterns

A single string passed to `.notes()`, `.name()`, `.variation()`/`.var()`, or `.xox()` is shorthand. Use `d.sh()` or `d.shorthand()` when the parsed value should be reused:

```ts
d.synth().notes("60 [64 67]").push();
d.sample().name("bd sd").push();
d.sample("bd").variation("0 <1 2>").push();
d.synth().xox("xoxo").push();

const reusable = d.sh("0 <1 2>");
d.sample("bd").var(reusable).push();
```

A shorthand value must be the only argument. Existing structured arguments remain structured, so `.name("bd", "sd")` creates two bars while `.name("bd sd")` creates two steps in one bar. Shorthand errors are reported at the direct method call when a string is used, or at `d.sh()`/`d.shorthand()` when a reusable value is created.

Notes and variations accept strict finite numeric atoms. XOX accepts `1`, `0`, `x`, `o`, and `.` atoms, including compact legacy strings. Sample aliases and bank keys use `[A-Za-z0-9]+`; constructor `d.sample("bd:2")` remains the supported name/variation shorthand, while `.name("bd:2")` is rejected.

Constructor defaults remain fallback values, while shorthand and structured setters create authored patterns:

```ts
d.sample("bd").slow(2).xox("11"); // fallback bd fills surviving hits
d.sample().name("bd").slow(2).xox("11"); // authored name rest filters the second bar
```

## Synth engines and saw-only unison

`d.synth()` and waveform selectors create the basic synthesizer. The basic
aliases are `sin`/`sine`, `tri`/`triangle`, `sq`/`square`, and
`saw`/`sawtooth`; basic synth schemas do not contain an `engine` field.

The saw-only unison engine is selected explicitly with either canonical alias:

```ts
d.synth("unison");
d.synth("uni"); // same engine and schema
```

Both forms return the same `UnisonSynthesizer`. Its schema is identified by
`engine: "unison"` and `waveform: "sawtooth"`; `"supersaw"` is not a public
compatibility selector. `.type("saw")` and `.type("sawtooth")` are the only
unison waveform choices. Other unison waveforms require a separate design and
are intentionally not implied by this API.

A unison voice is one scheduled note containing a bounded stack of saw
oscillators. It is separate from musical polyphony: `.notes([60, 64])` creates
multiple musical notes, while `.voices(8)` makes each note use eight saw
oscillators. The defaults are 7 oscillators, 10 cents of spread, and 0.4 stereo
width. The requested count resolves per event, is rounded, and is clamped at playback to
1–8; it is frozen for that note's lifetime rather than being live-modulated.

```ts
d.synth("unison")
  .type("saw")
  .notes("60 64 67 72")
  .voices([1, 2, 4, 8])
  .spread([0, 12, 24, 36]) // outer oscillators: ±spread cents from the note
  .width([0, 0.35, 0.7, 1]) // normalized stereo width, 0…1
  .gain(0.35)
  .adsr(0.01, 0.1, 0.8, 0.1)
  .push();
```

`.spread()` is detune in cents: an outer oscillator is offset by up to the
requested amount in either direction, independently of `.width()`. Width is
stereo placement, not detune; `0` centers the stack and `1` reaches the full
stereo range. Mono output is produced by the destination channel layout.

Spread and width accept the normal audio-parameter inputs: static cycles,
envelopes, LFOs, or MIDI CC sources. For example, `d.lfo(0, 24)` can animate
spread, while `d.lfo(0, 1).norm()` can animate width. LFO sources connect
directly to the per-voice AudioParams, so spread and width are evaluated
continuously during a note; only patterned LFO ranges update at bar boundaries.
A MIDI CC can be used for interactive control, such as
`.width(d.midi.cc(75))`; `.out()` remains the separate MIDI note-output
context. Voices/count are numeric event patterns, not an audio-rate control.

The public ranges are `width: 0…1` and nonnegative finite `spread` in cents.
`12` cents is a useful example, not a maximum; the default is `10` cents. Width
is clamped to `0…1`, and negative spread becomes `0`. Spread has no public
upper cap, while the engine applies an internal maximum finite Float32
AudioParam value before scheduling so extreme inputs cannot crash native
automation. Keep authored controls finite; these bounds do not turn the
controls into a musical loudness limiter. Each oscillator stack uses count compensation, while
final `.gain()`/ADSR, note pitch, panning, and effects can still change peak
level. There is no automatic limiter or cross-device loudness guarantee.

Unison phases are deterministic from the event, note, and oscillator identity.
Fresh renders therefore have stable phase identity without exposing a public
seed control or depending on ambient randomness. `.detune()` remains the
common synth detune control; `.spread()` adds the per-oscillator cents offsets.

## Per-voice noise layers

Synthesizers and samplers can add one optional noise layer to every emitted
voice:

```ts
d.synth("saw").noise(0.3).notes(60).push();
d.synth("unison").noise("pink", d.lfo(0, 0.4).norm()).push();
d.sample("hh")
  .noise("white", d.env(0, 0.5).adsr(0.01, 0.2, 0, 0.1))
  .push();
```

`.noise(gainInput)` enables white noise; `.noise(color, gainInput)` selects
`"white"` or `"pink"`. Omitting the gain input uses gain `1`, so `.noise()` and
`.noise("pink")` are valid. Calling `.noise()` again replaces the complete
layer, including its color and omitted defaults. `.noise(0)` is a zero-level
layer, not a removal operation.

The gain input uses the same numeric cycles, random cycles, envelopes, LFOs,
and MIDI CC sources as other instrument parameters. Values are not automatically
clamped at one, and signed or above-one values retain the existing gain
semantics. Color is static; only the gain is automated.

Noise is generated continuously, is mono/centered and unpitched, and is mixed
additively with the main source before the instrument's ordered `.fx()` chain
and shared amplitude ADSR. Adding noise does not reduce or rebalance the main
source, and there is no automatic limiter or headroom normalization. The shared
voice envelope and existing sampler duration rules still bound the complete
voice: noise gain automation cannot extend sustain or create an independent
tail. A sampler's noise layer is skipped when that sampler voice is skipped.

Noise currently uses a deterministic internal seed of `0` for reproducible
offline rendering. Seed variation and public seed controls are deferred; this
API does not create a standalone `d.noise()` instrument.

## Sampler names

These constructor forms are equivalent where applicable:

```ts
d.sample("bd");
d.sample("bd", 2);
d.sample("bd:2");
d.sample();
```

The shorthand accepts exactly one colon, trims both parts, and requires a finite numeric variation suffix. An unnamed sampler must receive a name before `getSchema()`.

`.name()` replaces any constructor name and accepts sequential bars, simultaneous voices, and whole-hit rests:

```ts
d.sample().name(["bd", "sd"]).push();
d.sample()
  .name([["bd", "hh"], "sd"])
  .push();
d.sample().name(["bd", null, "sd", null]).push();
d.sample().name("bd", "sd").push(); // two bars
```

Names, notes, and variations are independent event-value dimensions. The longest voice group supplies the voice count and shorter groups wrap. Duplicate names remain duplicate voices. Random numeric notes and variations resolve one scalar per hit and broadcast across static name layers. Random sample-name choice is not currently exposed.

Without explicit rhythm, notes, names, and variations compete by average sequential density; notes win ties over names, and names win ties over variations. Explicit rhythm and generated chop/fit timing are stronger. Authored rests filter the final timing and do not consume later values. Static names participate in `fast()`, `slow()`, `stretch()`, and `reverse()`; setting `.name()` later replaces the transformed name lane.

Each name resolves independently through its bank, source keys, and variation entries. Natural pitch uses the lowest source key at rate `1`; a requested note selects the nearest source key. Variation indices are rounded and positively wrapped per selected source key. Missing banks, names, entries, or exact URLs warn and skip only the affected voice. Exact URLs share decoded buffers, while a newly introduced URL loads in the background for later hits.

## Sampler variations

`.var()` and `.variation()` are aliases. Their input dimensions are:

```txt
outer arguments → bars
array entries   → sequential hits
nested arrays   → simultaneous sampler voices
null            → a whole-hit rest
```

```ts
d.sample("bd").var([0, 1, 2]).push(); // three hits in one bar
d.sample("bd").var(0, 1, 2).push(); // one hit across three bars
d.sample("bd")
  .var([
    [0, 1],
    [2, 3],
  ])
  .push(); // two layered hits
```

Without explicit rhythm, authored notes and variations compete to supply timing by sequential-hit density; explicit rests take priority, and notes win density ties. Explicit rhythm and generated chop/fit timing remain stronger than variation timing. Rests remove timing candidates and do not consume later values.

At a sampler event, note and variation groups are paired to the longest group length; shorter groups wrap. A random variation produces one scalar per event and broadcasts to every static voice in that event.

Variation values are resolved per selected source key: Fluid preserves finite authored values, then the engine applies `Math.round()` and positive modulo wrapping to that key's variation count. For four variations, `-1` selects `3` and `4` selects `0`; variation `0` is always a playable value, never a rest.

`fast()`, `slow()`, `stretch()`, and `reverse()` preserve static note/variation event combinations. Random variation shape transforms generate fresh deterministic values rather than repeating prior results. Generated chop/fit timing remains exempt. With `.dir("alt")`, every layer in one event uses the same direction, and direction advances once only when at least one voice plays.

## Per-voice effects

`.fx()` applies its effects independently to every synth or sampler voice, in the authored order, before that voice's amplitude ADSR envelope:

```text
source → .fx(...) → amplitude envelope → instrument mix
```

The envelope remains the final per-voice loudness stage, while effect automation and LFOs still target the same effect parameters. Voices do not share effect audio nodes, and the public syntax and schema are unchanged. There is no legacy position selector or compatibility mode.

This placement is an intentional sonic breaking change for effected sketches. For example, a filter can respond differently during note attacks and releases because it now receives the un-enveloped source before the voice envelope gates the processed result. Not every sketch will sound audibly different, and no automatic conversion is provided; adjust the sketch only if its former sound is desired.

Effects on persistent buses remain separate from per-voice `.fx()` processing. Routes and sends still branch from the existing post-voice, post-balancing, post-mute instrument output described below.

## Buses, routes, and sends

`main` is the persistent engine output. Its gain is configurable, but it does not support effects:

```ts
d.bus("main").gain(0.9);
```

Declare named buses for group processing and auxiliary returns. Named buses feed main automatically:

```ts
d.bus("drums").gain(0.8).fx(d.lpf(8_000));
d.bus("verb").gain(0.5);
```

An instrument has one primary route, defaulting to main. Selecting a named route replaces the direct-main path:

```ts
d.sample("bd").route("drums").push();
```

Sends add gain-controlled parallel copies without changing the primary route:

```ts
d.sample("bd").route("drums").send("verb", 0.1).push();
d.sample("sd").route("drums").send("verb", 0.4).push();
d.synth().send("verb", 0.2).push();
```

Routes and sends branch after instrument balancing and mute. Sending to main is rejected because it would normally duplicate the dry signal. Repeated sends to one target use the most recent amount.

### Pattern-triggered ducking

An instrument can duck a declared named bus when each resolved pattern event starts. Ducking follows the pattern, not the source amplitude, and never targets `main`:

```ts
d.bus("music").gain(0.8);
d.sample("bd").route("drums").duck("music", 0.75, 0.2, 0.5).push();
```

`.duck(target, depth, onset, recovery)` accepts one target or an array of named targets. The defaults are `depth = 1`, `onset = 0`, and `recovery = 1`. Fluid trims target names, clamps finite values to the canonical ranges, and replaces an earlier configuration for the same target. Direct schemas must contain canonical values and are validated against declared buses; forward bus declarations are allowed.

Onset and recovery are proportions of the resolved pattern-event duration. For a 0.5-second event, `onset = 0.2` reaches the duck target after 0.1 seconds, then `recovery = 0.5` returns to unity over 0.25 seconds immediately afterward—it does not wait for the event to end. Zero depth is a no-op. Muted instruments still trigger ducks, and sampler triggers still occur when a sample is unavailable; sample playback length does not change duck timing.

A retrigger during an unfinished dip or recovery holds the current bus gain and starts a fresh dip instead of jumping to unity or dropping the trigger. Exact same-target/time collisions keep the deepest request; other dense or nearly simultaneous requests use the simple ordered retrigger behavior and are not guaranteed to be sample-frame deterministic. This is event-triggered ducking, not sidechain compression, and patterned duck settings, MIDI-triggered ducking, and main ducking are unsupported. Transport Stop cancels future duck automation and holds each bus at its current duck gain while that graph remains alive; graph replacement isolates old and new bus generations, with replacement buses starting at unity.

Named-bus gain and filter effect parameters accept static cycles and deterministic random values. They resolve once per bar using the first step in each represented bar:

```ts
d.bus("filter").fx(
  d.lpf(8_000, 400), // two bars: bar 0 → 8,000, bar 1 → 400
  d.gain([1, 0.5]), // one bar with two steps: the bus uses only 1
);

d.bus("random").fx(
  d.lpf(d.rand().range(400, 8_000).rib(42)), // deterministic by bar
);
```

Additional intra-bar steps remain in the schema but are intentionally ignored by buses.

By default, parameter changes use a mandatory 10 ms anti-pop transition. Configure a longer transition as a fraction of one bar with `transition()` or its extracted-safe `trans()` alias:

```ts
d.bus("filter").transition(0.25).fx(d.lpf(8_000, 400));
d.bus("gain").trans(0.5).fx(d.gain(1, 0.2));
```

Transitions begin at the bar boundary. Their duration is the greater of 10 ms and the configured bar fraction. Effect nodes remain persistent while their runtime graph is alive. Replaced buses freeze at their last scheduled state while retiring voices finish. Transport Stop cancels and holds scheduled bus automation at the exact Stop time without disconnecting those nodes.

Bus output `gain()` remains constant. Envelopes, LFOs, MIDI CC, patterned sends, main effects, and bus-to-bus routing remain unsupported. Random validation is intentionally limited to the bus-safe subset; global random-schema hardening remains separate follow-up work. A bus named `verb` is only a name until a reverb processor is implemented.

Fluid always emits the canonical graph fields expected by AudioEngine. With no explicit routing configuration, `getSchema()` includes `buses: {}`, and each instrument includes `route: "main"`, `sends: {}`, and `ducks: {}`. It also emits `bpm: undefined` when BPM has not been configured, which resets playback to the default 120 BPM when committed. Fluid validates the completed graph, allowing buses to be declared after instruments that reference them.

## LFO automation

Create a free-running, BPM-synchronized LFO with `d.lfo()`.

By default, the two arguments are a baseline and bipolar offset:

```ts
const vibrato = d.lfo(0, 100);
```

```text
output = baseline + offset × waveform[-1…1]
range = -100…100
```

Calling `.norm()` changes the arguments to minimum and maximum:

```ts
const cutoff = d.lfo(400, 1200).norm();
```

```text
output = min + (max - min) × waveform[0…1]
range = 400…1200
```

Examples:

```ts
d.synth("saw")
  .notes(60)
  .detune(d.lfo(0, 100).speed(4))
  .fx(
    d.lpf(d.lfo(400, 1200).norm().speed(0.5)),
    d.gain(d.lfo(0, 1).norm().speed(4)),
  )
  .push();
```

LFO phase is free-running and shared across an instrument's voices rather than restarting for every note. Applying an LFO replaces the target parameter value; it is not added to that parameter's native Web Audio default.

## Development

From the repository root:

```sh
pnpm install
pnpm --filter @web-audio/fluid build
pnpm --filter @web-audio/fluid check
pnpm --filter @web-audio/fluid lint
pnpm --filter @web-audio/fluid test:ci
pnpm --filter @web-audio/fluid format
```

For workspace verification:

```sh
pnpm check
pnpm lint
pnpm test
pnpm format
git diff --check
```
