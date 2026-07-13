# Global Player Loaded Sketch Refactor Plan

## Goal

Refactor playback so the global header acts as a persistent player for the currently loaded sketch.

The desired behavior is:

- Playing a sketch from the feed loads that sketch into the global player.
- The header shows the loaded sketch title next to transport controls.
- Stopping playback does not unload the sketch.
- Header play can restart the loaded sketch from anywhere in the app.
- REPL-specific controls, such as `Publish`, only appear on the REPL route.
- Entering the REPL via an explicit remix/load path preserves or loads the target sketch.
- Entering plain `/repl` from the nav starts fresh, stops audio, clears the loaded sketch, and shows the default code.

## Validated Current Code State

Relevant files:

- `apps/web/src/lib/client/audio.svelte.ts`
  - Owns persistent audio engine state.
  - Currently has `audio.play(code, uri?)`, `audio.stop()`, `isRunning`, `currentUri`, and `lastError`.
  - Needs to be refactored to remove `currentUri` and replace it with first-class `loadedSketch` state.

- `apps/web/src/components/sketch-card/index.svelte`
  - Feed cards already receive `sketch.code`, `sketch.title`, `sketch.uri`, and `sketch.cid`.
  - Current play button calls `audio.play(sketch.code, sketch.uri)`.
  - Current Remix link already points to `/repl?load={encodeURIComponent(sketch.uri)}`.
  - No server/query changes should be required for feed playback.

- `apps/web/src/routes/repl/+page.server.ts`
  - Already supports explicit loading via `?load=...`.
  - Returns `{ loadedSketch: sketch }` when a load param is present.
  - Returns `{ loadedSketch: null }` for plain `/repl`.
  - This already encodes the desired distinction between remix/load and fresh REPL.

- `apps/web/src/components/login-button/profile-popover.svelte`
  - The nav REPL link is plain `/repl`.
  - This gives us a clean fresh-REPL entry path.

- `apps/web/src/routes/repl/+page.svelte`
  - Initializes editor code from `data.loadedSketch` when present, otherwise default code.
  - Registers REPL header controls.
  - Needs to distinguish explicit load/remix from fresh REPL on mount.

## Core Model

Add a first-class loaded sketch concept to the client audio player.

```ts
type LoadedSketch = {
	uri: string | null;
	title: string;
	code: string;
};
```

The audio player should own:

```ts
loadedSketch: LoadedSketch | null;
isRunning: boolean;
lastError: string | null;
```

Remove `currentUri` entirely. It would be redundant once `loadedSketch` exists.

Use:

```ts
audio.loadedSketch?.uri
```

instead of:

```ts
audio.currentUri
```

This keeps the state model clean:

- `loadedSketch` answers: what is loaded in the player?
- `isRunning` answers: is it currently playing?
- `lastError` answers: what was the last playback/evaluation failure?

## Step 1: Refactor `audio.svelte.ts` around `loadedSketch`

### Implementation

In `apps/web/src/lib/client/audio.svelte.ts`:

1. Add `LoadedSketch` type.
2. Add:

```ts
loadedSketch = $state<LoadedSketch | null>(null);
```

3. Remove:

```ts
currentUri = $state<string | null>(null);
```

4. Add methods similar to:

```ts
load(sketch: LoadedSketch) {
	this.loadedSketch = sketch;
}

clearLoaded() {
	this.stop();
	this.loadedSketch = null;
	this.lastError = null;
}

async playLoaded() {
	if (!this.loadedSketch) return;
	await this.playCode(this.loadedSketch.code);
}

async playSketch(sketch: LoadedSketch) {
	this.load(sketch);
	await this.playLoaded();
}
```

5. Convert the existing `play(code, uri?)` implementation into a lower-level private method such as:

```ts
private async playCode(code: string) {
	// eval/update/prepare/start
}
```

6. Update `stop()` so it stops transport but does not clear `loadedSketch`:

```ts
stop() {
	this.clock?.stop();
	this.isRunning = false;
}
```

### Acceptance Criteria

- `currentUri` no longer exists.
- `audio.loadedSketch` is the only source of truth for the loaded sketch URI/title/code.
- `audio.playSketch(sketch)` loads and starts a sketch.
- `audio.stop()` stops playback but keeps `audio.loadedSketch` intact.
- `audio.playLoaded()` restarts the loaded sketch after stop.
- `audio.clearLoaded()` stops playback and clears the loaded sketch.

## Step 2: Update the global header to use the loaded sketch

### Implementation

In `apps/web/src/routes/+layout.svelte`:

- Display title from `audio.loadedSketch?.title`.
- Header stop should always call `audio.stop()`.
- Header play behavior should be route-aware:

```ts
if (isRepl && controls?.run) {
	controls.run();
} else {
	await audio.playLoaded();
}
```

This is important because on the REPL route, the header button should behave like `Run` and use the current editor contents, not necessarily the last loaded code.

Button label can be route-aware:

- `/repl`: `Run`
- elsewhere: `Play`

Disable play when:

- On REPL: no REPL run control exists.
- Outside REPL: no `audio.loadedSketch` exists.

Keep REPL-only controls route-gated:

- `Publish` appears only when `page.url.pathname === '/repl'` and REPL controls exist.

### Acceptance Criteria

- Header title comes from `audio.loadedSketch?.title`.
- Header play restarts a loaded feed sketch outside the REPL.
- Header play runs current editor code inside the REPL.
- Header stop stops playback globally.
- `Publish` remains hidden on feed/bookmarks/profile/sketch pages.
- Transport controls persist across the app.

## Step 3: Update feed card playback

### Implementation

In `apps/web/src/components/sketch-card/index.svelte`:

Replace usage of `audio.currentUri` with `audio.loadedSketch?.uri`.

For example:

```ts
const isThisPlaying = $derived(audio.loadedSketch?.uri === sketch.uri && audio.isRunning);
```

Update play behavior from:

```ts
await audio.play(sketch.code, sketch.uri);
```

to:

```ts
await audio.playSketch({
	uri: sketch.uri,
	title: sketch.title,
	code: sketch.code
});
```

When clicking the same card while it is playing, keep the current stop behavior:

```ts
audio.stop();
```

Do not clear the loaded sketch on card stop.

### Acceptance Criteria

- Clicking `Play` on a card starts playback.
- Header title updates to that sketch title.
- Card button shows `Stop` while that sketch is playing.
- Clicking card `Stop` stops audio but leaves the sketch loaded in the header.
- Header `Play` restarts the stopped sketch.
- Playing a different card replaces `audio.loadedSketch` and updates the header title.

## Step 4: Preserve playback when remixing the currently loaded sketch

### User Flow

1. User is in the feed.
2. User clicks `Play` on a sketch card.
3. They like it and click `Remix`.
4. REPL opens with the sketch code.
5. Audio continues uninterrupted.

### Implementation

This flow already uses `/repl?load=<uri>` from `SketchCard`.

In `apps/web/src/routes/repl/+page.svelte`, on mount:

- If `data.loadedSketch` exists, treat it as an explicit load/remix.
- Do not stop audio.
- Do not clear `audio.loadedSketch`.
- Initialize the editor from `data.loadedSketch.code`.
- If `audio.loadedSketch?.uri === data.loadedSketch.uri`, do nothing to audio. This preserves uninterrupted playback.
- If `audio.loadedSketch?.uri !== data.loadedSketch.uri`, call `audio.load(...)` but do not autoplay.

That last rule handles the agreed edge case:

- Remix should preserve currently playing audio if it is the same sketch.
- If remixing a non-playing sketch, load the editor/player but do not autoplay unless the user clicks play/run.

### Acceptance Criteria

- Feed play followed by Remix on the same sketch opens the REPL with that sketch code.
- Audio continues playing without stopping or restarting.
- Header still shows the same sketch title.
- Remixing a non-playing sketch opens the REPL with that sketch code.
- Remixing a non-playing sketch loads the title into the header.
- Remixing a non-playing sketch does not autoplay.
- Header `Run` in the REPL starts the loaded/remixed sketch when the user asks it to.

## Step 5: Plain `/repl` starts fresh

### User Flow

1. User is in the feed.
2. User clicks `Play` on a card.
3. Audio starts and the header shows the title.
4. User opens the profile menu and clicks `Repl`.
5. Since this is plain `/repl`, the app treats it as a fresh sketch.
6. Audio stops, loaded sketch clears, and the default code appears.

### Implementation

In `apps/web/src/routes/repl/+page.svelte`, on mount:

- If `data.loadedSketch` is null:

```ts
audio.clearLoaded();
```

- Initialize editor code from `DEFAULT_CODE`.

Use a mount-time effect, likely `onMount`, so this behavior occurs when entering the REPL and does not repeatedly fire while the user edits.

Conceptually:

```ts
onMount(() => {
	if (!initial) {
		audio.clearLoaded();
		return;
	}

	if (audio.loadedSketch?.uri !== initial.uri) {
		audio.load({
			uri: initial.uri,
			title: initial.title,
			code: initial.code
		});
	}
});
```

### Acceptance Criteria

- Feed play starts audio and shows title in header.
- Navigating to profile popover > `Repl` goes to plain `/repl`.
- Audio stops.
- `audio.loadedSketch` becomes null.
- Header no longer shows the feed sketch title.
- REPL editor shows `DEFAULT_CODE`.
- Previous feed sketch is not injected into the REPL.

## Step 6: Keep REPL header Run tied to live editor code

### Explanation

On the REPL route, header play should not blindly call `audio.playLoaded()`.

Why: a user may run a sketch, edit the code, stop playback, then click the header button again. If the header simply calls `audio.playLoaded()`, it may replay the older code that was loaded during the previous run, not the latest text in the editor.

Example:

1. REPL starts with:

```js
d.synth("triangle").push()
```

2. User clicks `Run`.
3. The loaded sketch code is now triangle.
4. User edits the editor to:

```js
d.synth("sawtooth").push()
```

5. User clicks `Stop`.
6. User clicks header `Run`.

Expected behavior: play sawtooth, because that is what is currently in the editor.

Incorrect behavior: replay triangle from `audio.loadedSketch.code`.

Therefore, on `/repl`, the header button should call `replControls.run()`, which closes over current editor state, instead of `audio.playLoaded()`.

After successful REPL evaluation, update `audio.loadedSketch` to the current editor code/title so the global player state remains accurate.

### Implementation

In REPL `evaluate(input)`:

- Use the current editor code.
- Play using `audio.playSketch(...)` with:

```ts
{
	uri: initial?.uri ?? null,
	title: publishTitle.trim() || initial?.title || 'Untitled sketch',
	code: input
}
```

- Keep logging success/error as today.

For loaded/remixed sketches, decide whether edits should retain the original URI. A reasonable first pass is:

- Before publishing, keep `uri: initial?.uri ?? null` so the header/card can still identify the source sketch.
- Once published, update version metadata as the current code already does.

### Acceptance Criteria

- Header button says/acts like `Run` on the REPL.
- Header Run always evaluates the current editor contents.
- Editing code after a previous run, then stopping, then clicking header Run plays the edited code.
- Successful REPL runs update `audio.loadedSketch.code` to the current editor code.
- REPL success/error logging still works.

## Step 7: Simplify `replControls`

### Implementation

In `apps/web/src/lib/client/repl-controls.svelte.ts`, reduce controls to REPL-specific capabilities plus live run:

```ts
type ReplControls = {
	canPublish: boolean;
	run: () => void;
	publish: () => void;
};
```

Remove from `replControls`:

- `title`
- `stop`

Reasoning:

- Title belongs to `audio.loadedSketch`.
- Stop is global audio behavior.
- Run remains because REPL Run must use live editor state.
- Publish remains because it is REPL-specific.

### Acceptance Criteria

- `replControls` no longer stores player title/state.
- `replControls` no longer stores stop behavior.
- Global stop works independently of the REPL lifecycle.
- REPL-only `Publish` still appears on `/repl` and disappears elsewhere.

## Step 8: Error handling

### Implementation

Keep current REPL logging behavior:

- REPL `evaluate()` logs success and errors.

For feed/header playback:

- Catch errors where needed.
- Rely on `audio.lastError` for now.
- Do not add new UI for playback errors in this refactor unless necessary.

Example header play handler:

```ts
async function handlePlay() {
	try {
		if (isRepl && controls?.run) controls.run();
		else await audio.playLoaded();
	} catch {
		// audio.lastError is set by the audio player
	}
}
```

### Acceptance Criteria

- REPL evaluation errors still appear in the REPL log.
- Feed/header playback errors do not crash the UI.
- `audio.lastError` is populated on failure.

## End-to-End Acceptance Scenarios

### Scenario 1: Feed play -> header replay

1. Go to `/feed`.
2. Click `Play` on a sketch card.
3. Audio starts.
4. Header shows the sketch title.
5. Click header `Stop`.
6. Audio stops and title remains.
7. Click header `Play`.
8. Same sketch starts again.

### Scenario 2: Feed play -> remix same sketch

1. Go to `/feed`.
2. Click `Play` on a sketch card.
3. Audio starts.
4. Click `Remix` on the same card.
5. Navigate to `/repl?load=<uri>`.
6. Editor contains that sketch code.
7. Audio continues without stopping/restarting.
8. Header still shows the same sketch title.
9. Header `Stop` stops playback.
10. Header `Run` in REPL runs current editor code.

### Scenario 3: Remix non-playing sketch

1. Go to `/feed`.
2. Do not click play.
3. Click `Remix` on a card.
4. Navigate to `/repl?load=<uri>`.
5. Editor contains that sketch code.
6. Header shows that sketch title as loaded.
7. Audio does not autoplay.
8. Click header `Run`.
9. Audio starts.

### Scenario 4: Feed play -> fresh REPL from nav

1. Go to `/feed`.
2. Click `Play` on a sketch.
3. Audio starts and header shows title.
4. Open profile popover.
5. Click `Repl`.
6. Navigate to plain `/repl`.
7. Audio stops.
8. Loaded sketch is cleared.
9. Header no longer shows feed sketch title.
10. Editor shows default code.

### Scenario 5: REPL live-code Run behavior

1. Open `/repl`.
2. Run the default code.
3. Edit the code.
4. Stop playback.
5. Click header `Run`.
6. The edited code plays, not the previously loaded code.

### Scenario 6: REPL route gating

1. On `/repl`, confirm `Publish` appears.
2. Navigate to `/feed`.
3. Confirm `Publish` disappears.
4. Confirm global transport remains visible.
5. If a sketch is loaded, confirm title/play/stop still work.

## Notes / Open Decisions

- Header label outside REPL should likely be `Play`; on REPL it should likely be `Run`.
- Fresh unsaved REPL sketches need a header title. Suggested default: `Untitled sketch`.
- This plan intentionally avoids introducing extra playback error UI. `audio.lastError` can support future UI if needed.
