# @web-audio/fluid

Fluid language for constructing scheduled Web Audio schemas.

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
d.bus("filter").fx(d.lpf(8_000, 400));
```

By default, parameter changes use a mandatory 10 ms anti-pop transition. Configure a longer transition as a fraction of one bar with `transition()` or its extracted-safe `trans()` alias:

```ts
d.bus("filter").transition(0.25).fx(d.lpf(8_000, 400));
d.bus("gain").trans(0.5).fx(d.gain(1, 0.2));
```

Transitions begin at the bar boundary. Their duration is the greater of 10 ms and the configured bar fraction. Envelopes, LFOs, MIDI CC, patterned sends, and patterned bus output gain remain unsupported. A bus named `verb` is only a name until a reverb processor is implemented.

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
