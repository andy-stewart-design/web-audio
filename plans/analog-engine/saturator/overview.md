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
describes the reviewable work and verification gates. Step 1.1, Step 1.2, the
Phase 1 implementation exit, and the scoped Step 2.1 gate are verified. Step
2.1 produced one repeatable synth/sampler/named-bus candidate, focused checks,
and completed parent review. The candidate was explicitly approved, registered
as the `saturator` case, and used to generate its named reference pair. The
historical `bends` limitation remains unresolved, while current read-only
verification passed all 15 pre-existing references and the fresh `saturator`
case. Saved-reference listening approval and final existing checks remain
pending; final feature acceptance is not claimed.

## What using it will look like

The API for this scope is:

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

The documented defaults and signed-gain behavior apply to this scope. The
AudioWorklet implementation and voice/named-bus support are the current scope;
compression and main-output effects remain separate work.

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
reduce unwanted digital distortion artifacts. The finished implementation still
requires final saved-reference listening approval.
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
- Extra native infrastructure or coverage beyond the focused checks and one
  selected approved recording.

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
- Focused unit and integration checks cover the DSP math, API/schema,
  automation, topology, ownership, and lifecycle boundaries already accepted.
  One approved native regression case covers representative synth, sampler, and
  named-bus musical behavior in a single reused candidate.
- The candidate was explicitly approved before registration and the named
  reference update. The saved recording still requires separate user listening
  approval before feature acceptance. Existing fixed tolerances remain raw: no
  normalization or tolerance widening.
- No extra infrastructure, machine benchmark, maximum-CPU, or
  supported-polyphony guarantee is required. Ordinary manual audition may
  expose an obvious issue, which remains visible rather than creating a new
  verification obligation.

The main tradeoffs to watch are sound quality at strong drive and behavior during
fast control changes. CPU cost may be noticed during ordinary use, but it has no
required benchmark or capacity guarantee. The historical intermittent `bends`
comparison remains unresolved. If audition or focused checks expose a material
problem, revisit the affected choice explicitly rather than quietly expanding the
scope.
