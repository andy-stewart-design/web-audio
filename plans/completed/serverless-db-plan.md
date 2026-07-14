# Plan: Drome Network — Serverless DB + Deployment

## Overview

This plan picks up after Phases 1–7 (lexicons, write layer, REPL publish, follow graph, feed, profile pages, audio singleton). It replaces the Tap/SQLite/Railway approach with a serverless-first architecture: Neon (Postgres) + Drizzle ORM, deployed to Vercel.

**The core shift:** instead of a persistent server running a firehose listener, we write to the DB directly on publish (since our app is the only publisher of `live.drome.*` records). The feed becomes a single SQL query instead of a fan-out across N PDSes. Auth sessions are stored in the DB to survive serverless cold starts.

**Key architectural decisions:**

- Neon (serverless Postgres) + Drizzle ORM — already installed, just unused
- Write-through on publish: PDS write succeeds → DB insert
- Feed query: `SELECT * FROM sketches WHERE author_did = ANY($dids) ORDER BY created_at DESC LIMIT 50`
- OAuth state/session stored in DB (keeps `@atproto/oauth-client-node`, swaps its stores)
- `@sveltejs/adapter-vercel` replaces `@sveltejs/adapter-node`
- Backfill via one-time script using existing `listSketches` reads

---

## Completed (Phases 1–7)

- [x] Lexicons: `live.drome.sketch`, `live.drome.like`, `live.drome.repost`, `live.drome.follow`
- [x] AT Protocol write layer: `publishSketch`, `likeSketch`, `repostSketch`, `followUser`, `unfollowUser`
- [x] REPL publish with version chain (`previousVersion` / `rootVersion`)
- [x] Feed: direct PDS fan-out reads, sorted by `createdAt`
- [x] Profile pages: `/profile/[identifier]` (handle or DID), follow/unfollow UI
- [x] Audio singleton: persistent `AudioPlayer` class, in-place playback on feed/profile
- [x] Sandboxed code evaluation via Web Worker (`eval.worker.ts`)

---

## Phase 8: Bookmarks

**Goal:** Users can bookmark sketches from the feed and profile pages. The bookmark UI (icon button in the card header) is already in place — this phase wires up the lexicon and read/write logic.

**Why a dedicated lexicon over reusing `live.drome.like`:** bookmarks are private saves; likes will be public social signals (counts, notifications). Conflating them now would require a migration later. `live.drome.bookmark` is trivial to add and keeps the semantics clean.

**Why this doesn't need the DB first:** bookmarks are personal (only your own records). Direct PDS reads work fine here — unlike the feed, there's no fan-out across N users. The DB would only be needed for "sketches bookmarked by N people" (public counts), which isn't a near-term goal.

### Lexicon

```json
{
  "lexicon": 1,
  "id": "live.drome.bookmark",
  "defs": {
    "main": {
      "type": "record",
      "description": "A saved reference to a sketch.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["subject", "subjectCid", "createdAt"],
        "properties": {
          "subject": { "type": "string", "format": "at-uri" },
          "subjectCid": { "type": "string", "format": "cid" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

### What to build

- [x] `lexicons/live/drome/bookmark.json`
- [x] Regenerate TypeScript types (`pnpm --filter web lex:build`)
- [x] Update OAuth scope in `client.ts`: add `repo:live.drome.bookmark`
- [x] Add `bookmarkSketch(sessionDid, subjectUri, subjectCid)` and `unbookmarkSketch(sessionDid, bookmarkUri)` to `records.ts`
- [x] Add `getBookmarks(did)` to `reads.ts` — fetches `live.drome.bookmark` records from PDS, returns `{ uri, subject, subjectCid }[]`
- [x] Bookmark action + unaction via `/api/bookmark` route (POST + DELETE)
- [x] Wire the bookmark button in `sketch-card/index.svelte` to the action
- [x] `/bookmarks` page — lists the logged-in user's bookmarked sketches

### Acceptance criteria

- [x] Logged-in users can bookmark/unbookmark any sketch
- [x] Bookmark button shows active state when bookmarked
- [x] `/bookmarks` page shows all bookmarked sketches, reverse-chronological
- [x] Unauthenticated users see the button disabled

---

## ✅ Phase 9 + 10: Serverless DB Setup + OAuth Refactor

Phases 9 and 10 were completed together since removing `better-sqlite3` forced the OAuth refactor immediately.

**What was done:**

- Removed `@sveltejs/adapter-node`, `better-sqlite3`, `@types/better-sqlite3`
- Added `@neondatabase/serverless`, `@sveltejs/adapter-vercel`
- Rewrote `schema.ts` for Postgres: `auth_state`, `auth_session`, `account`, `sketches`, `bookmarks`
- Rewrote `db/index.ts` using `neon()` + `drizzle-orm/neon-http`
- Updated `auth/client.ts` — state/session stores now use async Postgres queries (no separate store files needed)
- Updated `drizzle.config.ts` to `dialect: 'postgresql'`
- Updated `svelte.config.js` to `adapter-vercel` with `runtime: 'nodejs22.x'`
- Tables pushed to Neon, `pnpm build` passes clean

**Note:** `auth_state` rows are deleted automatically on successful login (`stateStore.del` is called by the OAuth client after callback). Rows from abandoned logins (tab closed mid-flow) will linger but accumulate very slowly — cleanup deferred.

**Known gap:** `NodeOAuthClient` warns "No lock mechanism provided. Credentials might get revoked." A `requestLock` option exists to serialize concurrent token refreshes for the same session, preventing a race where two simultaneous requests both try to refresh an expired token and one invalidates the other. The correct fix in a serverless environment is a distributed lock (Postgres advisory locks or Redis) — not worth the complexity at current scale. Revisit if users report being randomly logged out.

---

## Phase 11: Write-Through + Feed and Bookmarks from DB

**Goal:** Write sketch and bookmark data to the DB on every mutation, then use the DB for feed and bookmark queries instead of direct PDS reads.

### DB schema additions

Add a `bookmarks` table to `schema.ts`:

```ts
export const bookmarks = pgTable("bookmarks", {
  uri: text("uri").primaryKey(), // bookmark record AT URI
  authorDid: text("author_did").notNull(), // who bookmarked it
  subjectUri: text("subject_uri").notNull(), // AT URI of the bookmarked sketch
  subjectCid: text("subject_cid").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
```

Index: `(author_did, subject_uri)` for bookmark state lookups.

### Write-through on publish

In `repl/+page.server.ts`, after the PDS write:

```ts
const ref = await publishSketch(agent, input);

await db
  .insert(sketches)
  .values({
    uri: ref.uri,
    cid: ref.cid,
    authorDid: session.did,
    title: input.title,
    code: input.code,
    description: input.description ?? null,
    tags: input.tags ?? null,
    previousVersion: input.previousVersion ?? null,
    rootVersion: input.rootVersion ?? null,
    createdAt: new Date(),
  })
  .onConflictDoUpdate({ target: sketches.uri, set: { cid: ref.cid } });
```

The `onConflictDoUpdate` handles republish (same URI, new CID).

### Write-through on bookmark/unbookmark

In `api/bookmark/+server.ts`, after the PDS write:

```ts
// POST — bookmark
const ref = await bookmarkSketch(session.did, {
  uri: subjectUri,
  cid: subjectCid,
});
await db.insert(bookmarks).values({
  uri: ref.uri,
  authorDid: session.did,
  subjectUri,
  subjectCid,
  createdAt: new Date(),
});

// DELETE — unbookmark
await unbookmarkSketch(session.did, bookmarkUri);
await db.delete(bookmarks).where(eq(bookmarks.uri, bookmarkUri));
```

### Feed from DB with bookmark state

Replace the `Promise.allSettled` fan-out in `feed/+page.server.ts` with a single joined query:

```ts
const followedDids = [session.did, ...follows.map((f) => f.subject)];

const rows = await db
  .select({ sketch: sketches, bookmarkUri: bookmarks.uri })
  .from(sketches)
  .leftJoin(
    bookmarks,
    and(
      eq(bookmarks.subjectUri, sketches.uri),
      eq(bookmarks.authorDid, session.did),
    ),
  )
  .where(inArray(sketches.authorDid, followedDids))
  .orderBy(desc(sketches.createdAt))
  .limit(50);
```

This replaces both the PDS fan-out and the separate `getBookmarks` call — bookmark state is resolved in the same query for exactly the sketches in the feed.

### Bookmarks page from DB

Replace `getBookmarkedSketches` (which fetches each sketch individually from PDS) with a DB join:

```ts
const rows = await db
  .select({ sketch: sketches, bookmarkUri: bookmarks.uri })
  .from(bookmarks)
  .innerJoin(sketches, eq(sketches.uri, bookmarks.subjectUri))
  .where(eq(bookmarks.authorDid, session.did))
  .orderBy(desc(bookmarks.createdAt))
  .limit(50);
```

### Cursor-based pagination

With the DB in place, pagination is straightforward. Pass the `createdAt` of the last item as a cursor:

```ts
.where(and(
  inArray(sketches.authorDid, followedDids),
  lt(sketches.createdAt, cursor)
))
```

### What to build

- [x] Add `bookmarks` table to `schema.ts`
- [x] Update `repl/+page.server.ts` publish action to insert into `sketches` after PDS write
- [x] Update `api/bookmark/+server.ts` to insert/delete from `bookmarks` after PDS write
- [x] Update `feed/+page.server.ts` to use joined DB query (replaces fan-out + `getBookmarks`)
- [x] Update `bookmarks/+page.server.ts` to use DB join instead of `getBookmarkedSketches`
- [x] Add cursor param to feed load function for "load more" support
- [x] Remove fan-out logic from `feed/+page.server.ts` (keep `listSketches` in `reads.ts` — still used by profile pages and backfill)

### Acceptance criteria

- [x] Publishing a sketch appears in the feed immediately
- [x] Feed is a single DB query — no PDS fan-out, no separate bookmark call
- [x] Bookmarking/unbookmarking writes to both PDS and DB
- [x] Bookmarks page queries DB — no per-sketch PDS calls
- [x] Cursor-based "load more" returns the next page in correct order
- [ ] Republishing updates the DB record (onConflict)

---

## Phase 12: Backfill

**Goal:** Populate the `sketches` and `bookmarks` tables with existing records created before the DB was introduced.

### Approach

A one-time server action (or admin endpoint) that:

1. Fetches all known DIDs (session user + all follows)
2. Calls `listSketches(did)` for each DID and `getBookmarks(session.did)` for the session user
3. Batch-inserts into `sketches` and `bookmarks` with `onConflictDoNothing` (idempotent — safe to run multiple times)

Since the current user base is 2–3 accounts with ~5 sketches total, this is a trivial operation. No pagination needed at this scale.

```ts
// One-time: POST /api/admin/backfill (protected by checking session.did === ADMIN_DID)
const dids = [session.did, ...follows.map((f) => f.subject)];
const results = await Promise.allSettled(dids.map((did) => listSketches(did)));
const cards = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
await db
  .insert(sketches)
  .values(cards.map(sketchCardToRow))
  .onConflictDoNothing();
```

### What to build

- [x] `POST /api/admin/backfill` — protected endpoint that runs the backfill
- [x] Run once after deploy, verify row count matches expected sketch count

### Acceptance criteria

- [x] All pre-DB sketches appear in the feed after backfill
- [x] Running the backfill a second time is a no-op (idempotent)

---

## Phase 13: Sketch Detail Page

**Goal:** A public `/sketch/[did]/[rkey]` page showing the full sketch — title, description, tags, author, code, and version chain.

**Data source:** PDS fetch via `getSketch(atUri)` + `getProfile(did)` — PDS is authoritative for `previousVersion`/`rootVersion`, which are null in the DB for backfilled rows. If the user is logged in, bookmark state is resolved from the DB.

**Version chain:** If `previousVersion` is set, fetch the parent sketch's title and show "Remixed from [title]" as a link to its detail page. Display only one level up (not the full chain).

### What to build

- [x] `/sketch/[did]/[rkey]/+page.server.ts` — load full sketch from PDS, author profile, bookmark state, and parent title if `previousVersion` is set
- [x] `/sketch/[did]/[rkey]/+page.svelte` — display title, description, tags, author, date, code in `<pre>`, "Remixed from" link
- [x] Update `sketch-card/index.svelte` — wrap title in `<a>` pointing to `/sketch/[authorDid]/[rkey]`

### Acceptance criteria

- [x] Page is accessible without login
- [x] Code renders in a `<pre>` tag
- [x] "Remixed from [title]" link appears when `previousVersion` is set, links to that sketch's detail page
- [x] Bookmark button visible and functional for logged-in users
- [x] Clicking the title in a sketch card navigates to the detail page

---

## Phase 14: Vercel Deployment

**Goal:** Deploy to Vercel with production environment variables and publish the `live.drome.bookmark` lexicon.

### What to build

- [x] Create Vercel project, link to repo
- [x] Set environment variables: `DATABASE_URL`, `ADMIN_DID`, `APP_URL`
- [x] Verify `pnpm build` passes with `adapter-vercel`
- [ ] Add `live.drome.bookmark` to DNS TXT record scope
- [ ] Run `goat lex publish lexicons/` to publish all lexicons
- [x] Run backfill against production DB

### Acceptance criteria

- [x] App is reachable at production URL
- [x] Login flow works end-to-end in production
- [ ] All five lexicons published: `goat lex status lexicons/` shows all in sync
- [x] Feed populates correctly after backfill

---

## Deferred

- **Tap + firehose indexer** — revisit if the app ever has users writing records outside this app (direct PDS writes, third-party clients)
- **Like/repost counts** — requires aggregation; straightforward to add once the DB is in place
- **Local IndexedDB authoring layer** — Cmd+S save, sketch list sidebar, fork provenance in REPL. See [`indexeddb-plan.md`](indexeddb-plan.md) for the full spec.
- **Login handle autocomplete** — combobox with Bluesky actor search (from old Phase 10)

---

## Implementation Order Summary

| Phase | What                         | Key output                                           |
| ----- | ---------------------------- | ---------------------------------------------------- |
| 1–7   | ✅ Done                      | Lexicons, write layer, feed, profiles, audio         |
| 8     | ✅ Bookmarks                 | `live.drome.bookmark`, bookmark button, `/bookmarks` |
| 9     | ✅ Serverless DB setup       | Neon + Drizzle schema, Vercel adapter, dep cleanup   |
| 10    | ✅ OAuth refactor            | DB-backed state/session stores                       |
| 11    | ✅ Write-through + feed from DB | Publish → DB insert, feed query replaces PDS fan-out |
| 12    | ✅ Backfill                  | One-time populate of existing sketches               |
| 13    | ✅ Sketch detail page        | `/sketch/[did]/[rkey]`, version chain, code display  |
| 14    | ✅ Vercel deployment         | Production deploy, lexicons published                |
