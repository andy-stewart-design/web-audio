# Step 2.1 candidate evidence

## Status

Step 2.1 is **Verified** for scoped candidate preparation, repeatability
checks, focused verification, and parent review. The candidate remains
unregistered and has not received user listening approval or a saved reference.

## Candidate

The focused test renders two fresh instances of the same portable candidate and
compares their raw Float32 channels with the existing fixed comparison limits
(maximum error `1e-6`, RMS error `1e-7`). The first render writes:

- WAV: `packages/audio-regression/artifacts/saturator/candidate-48000.wav`
- Metadata: `packages/audio-regression/artifacts/saturator/candidate-48000.json`

Recorded metadata: 48,000 Hz, stereo, 196,417 frames, 4.092020833 seconds,
two bars, 128 BPM, 4,417-frame start offset, and 0.25 seconds of tail. The
candidate contains a saw synth, the local `sample-tone` sampler fixture, and a
named `drums` bus with a square synth routed into it.

## Checks

- Forced source build: passed, 6/6 tasks.
- Focused native Vitest command: passed, 3 files and 4 tests.
- Audio-regression check, lint, and format check: passed.
- Read-only `audio:verify`: passed, 15/15 existing cases; references were not
  updated.

The [native evidence](native.md) records an unresolved intermittent `bends`
limitation; the current read-only verification nevertheless passed all 15
existing references. This does not establish a cause or resolution. Step 2.2
still owns user listening approval, case registration, reference creation, and
final acceptance.
