# @web-audio/fluid

Fluid language for constructing scheduled Web Audio schemas.

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
