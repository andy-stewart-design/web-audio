# Plan: Drome Network — Direct Feed Architecture

## Overview

This plan picks up after the core AT Protocol write layer is in place (lexicons, OAuth, write functions, REPL publish). It replaces the original Tap-based indexing plan with a simpler direct-fetch architecture suited to the current scale.

**The core shift:** instead of running a Go firehose sidecar (Tap) to index records into SQLite, the feed reads directly from the AT Protocol network on demand — fetching each user's published sketches straight from their PDS. SQLite and Tap are deferred until there are enough real users to justify the operational complexity.

**Key architectural decisions:**
- Feed data comes from direct `com.atproto.repo.listRecords` calls to each followed user's PDS
- Follow graph is a custom `live.drome.follow` lexicon — independent of Bluesky follows
- DID resolution (DID → PDS URL) uses the PLC directory (`https://plc.directory/{did}`)
- No server-side caching layer until Tap is introduced

---

## Completed (from atproto-lexicon-plan.md)

- [x] **Phase 1:** Lexicon files (`live.drome.sketch`, `live.drome.like`, `live.drome.repost`) + TypeScript codegen + OAuth scope
- [x] **Phase 2:** SQLite schema (`sketch`, `like`, `repost`, `sketch_tag` tables) — schema exists, unused until Tap
- [x] **Phase 3:** AT Protocol write layer (`publishSketch`, `likeSketch`, `repostSketch`, `deleteRecord`)
- [x] **Phase 4:** Publish from REPL — form action, publish dialog, version chain (`previousVersion`/`rootVersion`) tracked in local state

---

## Phase 5: Follow Lexicon + Write Layer

**Goal:** Add `live.drome.follow` as a fourth lexicon record type, giving users an app-specific social graph independent of their Bluesky follows.

### Lexicon definition

```json
{
  "lexicon": 1,
  "id": "live.drome.follow",
  "defs": {
    "main": {
      "type": "record",
      "description": "A follow relationship between two Drome users.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["subject", "createdAt"],
        "properties": {
          "subject": {
            "type": "string",
            "format": "did",
            "description": "DID of the user being followed."
          },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

### What to build

- [x] Add `lexicons/live/drome/follow.json`
- [x] Regenerate TypeScript types (`pnpm --filter web lex:build`)
- [x] Update OAuth scope in `client.ts`:
  ```ts
  export const SCOPE =
    'atproto repo:live.drome.sketch repo:live.drome.like repo:live.drome.repost repo:live.drome.follow';
  ```
- [x] Add `followUser` and `unfollowUser` to `apps/web/src/lib/server/atproto/records.ts`:
  - `followUser(sessionDid, subjectDid)` — creates a `live.drome.follow` record, returns `{ uri, cid }`
  - `unfollowUser(sessionDid, followUri)` — calls `deleteRecord` with the follow's AT URI
- [x] Add `getFollows(did)` to a new read module `apps/web/src/lib/server/atproto/reads.ts` — fetches `live.drome.follow` records from the PDS for a given DID, returns `{ uri, subject }[]`

### Acceptance criteria

- [x] `live.drome.follow` lexicon exists and passes `goat lex lint`
- [x] TypeScript types regenerated and importable
- [x] OAuth scope updated — existing sessions need re-authentication
- [x] `followUser` creates a `live.drome.follow` record on the PDS
- [x] `unfollowUser` deletes the record
- [x] `getFollows` returns the correct list for a given DID

---

## Phase 6: Simple Feed

**Goal:** `/feed` shows the latest sketches from users the logged-in user follows, fetched directly from the AT Protocol network. No SQLite, no indexer.

### Architecture

All fetching happens in the SvelteKit `+page.server.ts` load function on each page load:

1. **Get follow list:** call `getFollows(session.did)` → array of followed DIDs
2. **Resolve PDS URLs:** for each DID, fetch `https://plc.directory/{did}` and extract the `atproto_pds` service endpoint — a small utility `resolveDidToPds(did): Promise<string>`
3. **Fetch sketches:** for each followed DID and their PDS URL, call `com.atproto.repo.listRecords` filtered to `live.drome.sketch` — a utility `getSketchesForDid(pds, did): Promise<SketchRecord[]>`
4. **Merge and sort:** combine all results, sort by `createdAt` descending, take the most recent 50

For unauthenticated users: show an empty state with a login prompt.

### New utilities in `reads.ts`

```ts
export async function resolveDidToPds(did: string): Promise<string>
// Fetches https://plc.directory/{did}, extracts service with type "AtprotoPersonalDataServer"

export async function getSketchesForDid(pds: string, did: string): Promise<SketchCard[]>
// Calls com.atproto.repo.listRecords on the given PDS, collection=live.drome.sketch
// Returns a flat array typed as { uri, cid, authorDid, record }
```

### Feed card

Each sketch card shows: title, author handle, `createdAt`, description (truncated), tags, and a "Play" button. Like/repost counts are omitted for now (no index to query against — added in Phase 8).

"Play" navigates to `/repl?load={at-uri}`. The REPL reads the `load` param, fetches the record from the PDS, and hydrates the editor with the code and sets `previousVersion`/`rootVersion` from the record.

### What to build

- [x] `apps/web/src/lib/server/atproto/reads.ts` with `resolveDidToPds`, `resolveIdentifier`, `getProfile`, `listSketches`, `getSketch`
- [x] `apps/web/src/routes/feed/+page.server.ts` — load function implementing the fetch/merge/sort pipeline
- [x] `apps/web/src/routes/feed/+page.svelte` — feed UI with sketch cards, empty state for unauthenticated users
- [x] Sketch card component at `apps/web/src/components/sketch-card/index.svelte`
- [x] REPL `?load={at-uri}` param handling — fetch record from PDS and hydrate editor

### Acceptance criteria

- [x] Logged-in user sees sketches from followed users, sorted by `createdAt` descending
- [x] Unauthenticated users see an empty state with a login prompt
- [x] "Play" loads sketch code into the REPL editor
- [x] Loading from `?load=` param sets `previousVersion` and `rootVersion` correctly if the user republishes
- [x] Handles the case where a followed user has no sketches (no crash, graceful empty)
- [x] Handles PDS resolution failure gracefully (skip that user, don't crash the whole feed)

---

## Phase 7: Profile Pages + Follow UI

**Goal:** Users can view any profile's published sketches and follow/unfollow them from the UI.

### What to build

**`/profile/[did]`** — public profile page for any DID:
- Fetch `com.atproto.repo.describeRepo` for display name / handle
- Fetch `live.drome.sketch` records for that DID
- Show sketch cards (same component as feed)
- If logged in: show Follow/Unfollow button
  - Follow state: check if session user's follow list contains this DID
  - Follow: POST to `/api/follow` → `followUser(sessionDid, subjectDid)`
  - Unfollow: DELETE to `/api/follow` with the follow's AT URI → `unfollowUser`

**`/profile`** — redirects to `/profile/[session.did]` if logged in, otherwise redirects to `/`.

**Nav update:** Add a "Profile" link in the header pointing to `/profile/[session.did]` when logged in.

### Acceptance criteria

- [x] `/profile/[identifier]` renders any user's published sketches (accepts both handle and DID)
- [x] Follow/Unfollow button visible to logged-in users on other users' profiles
- [x] Following a user adds them to the feed on next load
- [x] Unfollowing removes them
- [x] Own profile shows no Follow button
- [x] "Profile" link appears in header when logged in

---

## Phase 8: Likes + Reposts UI

**Goal:** Users can like and repost sketches from the feed and profile pages. Write layer already exists; this phase wires up the UI.

### What to build

- Like button on sketch cards:
  - POST to `/api/sketch/like` with `{ subjectUri, subjectCid }` → `likeSketch`
  - Returns like AT URI, stored in component state for unlike
  - Unlike: DELETE to `/api/sketch/like` → `deleteRecord`
- Repost button: same pattern with `repostSketch`
- Like/repost state is session-local (no index to query) — buttons show active state based on client-side tracking
- Counts are omitted until Tap is introduced (no way to aggregate without an index)

### Acceptance criteria

- [ ] Logged-in users can like/unlike sketches from feed and profile pages
- [ ] Logged-in users can repost/un-repost
- [ ] Unauthenticated users see buttons disabled
- [ ] Like/repost state persists correctly within a session

---

## Phase 9: Local IndexedDB

**Goal:** Sketches are saved locally in the browser between sessions. Local is the authoring layer; AT Protocol is the publishing layer.

### Schema

| Field               | Type               | Notes                                      |
| ------------------- | ------------------ | ------------------------------------------ |
| `tid`               | `string`           | TID primary key, AT Proto rkey-compatible  |
| `title`             | `string`           | Display name                               |
| `code`              | `string`           | Sketch source code                         |
| `origin`            | `string \| null`   | AT URI this was forked from                |
| `originDid`         | `string \| null`   | DID of original author                     |
| `originDisplayName` | `string \| null`   | Cached display name                        |
| `description`       | `string \| null`   | Optional                                   |
| `tags`              | `string[] \| null` | Optional                                   |
| `publishedUri`      | `string \| null`   | AT URI of most recent publication          |
| `publishedRootUri`  | `string \| null`   | AT URI of first-ever publication (rootVersion) |
| `createdAt`         | `string`           | ISO 8601                                   |
| `updatedAt`         | `string`           | ISO 8601                                   |
| `deletedAt`         | `string \| null`   | ISO 8601, soft delete                      |

Module at `apps/web/src/lib/client/db/sketches.ts`. Versioned migrations via `onupgradeneeded`. Indexes on `updatedAt`, `title`, `publishedUri`.

### Routing

- `/repl` — redirects to most recent sketch or `/repl/new`
- `/repl/new` — blank editor, ephemeral until saved
- `/repl/[tid]` — loads sketch from IndexedDB by TID

### Key flows

**Save:** `Cmd+S` saves. First save prompts for title, generates TID via `TID.nextStr()`, persists to IndexedDB, replaces URL to `/repl/[tid]`. Subsequent saves overwrite and bump `updatedAt`. `beforeunload` guard when dirty.

**Publish integration:** After successful publish, store `{ uri }` in `publishedUri` and `publishedRootUri` (if first publish). On re-publish, read `publishedUri` as `previousVersion` and `publishedRootUri` as `rootVersion` — replaces the current in-page state tracking.

**Fork ("Play" from feed):** Creates a new local record with a new TID, `origin` = remote AT URI, `originDid` and `originDisplayName` from the author. REPL shows "forked from @handle" when `origin` is set.

**Sketch list sidebar:** Lists sketches sorted by `updatedAt`, toggleable to alphabetical. Soft-deleted sketches hidden. Startup cleanup purges records with `deletedAt` older than 30 days.

### Acceptance criteria

- [ ] Sketches persist across browser sessions
- [ ] `Cmd+S` saves; prompts for title on first save; URL updates to `/repl/[tid]`
- [ ] Sidebar lists sketches sorted by `updatedAt`, toggleable to alphabetical
- [ ] `/repl` redirects to most recent or `/repl/new`
- [ ] Soft delete hides from UI; startup cleanup purges old deleted records
- [ ] Publishing stores `publishedUri` / `publishedRootUri` — replaces in-page state tracking
- [ ] Re-publishing sends `previousVersion` and `rootVersion` from IndexedDB automatically
- [ ] "Play" on a feed sketch creates a local fork with provenance shown in the REPL

---

## Phase 10: Login Handle Autocomplete

**Goal:** Improve the login UX by showing matching handles as the user types, using the Bluesky actor search API.

### What to build

Replace the plain text input in `login-dialog.svelte` with a combobox that:
- Debounces input (~300ms), then fetches:
  ```
  GET https://api.bsky.app/xrpc/app.bsky.actor.searchActors?q={input}&limit=8
  ```
- Renders a dropdown of results showing avatar, display name, and handle
- Arrow keys navigate the list; Enter or click selects and fills the input
- Escape closes the dropdown
- Selecting a result submits the form immediately

### Acceptance criteria

- [ ] Dropdown appears after 300ms of typing
- [ ] Results show avatar, display name, and handle
- [ ] Keyboard navigation (arrows, Enter, Escape) works correctly
- [ ] Selecting a result fills the input and submits
- [ ] No dropdown shown for input shorter than 2 characters
- [ ] Accessible: `role="combobox"`, `aria-activedescendant`, `aria-expanded`

---

## Phase 11: Tap + SQLite Indexer (Deferred)

**Goal:** Replace direct PDS reads with a real-time indexed feed backed by SQLite. Introduced once the app has enough real users that direct fetching becomes a bottleneck.

### When to revisit

- More than ~20 active users (fan-out on read becomes slow)
- Need for like/repost counts in the feed
- Need for cross-user search or tag filtering

### What to build (when the time comes)

The SQLite schema is already in place from Phase 2. Add:

- Tap sidecar (Go) subscribing to the AT Protocol firehose, filtering `live.drome.*`
- Webhook handler at `/api/webhook` handling `identity`, `live.drome.sketch`, `live.drome.like`, `live.drome.repost`, and `live.drome.follow` events
- Swap the feed's load function from direct PDS reads to SQLite queries
- Add follow table to SQLite schema to support feed queries

The implementation notes and Tap configuration from `atproto-lexicon-plan.md` Phase 5 remain valid reference material.

---

## Phase 12: Publish Lexicons + Deploy

**Goal:** Publish the four `live.drome.*` lexicons to the AT Protocol network and deploy to production.

### What to do

- [ ] Add `live.drome.follow` to DNS TXT record scope (same `_lexicon.drome.live` record)
- [ ] Verify DNS: `goat lex check-dns lexicons/`
- [ ] Publish lexicons: `goat lex publish lexicons/`
- [ ] Deploy app to Railway (or equivalent)
- [ ] Set production environment variables

### Acceptance criteria

- [ ] `_lexicon.drome.live` DNS TXT record resolves to your DID
- [ ] All four lexicons published: `goat lex status lexicons/` shows all in sync
- [ ] App is deployed and reachable at production URL

---

## Implementation Order Summary

| Phase | What                          | Key output                                              |
| ----- | ----------------------------- | ------------------------------------------------------- |
| 1–4   | ✅ Done                       | Lexicons, write layer, REPL publish                     |
| 5     | Follow lexicon + write layer  | `live.drome.follow`, `followUser`, `unfollowUser`       |
| 6     | Simple feed                   | Direct PDS reads, sketch cards, "Play" → REPL           |
| 7     | Profile pages + follow UI     | `/profile/[did]`, follow/unfollow button                |
| 8     | Likes + reposts UI            | Like/repost buttons wired to existing write layer       |
| 9     | Local IndexedDB               | Authoring layer, `publishedUri` sync, forks             |
| 10    | Login handle autocomplete     | Combobox with Bluesky actor search                      |
| 11    | Tap + SQLite (deferred)       | Real-time indexer, revisit when scale demands it        |
| 12    | Publish lexicons + deploy     | DNS record, `goat lex publish`, production              |
