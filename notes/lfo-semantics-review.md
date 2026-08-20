# LFO semantics compatibility review

## Purpose

This fixture records the intended before/after effective ranges and provides a focused listening checklist for the LFO semantics correction.

Web Audio sums an `AudioParam`'s intrinsic value with connected signals. The corrected engine sets the intrinsic value to zero because the Drome LFO emits the complete target value.

## Inspectable ranges

| Target               | Configured LFO range | Native default | Previous effective range | Corrected effective range |
| -------------------- | -------------------: | -------------: | -----------------------: | ------------------------: |
| Oscillator detune    |       -100…100 cents |              0 |                 -100…100 |                  -100…100 |
| Buffer-source detune |       -100…100 cents |              0 |                 -100…100 |                  -100…100 |
| Filter frequency     |          400…1200 Hz |            350 |                 750…1550 |                  400…1200 |
| Filter Q             |                0.5…8 |              1 |                    1.5…9 |                     0.5…8 |
| Filter gain          |              -6…6 dB |              0 |                     -6…6 |                      -6…6 |
| Gain-effect gain     |                  0…1 |              1 |                      1…2 |                       0…1 |

The unchanged detune and filter-gain ranges are intentional: their common native defaults are already zero. They still use explicit neutralization so all LFO targets share one contract.

Sketches that intentionally compensated for the previous filter, Q, or gain native-default offset will sound different. That is a documented compatibility break: preserving the accidental offset would conflict with the configured LFO range.

## Formula fixtures

```ts
// Baseline 800, offset 400: 400…1200
d.lfo(800, 400);

// Minimum 400, maximum 1200: 400…1200
d.lfo(400, 1200).norm();

// Minimum 0, maximum 1: 0…1
d.lfo(0, 1).norm();

// Baseline 0, offset 100: -100…100
d.lfo(0, 100);
```

## Listening fixtures

### Filter frequency

```ts
d.synth("saw")
  .notes(60)
  .fx(d.lpf(d.lfo(400, 1200).norm().speed(0.5)))
  .push();
```

Expected: the cutoff traverses 400…1200 Hz rather than receiving the filter's native 350 Hz offset.

### Tremolo

```ts
d.synth("sine")
  .notes(60)
  .fx(d.gain(d.lfo(0, 1).norm().speed(4)))
  .push();
```

Expected: gain traverses 0…1 and produces full tremolo rather than 1…2 amplification.

### Filter Q and gain

```ts
const movement = d.lfo(0.5, 8).norm().speed(0.5);

d.synth("saw").notes(48).fx(d.lpf(900).q(movement)).push();
```

Review Q and a peaking/shelf filter gain fixture with moderate output level. Confirm the configured range is audible without an extra native offset.

### Oscillator detune

```ts
d.synth("saw").notes(60).detune(d.lfo(0, 100).speed(4)).push();
```

Expected: symmetric -100…100 cent vibrato, phase-locked as before.

### Sampler detune

```ts
d.sample("bd").detune(d.lfo(0, 100).speed(4)).push();
```

Expected: the same symmetric detune contract on each buffer-source voice.

## Stop regression review

Use a sustained synth voice with prominent detune or filter modulation. Press Stop while the voice is currently audible.

Expected:

- future voices are cancelled;
- the active voice retains its LFO modulation until it ends;
- Stop does not produce a click caused by abruptly disconnecting the active LFO edge.

## Manual status

- [ ] Filter frequency reviewed
- [ ] Tremolo reviewed
- [ ] Filter Q reviewed
- [ ] Filter gain reviewed
- [ ] Oscillator detune reviewed
- [ ] Sampler detune reviewed
- [ ] Active-voice Stop behavior reviewed

Do not start a development server or browser session for this review without explicit permission.
