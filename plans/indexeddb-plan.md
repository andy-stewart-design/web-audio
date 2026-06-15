# Plan: Local IndexedDB Authoring Layer

## Overview

Sketches are saved locally in the browser between sessions using IndexedDB. Local storage is the **authoring layer**; AT Protocol is the **publishing layer**. This plan was deferred during the serverless DB migration (see `serverless-db-plan.md`) but the spec is fully defined and ready to implement.

---

## Schema

IndexedDB module at `apps/web/src/lib/client/db/sketches.ts`. Versioned migrations via `onupgradeneeded` (walks an ordered array of migration functions). Indexes on `updatedAt`, `title`, `publishedUri`, `deletedAt`. Startup cleanup purges records with `deletedAt` older than 30 days.

| Field               | Type               | Notes                                                     |
| ------------------- | ------------------ | --------------------------------------------------------- |
| `tid`               | `string`           | TID primary key, AT Proto rkey-compatible                 |
| `title`             | `string`           | Display name                                              |
| `code`              | `string`           | Sketch source code                                        |
| `origin`            | `string \| null`   | AT URI this was forked from                               |
| `originDid`         | `string \| null`   | DID of original author                                    |
| `originDisplayName` | `string \| null`   | Cached handle, refreshed opportunistically                |
| `description`       | `string \| null`   | Optional description                                      |
| `tags`              | `string[] \| null` | Optional tags                                             |
| `publishedUri`      | `string \| null`   | AT URI of most recent publication                         |
| `publishedCid`      | `string \| null`   | CID of most recent publication                            |
| `publishedRootUri`  | `string \| null`   | AT URI of first-ever publication (rootVersion)            |
| `createdAt`         | `string`           | ISO 8601                                                  |
| `updatedAt`         | `string`           | ISO 8601                                                  |
| `deletedAt`         | `string \| null`   | ISO 8601, soft delete                                     |

**Operations:** `create`, `read`, `update`, `softDelete`, `list(sortBy)`.

---

## Routing

- `/repl` — redirects to most recent sketch or `/repl/new`
- `/repl/new` — blank editor, ephemeral until saved
- `/repl/[tid]` — loads sketch from IndexedDB by TID

---

## Key Flows

### Save

`Cmd+S` triggers save. First save prompts for title, generates TID via `TID.nextStr()` from `@atproto/common-web`, persists to IndexedDB, and replaces the URL to `/repl/[tid]`. Subsequent saves overwrite in place and bump `updatedAt`. A `beforeunload` guard fires when the editor is dirty.

### Publish Integration

After a successful publish, store `{ uri, cid }` in the local record's `publishedUri` and `publishedCid`. On re-publish, read `publishedUri` and pass it as `previousVersion` to `publishSketch`, then update both fields. This replaces the current in-page state tracking.

### Fork ("Play" from Feed)

When "Play" is clicked on a feed or profile sketch, create a new local record with a new TID, `origin` set to the remote AT URI, and `originDid` / `originDisplayName` from the author. The REPL shows "forked from @handle" when `origin` is set.

### Sketch List Sidebar

Lists sketches sorted by `updatedAt` descending, toggleable to alphabetical. Soft-deleted sketches are hidden. Startup cleanup purges records with `deletedAt` older than 30 days.

---

## What to Build

- [ ] `apps/web/src/lib/client/db/sketches.ts` — IndexedDB module with versioned migrations and CRUD operations
- [ ] Update `/repl` route to redirect to most recent sketch or `/repl/new`
- [ ] `/repl/new` — blank editor, ephemeral until saved
- [ ] `/repl/[tid]` — loads sketch from IndexedDB by TID
- [ ] `Cmd+S` save handler — title prompt on first save, TID generation, URL update
- [ ] `beforeunload` dirty guard
- [ ] Sketch list sidebar component
- [ ] Publish integration — store `publishedUri` / `publishedCid` after successful publish
- [ ] Fork flow — "Play" creates a new local record with provenance fields
- [ ] Startup cleanup — purge soft-deleted records older than 30 days

---

## Acceptance Criteria

- [ ] Sketches persist across browser sessions
- [ ] `Cmd+S` saves; prompts for title on first save; URL updates to `/repl/[tid]`
- [ ] Sidebar lists sketches sorted by `updatedAt`, toggleable to alphabetical
- [ ] `/repl` redirects to most recent sketch or `/repl/new`
- [ ] Soft delete hides from UI; startup cleanup purges old deleted records
- [ ] Publishing stores `publishedUri` / `publishedCid` locally — replaces in-page state tracking
- [ ] Re-publishing sends `previousVersion` automatically from IndexedDB
- [ ] "Play" on a feed sketch creates a local fork with provenance shown in the REPL
