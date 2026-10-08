# Case inputs and sample provenance

Each immediate case folder has `metadata.json` and ordinary REPL source in `sketch.js`; see [the package README](../README.md#authoring-cases) for authoring/discovery rules. Samples are colocated in the case's `samples/` directory. These are **input sample fixtures**, not listening-approved reference recordings:

- `sample-tone/samples/tone.wav`: mono, 48 kHz, PCM16, 0.5 seconds; 440 Hz sine, amplitude 0.5.
- `sample-reverse/samples/asymmetric.wav` and `sample-alternate/samples/asymmetric.wav`: byte-identical copies, same format/duration; first 0.125 seconds are a 440 Hz sine at amplitude 0.6, middle 0.25 seconds are silent, final 0.125 seconds are an 880 Hz sine at amplitude 0.2. Unequal ends expose reversal and region-selection mistakes.

Origin/license notes: original mathematically generated sine-wave data; no third-party samples, recordings, performances, or separate sample-license dependencies. User-supplied assets must have their own origin/permission notes before committing.

Regenerate the input files explicitly from the repository root:

```sh
pnpm --filter @web-audio/audio-regression exec tsx src/resources/generate-fixtures.ts
```

The generator is included in TypeScript checking and explicitly writes all three colocated files. Rendering/tests never regenerate these inputs. Existing PCM16 bytes were retained exactly when the cases moved from the central TypeScript registry. Samples are fetched from the owned loopback HTTP server and decoded by the real engine in Chromium, not replaced with generated AudioBuffers in the browser.
