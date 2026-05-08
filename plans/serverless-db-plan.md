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

- [ ] `lexicons/live/drome/bookmark.json`
- [ ] Regenerate TypeScript types (`pnpm --filter web lex:build`)
- [ ] Update OAuth scope in `client.ts`: add `repo:live.drome.bookmark`
- [ ] Add `bookmarkSketch(sessionDid, subjectUri, subjectCid)` and `unbookmarkSketch(sessionDid, bookmarkUri)` to `records.ts`
- [ ] Add `getBookmarks(did)` to `reads.ts` — fetches `live.drome.bookmark` records from PDS, returns `{ uri, subject, subjectCid }[]`
- [ ] Bookmark action + unaction in `/profile/[identifier]/+page.server.ts` (or a new `/api/bookmark` route — whichever is cleaner given how follow is wired)
- [ ] Wire the bookmark button in `sketch-card/index.svelte` to the action, with optimistic active state (same pattern as follow/unfollow)
- [ ] `/bookmarks` page — lists the logged-in user's bookmarked sketches (fetch bookmark records, then batch-fetch the sketches by URI)

### Acceptance criteria

- [ ] Logged-in users can bookmark/unbookmark any sketch
- [ ] Bookmark button shows active state when bookmarked
- [ ] `/bookmarks` page shows all bookmarked sketches, reverse-chronological
- [ ] Unauthenticated users see the button disabled

---

## Phase 9: Serverless DB Setup

**Goal:** Set up Neon + Drizzle, define the schema, wire up the Neon driver, and swap the deployment adapter.

### Dependency changes

**Remove:**
- `@sveltejs/adapter-node`

**Add:**
- `@neondatabase/serverless` — Neon's HTTP-based driver (works in Vercel edge/serverless)
- `@sveltejs/adapter-vercel`

### DB schema (Drizzle)

```ts
// src/lib/server/db/schema.ts

export const sketches = pgTable('sketches', {
  uri:             text('uri').primaryKey(),
  cid:             text('cid').notNull(),
  authorDid:       text('author_did').notNull(),
  title:           text('title').notNull(),
  code:            text('code').notNull(),
  description:     text('description'),
  tags:            text('tags').array(),
  previousVersion: text('previous_version'),
  rootVersion:     text('root_version'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull(),
});

export const oauthState = pgTable('oauth_state', {
  key:       text('key').primaryKey(),
  value:     jsonb('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const oauthSessions = pgTable('oauth_sessions', {
  key:       text('key').primaryKey(),
  value:     jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Indexes: `author_did` + `created_at` on `sketches` for feed query performance.

### Drizzle config

Update `drizzle.config.ts` to use Neon's connection string from `DATABASE_URL` env var.

### What to build

- [ ] Remove unused deps, add Neon driver + Vercel adapter
- [ ] `src/lib/server/db/schema.ts` with the three tables above
- [ ] `src/lib/server/db/index.ts` — exports a `db` client using `@neondatabase/serverless` + Drizzle
- [ ] Update `drizzle.config.ts` to point at `DATABASE_URL`
- [ ] Run `pnpm db:push` against the Neon dev branch to create tables
- [ ] Swap `@sveltejs/adapter-node` → `@sveltejs/adapter-vercel` in `svelte.config.js`
- [ ] Add `.env` entries: `DATABASE_URL`, `PUBLIC_URL` (Vercel sets this automatically in prod)

### Acceptance criteria

- [ ] `pnpm db:push` creates tables in Neon without errors
- [ ] `db` client importable from `$lib/server/db`
- [ ] `svelte-check` passes with 0 errors
- [ ] `pnpm build` succeeds with Vercel adapter

---

## Phase 10: OAuth Refactor (DB-backed Sessions)

**Goal:** Replace the in-memory/file-based OAuth state and session stores with DB-backed implementations, making the app compatible with serverless deployment.

### Problem

`@atproto/oauth-client-node` defaults to in-memory stores for OAuth state (the code/PKCE verifier during the handshake) and sessions (access/refresh tokens after login). Serverless functions have no shared memory between invocations, so these are lost on cold starts.

### Solution

Implement the `StateStore` and `SessionStore` interfaces from `@atproto/oauth-client-node` using the `oauth_state` and `oauth_sessions` tables. No change to the OAuth flow itself — just swap the storage backend.

```ts
// src/lib/server/auth/state-store.ts
export class DbStateStore implements StateStore {
  async set(key: string, state: NodeSavedState): Promise<void> {
    await db.insert(oauthState).values({ key, value: state, expiresAt: ... }).onConflictDoUpdate(...)
  }
  async get(key: string): Promise<NodeSavedState | undefined> { ... }
  async del(key: string): Promise<void> { ... }
}

// src/lib/server/auth/session-store.ts
export class DbSessionStore implements SessionStore {
  async set(key: string, session: NodeSavedSession): Promise<void> { ... }
  async get(key: string): Promise<NodeSavedSession | undefined> { ... }
  async del(key: string): Promise<void> { ... }
}
```

Pass these to the `OAuthClient` constructor in `client.ts`.

### Dependency changes

**Remove:**
- `better-sqlite3` — replaced by DB-backed stores
- `@types/better-sqlite3`

### What to build

- [ ] `src/lib/server/auth/state-store.ts` — `DbStateStore` implementing `StateStore`
- [ ] `src/lib/server/auth/session-store.ts` — `DbSessionStore` implementing `SessionStore`
- [ ] Update `src/lib/server/auth/client.ts` to pass both stores to `OAuthClient`
- [ ] Remove `better-sqlite3` and `@types/better-sqlite3`
- [ ] Add a cron/cleanup job (or in-request cleanup) to delete expired `oauth_state` rows

### Acceptance criteria

- [ ] Login flow completes successfully when deployed to Vercel (no shared memory between invocations)
- [ ] Sessions persist across cold starts
- [ ] OAuth state rows are cleaned up after use (not left indefinitely)

---

## Phase 11: Write-Through on Publish + Feed from DB

**Goal:** Write sketch metadata to the DB on publish, then use the DB for the feed instead of direct PDS fan-out reads.

### Write-through

In the `?/publish` action in `repl/+page.server.ts`, after the AT Protocol write succeeds, insert into the `sketches` table:

```ts
const ref = await publishSketch(agent, input);

await db.insert(sketches).values({
  uri:             ref.uri,
  cid:             ref.cid,
  authorDid:       session.did,
  title:           input.title,
  code:            input.code,
  description:     input.description ?? null,
  tags:            input.tags ?? null,
  previousVersion: input.previousVersion ?? null,
  rootVersion:     input.rootVersion ?? null,
  createdAt:       new Date(),
}).onConflictDoUpdate({ target: sketches.uri, set: { cid: ref.cid } });
```

The `onConflictDoUpdate` handles republish (same URI, new CID).

### Feed from DB

Replace the `Promise.allSettled` fan-out in `feed/+page.server.ts` with a single query:

```ts
const followedDids = [session.did, ...follows.map(f => f.subject)];

const rows = await db
  .select()
  .from(sketches)
  .where(inArray(sketches.authorDid, followedDids))
  .orderBy(desc(sketches.createdAt))
  .limit(50);
```

### Cursor-based pagination

With the DB in place, pagination is straightforward. When the client wants more, pass the `createdAt` of the last item as a cursor:

```ts
.where(and(
  inArray(sketches.authorDid, followedDids),
  lt(sketches.createdAt, cursor)
))
```

### What to build

- [ ] Update `repl/+page.server.ts` publish action to insert into `sketches` after PDS write
- [ ] Update `feed/+page.server.ts` to query `sketches` table instead of fan-out reads
- [ ] Add cursor param to feed load function for "load more" support
- [ ] Remove fan-out logic from `feed/+page.server.ts` (keep `listSketches` in `reads.ts` — still used by profile pages and backfill)

### Acceptance criteria

- [ ] Publishing a sketch appears in the feed immediately (DB write is synchronous with the publish action)
- [ ] Feed is a single DB query — no PDS fan-out on load
- [ ] Cursor-based "load more" returns the next page in correct order
- [ ] Republishing updates the DB record (onConflict)

---

## Phase 12: Backfill

**Goal:** Populate the `sketches` table with existing records published before the DB was introduced.

### Approach

A one-time server action (or admin endpoint) that:

1. Fetches all known DIDs (session user + all follows)
2. Calls `listSketches(did)` for each (the existing read function, which hits PDS directly)
3. Batch-inserts into `sketches` with `onConflictDoNothing` (idempotent — safe to run multiple times)

Since the current user base is 2–3 accounts with ~5 sketches total, this is a trivial operation. No pagination needed at this scale.

```ts
// One-time: POST /api/admin/backfill (protected by checking session.did === ADMIN_DID)
const dids = [session.did, ...follows.map(f => f.subject)];
const results = await Promise.allSettled(dids.map(did => listSketches(did)));
const cards = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
await db.insert(sketches).values(cards.map(sketchCardToRow)).onConflictDoNothing();
```

### What to build

- [ ] `POST /api/admin/backfill` — protected endpoint that runs the backfill
- [ ] Run once after deploy, verify row count matches expected sketch count

### Acceptance criteria

- [ ] All pre-DB sketches appear in the feed after backfill
- [ ] Running the backfill a second time is a no-op (idempotent)

---

## Phase 13: Vercel Deployment

**Goal:** Deploy to Vercel with production environment variables and publish the `live.drome.bookmark` lexicon.

### What to build

- [ ] Create Vercel project, link to repo
- [ ] Set environment variables: `DATABASE_URL`, `ATPROTO_CLIENT_ID`, `ATPROTO_CLIENT_SECRET`, etc.
- [ ] Verify `pnpm build` passes with `adapter-vercel`
- [ ] Add `live.drome.bookmark` to DNS TXT record scope
- [ ] Run `goat lex publish lexicons/` to publish all lexicons
- [ ] Run backfill against production DB

### Acceptance criteria

- [ ] App is reachable at production URL
- [ ] Login flow works end-to-end in production
- [ ] All five lexicons published: `goat lex status lexicons/` shows all in sync
- [ ] Feed populates correctly after backfill

---

## Deferred

- **Tap + firehose indexer** — revisit if the app ever has users writing records outside this app (direct PDS writes, third-party clients)
- **Like/repost counts** — requires aggregation; straightforward to add once the DB is in place
- **Local IndexedDB authoring layer** — Cmd+S save, sketch list sidebar, fork provenance in REPL (from old Phase 9)
- **Login handle autocomplete** — combobox with Bluesky actor search (from old Phase 10)

---

## Implementation Order Summary

| Phase | What                             | Key output                                              |
| ----- | -------------------------------- | ------------------------------------------------------- |
| 1–7   | ✅ Done                          | Lexicons, write layer, feed, profiles, audio            |
| 8     | Bookmarks                        | `live.drome.bookmark`, bookmark button, `/bookmarks`    |
| 9     | Serverless DB setup              | Neon + Drizzle schema, Vercel adapter, dep cleanup      |
| 10    | OAuth refactor                   | DB-backed state/session stores                          |
| 11    | Write-through + feed from DB     | Publish → DB insert, feed query replaces PDS fan-out    |
| 12    | Backfill                         | One-time populate of existing sketches                  |
| 13    | Vercel deployment                | Production deploy, lexicons published                   |
