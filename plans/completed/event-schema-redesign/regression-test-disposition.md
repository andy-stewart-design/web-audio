# PR 1 Regression Test Disposition

This audit accounts for the behavior in the four suites substantially changed or removed by the event-schema migration. It classifies tests by observable responsibility rather than preserving tests coupled to the old representation.

## Disposition labels

- **Migrated** — the behavior is asserted through the target schema, sometimes in a more focused suite.
- **Covered elsewhere** — an existing shared or integration suite owns the behavior.
- **Obsolete** — the behavior was intentionally removed by PR 1 and must not be recreated.

## `resolve-note-events.test.ts` (11 baseline cases)

| Baseline behavior                                    | Disposition       | Current ownership                                                                             |
| ---------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| Dense and sparse unmasked notes                      | Migrated          | `resolve-timing.test.ts`, `resolve-synth-events.test.ts`, `resolve-sampler-events.test.ts`    |
| Chord grouping into one multi-voice event            | Migrated          | `resolve-synth-events.test.ts`, synth/sampler layered scheduling tests                        |
| Cycling source groups across static masks            | Migrated          | Fluid timing compilation plus typed event resolver tests                                      |
| Independent source/mask bars and bar-local hit reset | Migrated          | independent wrapping tests in both typed event resolvers                                      |
| Random-mask misses do not consume hit indices        | Migrated          | `resolve-timing.test.ts` and surviving-hit scheduler tests                                    |
| Random notes under static and random masks           | Migrated          | `resolve-synth-events.test.ts`, `resolve-sampler-events.test.ts`, scheduler random-note tests |
| Structural rests and empty/all-rest bars             | Migrated          | empty timing tests in timing, event resolver, synth, and sampler suites                       |
| Input schemas are not mutated                        | Covered elsewhere | immutable resolver behavior plus engine graph-cloning tests                                   |

The old combined resolver itself is obsolete. Timing eligibility and value resolution now have separate typed owners.

## `sample-buffer-store.test.ts` (17 baseline cases)

| Baseline behavior                                   | Disposition | Current ownership                                              |
| --------------------------------------------------- | ----------- | -------------------------------------------------------------- |
| Exact cached lookup                                 | Migrated    | `sample-buffer-cache.test.ts`                                  |
| Fetch and decode on cache miss                      | Migrated    | `sample-buffer-cache.test.ts`                                  |
| In-flight URL promise deduplication                 | Migrated    | `sample-buffer-cache.test.ts`                                  |
| Failed-load warning and retry                       | Migrated    | `sample-buffer-cache.test.ts`                                  |
| Lazy exact-URL loading                              | Migrated    | sampler missing-buffer regression and cache tests              |
| Missing bank/sample warnings                        | Migrated    | `preload-samples.test.ts` and sampler skip behavior            |
| Forward-only preload avoids reverse work            | Migrated    | `preload-samples.test.ts`                                      |
| Reverse preparation and reuse                       | Migrated    | `sample-buffer-cache.test.ts`, `reversed-buffer-cache.test.ts` |
| Every source key and known variation is prepared    | Migrated    | `preload-samples.test.ts` and engine preload integration tests |
| Out-of-range variation falls back to variation zero | Migrated    | `resolve-sample-entry.test.ts` and preload tests               |
| Initial fallback buffer behavior                    | Obsolete    | PR 1 forbids approximate buffer substitution                   |
| `fallbackBufferFor()` identity behavior             | Obsolete    | API removed with fallback policy                               |
| Sampler-wide initial readiness                      | Obsolete    | exact resources load independently; affected voices skip       |
| Warning for an unprepared reverse fallback          | Obsolete    | reverse data is requested through the exact-URL cache          |

## `synthesizer.test.ts` (23 baseline cases)

| Baseline behavior                                               | Disposition | Current ownership                                                                 |
| --------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| Parameter and envelope value resolution                         | Migrated    | `value-pattern-resolver.test.ts`, `instrument.test.ts`                            |
| Sparse timing and hit-addressed processing                      | Migrated    | timing, typed event resolver, synthesizer, and instrument tests                   |
| Static/random notes under fixed/random masks                    | Migrated    | Fluid timing compiler, `resolve-timing.test.ts`, and synth event/scheduling tests |
| Empty and random-miss bars schedule nothing                     | Migrated    | synth event and scheduling tests                                                  |
| Chord voices share hit index and processing                     | Migrated    | synth event and scheduling tests                                                  |
| Independent value bars and bar-local hit reset                  | Migrated    | `value-pattern-resolver.test.ts`, `resolve-synth-events.test.ts`                  |
| MIDI timing, note, channel, selector, and gain-derived velocity | Migrated    | `synthesizer.test.ts`, `midi-output-scheduler.test.ts`                            |
| MIDI velocity clamp and zero suppression                        | Migrated    | `synthesizer.test.ts`                                                             |
| Missing MIDI scheduler preserves local playback                 | Migrated    | `synthesizer.test.ts`                                                             |
| Absent `notesOut` suppresses MIDI only                          | Migrated    | `synthesizer.test.ts`                                                             |

## `sampler.test.ts` (85 baseline cases)

### Resource loading and identity

| Baseline behavior                                               | Disposition | Current ownership                                         |
| --------------------------------------------------------------- | ----------- | --------------------------------------------------------- |
| Bank/name/variation URL resolution                              | Migrated    | `resolve-sample-entry.test.ts`, sampler scheduling tests  |
| Static variation preload and variation-zero fallback            | Migrated    | `preload-samples.test.ts`, `resolve-sample-entry.test.ts` |
| Cache hits, fetch/decode, concurrent deduplication, and retries | Migrated    | `sample-buffer-cache.test.ts`                             |
| Shared sprite URLs decode once                                  | Migrated    | cache and preload deduplication tests                     |
| Missing resources warn and skip exact voices                    | Migrated    | preload and sampler missing-buffer tests                  |
| Readiness gating and old-buffer fallback                        | Obsolete    | intentionally removed exact-URL policy                    |
| Per-name source-key selection                                   | Migrated    | layered-name sampler regression                           |

### Timing, values, and voices

| Baseline behavior                                               | Disposition | Current ownership                                               |
| --------------------------------------------------------------- | ----------- | --------------------------------------------------------------- |
| Static/random notes under fixed/random masks                    | Migrated    | timing/event resolver tests and random-note sampler scheduling  |
| Random variation independent of random pitch                    | Migrated    | sampler scheduling test                                         |
| Chords/layers share one event hit                               | Migrated    | sampler event and scheduling tests                              |
| Gain, detune, regions, and variation advance by final hit       | Migrated    | sampler surviving-hit, missing-buffer, and invalid-region tests |
| Empty bars and misses schedule no voices                        | Migrated    | timing/event resolver and sampler empty-bar tests               |
| Missing buffers or invalid windows do not compress later values | Migrated    | sampler scheduling regressions                                  |

### Source and playback composition

| Baseline behavior                                      | Disposition       | Current ownership                                              |
| ------------------------------------------------------ | ----------------- | -------------------------------------------------------------- |
| Natural pitch, nearest key, and playback rate          | Migrated          | source-entry and sampler scheduling tests                      |
| File and sprite entry windows                          | Migrated          | sampler region/sprite tests                                    |
| Static start/end and relative-duration regions         | Migrated          | sampler region tests                                           |
| Variation is selected before region mapping            | Migrated          | sampler variation/region test                                  |
| Reverse whole-buffer and region mapping                | Migrated          | sampler reverse-region test                                    |
| Reverse duration loop points                           | Migrated          | sampler reverse-loop test                                      |
| Chop selection, negative wrapping, and bounded offsets | Migrated          | sampler chop/fit scheduling tests                              |
| Fit rate from file, sprite, and bounded chop duration  | Migrated          | sampler fit and fit/chop tests                                 |
| One-shot source-window duration                        | Migrated          | sampler one-shot test                                          |
| Loop duration and loop-window behavior                 | Migrated          | sampler reverse-loop test and shared instrument envelope tests |
| Effects wiring and event parameter resolution          | Covered elsewhere | `instrument.test.ts` plus synth/sampler processing tests       |

### Alternate direction and lifecycle

| Baseline behavior                                               | Disposition       | Current ownership                         |
| --------------------------------------------------------------- | ----------------- | ----------------------------------------- |
| Alternate starts forward and advances after successful playback | Migrated          | sampler alternate tests                   |
| All voices in an event share direction                          | Migrated          | layered alternate regression              |
| Partial success advances once; complete failure does not        | Migrated          | sampler alternate regressions             |
| Empty/failed events do not advance                              | Migrated          | sampler alternate regressions             |
| Cancellation resets direction                                   | Migrated          | sampler cancellation regression           |
| Finished, retirement, cancellation, and disconnection           | Covered elsewhere | `instrument.test.ts` and `engine.test.ts` |

## Remaining intentional matrix reduction

The baseline sampler suite repeated many assertions across the Cartesian product of source type, region type, direction, fit/chop, variation, and clipping mode. PR 1 keeps direct tests at composition boundaries where ordering changes behavior, while leaf responsibilities are tested once in focused suites. This avoids restoring assertions whose only purpose was to exercise the removed schema shape or `SampleBufferStore`.

Every baseline behavioral family now has a migrated, shared, or obsolete disposition. Future sampler-name and variation PRs should extend this matrix when they add new timing authority, layers, wrapping, or dynamic-name semantics.
