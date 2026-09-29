# @web-audio/fluid

Fluid language for constructing scheduled Web Audio schemas.

## Compiled event model

Fluid separates authoring patterns into three playback concerns:

- `eventPattern.timing` describes candidate offsets and durations;
- instrument event patterns describe notes, sample names, and variations;
- processing value patterns describe gain, detune, envelopes, effects, and regions.

Fixed rhythm masks and rests are compiled into timing and do not cross the engine boundary. Random rhythm becomes one optional timing chance condition. After chance filtering, the engine numbers surviving hits consecutively and resolves all event and processing values with that final hit index. Chord voices share one hit index.

Static value patterns contain raw values only; random numeric patterns contain per-bar value counts and random-generation settings. Neither carries offsets, durations, masks, or serialized step indices.

Samplers may be unnamed while they are being built. A name must be supplied before schema generation, either with the constructor or with `.name()`. Natural-pitch samplers omit `events.notes`, and an absent `events.variationIndices` field means variation `0`.

## Event-pattern compatibility changes

These are intentional changes to structured event authoring (not new shorthand syntax):

- **Candidate-ordinal rests:** sampler note and variation rests now filter the ordered hits in a bar, wrapping by hit ordinal rather than resampling their offsets. For example, `.var([0, null, 2]).xox([1, 1, 1, 1])` keeps hits at offsets `0`, `1/2`, and `3/4` with variations `0`, `2`, and `0`. Sample-name rests already followed this rule.
- **Authored scalars are patterns:** values set with `.notes()`, `.name()`, or `.var()` behave like one-step arrays. `.var(1).slow(2)` has an event bar followed by a rest bar; that rest suppresses hits when another lane owns timing. Replace an authored scalar after a transform if you want an untransformed repeating one-step pattern.
- **Constructor defaults are fallbacks:** a constructor sample name, the default pitch, and the default variation `0` do not compete with or filter externally owned timing. Their values fill surviving hits, never create hits in a silent bar, and their transformed cycles provide timing only when no stronger source exists. Calling a setter replaces the default with an authored pattern even if its value is unchanged. For example, `.sample("bd").slow(2)` retains fallback `bd`, while `.sample().name("bd").slow(2)` has an authored rest bar under stronger timing.

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

Fluid always emits the canonical graph fields expected by AudioEngine. With no explicit routing configuration, `getSchema()` includes `buses: {}`, and each instrument includes `route: "main"` and `sends: {}`. It also emits `bpm: undefined` when BPM has not been configured, which resets playback to the default 120 BPM when committed. Fluid validates the completed graph, allowing buses to be declared after instruments that reference them.

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

- Install dependencies:

```bash
npm install
```

- Run the unit tests:

```bash
npm run test
```

- Build the library:

```bash
npm run build
```
