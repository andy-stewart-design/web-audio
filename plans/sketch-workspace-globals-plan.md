# Plan: Sketch Workspace Globals Refactor

## Overview

Refactor the web app's global client state into three domain-focused globals imported from `@/lib/globals`:

- `sketchWorkspace` — owns the current loaded sketch, editable draft sketch, and REPL logs.
- `audioPlayer` — owns playback only: audio context, eval worker, engine, clock, running state, and playback errors.
- `sketchPersistence` — owns publish affordances now, and later AT Protocol / IndexedDB persistence.

The goal is to replace the current mix of `audio` and `globalControls` with clearer ownership boundaries.

---

## Current Problems

- `audio` currently owns both loaded sketch state and audio playback behavior.
- `globalControls` is a UI-shaped abstraction that can become a grab bag for header behavior, REPL overrides, publish actions, and playback state.
- The REPL has local draft state while the global player also has loaded sketch state, making loaded vs editable semantics unclear.
- Header Run in the REPL must update the REPL log, which means run/log state needs to be available outside the local editor callback path.

---

## Target Model

### `sketchWorkspace`

Owns sketch state and REPL run logs.

```ts
type LoadedSketch = {
  uri: string | null;
  title: string;
  code: string;
};

type DraftSketch = {
  uri: string | null;
  title: string;
  code: string;
  description: string;
  tags: string;
  rootVersion: string | null;
  previousVersion: string | null;
};

type LogEntry = {
  id: string;
  type: "output" | "error";
  message: string;
};
```

Suggested API:

```ts
sketchWorkspace.loaded
sketchWorkspace.draft
sketchWorkspace.logs

sketchWorkspace.load(sketch)
sketchWorkspace.clearLoaded()
sketchWorkspace.openDraft(sketch?)
sketchWorkspace.commitDraft()
sketchWorkspace.addLog(entry)
sketchWorkspace.clearLogs()
```

`openDraft(sketch?)` handles both draft creation modes:

- `openDraft()` creates a fresh default draft.
- `openDraft(sketch)` creates a draft from an existing sketch and loads that sketch into `loaded` state.

Most playback side effects stay outside the workspace. The one intentional compromise is `sketchWorkspace.runDraft()`, which commits the active draft, calls `audioPlayer.play(...)`, and appends the returned log entry so header Run and editor Run share one implementation. REPL route code still coordinates whether audio should stop when opening a draft.

### `audioPlayer`

Owns playback only.

Suggested API:

```ts
audioPlayer.isRunning;
audioPlayer.lastError;

audioPlayer.play(code);
audioPlayer.stop();
```

`play(code)` should return a structured log entry instead of throwing for expected evaluation/playback failures:

```ts
type LogEntry = {
  id: string;
  type: "output" | "error";
  message: string;
};
```

`audioPlayer` provides result data only. It does not choose icons/glyphs. The REPL decides presentation based on `type` and renders `message`. Feed/detail playback can ignore the returned entry.

### `sketchPersistence`

Thin publish affordance module for now.

Suggested API:

```ts
sketchPersistence.register({
	canPublish: () => boolean,
	publish: () => void
})

sketchPersistence.canPublish
sketchPersistence.showPublish
sketchPersistence.publish()
```

Later this can grow into the AT Protocol / IndexedDB persistence layer.

---

## Step 1: Create `@/lib/globals`

### Implementation

Add:

```txt
apps/web/src/lib/globals/
  index.ts
  sketch-workspace.svelte.ts
  audio-player.svelte.ts
  eval.worker.ts
  sketch-persistence.svelte.ts
```

Move `apps/web/src/lib/client/eval.worker.ts` to `apps/web/src/lib/globals/eval.worker.ts` so `audio-player.svelte.ts` can instantiate it with `new URL('./eval.worker.ts', import.meta.url)`.

`index.ts` should export:

```ts
export { sketchWorkspace } from "./sketch-workspace.svelte";
export { audioPlayer } from "./audio-player.svelte";
export { sketchPersistence } from "./sketch-persistence.svelte";
```

Export relevant types from the modules as needed.

### Acceptance Criteria

- `@/lib/globals` can be imported from Svelte components and client modules.
- No behavior changes yet.
- Type-check passes.

---

## Step 2: Extract playback into `audioPlayer`

### Implementation

Move the low-level playback behavior from `apps/web/src/lib/client/audio.svelte.ts` into `apps/web/src/lib/globals/audio-player.svelte.ts`.

`audioPlayer` should own:

- `isRunning`
- `lastError`
- audio context
- clock
- audio engine
- eval worker from `./eval.worker.ts`
- pending eval promises

It should not own loaded sketch state.

`play(code)` should return:

```ts
{
  id: crypto.randomUUID(),
  type: "output",
  message: "success"
}
```

or:

```ts
{
  id: crypto.randomUUID(),
  type: "error",
  message: error.message
}
```

and set `lastError` on failure.

### Acceptance Criteria

- `audioPlayer` has no loaded sketch state.
- `audioPlayer.play(code)` plays code successfully.
- `audioPlayer.play(code)` returns a structured error log entry for invalid code instead of requiring callers to catch.
- `audioPlayer.stop()` stops playback and sets `isRunning` to false.
- Existing audio engine behavior is preserved.

---

## Step 3: Create `sketchWorkspace`

### Implementation

Add `apps/web/src/lib/globals/sketch-workspace.svelte.ts`.

It should own:

```ts
loaded = $state<LoadedSketch | null>(null);
draft = $state<DraftSketch | null>(null);
logs = $state<LogEntry[]>([]);
```

Suggested behavior:

```ts
openDraft(sketch?)
```

- Without a sketch:
  - creates default draft using `DEFAULT_CODE`
  - clears loaded sketch
  - clears logs

- With a sketch:
  - creates draft from sketch
  - sets loaded from sketch
  - clears logs
  - normalizes metadata:
    - `description = sketch.description ?? ""`
    - `tags = sketch.tags?.join(", ") ?? ""`
    - `rootVersion = sketch.rootVersion ?? sketch.uri ?? null`
    - `previousVersion = sketch.uri ?? null`

```ts
commitDraft();
```

- Copies the current draft into `loaded` using only `{ uri, title, code }`.
- Does not mutate draft version metadata.
- Returns the loaded sketch, or `null` if no draft exists.

```ts
runDraft();
```

- Commits the current draft.
- Calls `audioPlayer.play(loaded.code)`.
- Adds the returned log entry to `logs`.
- Returns the log entry, or `null` if no draft exists.

```ts
load(sketch);
```

- Sets `loaded` directly.

```ts
addLog(entry);
```

- Prepends a log entry returned by `audioPlayer.play(code)`.

```ts
clearLoaded();
```

- Clears only workspace loaded state.
- Does not stop audio. Route code coordinates audio stopping separately.

### Acceptance Criteria

- Workspace can represent no loaded sketch, a loaded sketch, and an editable draft.
- Fresh draft creation no longer requires REPL-local code state.
- Existing sketch drafts include title, description, tags, root version, previous version, and code.
- Logs can be added and rendered from workspace state.

---

## Step 4: Create thin `sketchPersistence`

### Implementation

Add `apps/web/src/lib/globals/sketch-persistence.svelte.ts`.

For now, this replaces publish-related pieces from `globalControls`.

Suggested API:

```ts
type PublishControls = {
	canPublish: () => boolean;
	publish: () => void;
};

register(controls: PublishControls): () => void
```

`register` returns an unregister function and should only clear the active controls if the same controls object is still registered.

Derived behavior:

```ts
showPublish;
canPublish;
publish();
```

This module does not need to implement AT Protocol or IndexedDB yet.

### Acceptance Criteria

- Header can determine whether to show Publish from `sketchPersistence.showPublish`.
- Header can determine disabled state from `sketchPersistence.canPublish`.
- Header can invoke `sketchPersistence.publish()`.
- Publish behavior remains implemented by the REPL dialog/form for now.

---

## Step 5: Update feed and sketch detail playback

### Implementation

Update feed cards and sketch detail pages to use `sketchWorkspace` and `audioPlayer`.

Feed card play should become conceptually:

```ts
sketchWorkspace.load(sketch);
const result = await audioPlayer.play(sketch.code);
```

Card playing state should use:

```ts
sketchWorkspace.loaded?.uri === sketch.uri && audioPlayer.isRunning;
```

Card stop should call:

```ts
audioPlayer.stop();
```

Stopping should not clear `sketchWorkspace.loaded`.

### Acceptance Criteria

- Clicking Play on a feed card loads that sketch and starts playback.
- Header title updates from `sketchWorkspace.loaded.title`.
- Clicking Stop on the card stops playback but leaves the sketch loaded.
- Header Play can restart the loaded sketch.
- Sketch detail page play/stop behavior matches feed behavior.

---

## Step 6: Update global header

### Implementation

Update `apps/web/src/routes/+layout.svelte` to stop importing `audio` or `globalControls`.

Header should read from:

- `sketchWorkspace.loaded` for title/can-play state.
- `audioPlayer.isRunning` for running/stop state.
- `sketchPersistence` for publish visibility/action.

Header Play behavior:

- If a draft exists, call `sketchWorkspace.runDraft()`.
- Otherwise, play the loaded sketch.

```ts
if (sketchWorkspace.draft) {
  await sketchWorkspace.runDraft();
} else if (sketchWorkspace.loaded) {
  await audioPlayer.play(sketchWorkspace.loaded.code);
}
```

Because `runDraft()` commits the draft and appends the returned playback log entry, header Run and editor Run share the same path.

Header Stop:

```ts
audioPlayer.stop();
```

Header Publish:

```ts
sketchPersistence.publish();
```

### Acceptance Criteria

- Header no longer imports `globalControls`.
- Header title comes from `sketchWorkspace.loaded?.title`.
- Header Stop only calls `audioPlayer.stop()`.
- Publish button is shown/hidden through `sketchPersistence`.
- Existing icon behavior is preserved:
  - REPL + running shows repeat icon.
  - Otherwise shows play icon.

---

## Step 7: Update REPL to use workspace draft and logs

### Implementation

Update `apps/web/src/routes/repl/+page.svelte`.

Initialize the draft before first render:

```ts
const initialSketch = untrack(() => data.loadedSketch);
sketchWorkspace.openDraft(initialSketch ?? undefined);
```

On mount, coordinate REPL-specific audio policy:

```ts
const shouldStop =
  !initialSketch || sketchWorkspace.loaded?.uri !== initialSketch.uri;
if (shouldStop) audioPlayer.stop();
```

This preserves the existing policy:

- Plain `/repl` stops audio and opens a fresh draft.
- `/repl?load=same-uri` opens draft without interrupting current playback.
- `/repl?load=different-uri` stops current audio and opens the new draft without autoplay.

Editor should bind to `sketchWorkspace.draft.code`.

Publish fields should bind to `sketchWorkspace.draft.title`, `description`, and `tags`.

REPL logs should render `sketchWorkspace.logs` and choose icons/display treatment based on `entry.type`.

Run behavior:

```ts
await sketchWorkspace.runDraft();
```

Both editor keyboard shortcut and header Run should call this same run path.

Register publish affordances with `sketchPersistence` on mount:

```ts
return sketchPersistence.register({
  canPublish,
  publish: openPublishDialog,
});
```

The returned cleanup hides Publish after leaving the REPL.

### Acceptance Criteria

- REPL no longer owns separate local `code` state.
- REPL editor binds to `sketchWorkspace.draft.code`.
- Header Run and editor shortcut both add `audioPlayer.play(code)` log entries to the same workspace log.
- Fresh `/repl` opens default draft and clears loaded sketch.
- Remixing same playing sketch preserves audio.
- Remixing different sketch stops previous audio and loads new draft.
- Publish dialog continues to work.

---

## Step 8: Remove `globalControls`

### Implementation

Delete:

```txt
apps/web/src/lib/client/global-controls.svelte.ts
```

Remove all imports/usages.

If `apps/web/src/lib/client/audio.svelte.ts` is fully replaced, delete it as well or leave a temporary re-export only if needed during migration.

### Acceptance Criteria

- No imports from `global-controls.svelte.ts` remain.
- Header, feed, sketch detail, and REPL use only `@/lib/globals` for global state/services.
- Type-check and lint pass.

---

## Step 9: Update publish form to use workspace draft/version state

### Implementation

Ensure the publish form reads from `sketchWorkspace.draft`:

- `code`
- `title`
- `description`
- `tags`
- `previousVersion`
- `rootVersion`

On successful publish:

- update draft previous/root version fields
- update local published URI state as needed for dialog display

This step can remain page-local until `sketchPersistence` grows real publish behavior.

### Acceptance Criteria

- Publishing sends the current draft code/title/metadata.
- Successful publish updates version chain state.
- Publish dialog behavior remains unchanged.

---

## End-to-End Acceptance Scenarios

### Scenario 1: Feed play -> header replay

1. Go to `/feed`.
2. Click Play on a sketch card.
3. Audio starts.
4. Header shows sketch title.
5. Click header Stop.
6. Audio stops, title remains.
7. Click header Play.
8. Same sketch starts again.

### Scenario 2: Feed play -> remix same sketch

1. Play sketch A from the feed.
2. Click Remix on sketch A.
3. REPL opens with sketch A as draft.
4. Audio continues uninterrupted.
5. Header Run runs the current draft and logs output.

### Scenario 3: Feed play -> remix different sketch

1. Play sketch A from the feed.
2. Click Remix on sketch B.
3. REPL opens with sketch B as draft.
4. Sketch A stops.
5. Sketch B is loaded but does not autoplay.
6. Header Run starts sketch B and logs output.

### Scenario 4: Fresh REPL

1. Play a sketch from the feed.
2. Navigate to plain `/repl` from the profile menu.
3. Audio stops.
4. Loaded sketch clears.
5. Default draft opens in the editor.
6. Header has no title until the draft is run with a title.

### Scenario 5: Header Run logging

1. Open REPL.
2. Run with keyboard shortcut.
3. Log updates.
4. Edit code.
5. Run with header button.
6. Log updates through the same workspace log state.

### Scenario 6: Publish affordance

1. On `/repl`, Publish appears when publish controls are registered.
2. Publish disabled state reflects session/code state.
3. Outside `/repl`, Publish is hidden.

---

## Notes / Open Decisions

- `sketchWorkspace` should not own audio engine internals.
- REPL can keep route-specific coordination for now because fresh/remix behavior is REPL-specific.
- `sketchPersistence` is intentionally thin at first.
- Later IndexedDB work can move more draft/version/publish behavior into `sketchPersistence` or keep draft state in `sketchWorkspace` and storage behavior in `sketchPersistence`.
- Avoid naming anything `manager` unless the responsibility becomes clearer; prefer `sketchWorkspace`, `audioPlayer`, and `sketchPersistence`.
