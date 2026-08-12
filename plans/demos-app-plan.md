# Internal Demos App Plan

## Context

The repository currently has three standalone Vite applications under `apps/`:

- `apps/audio-clock`: a Solid-based `@web-audio/clock` metronome exploration;
- `apps/midi-demo`: a vanilla TypeScript `@web-audio/midi` manual-test application;
- `apps/sequencer`: an old React sequencer prototype that is no longer representative of the current system.

Create a single internal `apps/demos` application to collect small, focused Web Audio explorations. It will initially replace the audio-clock and MIDI demos, add an interactive explanation of turntable-style scratch playback, and then retire `apps/sequencer`.

This is an internal learning/manual-verification tool, not the deployable Drome application. It must remain separate from `apps/web` and must not add routes, dependencies, or deployment concerns to that application.

## Goals

- Give isolated audio concepts a durable, discoverable home.
- Preserve the useful behavior of the current clock and MIDI demos.
- Teach scratch playback through direct, inspectable Web Audio API usage.
- Make each demo usable independently from a browser user gesture.
- Keep the demos lightweight and implement their interactive behavior in vanilla TypeScript.

## Non-goals

- Recreate Hyperblam or depend on Hyperblam.
- Add scratch semantics to `@web-audio/audio-engine` or the Drome language.
- Re-fetch the Chocolate Rain / Tay Zonday source from a third-party host; the local default is `apps/demos/public/tay.mp3`, and users can replace it with a local file.
- Deploy `apps/demos` or link it from the production web app.
- Preserve the obsolete sequencer UI or migrate its code.

## Key design decisions

- `apps/demos` is an Astro application. Astro provides the shared layout, static demo index, and individual routes.
- Each route is entirely client-side where it accesses Web Audio or Web MIDI. No `AudioContext`, `navigator.requestMIDIAccess`, or browser-only APIs may run during SSR/module evaluation.
- Use vanilla TypeScript for every interactive demo. Migrate the Solid audio-clock UI as a small DOM-rendering/controller module rather than retaining Solid or installing an Astro framework integration.
- Existing demo CSS may be migrated and normalized gradually; visual consistency is useful but is not a reason to block the functional migration.
- The scratch demo owns its own `AudioContext` and raw nodes. It intentionally does not use `@web-audio/audio-engine`, so the node graph and scheduling choices remain visible.
- The default source is the repository-local `apps/demos/public/tay.mp3`, credited to Hyperblam's “Ch-ch-ch-chocolate” example. A user-selected local file can replace it at any time.
- “Scratch” means a baby-scratch approximation: short, retriggered forward/reversed sample slices, gain choking, and playback-speed modulation. It is not arbitrary continuous timeline scrubbing.

## Target structure

```text
apps/demos/
  src/
    layouts/
      DemoLayout.astro
    pages/
      index.astro
      audio-clock.astro
      midi.astro
      scratching.astro
    components/
      AudioClockDemo.ts        # vanilla DOM setup, migrated from apps/audio-clock
      MidiDemo.ts              # vanilla DOM setup, migrated from apps/midi-demo
      ScratchDemo.ts           # vanilla DOM setup and audio implementation
      ScratchControls.ts       # optional DOM/UI extraction when warranted
    styles/
      global.css
      demo.css
  public/
  package.json
  astro.config.mjs
  tsconfig.json
```

Exact component names may change, but routes should remain independent: loading or changing one demo must not instantiate audio/MIDI state for another.

## Implementation status

- **Phase 1:** complete. `apps/demos` is an Astro/vanilla-TypeScript workspace app with shared layout, index, routes, lint/check/format/build scripts, and root-workspace dependencies.
- **Phase 2:** complete in code. The clock and MIDI apps are migrated to scoped vanilla modules, and the superseded `apps/audio-clock` and `apps/midi-demo` apps have been removed. Real-browser audio/MIDI verification remains pending.
- **Phase 3:** complete in code. The scratch route loads repository-local `public/tay.mp3` or an uploaded file, builds a separate reversed buffer, creates short forward/reverse voices with gain envelopes, and schedules a default one-bar 16-step scratch phrase followed by a one-bar rest/release phrase. It supports configurable min/max clip durations, choking, probability, direction, timing jitter, a turntable-style full-sample release at rest, base detune, and LFO-to-`detune` modulation.
- Scratch scheduling randomness is deterministic per automatic run: a string seed initializes a PRNG when Start is pressed. The same seed and settings reproduce hit selection, random direction, duration variation, and jitter.
- Scratch voices intentionally call `source.start(when, offset)` without the optional source-duration argument. Supplying a duration caused audible boundary pops; the per-voice gain envelope gates the slice and the source is stopped only after its fade-out instead.
- **Phase 4:** in progress. Step 4.1 is complete in code: a downsampled, responsive canvas displays forward and precomputed reversed buffers, selected matching regions, and the latest hit/offset/duration. It animates a source-buffer playhead only when LFO modulation is disabled, since that is the only configuration for which the position can be represented accurately. Step 4.2 is complete in code: controls are organized by mechanism and Reset stops playback before restoring all configuration defaults without replacing the loaded source. The complete in-app explanation remains.
- **Phase 5 and manual browser verification:** pending. `apps/sequencer` still exists, and no real-browser clock, MIDI, or scratch verification has been recorded.

---

## Phase 1 — Establish the Astro demos shell

### Step 1.1 — Scaffold `apps/demos`

Create the Astro workspace application using the package manager/generator rather than hand-writing dependency versions. Do not install a frontend-framework integration.

Expected capabilities:

- Astro static pages and a shared `DemoLayout`;
- TypeScript, formatting, linting, checking, and build scripts compatible with root Turbo tasks;
- browser-only vanilla TypeScript modules initialized from each route after its DOM is available;
- package dependencies on `@web-audio/clock` and `@web-audio/midi` where their respective routes need them.

Do not add dependencies to `apps/web`.

**Acceptance criteria:**

- [ ] `apps/demos` is discovered by the existing `apps/*` workspace glob.
- [ ] It has `build`, `check`, `lint`, and `format` scripts.
- [ ] `pnpm --filter demos build`, `check`, and `lint` succeed.
- [ ] Opening the root page requires no audio/MIDI permissions and creates no `AudioContext`.

### Step 1.2 — Build the shared index and navigation

Create an index page that explains the purpose of the app and links to each demo. Give every page a title, a concise description, and a link back to the index.

Initial cards:

- **Audio clock** — clock events and audio-time scheduling;
- **MIDI** — connected ports, CC input, held notes, and test output;
- **Scratching** — retriggered forward/reverse sample slices and modulation.

Make the layout readable on narrow screens, but favor clarity over a production design system. Do not import the production Svelte component library or production app styles.

**Acceptance criteria:**

- [ ] All three routes are linked from `/`.
- [ ] Each demo can be opened directly and has a clear return link.
- [ ] The shared page shell works without JavaScript; client functionality is progressively added inside each demo.

---

## Phase 2 — Migrate the existing focused demos

### Step 2.1 — Move the audio-clock exploration

Migrate the clock demo from `apps/audio-clock/src/App.tsx` into a vanilla TypeScript module. Astro renders the semantic control and display markup; a browser-only setup function receives the route root, binds events, updates the DOM, and returns a cleanup function.

Preserve current behavior:

- start/stop control;
- BPM slider;
- beat/bar visualisation;
- audio-time metronome clicks;
- clock event log;
- cleanup that destroys the `AudioClock` on component teardown.

Improve only migration-related behavior:

- construct the `AudioContext`/`AudioClock` inside client lifecycle code rather than during SSR;
- ensure a stopped or unmounted route cannot leave audible scheduled clicks;
- label the use of scheduled audio time versus UI/event time.

**Acceptance criteria:**

- [ ] Start is initiated by a user gesture and resumes the audio context successfully.
- [ ] Changing BPM affects subsequent scheduled clock events.
- [ ] The metronome and beat display remain aligned through start/stop cycles.
- [ ] Leaving/unmounting the page destroys the clock and stops future audio.

### Step 2.2 — Move the MIDI exploration

Move the DOM structure and TypeScript behavior from `apps/midi-demo` into the MIDI route. Keep it vanilla TypeScript initially: Astro renders static markup and a client-only module binds it after DOM availability.

Preserve current manual-verification features:

- explicit Enable MIDI and Disable MIDI controls;
- reactive input/output lists, names, IDs, and copy-ID action;
- CC 1, 7, and 74 displays with optional device/channel scoping;
- source-aware held-note display;
- selected-output test note-on/note-off and CC sends;
- visible access/error state.

Avoid querying the global document where component-scoped roots are practical. The setup function should return a cleanup function that destroys `Midi` and removes subscriptions/listeners when the Astro client component is unmounted.

**Acceptance criteria:**

- [ ] MIDI access is requested only after Enable is clicked.
- [ ] Port connection/disconnection updates the route without reload.
- [ ] Input signals and test output retain the current app’s semantics.
- [ ] Disable and route teardown call `Midi.destroy()` and release every subscription.
- [ ] Browsers without Web MIDI show an understandable unavailable/error state.

### Step 2.3 — Remove superseded applications

Once both migrated routes meet their acceptance criteria, delete:

- `apps/audio-clock/`;
- `apps/midi-demo/`.

Do not delete `apps/sequencer` yet; it is removed in the final cleanup phase after the new scratch demo demonstrates the intended role of the app.

**Acceptance criteria:**

- [ ] No root scripts, docs, or CI configuration refers to the removed app paths.
- [ ] Workspace install and root Turbo discovery remain valid.
- [ ] The demos app supplies the prior clock and MIDI manual-test coverage.

---

## Phase 3 — Implement the scratch engine as an explicit Web Audio experiment

### Step 3.1 — Audio loading and reverse-buffer preparation

Implement a browser-only scratch controller/module with an explicit lifecycle:

```ts
load(file: File): Promise<void>
playForward(): void
playReverse(): void
startAutoScratch(): void
stop(): void
destroy(): void
```

On file selection:

1. create/resume an `AudioContext` only after the user interacts;
2. decode file data with `decodeAudioData()`;
3. create a distinct reversed `AudioBuffer` by copying and reversing every channel’s sample data;
4. retain both buffers and expose their duration/sample rate/channel count to the UI.

Make loading/error state explicit. Replacing a file stops active voices before replacing buffers.

**Acceptance criteria:**

- [ ] Common browser-decodable audio files load from a user-selected file.
- [ ] The original decoded buffer is never mutated while building the reversed buffer.
- [ ] Forward and reverse one-shot buttons use their respective buffers.
- [ ] Invalid/undecodable files yield a visible error without leaving stale playable state.

### Step 3.2 — Model one scratch hit with raw nodes

Every hit creates a new `AudioBufferSourceNode` and a per-voice `GainNode`:

```text
AudioBufferSourceNode → voice GainNode → master GainNode → destination
```

For each hit:

- select the forward or reversed buffer;
- set `playbackRate` and/or `detune` before `start()`;
- calculate a valid source offset and duration from the selected clip region;
- schedule a short attack and release gain envelope to avoid clicks;
- call `start(when, offset)`; intentionally do not pass the optional source-duration argument because it produced audible boundary pops;
- use the per-voice gain envelope to gate the selected slice, then stop/disconnect the source after its fade-out finishes.

When direction is reverse and the demo is configured to mimic Hyperblam-style matching slices, derive the reverse-buffer offset so forward and reverse hits refer to the corresponding region of the original recording. Show the chosen buffer, offset, duration, and scheduled audio time in the event log.

**Acceptance criteria:**

- [ ] A hit is a newly created source; no attempt is made to restart or reverse an already-started source.
- [ ] Start/offset and envelope-gated slice duration stay within buffer bounds, including near either edge.
- [ ] Short clips do not produce obvious gain discontinuity clicks under normal settings; in particular, do not reintroduce `start(when, offset, duration)` unless its boundary pops are resolved.
- [ ] Finished voices disconnect and are removed from controller bookkeeping.

### Step 3.3 — Add choking and automatic baby-scratch scheduling

Maintain the currently active voice gain node. Before an automatic or manually triggered replacement hit, ramp the previous voice’s gain to zero over the configured choke time; do not rely only on `source.stop()` for click-free interruption.

Implement an automatic sequence with a simple lookahead scheduler based on `AudioContext.currentTime`, not `setInterval` timing alone. Configurable sequence behavior:

- tempo and subdivision/retrigger interval;
- active phrase length and rest length;
- hit probability;
- alternating direction versus random direction;
- fixed or randomized clip duration;
- optional timing jitter.

Keep randomization inspectable and deterministic: initialize a seeded PRNG from a visible seed when automatic playback starts, and log the resolved values used for each actual hit.

**Acceptance criteria:**

- [ ] Repeated hits alternate forward/reverse in alternating mode.
- [ ] The previous active clip fades out at the configured choke time when the next hit begins.
- [ ] The sequence remains stable when the main thread is briefly busy because hits are scheduled ahead in audio time.
- [ ] Stop cancels future scheduling, fades/stops active voices, and allows a clean restart.

### Step 3.4 — Add speed/pitch modulation

Start with a simple per-hit `detune` value and add optional LFO modulation that explicitly demonstrates AudioParam connection:

```text
OscillatorNode → LFO depth GainNode → AudioBufferSourceNode.detune
```

The LFO can be shared across a run, while each new source’s `detune` parameter receives the modulation connection. Ensure it does not route audibly to the destination. Controls include LFO waveform, rate, depth in cents, and enabled state.

Document in the UI that `detune` changes playback speed and pitch together, and that one octave is 1200 cents. The demo must distinguish this from changing the clip duration or choosing a reverse buffer.

**Acceptance criteria:**

- [ ] With LFO disabled, only configured base detune affects source speed.
- [ ] With LFO enabled, each active/new hit receives modulation on its `detune` AudioParam.
- [ ] Disabling/destroying the controller disconnects modulation and stops the oscillator safely.
- [ ] The event/node inspector makes the modulation connection apparent.

---

## Phase 4 — Build the educational scratch UI

### Step 4.1 — Visualize the sample and current slice

Add a canvas or SVG waveform view for the loaded audio. It should show:

- total buffer duration;
- selected original clip region;
- the equivalent region in the reversed buffer;
- the most recently scheduled hit, including direction;
- a moving/playback indicator only when it can accurately represent scheduled audio time.

The visualization may be downsampled for display, but audio processing must always use the complete decoded buffer.

**Acceptance criteria:**

- [ ] Changing clip start/duration visibly updates the selected region.
- [ ] A reverse hit makes clear that a reversed _buffer_ is played, rather than negative-rate playback.
- [ ] Visual state agrees with the source offset and duration reported in the event log.

### Step 4.2 — Expose controls in conceptual groups

Organize controls by the mechanism they alter, with a compact explanation beside each group:

1. **Source and slice:** file, clip start, clip duration.
2. **Retriggering:** one-shot buttons, tempo, subdivision, phrase/rest, probability, jitter.
3. **Direction:** forward, reverse, alternating/random selection.
4. **Gate:** attack, release, choke time.
5. **Speed:** base detune/playback rate and optional LFO rate, depth, waveform.
6. **Inspection:** live event log and node-graph legend.

Include sensible defaults that produce recognizable scratch-like output as soon as a suitable vocal/percussive sample is loaded. Provide a reset button restoring those defaults.

**Acceptance criteria:**

- [ ] Every audible behavior has a corresponding visible control or documented fixed rule.
- [ ] Slider values include units: seconds/ms, BPM, probability, Hz, cents, and rate as appropriate.
- [ ] Keyboard-accessible controls and labels are present.
- [ ] Reset affects configuration only and does not unexpectedly retain scheduled audio.

### Step 4.3 — Add concise in-app explanation

Include a short explanation adjacent to the demo, covering:

- why `AudioBufferSourceNode` is one-shot;
- why a reverse `AudioBuffer` is precomputed;
- why short new sources approximate record motion;
- how choke gain ramps avoid clicks;
- why source `detune` changes both pitch and speed;
- what the LFO-to-`detune` connection means.

Link to the Hyperblam “Ch-ch-ch-chocolate” example as inspiration, but describe this demo as an independent reimplementation and do not reuse its audio.

**Acceptance criteria:**

- [ ] A reader can map each explanatory section to the related UI and node graph.
- [ ] The page clearly states this is an approximation, not true continuous bidirectional scrubbing.

---

## Phase 5 — Retire the obsolete sequencer and verify

### Step 5.1 — Remove `apps/sequencer`

Delete `apps/sequencer/` after the demos app has the clock, MIDI, and scratch routes. Its history remains available in Git; do not attempt to preserve its stale React dependencies or assets in the new app.

Search repository documentation, root scripts, and configuration for references to the deleted path and remove/update them.

**Acceptance criteria:**

- [ ] `apps/sequencer/` is absent.
- [ ] `pnpm-workspace.yaml` requires no change because it already discovers `apps/*`.
- [ ] No active documentation directs contributors to the retired sequencer app.

### Step 5.2 — Automated verification

Run:

```sh
pnpm --filter demos check
pnpm --filter demos lint
pnpm --filter demos build
pnpm check
pnpm lint
pnpm format
```

Run focused package checks if migration changes package code rather than only app code.

**Acceptance criteria:**

- [ ] Demos-specific scripts pass.
- [ ] Root check/lint/format tasks pass or any unrelated pre-existing failure is recorded clearly.
- [ ] No generated build output is accidentally committed unless repository conventions explicitly require it.

### Step 5.3 — Manual browser verification

Use a current Chromium-based browser on localhost.

**Clock:**

- [ ] Browser autoplay policy is satisfied by Start.
- [ ] Start/stop/restart and BPM changes keep audio and visual beat state coherent.

**MIDI:**

- [ ] Enable/disable, permission denial, hot-plugged ports, CC input, held notes, and test output work with a real controller/monitor.

**Scratch:**

- [ ] Load a local audio file and test forward/reverse one-shots.
- [ ] Confirm alternating retriggers, choking, probability gaps, duration variation, and modulation are audible and reflected in the log.
- [ ] Stop or navigate away while automatic playback is running; confirm no audio continues and reopening starts from a clean state.

## File change summary

| Path                                       | Change                                                          |
| ------------------------------------------ | --------------------------------------------------------------- |
| `apps/demos/`                              | New Astro internal demos application                            |
| `apps/demos/src/pages/index.astro`         | Demos directory/index                                           |
| `apps/demos/src/pages/audio-clock.astro`   | Migrated clock route                                            |
| `apps/demos/src/pages/midi.astro`          | Migrated MIDI route                                             |
| `apps/demos/src/pages/scratching.astro`    | New scratch experiment route                                    |
| `apps/demos/src/components/audio-clock.ts` | Vanilla DOM controller adapted from the existing Solid clock UI |
| `apps/demos/src/components/midi.ts`        | Adapted existing vanilla MIDI UI/controller                     |
| `apps/demos/src/components/scratch.ts`     | Raw Web Audio scratch controller and UI binding                 |
| `apps/demos/src/pages/*.module.css`        | Route-scoped demo styles                                        |
| `apps/demos/public/tay.mp3`                | Default vocal sample                                            |
| `apps/audio-clock/`                        | Removed after migration                                         |
| `apps/midi-demo/`                          | Removed after migration                                         |
| `apps/sequencer/`                          | Removed after demos app is complete                             |
| `pnpm-lock.yaml`                           | Updated by package-manager installation for Astro               |
