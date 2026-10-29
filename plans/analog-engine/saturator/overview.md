# Saturator: Scope of Work

## What we are building

Add one saturation effect to Drome, usable on synths, samples, and named buses.
Saturation rounds off waveform peaks and adds harmonics, letting users move from
subtle coloration toward more obvious distortion.

The effect will have two controls: one to determine how hard the sound is driven
into saturation, and another to adjust its output level afterward.

**This is a saturator-only project.** Compression and effects on the main output
will be separate pieces of work. They are not prerequisites for shipping this
feature.

This document explains the scope in plain language. The [specification](spec.md)
is the detailed behavioral contract, and the [implementation plan](plan.md)
describes the reviewable changes and verification gates. Step 1.1 and the
minimal Step 1.2 integration redo are verified after parent review, and the
Phase 1 implementation exit is verified. Phase 2 native characterization,
real-time characterization, listening approval, saved-reference work, and final
feature acceptance remain pending. No user manual listening or approval is
claimed. The latest minimal-integration scope amendment supersedes the earlier
broad failure-hardening direction.

## What using it will look like

The proposed API is:

```js
// Saturate a synth, then lower its output level.
d.synth("saw").fx(d.saturator(2).postgain(0.5)).push();

// Saturate a sample.
d.sample("bd").fx(d.saturator(1.25)).push();

// Saturate everything routed into a named drum bus together.
d.bus("drums").fx(d.saturator(1.5));
```

- **Drive** multiplies the signal before saturation. More drive generally means
  stronger distortion, depending on how loud the incoming sound already is.
- **Postgain** multiplies the result afterward. It lets users turn the output
  down without undoing the distortion they have dialed in.

These are ordinary multipliers, not decibels. The working defaults are `1` for
both controls. Unity drive still applies saturation: leaving the effect out is
how to get an unchanged signal. Drive `0` means silence after any brief internal
transition, not a clean bypass.

The API, defaults, and signed-gain behavior are carried-forward working choices,
not separately approved product decisions. The agreed commitments are the
AudioWorklet implementation and the voice/named-bus-first scope.

## Where it fits in the sound

On a synth or sampler, each playing note gets its own saturator. Its source
layers mix together, pass through the effects in the user's chosen order, and
then pass through the note's volume envelope—the shape that controls its attack
and fade-out. Notes remain independent, and saturation does not make them last
longer.

On a named bus, one shared saturator processes the combined incoming sound.
That is deliberately different: simultaneous notes or drum hits can influence
each other's distortion because they enter the effect together.

Users can put existing filters or gain effects before or after saturation.
There is no built-in filter recipe or automatic loudness adjustment.

## How we will keep the implementation small

Each saturator will be **one AudioWorklet node**: a small custom audio processor
that handles drive, saturation, and output gain together. We will not build it
as a chain of native audio nodes or create a general-purpose effect framework
first.

The starting sound is a single smooth saturation curve, called `tanh`. The
working approach uses ADAA, a technique that considers consecutive samples to
reduce unwanted digital distortion artifacts. Earlier listening supports this
choice, but the finished implementation still needs testing and listening.
It is not perfectly artifact-free and can soften very high frequencies.

The surrounding work is limited to making that processor available through
Drome's existing effect API, configuration validation, voice and bus chains,
parameter controls, and cleanup rules.

On individual voices, drive and postgain will support the existing patterns,
random values, envelopes, LFOs, and MIDI controls. Named buses will keep their
current, narrower support: fixed values and per-bar patterns or random values.
This project will not expand bus modulation.

## What is not included

- A compressor, limiter, or automatic protection against excessive output levels.
- Effects on `main`, or a redesign of output routing.
- Multiple saturation curves, quality modes, or a native-node fallback.
- Wet/dry mixing, a separate bypass switch, or automatic volume compensation.
- New effect tails, longer notes, or changes to sequencing and routing.
- Broad cleanup or refactoring unrelated to making this effect work reliably.

## What finished means

The deliverable is an integrated effect, not just a standalone DSP experiment:

- It works on synths, samples, and named buses, in the requested effect order.
- Drive and output level behave predictably, including when automated.
- Mono and stereo work correctly, without mixing up channels or sharing state
  between independent notes.
- Invalid configurations are rejected clearly. Failures are reported rather
  than silently switching to another implementation.
- Finished or cancelled notes, replaced buses, and failed setup attempts leave
  no orphaned processors or control connections running.
- Existing music without a saturator sounds and behaves as before.
- Automated checks and browser audio renders verify the behavior, followed by
  the user's listening approval before accepting the feature and saving new
  reference recordings.
- A representative real-time workload is checked and documented. This is not
  a promise of unlimited simultaneous notes or identical performance on every
  device; any observed glitches remain visible risks.

The main tradeoffs to watch are sound quality at strong drive, behavior during
fast control changes, and CPU cost when many notes each own a saturator. If those
checks expose a material problem, revisit the affected choice explicitly rather
than quietly expanding the scope.
