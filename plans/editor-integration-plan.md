# Editor Package Integration Plan

## Background

The REPL in `apps/web` currently uses a plain `<textarea>` for sketch editing. The neighboring
`../drome` repo contains `packages/editor`, a small CodeMirror 6 package that provides line
numbers, history, bracket matching, JavaScript language support, and a CSS-variable based theme.

The goal is to migrate that package into this monorepo as `@web-audio/editor` and use it to
replace the REPL textarea while moving the REPL toward the layout used by the source app:

```txt
[ Header                   ]
[ Editor          ][Sidebar]
```

In the short term, the sidebar does not need the full source app feature set. It should contain the
existing REPL log so the editor can fill most of the screen.

Existing REPL semantics should remain unchanged:

- Run button evaluates the latest code.
- `Cmd/Ctrl+Enter` evaluates the latest code from inside the editor.
- Publish submits the latest code.
- Loaded sketches initialize the editor content.
- Publish remains disabled when the editor is empty.

---

## Phase 1 — Import and normalize the editor package

**Files:**

- `packages/editor/package.json` — new
- `packages/editor/src/index.ts` — new
- `packages/editor/src/theme.ts` — new
- `packages/editor/src/utils.ts` — new
- `packages/editor/tsconfig.json` — new
- `packages/editor/tsdown.config.ts` — new
- `packages/editor/tests/index.test.ts` — new or replaced with meaningful smoke tests

### Changes

1. Copy `../drome/packages/editor` into `packages/editor`.
2. Rename the package from `@drome/editor` to `@web-audio/editor`.
3. Align scripts with this repo's package conventions:
   - `build`: `tsdown`
   - `dev`: `tsdown --watch`
   - `test`: `vitest`
   - `test:ci`: `vitest run`
   - `lint`: `eslint . --max-warnings 0`
   - `format`: `prettier --write .`
   - `check`: `tsc --noEmit`
4. Extend `@repo/typescript-config/library.json` and include DOM libs.
5. Keep CodeMirror packages as runtime dependencies.
6. Rename `src/utiils.ts` to `src/utils.ts` and update imports.

### Acceptance criteria

- [x] `packages/editor` exists and is included automatically by `pnpm-workspace.yaml`.
- [x] Package name is `@web-audio/editor`.
- [x] Package exports `createCodeMirror` from `src/index.ts`.
- [x] No references to `@drome/editor` remain in the imported package.
- [x] The typo `utiils.ts` is fixed.
- [x] Package scripts are consistent with other packages in this repo.

### Verification

Automated:

- [x] `pnpm --filter @web-audio/editor check`
- [x] `pnpm --filter @web-audio/editor build`
- [x] `pnpm --filter @web-audio/editor test:ci`

---

## Phase 2 — Shape the editor API for Svelte integration

**Files:**

- `packages/editor/src/index.ts`
- `packages/editor/src/theme.ts`
- `packages/editor/src/utils.ts`
- `packages/editor/tests/index.test.ts`

### Changes

Replace the initial `createCodeMirror(parent, doc?)` API with an options object that supports the
REPL integration directly:

```ts
interface CreateCodeMirrorOptions {
  parent: HTMLElement;
  doc?: string;
  onChange?: (doc: string) => void;
  onRun?: (doc: string) => void;
}
```

`createCodeMirror(options)` should:

1. Create an `EditorView` in `options.parent`.
2. Initialize the document from `options.doc`.
3. Call `options.onChange(nextDoc)` when the document changes.
4. Handle `Mod-Enter` by calling `options.onRun(currentDoc)` and returning `true`.
5. Preserve the existing `Mod-Shift-Enter` `insertLineAbove` command.
6. Return the `EditorView` so callers can call `destroy()`.

Add or keep theme support for a fixed-height editor:

- Ensure the editor can be sized through `--cm-editor-block-size`.
- Ensure the scroller can scroll when the configured block size is fixed.

### Acceptance criteria

- [x] `createCodeMirror({ parent, doc })` initializes the editor with the provided document.
- [x] `onChange` receives the full document string after edits.
- [x] `Mod-Enter` calls `onRun` with the current document.
- [x] `Mod-Shift-Enter` still inserts a line above.
- [x] `createCodeMirror` returns an `EditorView`.
- [x] Callers can destroy the editor by calling `view.destroy()`.

### Verification

Automated:

- [x] `pnpm --filter @web-audio/editor check`
- [x] `pnpm --filter @web-audio/editor test:ci`
- [x] `pnpm --filter @web-audio/editor build`

Manual or browser-level smoke test if unit testing CodeMirror DOM behavior is too costly:

- [ ] Create an editor with initial text and confirm it appears.
- [ ] Type in the editor and confirm `onChange` receives updated text.
- [ ] Press `Cmd/Ctrl+Enter` and confirm `onRun` receives updated text.

---

## Phase 3 — Add the editor dependency to the web app

**Files:**

- `apps/web/package.json`
- `pnpm-lock.yaml`

### Changes

Install the workspace package into the web app with an install command:

```bash
pnpm --filter web add @web-audio/editor@workspace:*
```

Do not manually edit `apps/web/package.json` for the dependency unless the install command fails
and the failure is understood.

### Acceptance criteria

- [x] `apps/web` depends on `@web-audio/editor` using `workspace:*`.
- [x] `pnpm-lock.yaml` is updated consistently.
- [x] No duplicate or external `@web-audio/editor` dependency is introduced.

### Verification

Automated:

- [x] `pnpm --filter web check`

---

## Phase 4 — Add a Svelte CodeEditor wrapper

**Files:**

- `apps/web/src/components/code-editor/index.svelte` — new

### Changes

Create a small Svelte component that owns the CodeMirror lifecycle.

Responsibilities:

1. Render a host `<div>` for CodeMirror.
2. Accept a bindable `value` prop.
3. Accept an optional `onRun` callback.
4. Create the CodeMirror editor on mount with the initial `value`.
5. Update `value` from CodeMirror's `onChange` callback.
6. Call `onRun` from CodeMirror's `Mod-Enter` handler.
7. Destroy the `EditorView` on unmount.

Suggested public component shape:

```svelte
<CodeEditor bind:value={code} onRun={evaluate} />
```

### Acceptance criteria

- [x] Component initializes CodeMirror with the bound `value`.
- [x] Editing updates the bound `value`.
- [x] `onRun` receives the latest editor content.
- [x] Component destroys the editor on unmount.
- [x] No editor creation occurs during SSR.

### Verification

Automated:

- [x] `pnpm --filter web check`

---

## Phase 5 — Replace the REPL textarea

**Files:**

- `apps/web/src/routes/repl/+page.svelte`

### Changes

1. Import the new wrapper component.
2. Replace the `<textarea>` with:

```svelte
<CodeEditor bind:value={code} onRun={evaluate} />
```

3. Remove the textarea-specific `handleKeyDown` function if it is no longer used.
4. Keep the existing Run, Stop, and Publish behavior unchanged.
5. Keep `code` as the single source of truth for publishing and button disabled state.

At this phase the route may still use the current vertical layout. The layout change is separated
into Phase 6 so the editor integration and screen-filling layout are independently verifiable.

### Acceptance criteria

- [x] The REPL no longer renders a `<textarea>` for code editing.
- [x] The Run button evaluates the current editor contents.
- [x] `Cmd/Ctrl+Enter` inside CodeMirror evaluates the current editor contents.
- [x] Stop behavior is unchanged.
- [x] Publish uses the current editor contents.
- [x] Publish disabled state still follows `!code.trim()`.
- [x] Loaded sketch data still seeds the editor.

### Verification

Automated:

- [x] `pnpm --filter web check`

Manual:

- [x] Open `/repl` with no loaded sketch and confirm `d.synth("triangle").push()` appears.
- [x] Type in the editor and confirm dependent UI, such as the Publish button disabled state, reacts to the new value.
- [x] Edit the code, click Run, and confirm the edited code is evaluated.
- [x] Edit the code, press `Cmd/Ctrl+Enter`, and confirm the edited code is evaluated.
- [x] Publish a sketch and confirm the submitted code matches the editor contents.
- [x] Load an existing sketch and confirm its code appears in the editor.
- [x] Paste a long sketch and confirm the editor scrolls internally instead of overflowing its container.

---

## Phase 6 — Convert REPL to header/editor/sidebar layout

**Files:**

- `apps/web/src/routes/repl/+layout.svelte`
- `apps/web/src/routes/repl/+page.svelte`
- `apps/web/src/components/code-editor/index.svelte` if wrapper sizing needs adjustment

### Changes

Restructure the REPL layout to match the source app's broad shape:

```txt
[ Header / toolbar                         ]
[ CodeMirror editor                ][ Log  ]
```

Implementation notes:

1. Treat the existing toolbar as the first header implementation. It can stay simple for now.
2. Put the editor and sidebar in a two-column grid below the header.
3. Move the existing `.log` element into the sidebar.
4. Make the route/editor area fill most of the viewport instead of using the current narrow,
   centered `max-width: 720px` column.
5. Give the editor column `min-width: 0` and the editor component `min-height: 0` so CodeMirror can
   scroll internally.
6. Give the sidebar a fixed or clamped width, for example `minmax(280px, 360px)`, with its own
   overflow behavior.
7. Keep the publish dialog outside the main layout so modal behavior is unchanged.

### Acceptance criteria

- [x] REPL layout has a header/toolbar row above a two-column editor/sidebar body.
- [x] CodeMirror occupies the main column and fills the available body height.
- [x] The log appears in the sidebar, not below the editor.
- [x] The old `max-width: 720px` centered editor layout is removed for the REPL surface.
- [x] The sidebar remains visible at desktop widths.
- [x] Editor and sidebar can scroll independently when content overflows.
- [x] Run, Stop, Publish, and publish dialog behavior are unchanged.

### Verification

Automated:

- [x] `pnpm --filter web check`
- [x] `pnpm --filter web lint`

Manual:

- [ ] Open `/repl` on a desktop-sized viewport and confirm the layout is `[header]` above
      `[editor][sidebar]`.
- [ ] Confirm the editor fills most of the screen horizontally and vertically.
- [ ] Produce several log entries and confirm they appear in the sidebar.
- [ ] Paste a long sketch and confirm the editor scrolls internally.
- [ ] Produce enough logs to overflow the sidebar and confirm the sidebar/log scroll behavior is acceptable.

---

## Phase 7 — Adopt full-screen editor styling from the source app

**Files:**

- `apps/web/src/components/code-editor/index.svelte`
- `apps/web/src/routes/repl/+page.svelte`
- `packages/editor/src/theme.ts` if package-level theme additions are needed

### Changes

Do **not** port the old textarea styling wholesale. The new layout should be styled like the source
app's full-screen editor, adapted to this repo's `--ui-*` design tokens.

Use the source app as the model:

- `../drome/apps/repl-web/src/components/main-layout/style.module.css`
- `../drome/apps/repl-web/src/components/code-mirror/style.module.css`
- `../drome/apps/repl-web/src/codemirror/theme.css`

Implementation notes:

1. Keep CodeMirror in a flex/grid container that can fill the route body: `flex: 1`, `min-height: 0`,
   `height: 100%` where appropriate.
2. Prefer a borderless or subtle editor surface that feels integrated into the REPL shell, rather
   than a textarea-like boxed control.
3. Map the editor package's `--cm-*` variables to this app's existing `--ui-*` tokens.
4. Preserve the source app's important editor UX choices where practical:
   - full-height editor
   - internal CodeMirror scrolling
   - readable gutter/line numbers
   - visible cursor, selection, active line, and matching bracket states
5. Remove textarea-only styles such as `resize`, textarea padding assumptions, and the old fixed
   `180px` editor height.

### Acceptance criteria

- [ ] CodeMirror visually fits the new header/editor/sidebar REPL layout.
- [ ] Editor fills the available editor column height rather than using the old textarea height.
- [ ] Styling is based on the source app's full-screen editor approach, not the old textarea.
- [ ] Long documents scroll inside the editor.
- [ ] Theme colors use existing `--ui-*` tokens through `--cm-*` variables.
- [ ] No textarea-specific styling remains in the REPL route.

### Verification

Automated:

- [ ] `pnpm --filter web lint`

Manual:

- [ ] Confirm line numbers, cursor, selection, and active line are visible on the REPL background.
- [ ] Paste a long sketch and confirm the editor scrolls internally rather than breaking the page layout.
- [ ] Confirm the editor feels like a full-screen coding surface, not a resized textarea.

---

## Phase 8 — Cross-package validation and cleanup

**Files:**

- Any files touched in earlier phases

### Changes

1. Remove unused imports/functions from the REPL page.
2. Remove placeholder editor tests if replaced by meaningful tests.
3. Confirm no stale references to the old textarea integration remain.
4. Confirm the package can be built as part of the monorepo.

### Acceptance criteria

- [ ] No TypeScript errors in `@web-audio/editor` or `web`.
- [ ] No lint errors in touched packages.
- [ ] Monorepo build includes `@web-audio/editor` successfully.
- [ ] REPL behavior is unchanged except for the editor UI.

### Verification

Automated:

- [ ] `pnpm --filter @web-audio/editor check`
- [ ] `pnpm --filter @web-audio/editor test:ci`
- [ ] `pnpm --filter @web-audio/editor build`
- [ ] `pnpm --filter web check`
- [ ] `pnpm --filter web lint`
- [ ] `pnpm build`
- [ ] `pnpm lint`

Manual final smoke test:

- [ ] Load `/repl`.
- [ ] Edit code.
- [ ] Run with button.
- [ ] Run with `Cmd/Ctrl+Enter`.
- [ ] Stop audio.
- [ ] Publish code.
- [ ] Load a published/existing sketch and verify the editor content.

---

## File Change Summary

| File                                               | Change                                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/editor/package.json`                     | New package, renamed to `@web-audio/editor`, aligned scripts/dependencies                                                              |
| `packages/editor/src/index.ts`                     | CodeMirror setup, public `createCodeMirror` API, change/run callbacks                                                                  |
| `packages/editor/src/theme.ts`                     | CodeMirror theme using CSS variables                                                                                                   |
| `packages/editor/src/utils.ts`                     | Custom editor commands, renamed from `utiils.ts`                                                                                       |
| `packages/editor/tsconfig.json`                    | Library TS config for DOM package                                                                                                      |
| `packages/editor/tsdown.config.ts`                 | Build config                                                                                                                           |
| `packages/editor/tests/index.test.ts`              | Editor smoke/unit tests where practical                                                                                                |
| `apps/web/package.json`                            | Add `@web-audio/editor` workspace dependency                                                                                           |
| `pnpm-lock.yaml`                                   | Lockfile update from install command                                                                                                   |
| `apps/web/src/components/code-editor/index.svelte` | New Svelte wrapper around CodeMirror lifecycle                                                                                         |
| `apps/web/src/routes/repl/+page.svelte`            | Replace textarea with `CodeEditor`, remove textarea key handling, add header/editor/sidebar layout, move log to sidebar, update styles |

---

## Constraints and non-goals

- Do not run `pnpm dev` unless manual browser verification requires it and it is explicitly approved.
- Do not manually edit dependency entries when an install command can do it.
- Keep this migration focused on replacing the REPL textarea; do not add persistence, tabs, linting,
  formatting, autocomplete customization, or a custom Drome language mode in this pass.
- The first editor language mode can remain CodeMirror JavaScript support, matching the source
  package from `../drome`.
- The REPL's runtime audio behavior should not change as part of this migration.
