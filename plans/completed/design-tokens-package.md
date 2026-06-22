# Design Tokens Package Implementation Plan

## Context

This plan implements a shared `@web-audio/tokens` package for repo-wide CSS design tokens and reset styles.

The first pass focuses on the package scaffold and CSS build pipeline only. The package should provide separate public CSS files, while allowing token source files to stay modular internally.

**Key design decisions:**

- Use a CSS-first package, not a JSON/design-token generator pipeline.
- Use Lightning CSS to bundle `@import`s and compile newer CSS syntax when appropriate.
- Keep public CSS entrypoints separate. Do not compile everything into one universal file.
- Start with two public outputs:
  - `tokens.css`
  - `reset.css`
- Keep token sources split by concern, e.g. `color.css`, `spacing.css`, `typography.css`.
- Do not minify package output by default. The consuming app can minify final production CSS.
- Do not make `@web-audio/editor` import tokens directly. Apps opt into token CSS.
- Add editor-specific token mappings later as a separate `editor.css` entrypoint.

---

## Phase 1: Package Scaffold + Lightning CSS Pipeline

Create the new workspace package and prove that it can compile separate CSS entrypoints.

### Step 1.1 — Create package scaffold

**Files:**

- `packages/tokens/package.json`
- `packages/tokens/README.md`
- `packages/tokens/src/reset.css`
- `packages/tokens/src/tokens/index.css`

Create a new package named `@web-audio/tokens`.

Initial `package.json` shape:

```json
{
  "name": "@web-audio/tokens",
  "type": "module",
  "version": "0.0.0",
  "exports": {
    "./tokens.css": "./dist/tokens.css",
    "./reset.css": "./dist/reset.css",
    "./package.json": "./package.json"
  },
  "files": ["dist"],
  "scripts": {
    "build": "pnpm build:tokens && pnpm build:reset",
    "build:tokens": "lightningcss src/tokens/index.css -o dist/tokens.css --bundle",
    "build:reset": "lightningcss src/reset.css -o dist/reset.css --bundle",
    "check": "pnpm build",
    "lint": "prettier --check .",
    "format": "prettier --write ."
  }
}
```

**Acceptance criteria:**

- [x] `packages/tokens/package.json` exists with `@web-audio/tokens` package name
- [x] Package exports `./tokens.css` and `./reset.css`
- [x] Package has `build`, `check`, `lint`, and `format` scripts

---

### Step 1.2 — Install Lightning CSS

**Files:**

- `packages/tokens/package.json`
- `pnpm-lock.yaml`

Install Lightning CSS CLI as a dev dependency using pnpm, rather than editing `package.json` manually:

```sh
pnpm --filter @web-audio/tokens add -D lightningcss-cli
```

**Acceptance criteria:**

- [x] `lightningcss-cli` is listed in `packages/tokens/package.json` dev dependencies
- [x] Lockfile is updated
- [x] `pnpm --filter @web-audio/tokens exec lightningcss --version` works

---

### Step 1.3 — Add placeholder CSS entrypoints

**Files:**

- `packages/tokens/src/reset.css`
- `packages/tokens/src/tokens/index.css`

Add minimal placeholder CSS so the build pipeline can be tested before moving real styles.

Example `src/tokens/index.css`:

```css
:where(html) {
  --ui-token-package-loaded: true;
}
```

Example `src/reset.css`:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}
```

**Acceptance criteria:**

- [x] `src/tokens/index.css` exists
- [x] `src/reset.css` exists
- [x] `pnpm --filter @web-audio/tokens build` creates `dist/tokens.css`
- [x] `pnpm --filter @web-audio/tokens build` creates `dist/reset.css`

---

## Phase 2: Token Source Files

Split token sources by concern and compile them into one public `tokens.css` file.

### Step 2.1 — Add modular token source files

**Files:**

- `packages/tokens/src/tokens/color.css`
- `packages/tokens/src/tokens/spacing.css`
- `packages/tokens/src/tokens/typography.css`
- `packages/tokens/src/tokens/radius.css`
- `packages/tokens/src/tokens/index.css`

Create token files grouped by concern.

Update `src/tokens/index.css` to compose them:

```css
@import "./color.css";
@import "./spacing.css";
@import "./typography.css";
@import "./radius.css";
```

**Acceptance criteria:**

- [x] Token source files are split by concern
- [x] `src/tokens/index.css` imports all token source files
- [x] `pnpm --filter @web-audio/tokens build` bundles imports into `dist/tokens.css`
- [x] `dist/tokens.css` does not contain unresolved local `@import "./..."` rules

---

### Step 2.2 — Move existing web color tokens

**Files:**

- `apps/web/src/styles/tokens.css`
- `packages/tokens/src/tokens/color.css`
- `packages/tokens/src/tokens/spacing.css`

Move the existing app-level tokens into the new token package.

Current tokens to move:

```css
:where(html) {
  --color-bg-primary: light-dark(#fff, #000);
  --color-bg-secondary: light-dark(#efefef, #111);

  --color-fg-primary: light-dark(#000, #fff);
  --color-fg-secondary: light-dark(#444, #ccc);
  --color-fg-tertiary: light-dark(#888, #777);

  --color-border-subtle: light-dark(rgb(0 0 0 / 0.1), rgb(255 255 255 / 0.1));
}
```

Suggested split:

- color variables go in `color.css` and use the simplified `--color-*` namespace
- app-specific `--ui-*` variables do not move into the tokens package
- `--ui-header-block-size` should remain app-owned and can later be defined in the web app as `var(--space-16)`

**Acceptance criteria:**

- [x] Existing color values are present in `packages/tokens/src/tokens/color.css` as `--color-*` variables
- [x] App-specific `--ui-header-block-size` is not part of the tokens package
- [x] `dist/tokens.css` contains the moved color variables after build

---

### Step 2.3 — Add initial typography, spacing, and radius tokens

**Files:**

- `packages/tokens/src/tokens/spacing.css`
- `packages/tokens/src/tokens/typography.css`
- `packages/tokens/src/tokens/radius.css`

Add a small set of reusable base tokens.

Suggested typography tokens:

```css
:where(html) {
  --font-sans: system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  --font-base: 1rem;
  --line-height-base: 1.5;
}
```

Suggested spacing tokens:

```css
:where(html) {
  --space-0: 0;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;
}
```

Suggested radius tokens:

```css
:where(html) {
  --radius-none: 0;
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 100vmax;
}
```

**Acceptance criteria:**

- [x] Font stack tokens are available in `dist/tokens.css`
- [x] Base font size and line-height tokens are available in `dist/tokens.css`
- [x] Spacing tokens are available in `dist/tokens.css`
- [x] Radius tokens are available in `dist/tokens.css`

---

## Phase 3: Shared Reset CSS

Move reusable reset styles into the package while keeping app-specific global styles in the web app.

### Step 3.1 — Move reset styles from the web app

**Files:**

- `apps/web/src/styles/global.css`
- `packages/tokens/src/reset.css`

Move only the broadly reusable reset section from `apps/web/src/styles/global.css` into `packages/tokens/src/reset.css`.

Include:

- box sizing
- default margin removal, except for `dialog`
- `interpolate-size` progressive enhancement
- body line-height and font smoothing
- media defaults
- inherited form control fonts
- text overflow/wrapping defaults
- `main { isolation: isolate; }`

Do not move app-specific global rules yet, such as:

- `html` background/color
- `html` font family
- anchor color rules
- button interaction rules

**Acceptance criteria:**

- [x] Reusable reset rules are in `packages/tokens/src/reset.css`
- [x] App-specific global rules remain in `apps/web/src/styles/global.css`
- [x] `pnpm --filter @web-audio/tokens build` creates `dist/reset.css`
- [x] `dist/reset.css` contains the reset rules

---

## Phase 4: Web App Integration

Update the web app to consume CSS from `@web-audio/tokens`.

### Step 4.1 — Add tokens package as a web dependency

**Files:**

- `apps/web/package.json`
- `pnpm-lock.yaml`

Install the workspace package into the web app with pnpm:

```sh
pnpm --filter web add @web-audio/tokens@workspace:*
```

**Acceptance criteria:**

- [x] `apps/web/package.json` includes `@web-audio/tokens` in dependencies
- [x] Lockfile is updated

---

### Step 4.2 — Import package CSS in web globals

**Files:**

- `apps/web/src/styles/global.css`

Add package CSS imports at the top of the global stylesheet:

```css
@import "@web-audio/tokens/reset.css";
@import "@web-audio/tokens/tokens.css";
```

Keep app-specific global styles below the imports.

Update the app's `html` styles to use shared color tokens while keeping app-owned font choices simple:

```css
:where(html) {
  font-family: var(--font-sans);
  color-scheme: light dark;
  background: var(--color-bg-primary);
  color: var(--color-fg-primary);
}
```

**Acceptance criteria:**

- [x] Web global stylesheet imports reset CSS from `@web-audio/tokens`
- [x] Web global stylesheet imports token CSS from `@web-audio/tokens`
- [x] App-specific global rules still live in `apps/web/src/styles/global.css`
- [x] `font-family` uses `--font-sans`

---

### Step 4.3 — Remove local token stylesheet usage

**Files:**

- `apps/web/src/styles/tokens.css`
- any files importing `apps/web/src/styles/tokens.css`

Search for imports of the local app token file. Remove or replace them with package imports.

If nothing imports `apps/web/src/styles/tokens.css` after migration, delete it.

Also update existing app CSS references from the old `--ui-color-*` names to the shared package `--color-*` names.

**Acceptance criteria:**

- [x] No remaining imports of `apps/web/src/styles/tokens.css`
- [x] Local token file is removed if unused
- [x] No remaining references to old `--ui-color-*` variables
- [x] Web app receives shared `--color-*`, `--space-*`, `--font-*`, and `--radius-*` variables from package CSS

---

## Phase 5: Validation

Run package-level and repo-level checks.

### Step 5.1 — Validate tokens package

**Commands:**

```sh
pnpm --filter @web-audio/tokens build
pnpm --filter @web-audio/tokens check
pnpm --filter @web-audio/tokens lint
```

**Acceptance criteria:**

- [x] Tokens package build succeeds
- [x] Tokens package check succeeds
- [x] Tokens package lint succeeds
- [x] `packages/tokens/dist/tokens.css` exists
- [x] `packages/tokens/dist/reset.css` exists

---

### Step 5.2 — Validate web integration

**Commands:**

```sh
pnpm --filter web check
pnpm --filter web lint
pnpm --filter web build
```

**Acceptance criteria:**

- [x] Web check succeeds
- [x] Web lint succeeds
- [x] Web build succeeds
- [x] Vite/Svelte can resolve `@web-audio/tokens/reset.css`
- [x] Vite/Svelte can resolve `@web-audio/tokens/tokens.css`

---

### Step 5.3 — Validate repo-level commands

**Commands:**

```sh
pnpm check
pnpm lint
pnpm build
```

**Acceptance criteria:**

- [x] Repo check succeeds
- [x] Repo lint succeeds
- [x] Repo build succeeds
- [x] Tokens package participates correctly in the workspace build

---

## Future Phase: Editor CSS Entrypoint

Not implemented in this plan.

Add `packages/tokens/src/editor.css` later to map shared UI tokens to the existing CodeMirror/editor variables used by `@web-audio/editor`.

Possible export:

```json
{
  "exports": {
    "./editor.css": "./dist/editor.css"
  }
}
```

Possible usage in app CSS:

```css
@import "@web-audio/tokens/editor.css";
```

The editor package should remain themeable and should not import this CSS directly.

---

## Future Phase: Optional Global CSS Entrypoint

Not implemented in this plan.

If app-global document styles become useful across multiple apps, add a separate `global.css` export. This should be distinct from `reset.css` because it would be more opinionated.

Possible content:

- document background and foreground
- body font family
- default anchor styling
- default button interaction behavior

Possible usage:

```css
@import "@web-audio/tokens/reset.css";
@import "@web-audio/tokens/tokens.css";
@import "@web-audio/tokens/global.css";
```
