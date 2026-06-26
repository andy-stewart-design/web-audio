# REPL Audio Visualizer Plan

## Goal

Add a framework-agnostic canvas audio visualizer package and integrate it into the web app's REPL sidebar.

The initial integration should visualize the final mixed output of the current audio engine, use a fixed `curve` visualization in the REPL, and stay synchronized with audio playback. The package should remain reusable outside Svelte and outside the web app.

## Key Decisions

- New package name: `@web-audio/visualizer`
- Package is framework-agnostic: canvas + analyser only
- Svelte-specific wrapper lives in `apps/web`
- Initial UI location: REPL sidebar only
- Initial visualizer type: `curve`
- Supported visualizer types: `bars`, `curve`, `waveform`
- Remove Drome's `circular` visualizer
- Visualize final mixed output only, not per-instrument output
- The visualizer starts/stops with audio playback
- Before audio exists, the REPL still shows a blank/placeholder canvas
- Do not create the audio context/engine just to show the placeholder
- When audio stops, keep the last visualized frame
- Use `ResizeObserver` inside the visualizer package
- Do not add dedicated device-pixel-ratio change listeners in this phase
- Package has hardcoded default colors that can be overridden at construction
- Package exposes minimal useful imperative API:
  - `start()`
  - `stop()`
  - `destroy()`
  - `setType(type)`
  - `setColors(colors)`
- `AudioEngine` exposes `getAnalyser()`
- The app-level audio singleton exposes `getAnalyser()` for UI code
- Add meaningful non-browser tests for visualizer behavior
- Add audio-engine tests for the new master/analyser graph

## Source Reference

Existing Drome package:

- `/Users/andystewart/Documents/Development/drome/packages/audio-visualizer`

Relevant implementation file:

- `/Users/andystewart/Documents/Development/drome/packages/audio-visualizer/src/index.ts`

Drome usage example:

- `/Users/andystewart/Documents/Development/drome/apps/repl-web/src/providers/drome.tsx`

The Drome package is a useful starting point, but this port should clean up the API and implementation rather than copy it verbatim.

---

## Phase 1: Add the Framework-Agnostic Visualizer Package

Create a new workspace package at `packages/visualizer` named `@web-audio/visualizer`.

### Files

- `packages/visualizer/package.json`
- `packages/visualizer/tsconfig.json`
- `packages/visualizer/tsdown.config.ts`
- `packages/visualizer/src/index.ts`
- `packages/visualizer/src/index.test.ts` or equivalent test files

### Implementation Notes

Use the existing repo package conventions from packages like `@web-audio/audio-engine` and `@web-audio/worklets`:

- `type: "module"`
- `exports` with `types` and `import`
- `files: ["dist"]`
- scripts:
  - `build`
  - `dev`
  - `test`
  - `test:ci`
  - `lint`
  - `format`
  - `check`
  - `prepublishOnly`
- dev dependencies should be installed with `pnpm`, not manually edited into `package.json`

Suggested public API shape:

```ts
type VisualizerType = 'bars' | 'curve' | 'waveform';
type Oklch = [lightness: number, chroma: number, hue: number];

type VisualizerColors = {
  foreground?: Oklch;
  background?: Oklch;
};

type VisualizerConfig = {
  analyser: AnalyserNode;
  canvas: HTMLCanvasElement;
  type?: VisualizerType;
  colors?: VisualizerColors;
};

class Visualizer {
  constructor(config: VisualizerConfig);
  start(): void;
  stop(): void;
  destroy(): void;
  setType(type: VisualizerType): void;
  setColors(colors: VisualizerColors): void;
}

export default Visualizer;
export { Visualizer, type VisualizerConfig, type VisualizerType, type VisualizerColors };
```

The exact names can be adjusted during implementation, but prefer cleaned-up names over Drome's current `bgLCH` / `fgLCH` API.

### Behavioral Requirements

- Constructor accepts an existing `AnalyserNode` and `HTMLCanvasElement`.
- The visualizer does not create or own the audio graph.
- The visualizer does own its canvas rendering loop and resize observer.
- `start()` begins a `requestAnimationFrame` loop if one is not already running.
- `stop()` cancels the loop and leaves the current canvas frame intact.
- `destroy()` stops animation and disconnects internal DOM observers/listeners.
- `destroy()` should not disconnect the provided analyser from the audio graph.
- `setType()` changes the visualization type and re-renders when stopped.
- `setColors()` updates foreground/background colors and re-renders when stopped.
- Initial data buffers should be sized from `analyser.frequencyBinCount` instead of relying on Drome's static placeholder data.
- `waveform` should use `getByteTimeDomainData()`.
- `bars` and `curve` should use `getByteFrequencyData()`.
- Remove all `circular` implementation and types.

### Resize Requirements

Use `ResizeObserver` inside the package.

- Observe the canvas element.
- Measure with `getBoundingClientRect()`.
- Set backing canvas size using current DPR.
- Reset the canvas transform before scaling to avoid cumulative scaling bugs.
- Resize once during construction.
- Resize again when `start()` is called.
- Disconnect the observer in `destroy()`.

Do not add special DPR-change listeners in this phase. A future polish phase can handle monitor/DPR changes more completely.

### Acceptance Criteria

- [ ] `packages/visualizer` exists as a workspace package named `@web-audio/visualizer`
- [ ] Package builds with `tsdown`
- [ ] Package exports the visualizer class and relevant public types
- [ ] Package supports exactly `bars`, `curve`, and `waveform`
- [ ] `circular` is not present in public types or implementation
- [ ] `start()`, `stop()`, `destroy()`, `setType()`, and `setColors()` exist
- [ ] `stop()` keeps the last rendered frame intact
- [ ] `destroy()` does not disconnect the provided analyser
- [ ] Canvas resizing is handled with `ResizeObserver`
- [ ] No framework-specific code exists in the package

---

## Phase 2: Add Visualizer Package Tests

Add meaningful non-browser tests for behavior that can be verified without full canvas/browser rendering.

### Files

- `packages/visualizer/src/*.test.ts`

### Test Strategy

Use lightweight fakes/mocks for:

- `AnalyserNode`
- `HTMLCanvasElement`
- `CanvasRenderingContext2D`
- `ResizeObserver`
- `requestAnimationFrame` / `cancelAnimationFrame`

Focus on lifecycle and logic, not pixel-perfect rendering.

### Suggested Test Coverage

- Defaults are applied when no type/colors are provided.
- `start()` schedules animation only once when called repeatedly.
- `stop()` cancels animation and is safe to call repeatedly.
- `destroy()` stops animation and disconnects the `ResizeObserver`.
- `destroy()` does not call `analyser.disconnect()`.
- `setType('waveform')` causes time-domain data to be requested on render.
- `setType('curve')` / `setType('bars')` cause frequency data to be requested.
- `setColors()` updates render colors and can be called while stopped.
- Invalid states, such as zero-size canvas measurements, do not throw.

### Acceptance Criteria

- [ ] Visualizer tests run with `pnpm --filter @web-audio/visualizer test:ci`
- [ ] Tests cover lifecycle behavior
- [ ] Tests cover type switching behavior
- [ ] Tests cover color updates
- [ ] Tests confirm `destroy()` does not disconnect the external analyser

---

## Phase 3: Add Master Output and Analyser to AudioEngine

Refactor the audio engine so all instruments connect to an engine-owned master output node. Attach an analyser to that final mixed output and expose it via public API.

### Files

Likely files:

- `packages/audio-engine/src/index.ts`
- `packages/audio-engine/src/instruments/instrument.ts`
- `packages/audio-engine/src/instruments/synthesizer.ts`
- `packages/audio-engine/src/instruments/sampler.ts`
- Existing audio-engine test files or new tests

### Current State

Instruments currently create their own output gain and connect directly to:

```ts
ctx.destination
```

This prevents the app from observing the final mixed output from one stable place.

### Target Graph

```txt
Synthesizer/Sampler output -> AudioEngine master gain -> AudioContext.destination
                                                    \
                                                     -> AnalyserNode
```

Or an equivalent final-mix graph where the analyser observes the same final output that reaches the destination.

### Implementation Notes

- `AudioEngine` should create a private master gain node.
- `AudioEngine` should create a private analyser node.
- The master gain should connect to `ctx.destination`.
- The master gain should connect to the analyser.
- Instruments should connect their output to the engine-provided destination node instead of directly to `ctx.destination`.
- Preserve existing instrument scheduling behavior.
- Preserve existing pending/retiring instrument behavior.
- Expose a public method:

```ts
getAnalyser(): AnalyserNode;
```

- Consider basic analyser defaults if useful, such as `fftSize` or `smoothingTimeConstant`, but do not over-design this in the first pass.

### Destroy Requirements

Update `AudioEngine.destroy()` so it owns cleanup for the nodes it creates.

- Unsubscribe clock listeners, as today.
- Clear active/retiring instruments, as today.
- Clear pending schema, as today.
- Disconnect master output node.
- Disconnect analyser node.
- Do not require app visualizer code to clean up the audio graph.

### Acceptance Criteria

- [ ] Instruments no longer connect directly to `ctx.destination`
- [ ] Instruments connect to an engine-owned master output or destination node
- [ ] `AudioEngine#getAnalyser()` returns a stable `AnalyserNode`
- [ ] The analyser observes final mixed output
- [ ] `AudioEngine.destroy()` disconnects master/analyser nodes
- [ ] Existing engine behavior remains unchanged from the user's perspective

---

## Phase 4: Add AudioEngine Graph Tests

Update or add tests to verify the new engine-owned output graph.

### Files

Likely files:

- `packages/audio-engine/src/**/*.test.ts`

### Suggested Test Coverage

- `AudioEngine` creates and exposes an analyser.
- Engine master output connects to `ctx.destination`.
- Engine master output connects to the analyser, or equivalent expected graph.
- Instruments connect to the engine-provided output node instead of `ctx.destination`.
- `destroy()` disconnects master/analyser nodes.
- Existing instrument tests are updated for the new constructor/config shape.

### Acceptance Criteria

- [ ] Audio-engine tests verify the master/analyser graph
- [ ] Tests fail if instruments connect directly to `ctx.destination`
- [ ] Tests verify `destroy()` disconnect behavior
- [ ] Existing audio-engine tests continue to pass

---

## Phase 5: Expose the Analyser Through the Web App Audio Singleton

Update the web app's global audio player so Svelte UI code can access the analyser without reaching into engine internals.

### Files

- `apps/web/src/lib/globals/audio-player.svelte.ts`

### Implementation Notes

Add an app-level method similar to:

```ts
getAnalyser(): AnalyserNode | null {
  return this.engine?.getAnalyser() ?? null;
}
```

Do not force-create the audio context or engine just to satisfy this method. Before playback exists, it should return `null`.

This supports the desired placeholder behavior:

- REPL loads with a visible blank canvas.
- `audio.getAnalyser()` returns `null` before the first successful play.
- After `audio.play()` creates the engine, `audio.getAnalyser()` returns the analyser.

### Acceptance Criteria

- [ ] `audio.getAnalyser()` exists
- [ ] It returns `null` before the engine exists
- [ ] It returns `engine.getAnalyser()` after engine creation
- [ ] It does not create or resume an audio context by itself
- [ ] Existing audio playback behavior remains unchanged

---

## Phase 6: Add the REPL Sidebar Visualizer Component

Add a Svelte component in the web app that owns the canvas element and creates a framework-agnostic `@web-audio/visualizer` instance when an analyser is available.

### Files

Suggested file:

- `apps/web/src/components/audio-visualizer/index.svelte`

or a REPL-specific name/location if preferred:

- `apps/web/src/components/repl-visualizer/index.svelte`

### Responsibilities

The Svelte component should:

- Render a canvas immediately, even when no analyser exists.
- Use CSS to provide a blank/placeholder background before audio exists.
- Import and instantiate `@web-audio/visualizer` only on the client.
- Create a visualizer only when `audio.getAnalyser()` returns a non-null analyser and a canvas exists.
- Use fixed initial type `curve`.
- Start the visualizer when `audio.isRunning` is true.
- Stop the visualizer when `audio.isRunning` is false.
- Leave the last rendered frame on the canvas after stop.
- Destroy the visualizer on component cleanup.

The component should not:

- Create an audio context.
- Create an audio engine.
- Own audio graph cleanup.
- Add visualizer type controls yet.

### Handling Reactivity

Because `audio.getAnalyser()` may become non-null only after playback starts, the component needs a reactive path that notices playback/engine creation. The exact Svelte 5 implementation can be chosen during coding, but the behavior should be:

1. Canvas appears on REPL load.
2. No visualizer instance exists while `audio.getAnalyser()` is null.
3. After a successful run creates the engine, the component creates the visualizer.
4. While `audio.isRunning`, the visualizer is started.
5. When `audio.stop()` is called, the visualizer is stopped.

### Acceptance Criteria

- [ ] REPL sidebar shows a canvas before audio has run
- [ ] No audio context/engine is created just to show the canvas
- [ ] Visualizer instance is created after playback creates an analyser
- [ ] Visualizer starts when audio starts
- [ ] Visualizer stops when audio stops
- [ ] Canvas keeps the last rendered frame after stop
- [ ] Component destroys the visualizer on cleanup
- [ ] Initial visualization type is `curve`

---

## Phase 7: Integrate the Component into the REPL Sidebar

Place the visualizer in the existing REPL sidebar above or near the output log.

### Files

- `apps/web/src/routes/repl/+page.svelte`
- Possibly component CSS files if split out

### Implementation Notes

Current REPL layout has a right sidebar containing the output log. Add the visualizer in that sidebar without changing playback controls.

Possible structure:

```svelte
<aside class="sidebar" aria-label="REPL sidebar">
  <AudioVisualizer />
  <section class="panel" aria-label="Output log">
    ...
  </section>
</aside>
```

Adjust grid sizing so the visualizer has a stable, useful height and the log remains scrollable.

### Acceptance Criteria

- [ ] Visualizer appears only in the REPL sidebar
- [ ] Output log remains visible and usable
- [ ] Existing Run/Stop editor behavior is unchanged
- [ ] Existing publish dialog behavior is unchanged
- [ ] Feed/sketch pages do not show the visualizer in this phase

---

## Phase 8: Validation

Run package-level, app-level, and repo-level validation.

### Package Commands

```sh
pnpm --filter @web-audio/visualizer check
pnpm --filter @web-audio/visualizer lint
pnpm --filter @web-audio/visualizer test:ci
pnpm --filter @web-audio/visualizer build
```

```sh
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/audio-engine build
```

### App Commands

```sh
pnpm --filter web check
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```

### Repo Commands

```sh
pnpm check
pnpm lint
pnpm test
pnpm build
```

### Acceptance Criteria

- [ ] Visualizer package check/lint/test/build succeeds
- [ ] Audio-engine check/lint/test/build succeeds
- [ ] Web app check/lint/test/build succeeds
- [ ] Repo-level check/lint/test/build succeeds
- [ ] No `dev` command is required for validation

---

## End-to-End Acceptance Scenarios

### Scenario 1: Open REPL before audio exists

1. Navigate to `/repl`.
2. Observe the REPL sidebar.
3. A blank/placeholder canvas is visible.
4. No audio starts automatically.
5. No audio context is created just for the visualizer.

### Scenario 2: Run code and see visualization

1. Navigate to `/repl`.
2. Click Run from the editor.
3. Audio starts.
4. The visualizer begins animating in `curve` mode.
5. The output log still records the evaluation result.

### Scenario 3: Stop audio

1. Start audio from the REPL.
2. Observe the visualizer animating.
3. Stop audio.
4. Audio stops.
5. The visualizer animation stops.
6. The canvas keeps the last rendered frame.

### Scenario 4: Run again after stop

1. Start audio from the REPL.
2. Stop audio.
3. Run again.
4. Audio starts again.
5. The existing or recreated visualizer animates again using the current analyser.

### Scenario 5: Navigate away

1. Start audio from the REPL.
2. Navigate away from the REPL.
3. The visualizer component is destroyed.
4. Its animation frame is cancelled.
5. Its resize observer is disconnected.
6. Audio graph cleanup remains owned by `AudioEngine` / app audio lifecycle.

---

## Future Work

Not part of this initial plan:

- Visualizer type controls in the REPL UI
- User-facing pause/reduce-motion control for accessibility
- Theme-derived foreground/background colors
- Per-instrument visualizers
- Visualizer on sketch detail pages or feed cards
- Dedicated DPR-change handling
- Browser/canvas pixel rendering tests
- A package-level placeholder renderer
