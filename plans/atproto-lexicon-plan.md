# Plan: AT Protocol Lexicon Integration

## Overview

Implement a custom AT Protocol lexicon (`live.drome.*`) for publishing and discovering live-coded music sketches. The web app already has OAuth working. This plan is AT-Protocol-first — integrate with the network before building local IndexedDB persistence, then layer local storage on top.

The real-time sync architecture follows the Statusphere reference implementation: Tap runs as a Go sidecar, subscribes to the AT Protocol firehose, and delivers events to the app via HTTP webhook. The app handles events in a SvelteKit API route, upserts into SQLite, and the feed reads from SQLite from day one. No polling layer to build and then replace.

---

## Domain

All lexicon NSIDs use the `live.drome.*` namespace, which requires owning `drome.live`. Verify domain ownership before publishing records to the network. Lexicon files live at `lexicons/` in the repo root.

---

## Lexicon Definitions

Three record types. All use TID rkeys.

### `live.drome.sketch`

The primary record. Each publication of a sketch is a **new record** (new TID rkey). Republishing creates a new record with `previousVersion` pointing at the prior AT URI, forming a version chain on the network. The first TID in a chain is the stable identifier for a sketch across all versions.

```json
{
  "lexicon": 1,
  "id": "live.drome.sketch",
  "defs": {
    "main": {
      "type": "record",
      "description": "A live-coded music sketch.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["title", "code", "createdAt"],
        "properties": {
          "title":           { "type": "string", "maxLength": 256 },
          "code":            { "type": "string", "maxLength": 100000 },
          "description":     { "type": "string", "maxLength": 2048 },
          "tags":            { "type": "array", "items": { "type": "string", "maxLength": 64 }, "maxLength": 8 },
          "origin":          { "type": "string", "format": "at-uri", "description": "AT URI of the sketch this was forked from." },
          "previousVersion": { "type": "string", "format": "at-uri", "description": "AT URI of the prior version of this sketch." },
          "createdAt":       { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

### `live.drome.like`

```json
{
  "lexicon": 1,
  "id": "live.drome.like",
  "defs": {
    "main": {
      "type": "record",
      "description": "A like of a live.drome.sketch record.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["subject", "createdAt"],
        "properties": {
          "subject":   { "type": "ref", "ref": "com.atproto.repo.strongRef" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

### `live.drome.repost`

```json
{
  "lexicon": 1,
  "id": "live.drome.repost",
  "defs": {
    "main": {
      "type": "record",
      "description": "A repost of a live.drome.sketch record.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["subject", "createdAt"],
        "properties": {
          "subject":   { "type": "ref", "ref": "com.atproto.repo.strongRef" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

---

## Architecture Notes

### Version chain

Each sketch publish creates a new AT Protocol record with a new TID rkey. Republishing sends `previousVersion` pointing at the prior record's AT URI. The indexer sets `isLatestVersion = false` on the referenced record when it processes the new one. The feed defaults to showing only latest versions.

The stable shareable URL for a sketch is the AT URI of its first publication. The feed/AppView resolves that to the latest version via the `isLatestVersion` flag.

### Local vs. remote source of truth

Local IndexedDB is the source of truth for editing. AT Protocol holds published snapshots. Publishing is an explicit, one-way push. No bidirectional sync — pulling a remote sketch creates a new local record with a new TID and sets `origin` to the remote AT URI.

### Tap architecture

Tap is a Go sidecar that subscribes to the AT Protocol relay (firehose), validates all repo operations, and forwards relevant events to the app via HTTP POST (webhook mode). The app handles events in a SvelteKit API route, upserts into SQLite, and the feed queries SQLite directly.

```
AT Protocol relay
      │
      ▼
   Tap sidecar  ──── POST /api/webhook ────▶  SvelteKit app
   (Go binary)                                      │
      │                                             ▼
   filters to                                   SQLite (drizzle)
   live.drome.*                                      │
                                                     ▼
                                               /feed page
```

---

## Phase 1: Lexicon Files + OAuth Scope

**Goal:** Commit lexicon definitions, generate TypeScript types, and update the OAuth flow to request write access to all three collections.

### What to build

- `lexicons/live.drome.sketch.json`
- `lexicons/live.drome.like.json`
- `lexicons/live.drome.repost.json`
- Run `lex build` (via `@atproto/lex` CLI) to generate TypeScript types from the lexicon files. Output to `apps/web/src/lib/lexicons/`.
- Update `SCOPE` in `apps/web/src/lib/server/auth/client.ts`:
  ```ts
  export const SCOPE = 'atproto repo:live.drome.sketch repo:live.drome.like repo:live.drome.repost';
  ```
- Verify the `oauth-client-metadata.json` route reflects the updated scope.
- Existing sessions will need re-authentication (scope change invalidates prior tokens).

### Acceptance criteria

- [ ] All three lexicon JSON files exist at `lexicons/` and are structurally valid
- [ ] TypeScript types are generated and importable from `$lib/lexicons/`
- [ ] OAuth flow completes with the new scope
- [ ] The granted token includes write access to all three collections
- [ ] Existing auth infrastructure continues to work

---

## Phase 2: SQLite Schema + Tap Webhook

**Goal:** SQLite tables for the AppView index and a webhook endpoint that Tap posts events to. This is the data foundation everything else reads from.

### What to build

**Extend the drizzle schema** at `apps/web/src/lib/server/db/schema.ts`:

```ts
export const sketch = sqliteTable('sketch', {
  uri:             text('uri').primaryKey(),
  cid:             text('cid').notNull(),
  authorDid:       text('author_did').notNull(),
  title:           text('title').notNull(),
  code:            text('code').notNull(),
  description:     text('description'),
  tags:            text('tags'),             // JSON array stored as string
  origin:          text('origin'),
  previousVersion: text('previous_version'),
  createdAt:       text('created_at').notNull(),
  indexedAt:       text('indexed_at').notNull(),
  isLatestVersion: integer('is_latest_version', { mode: 'boolean' }).notNull().default(true),
});

export const like = sqliteTable('like', {
  uri:        text('uri').primaryKey(),
  authorDid:  text('author_did').notNull(),
  subjectUri: text('subject_uri').notNull(),
  subjectCid: text('subject_cid').notNull(),
  createdAt:  text('created_at').notNull(),
  indexedAt:  text('indexed_at').notNull(),
});

export const repost = sqliteTable('repost', {
  uri:        text('uri').primaryKey(),
  authorDid:  text('author_did').notNull(),
  subjectUri: text('subject_uri').notNull(),
  subjectCid: text('subject_cid').notNull(),
  createdAt:  text('created_at').notNull(),
  indexedAt:  text('indexed_at').notNull(),
});
```

The existing `account` table already has `did` and `handle` — this is what Tap's identity events keep up to date.

**Webhook handler** at `apps/web/src/routes/api/webhook/+server.ts`:

```ts
import { parseTapEvent, assureAdminAuth } from '@atproto/tap';
import { AtUri } from '@atproto/syntax';
import { TAP_ADMIN_PASSWORD } from '$env/static/private';
import * as live from '$lib/lexicons/live';

export async function POST({ request }) {
  assureAdminAuth(TAP_ADMIN_PASSWORD, request.headers.get('Authorization'));
  const evt = parseTapEvent(await request.json());

  if (evt.type === 'identity') {
    // upsert account: did, handle, active status
  }

  if (evt.type === 'record') {
    const uri = AtUri.make(evt.did, evt.collection, evt.rkey);

    if (evt.collection === 'live.drome.sketch') {
      if (evt.action === 'create' || evt.action === 'update') {
        const record = live.drome.sketch.$parse(evt.record);
        // upsert sketch row
        // if record.previousVersion is set, mark that URI's isLatestVersion = false
      } else if (evt.action === 'delete') {
        // delete sketch row
      }
    }

    if (evt.collection === 'live.drome.like') { /* upsert/delete like row */ }
    if (evt.collection === 'live.drome.repost') { /* upsert/delete repost row */ }
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
```

**Tap local dev setup** (run in a second terminal tab):

```bash
go run github.com/bluesky-social/indigo/cmd/tap run \
  --webhook-url=http://localhost:3000/api/webhook \
  --collection-filter=live.drome.* \
  --signal-collection=live.drome.sketch \
  --no-replay --disable-acks
```

`--signal-collection=live.drome.sketch` means Tap auto-discovers and starts tracking any DID that publishes a sketch — no manual `addRepos` calls needed as new users join. `--no-replay` skips cursor replay on startup and connects to the firehose head immediately.

**Tap production setup (Railway):**

Add a second Railway service → "Deploy from image" → `ghcr.io/bluesky-social/indigo/tap:latest`. Set the following env vars in the Railway dashboard:

```
TAP_WEBHOOK_URL=https://your-app.railway.app/api/webhook
TAP_COLLECTION_FILTERS=live.drome.*
TAP_SIGNAL_COLLECTION=live.drome.sketch
TAP_ADMIN_PASSWORD=<secret>
```

**Environment variables** to add to `.env`:

```
TAP_URL=http://localhost:2480
TAP_ADMIN_PASSWORD=dev-password
```

Import in server modules via SvelteKit's static private env:

```ts
import { TAP_URL, TAP_ADMIN_PASSWORD } from '$env/static/private';
```

### Acceptance criteria

- [ ] Drizzle migration creates `sketch`, `like`, and `repost` tables
- [ ] `/api/webhook` rejects requests without valid admin auth (401)
- [ ] `/api/webhook` handles `identity` events: upserts into `account` table
- [ ] `/api/webhook` handles `live.drome.sketch` create/update: upserts into `sketch` table
- [ ] `/api/webhook` handles `live.drome.sketch` delete: removes row from `sketch` table
- [ ] On sketch upsert with `previousVersion` set, the referenced row gets `isLatestVersion = false`
- [ ] `/api/webhook` handles `live.drome.like` and `live.drome.repost` create/delete
- [ ] Tap running locally delivers events to the webhook and rows appear in SQLite
- [ ] Invalid or unparseable events return `{ success: false }` without crashing

---

## Phase 3: AT Protocol Write Layer

**Goal:** A typed server-side module for publishing records to the PDS via the authenticated OAuth agent.

### What to build

`apps/web/src/lib/server/atproto/records.ts`:

```ts
// Publish a new sketch. Returns { uri, cid }.
publishSketch(sessionDid: string, input: {
  title: string
  code: string
  description?: string
  tags?: string[]
  origin?: string          // set when publishing a forked sketch
  previousVersion?: string // set when republishing an existing sketch
}): Promise<{ uri: string; cid: string }>

// Like a sketch. Returns { uri, cid }.
likeSketch(sessionDid: string, subject: { uri: string; cid: string }): Promise<{ uri: string; cid: string }>

// Repost a sketch. Returns { uri, cid }.
repostSketch(sessionDid: string, subject: { uri: string; cid: string }): Promise<{ uri: string; cid: string }>

// Delete any record by AT URI (used for unlike, un-repost).
deleteRecord(sessionDid: string, uri: string): Promise<void>
```

Agent restoration: `getOAuthClient()` → `client.restore(sessionDid)` → authenticated `Agent`.

TID generation for rkeys: use `@atproto/common-web` `TID.nextStr()`, matching the format used by the local IndexedDB layer so local IDs and AT Proto rkeys are the same value.

### Acceptance criteria

- [ ] `publishSketch` creates a `live.drome.sketch` record on the PDS and returns a valid AT URI and CID
- [ ] `likeSketch` and `repostSketch` create the correct record types with a valid `strongRef` subject
- [ ] `deleteRecord` removes the specified record from the PDS
- [ ] All functions throw descriptively if the session is missing or the token is expired
- [ ] No dependency on Svelte or SvelteKit routing

---

## Phase 4: Publish from REPL

**Goal:** A logged-in user can publish the code currently in the REPL editor to their PDS.

### What to build

- SvelteKit form action on `/repl` (or `POST /api/sketch/publish`) that:
  1. Reads `title`, `code`, `description`, `tags`, `previousVersion` from the request
  2. Reads the session DID
  3. Calls `publishSketch`
  4. Returns `{ uri, cid }`
- "Publish" button in the REPL UI:
  - Opens a small modal to confirm title, optional description, and tags
  - Submits to the action
  - Displays the AT URI on success
- Unauthenticated users see the button disabled with a login prompt.

Note: Tap will pick up the published record via the firehose and deliver it to `/api/webhook` automatically. No manual SQLite write needed on publish — the webhook handles indexing.

### Acceptance criteria

- [ ] Logged-in user can publish a sketch from the REPL
- [ ] The AT URI is shown in the UI after successful publish
- [ ] Publishing the same sketch again sends `previousVersion` (tracked in local state for now, from IndexedDB in Phase 6)
- [ ] Unauthenticated users see a disabled button
- [ ] The published sketch appears in the feed once Tap delivers the webhook event

---

## Phase 5: Feed

**Goal:** `/feed` displays sketches indexed in SQLite, sorted by `createdAt` descending, with a play button that loads the sketch into the REPL.

### What to build

`apps/web/src/routes/feed/+page.server.ts` load function queries SQLite directly:

```ts
const sketches = db
  .select({ sketch, account })
  .from(sketch)
  .leftJoin(account, eq(sketch.authorDid, account.did))
  .where(eq(sketch.isLatestVersion, true))
  .orderBy(desc(sketch.createdAt))
  .limit(50)
```

Sketch cards show: title, author handle, description, tags, `createdAt`, like count, repost count, and a "Play" button.

Like and repost counts via SQL aggregation:
```ts
db.select({ count: count() }).from(like).where(eq(like.subjectUri, uri))
```

"Play" navigates to `/repl?uri=<at-uri>` and loads the code into the editor. The REPL reads `uri` from the query param, fetches the record from SQLite, and hydrates the editor.

Version history toggle: a UI toggle switches between "latest only" (default, `isLatestVersion = true`) and "all versions" (no filter, grouped by the first TID in the chain).

### Acceptance criteria

- [ ] `/feed` renders latest-version sketches from SQLite
- [ ] Records are sorted by `createdAt` descending
- [ ] Author handles are resolved via the `account` table
- [ ] Like and repost counts are correct
- [ ] "Play" loads the sketch code into the REPL
- [ ] Version history toggle works: all versions visible and grouped correctly
- [ ] Feed updates within seconds of a new sketch being published (Tap latency)
- [ ] Cursor-based pagination for scrolling past the initial 50

---

## Phase 6: Profile Page

**Goal:** A logged-in user can view all of their own published sketches in one place.

### What to build

`apps/web/src/routes/profile/+page.server.ts` load function queries SQLite filtered by the session DID:

```ts
const sketches = db
  .select({ sketch, account })
  .from(sketch)
  .leftJoin(account, eq(sketch.authorDid, account.did))
  .where(and(eq(sketch.authorDid, session.did), eq(sketch.isLatestVersion, true)))
  .orderBy(desc(sketch.createdAt))
  .limit(50)
```

- `/profile` is only accessible to authenticated users — redirect to login if no session.
- Uses the same sketch card component as `/feed` (title, description, tags, `createdAt`, like/repost counts, "Play" button).
- Add a "Profile" link to the nav when the user is logged in, next to the existing logout/login controls.
- Cursor-based pagination matching the feed's approach.

### Acceptance criteria

- [ ] `/profile` is only accessible to logged-in users; unauthenticated visitors are redirected
- [ ] Page lists only the session user's latest-version published sketches
- [ ] Records are sorted by `createdAt` descending
- [ ] Like and repost counts are correct
- [ ] "Play" loads the sketch code into the REPL
- [ ] "Profile" link appears in nav when logged in
- [ ] Cursor-based pagination works past the initial 50

---

## Phase 7: Local IndexedDB

**Goal:** Sketches are saved locally in the browser between sessions. Local becomes the authoring layer; AT Protocol is the publishing layer.

### What to build

IndexedDB module at `apps/web/src/lib/client/db/sketches.ts`:

**Schema:**

| Field               | Type               | Notes                                       |
| ------------------- | ------------------ | ------------------------------------------- |
| `tid`               | `string`           | TID primary key, AT Proto rkey-compatible   |
| `title`             | `string`           | Display name                                |
| `code`              | `string`           | Sketch source code                          |
| `origin`            | `string \| null`   | AT URI this was forked from                 |
| `originDid`         | `string \| null`   | DID of original author                      |
| `originDisplayName` | `string \| null`   | Cached handle, refreshed opportunistically  |
| `description`       | `string \| null`   | Optional description                        |
| `tags`              | `string[] \| null` | Optional tags                               |
| `publishedUri`      | `string \| null`   | AT URI of most recent publication           |
| `publishedCid`      | `string \| null`   | CID of most recent publication              |
| `createdAt`         | `string`           | ISO 8601                                    |
| `updatedAt`         | `string`           | ISO 8601                                    |
| `deletedAt`         | `string \| null`   | ISO 8601, soft delete                       |

Indexes on `updatedAt`, `title`, `publishedUri`, `deletedAt`. Versioned migration framework (`onupgradeneeded` walks an ordered array of migration functions). Startup cleanup purges records with `deletedAt` older than 30 days.

**Operations:** `create`, `read`, `update`, `softDelete`, `list(sortBy)`.

**Routing:**
- `/repl` — redirects to most recent sketch or `/repl/new`
- `/repl/new` — blank editor, ephemeral until saved
- `/repl/:tid` — loads sketch from IndexedDB by TID

**Save flow:** `Cmd+S` triggers save. First save prompts for title, generates TID via `@atproto/common-web`, persists, and replaces URL to `/repl/:tid`. Subsequent saves overwrite in place and bump `updatedAt`. `beforeunload` guard fires when dirty.

**Publish integration:** After a successful publish, store `{ uri, cid }` in the local record's `publishedUri` and `publishedCid`. On re-publish, read `publishedUri` and pass it as `previousVersion` to `publishSketch`, then update both fields.

**Fork integration:** When "Play" is clicked on a feed sketch, create a new local record with a new TID, `origin` = remote AT URI, `originDid` and `originDisplayName` from the author. REPL shows "forked from @handle" when `origin` is set.

### Acceptance criteria

- [ ] Sketches persist across browser sessions
- [ ] `Cmd+S` saves; prompts for title on first save; URL updates to `/repl/:tid`
- [ ] Sidebar lists sketches sorted by `updatedAt`, toggleable to alphabetical
- [ ] `/repl` redirects to most recent or `/repl/new`
- [ ] Soft delete hides from UI; startup cleanup purges old deleted records
- [ ] Publishing stores `publishedUri`/`publishedCid` locally
- [ ] Re-publishing sends `previousVersion` automatically
- [ ] "Play" on a feed sketch creates a local fork with provenance display in the REPL

---

## Phase 8: Likes and Reposts UI

**Goal:** Users can like and repost sketches from the feed. Counts are displayed on cards and update optimistically.

### What to build

- Like button on feed cards:
  - POST to `/api/sketch/like` with `{ subjectUri, subjectCid }`
  - Server calls `likeSketch`, returns like AT URI
  - Button toggles liked state; like URI stored in session for unlike
  - Unlike: DELETE to `/api/sketch/like` with the like AT URI; server calls `deleteRecord`
- Repost button: same pattern
- Counts are already in the feed query (Phase 5). Optimistic update adjusts the displayed count immediately on click without waiting for the next page load.

Note: Tap handles indexing likes/reposts automatically via the webhook. No manual SQLite writes in the like/repost endpoints.

### Acceptance criteria

- [ ] Logged-in users can like/unlike sketches
- [ ] Logged-in users can repost/un-repost sketches
- [ ] Like and repost counts update optimistically on click
- [ ] Unauthenticated users see counts but cannot interact
- [ ] Like/repost records are indexed in SQLite via Tap within seconds

---

## Implementation Order Summary

| Phase | What                       | Key output                                    |
| ----- | -------------------------- | --------------------------------------------- |
| 1     | Lexicons + OAuth scope     | JSON files, generated TS types, updated scope |
| 2     | SQLite schema + Tap webhook| DB tables, `/api/webhook`, Tap running locally|
| 3     | Write layer                | `publishSketch`, `likeSketch`, `repostSketch` |
| 4     | Publish from REPL          | "Publish" button, record appears on network   |
| 5     | Feed                       | `/feed` reading from SQLite, "Play" button    |
| 6     | Profile page               | `/profile` listing user's own published sketches |
| 7     | Local IndexedDB            | Authoring layer, `publishedUri` sync, forks   |
| 8     | Likes + reposts UI         | Like/repost buttons, optimistic counts        |
