# Sketch Type Simplification Plan

## Goal

Simplify the sketch data model in `apps/web` by reducing the number of near-duplicate sketch shapes, moving type definitions to clearer ownership boundaries, and replacing repeated ad hoc object mapping with explicit mappers.

The desired end state is:

- The app has a small, intentional set of sketch-related types.
- ATProto reads return normalized app/domain data, not UI-specific card data.
- UI components consume stable view models with predictable `null` values instead of `null | undefined` unions.
- DB row serialization and card construction happen through shared mapper functions.
- Route load functions focus on fetching/composition, not repetitive presentation shaping.
- The generated lexicon record remains the network source of truth but is not confused with app-level sketch types.

## Current Problems

### Type proliferation

Sketch-like shapes currently exist in several places:

- `apps/web/src/lib/lexicons/live/drome/sketch.defs.ts`
  - Generated `Main` lexicon type.
- `apps/web/src/lib/server/atproto/reads.ts`
  - `SketchRecord`
  - `SketchCard`
- `apps/web/src/lib/server/atproto/records.ts`
  - Imports lexicon `Main` as `SketchRecord`, which conflicts conceptually with `reads.ts`'s `SketchRecord`.
  - Defines `PublishInput` from that alias.
- `apps/web/src/lib/globals/sketch-workspace.svelte.ts`
  - `LoadedSketch`
  - `DraftSketch`
  - local `DraftSource`
- Route-local sketch references such as:
  - `remixedFrom: { uri: string; title: string; href: string } | null`

### Repeated mapping

DB rows are converted into card-shaped objects manually in multiple places:

- `apps/web/src/lib/server/db/queries.ts`
- `apps/web/src/routes/bookmarks/+page.server.ts`

These mappings are structurally the same and can drift over time.

### Boundary leakage

The app currently mixes boundary conventions:

- ATProto optional values are `undefined`.
- DB nullable values are `null`.
- UI card types often accept both: `string | null | undefined`.

This causes noisier types and pushes normalization responsibility into components.

### UI model in ATProto module

`SketchCard` lives in `server/atproto/reads.ts`, but it is really a UI/list view model used by feed, bookmarks, profile, and `components/sketch-card/index.svelte`.

### View model used for persistence/backfill

`listSketches()` returns `SketchCard`, then admin backfill uses those cards to insert DB rows. Because cards do not include all persisted sketch fields, backfill currently writes:

```ts
previousVersion: null,
rootVersion: null
```

This is a signal that the view model is being used where a fuller domain model should exist.

## Target Model

Keep the generated lexicon type, but introduce app-owned sketch types with clear responsibilities.

### Generated network type

Source:

```ts
apps / web / src / lib / lexicons / live / drome / sketch.defs.ts;
```

Usage convention:

```ts
import type { Main as SketchLexiconRecord } from "$lib/lexicons/live/drome/sketch";
```

Do not alias this as `SketchRecord`.

### Shared app/domain types

Create:

```txt
apps/web/src/lib/types/sketch.ts
```

Suggested contents:

```ts
export type Sketch = {
  uri: string;
  cid: string;
  authorDid: string;
  title: string;
  code: string;
  description: string | null;
  tags: string[] | null;
  previousVersion: string | null;
  rootVersion: string | null;
  createdAt: string;
};

export type SketchCard = Sketch & {
  authorHandle: string;
  authorDisplayName: string | null;
  authorAvatar: string | null;
  bookmarkUri: string | null;
};

export type PlayableSketch = {
  uri: string | null;
  title: string;
  code: string;
};

export type DraftSketch = {
  uri: string | null;
  title: string;
  code: string;
  description: string;
  tags: string;
  rootVersion: string | null;
  previousVersion: string | null;
};

export type DraftSketchSource = PlayableSketch & {
  description: string | null;
  tags: string[] | null;
  rootVersion: string | null;
  previousVersion: string | null;
};
```

Do not import server-only modules such as DB schema from this shared type file, because it will be imported by Svelte components.

### Server-only DB helpers

Create either:

```txt
apps/web/src/lib/server/sketches.ts
```

or:

```txt
apps/web/src/lib/server/db/sketches.ts
```

This module can safely import the DB schema and should own DB row serialization/card mapping.

## Phase 1: Add shared sketch types

### Implementation

1. Create `apps/web/src/lib/types/sketch.ts`.
2. Add the app/domain types listed in the target model.
3. Keep this file free of server-only imports.
4. Do not change call sites yet unless TypeScript requires it.

### Success Criteria

- `src/lib/types/sketch.ts` exists.
- The shared types include at least:
  - `Sketch`
  - `SketchCard`
  - `PlayableSketch`
  - `DraftSketch`
  - `DraftSketchSource`
- The shared type file does not import from `src/lib/server/*`.
- The project still type-checks.

## Phase 2: Rename conflicting lexicon/app sketch record concepts

### Implementation

In `apps/web/src/lib/server/atproto/records.ts`:

1. Change the lexicon import alias from:

```ts
import {
  main as sketchMain,
  type Main as SketchRecord,
} from "$lib/lexicons/live/drome/sketch";
```

to:

```ts
import {
  main as sketchMain,
  type Main as SketchLexiconRecord,
} from "$lib/lexicons/live/drome/sketch";
```

2. Update `PublishInput` accordingly:

```ts
export type PublishInput = WithStringUris<
  Omit<SketchLexiconRecord, "$type" | "createdAt">
>;
```

In `apps/web/src/lib/server/atproto/reads.ts`:

3. Remove or rename the local `SketchRecord` concept to align with the new shared `Sketch` type.
4. Prefer returning `Sketch` from `getSketch()` rather than another local record type.

### Success Criteria

- There is no import alias `type Main as SketchRecord` for the lexicon sketch record.
- No module has two plausible meanings for `SketchRecord`.
- `publishSketch()` still accepts the same practical input shape.
- `getSketch()` returns the shared app-level `Sketch` type or a deliberately named type from `src/lib/types/sketch.ts`.
- The project type-checks.

## Phase 3: Normalize ATProto read output to app/domain `Sketch`

### Implementation

In `apps/web/src/lib/server/atproto/reads.ts`:

1. Import `Sketch` and `SketchCard` from `$lib/types/sketch` as needed.
2. Change `getSketch(atUri)` to return `Promise<Sketch>`.
3. Parse the DID from the AT URI and include it as `authorDid`.
4. Normalize optional values from the lexicon to app-level `null`:

```ts
description: v.description ?? null,
tags: v.tags ?? null,
previousVersion: v.previousVersion ?? null,
rootVersion: v.rootVersion ?? null,
```

5. Update `listSketches(did, limit)` so it returns a domain-oriented type, preferably `Promise<Sketch[]>`, not `Promise<SketchCard[]>`.
6. Preserve profile fetching behavior only if needed by the immediate call sites. If `listSketches()` no longer returns cards, avoid fetching profile inside it.

Potential target for `listSketches()`:

```ts
export async function listSketches(did: string, limit = 50): Promise<Sketch[]> {
  // fetch records from PDS
  // parse each sketch
  // return normalized Sketch[]
}
```

### Success Criteria

- `getSketch()` returns a normalized app `Sketch` with `null` for missing optional fields.
- `listSketches()` no longer returns fake card data with `bookmarkUri: null`.
- `listSketches()` includes `previousVersion` and `rootVersion` when present.
- Admin backfill can preserve version-chain fields from remote records.
- No UI component imports `SketchCard` from `server/atproto/reads.ts`.
- The project type-checks.

## Phase 4: Add server-side sketch mappers

### Implementation

Create a server-only mapper module, for example:

```txt
apps/web/src/lib/server/sketches.ts
```

Add DB type aliases:

```ts
import { account, sketches } from "$lib/server/db/schema";

export type DbSketch = typeof sketches.$inferSelect;
export type NewDbSketch = typeof sketches.$inferInsert;
export type DbAccount = typeof account.$inferSelect;
```

Add a DB row to card mapper:

```ts
export function toSketchCard(row: {
  sketch: DbSketch;
  author: DbAccount | null;
  bookmarkUri: string | null;
}): SketchCard {
  return {
    uri: row.sketch.uri,
    cid: row.sketch.cid,
    authorDid: row.sketch.authorDid,
    authorHandle: row.author?.handle ?? row.sketch.authorDid,
    authorDisplayName: row.author?.displayName ?? null,
    authorAvatar: row.author?.avatar ?? null,
    title: row.sketch.title,
    code: row.sketch.code,
    description: row.sketch.description ?? null,
    tags: row.sketch.tags ?? null,
    previousVersion: row.sketch.previousVersion ?? null,
    rootVersion: row.sketch.rootVersion ?? null,
    bookmarkUri: row.bookmarkUri,
    createdAt: row.sketch.createdAt.toISOString(),
  };
}
```

Optionally add a domain sketch to DB insert mapper:

```ts
export function toSketchInsert(sketch: Sketch): NewDbSketch {
  return {
    uri: sketch.uri,
    cid: sketch.cid,
    authorDid: sketch.authorDid,
    title: sketch.title,
    code: sketch.code,
    description: sketch.description,
    tags: sketch.tags,
    previousVersion: sketch.previousVersion,
    rootVersion: sketch.rootVersion,
    createdAt: new Date(sketch.createdAt),
  };
}
```

### Success Criteria

- DB row to `SketchCard` mapping exists in exactly one shared server helper.
- The mapper normalizes all nullable fields to app-facing `null`.
- Feed and bookmarks can use the same mapper.
- Mapper module is server-only and is not imported by client components.
- The project type-checks.

## Phase 5: Replace repeated DB-to-card mappings

### Implementation

In `apps/web/src/lib/server/db/queries.ts`:

1. Import `toSketchCard`.
2. Import `SketchCard` from `$lib/types/sketch` instead of from ATProto reads.
3. Change `FeedPage` to:

```ts
export type FeedPage = {
  sketches: SketchCard[];
  hasMore: boolean;
  nextCursor: string | null;
};
```

4. Replace inline `page.map(...)` with:

```ts
sketches: page.map(toSketchCard);
```

In `apps/web/src/routes/bookmarks/+page.server.ts`:

5. Replace the inline `rows.map(...)` with the same mapper.

### Success Criteria

- `lib/server/db/queries.ts` no longer hand-builds `SketchCard` inline.
- `routes/bookmarks/+page.server.ts` no longer hand-builds `SketchCard` inline.
- Feed and bookmarks produce identical normalized card shapes.
- `SketchCard.createdAt` is always an ISO string.
- Optional display fields in card data are `null`, not `undefined`.
- The project type-checks.

## Phase 6: Update UI component imports and names

### Implementation

In `apps/web/src/components/sketch-card/index.svelte`:

1. Replace:

```ts
import type { SketchCard } from "@/lib/server/atproto/reads";
```

with:

```ts
import type { SketchCard } from "@/lib/types/sketch";
```

2. Update props:

```ts
let { sketch }: { sketch: SketchCard } = $props();
```

In `apps/web/src/routes/feed/+page.svelte`:

3. Replace the imported `SketchCard` type from server ATProto reads with `SketchCard` from the shared type module.

4. Update local state names:

```ts
let extraSketches = $state<SketchCard[]>([]);
const allSketches = $derived([...(data.sketches as SketchCard[]), ...extraSketches]);
```

### Success Criteria

- Client/Svelte files do not import sketch UI types from `server/atproto/reads.ts`.
- `components/sketch-card/index.svelte` consumes `SketchCard` from the shared type module.
- Feed infinite loading state uses `SketchCard[]`.
- The app behavior is unchanged.
- The project type-checks.

## Phase 7: Refactor profile sketch loading away from fake card data

### Implementation

Current flow:

```ts
listSketches(did) -> SketchCard[] with bookmarkUri: null
profile page patches bookmarkUri afterward
```

Target flow:

```ts
listSketches(did) -> Sketch[]
profile page combines Sketch[] + Profile + bookmark map -> SketchCard[]
```

In `apps/web/src/routes/profile/[identifier]/+page.server.ts`:

1. Get `profile` and `sketches` as today.
2. Build the bookmark map as today.
3. Convert each `Sketch` into `SketchCard` by adding:

```ts
authorHandle: profile.handle,
authorDisplayName: profile.displayName,
authorAvatar: profile.avatar,
bookmarkUri: bookmarkMap.get(s.uri) ?? null,
```

This can be a small helper in `server/sketches.ts`, for example:

```ts
export function toAuthorSketchCard(input: {
	sketch: Sketch;
	profile: Profile;
	bookmarkUri: string | null;
}): SketchCard { ... }
```

### Success Criteria

- `listSketches()` no longer returns card-shaped data just to satisfy profile page rendering.
- Profile page returns `SketchCard[]` to the Svelte page.
- Bookmark state is still correct on profile cards.
- Author labels/avatars are still correct.
- `previousVersion` and `rootVersion` remain available in the underlying sketch data if needed later.
- The project type-checks.

## Phase 8: Fix admin backfill to use domain sketches

### Implementation

In `apps/web/src/routes/api/admin/backfill/+server.ts`:

1. Use the new `listSketches()` return type, `Sketch[]`.
2. Insert sketches using `toSketchInsert()` or an equivalent shared mapper.
3. Preserve version metadata:

```ts
previousVersion: s.previousVersion,
rootVersion: s.rootVersion,
```

rather than forcing them to `null`.

4. Keep `onConflictDoNothing()` behavior unless there is a separate decision to update existing backfilled rows.

### Success Criteria

- Backfill no longer depends on `SketchCard`.
- Backfill preserves `previousVersion` and `rootVersion` from ATProto records.
- Backfill insert mapping is centralized or uses the same conventions as other DB sketch writes.
- Running backfill remains idempotent.
- The project type-checks.

## Phase 9: Simplify sketch workspace types

### Implementation

In `apps/web/src/lib/globals/sketch-workspace.svelte.ts`:

1. Replace local `LoadedSketch` with shared `PlayableSketch`.
2. Replace local `DraftSketch` with shared `DraftSketch`.
3. Replace local `DraftSource` with shared `DraftSketchSource`, if possible.

Potential import:

```ts
import type {
  DraftSketch,
  DraftSketchSource,
  PlayableSketch,
} from "$lib/types/sketch";
```

4. Update `apps/web/src/lib/globals/index.ts` to re-export the new shared type names if external imports expect them.
5. Consider whether backwards-compatible aliases are useful during the transition:

```ts
export type LoadedSketch = PlayableSketch;
```

Use aliases only if they reduce migration risk; remove them later if unnecessary.

### Success Criteria

- `sketch-workspace.svelte.ts` no longer owns unique definitions of general sketch types.
- The workspace still owns behavior/state, not app-wide type definitions.
- REPL draft behavior is unchanged.
- Running a sketch, loading a sketch, remixing, and publishing still work.
- The project type-checks.

## Phase 10: Simplify sketch detail page data shaping

### Implementation

In `apps/web/src/routes/sketch/[did]/[rkey]/+page.server.ts`:

1. Since `getSketch()` now returns `Sketch`, use `sketch.uri` instead of separately carrying `atUri` where possible.
2. Keep `remixedFrom` as a route-local inline type unless the same shape is needed in multiple places. A specific name such as `RemixedFromSketch` is preferable to a generic reference/link type if this gets extracted later.
3. Consider moving presentation-only values out of server load:

Current server-generated values:

```ts
(formattedDate, authorPrimaryLabel, authorSecondaryLabel);
```

Preferred approach:

- Return raw `sketch`, `profile`, `bookmarkUri`, and `remixedFrom`.
- Compute date and author labels in `+page.svelte`, matching the pattern used by `components/sketch-card/index.svelte`.

4. Keep `href` generation for `remixedFrom` server-side only if it avoids duplicated AT URI parsing. If extracted, create a small helper such as `atUriToSketchHref(uri)`.

### Success Criteria

- The detail page uses `sketch.uri` consistently instead of carrying duplicate `atUri` state unless there is a clear reason.
- Route-local structural types remain local unless there is repeated usage that justifies extraction.
- Presentation formatting is either consistently client-side or extracted into shared helpers.
- Detail page behavior is unchanged:
  - public access works
  - bookmark works
  - Remix link works
  - parent/remix link works
  - playback works
- The project type-checks.

## Phase 11: Optional bookmark helper extraction

This phase is optional for the sketch type cleanup, but it addresses repeated code discovered during the same investigation.

### Implementation

Create:

```txt
apps/web/src/lib/server/bookmarks.ts
```

Potential helpers:

```ts
export async function getBookmarkUri(authorDid: string, subjectUri: string) { ... }
export async function getBookmarkMap(authorDid: string) { ... }
```

Consider extracting the repeated bookmark button behavior into a component:

```txt
apps/web/src/components/bookmark-button/index.svelte
```

Props:

```ts
{
  subjectUri: string;
  subjectCid: string;
  bookmarkUri: string | null;
}
```

Use it from both:

- `components/sketch-card/index.svelte`
- `routes/sketch/[did]/[rkey]/+page.svelte`

### Success Criteria

- Bookmark lookup logic is not repeatedly written in route load functions.
- Bookmark POST/DELETE client behavior is not duplicated across card and detail page.
- Bookmark UI behavior remains unchanged.
- This phase does not introduce new sketch types.
- The project type-checks.

## Phase 12: Cleanup and verification

### Implementation

1. Search for old type names/imports:

```sh
rg "SketchRecord|SketchCard|LoadedSketch|DraftSketch|DraftSource" apps/web/src
```

2. Remove obsolete type exports from `server/atproto/reads.ts`.
3. Ensure all imports of card data use:

```ts
$lib / types / sketch;
```

or the `@/lib/types/sketch` alias in Svelte files.

4. Ensure server-only DB types are not imported into client components.
5. Run project checks.

### Success Criteria

- No stale imports of `SketchCard` from `server/atproto/reads.ts` remain.
- `SketchRecord` is not used ambiguously.
- `LoadedSketch`/`DraftSketch` either no longer exist or are explicit compatibility aliases to shared types.
- The app has one primary domain sketch type and one primary card view model.
- No client file imports from `$lib/server/*` solely to get sketch types.
- `pnpm --filter web check` passes.
- `pnpm --filter web lint` passes, or any failures are documented if unrelated.

## End-to-End Acceptance Scenarios

### Scenario 1: Feed cards still render and play

1. Open `/feed` while logged in.
2. Confirm sketches render as cards.
3. Click `Play` on a card.
4. Confirm playback starts.
5. Confirm bookmark button still works.
6. Confirm Remix link still opens `/repl?load=<uri>`.

### Scenario 2: Profile cards still render with bookmark state

1. Open a profile page.
2. Confirm profile sketches render as cards.
3. Confirm author label/avatar are correct.
4. Confirm bookmark active state is correct for bookmarked sketches.
5. Toggle bookmark and confirm UI updates after invalidation.

### Scenario 3: Bookmarks page still renders from DB

1. Open `/bookmarks` while logged in.
2. Confirm bookmarked sketches render.
3. Confirm dates are formatted correctly.
4. Confirm unbookmarking removes or deactivates the card after invalidation.

### Scenario 4: Sketch detail page still works

1. Open `/sketch/[did]/[rkey]` directly without login.
2. Confirm title, description, tags, author, date, and code render.
3. If the sketch has `previousVersion`, confirm `Remixed from` link works.
4. Log in and confirm bookmark button works.
5. Confirm Play and Remix work.

### Scenario 5: REPL load/remix still works

1. Click Remix from a card or detail page.
2. Confirm REPL opens with the correct code/title/version metadata.
3. Publish a remix.
4. Confirm `previousVersion` and `rootVersion` are sent correctly.
5. Confirm the newly published sketch is inserted into DB and appears in feed/profile.

### Scenario 6: Backfill preserves version metadata

1. Run admin backfill in a safe environment.
2. Inspect rows for sketches known to have `previousVersion` or `rootVersion`.
3. Confirm those DB columns are populated when the ATProto records contain values.
4. Run backfill again and confirm it remains idempotent.

## Implementation Order Summary

| Phase | What                         | Key output                                                |
| ----- | ---------------------------- | --------------------------------------------------------- |
| 1     | Shared sketch types          | `src/lib/types/sketch.ts`                                 |
| 2     | Rename conflicting records   | No ambiguous `SketchRecord`                               |
| 3     | Normalize ATProto reads      | `getSketch()` / `listSketches()` return `Sketch`          |
| 4     | Server mappers               | Shared DB/card conversion helpers                         |
| 5     | Replace repeated DB mappings | Feed/bookmarks use mapper                                 |
| 6     | Update UI imports            | Components use shared `SketchCard`                        |
| 7     | Refactor profile cards       | Profile composes `SketchCard` from `Sketch` + profile     |
| 8     | Fix backfill                 | Version metadata preserved                                |
| 9     | Workspace type cleanup       | Shared `PlayableSketch` / `DraftSketch`                   |
| 10    | Detail page cleanup          | Less duplicate page shaping                               |
| 11    | Optional bookmark cleanup    | Shared bookmark helpers/component                         |
| 12    | Verification                 | Old types removed, checks pass                            |

## Notes / Open Decisions

- Decide whether `SketchCard` should extend full `Sketch` or only include fields needed by cards. Extending `Sketch` is simpler and keeps version metadata available, but cards do not currently render version data.
- Decide whether `listSketches()` should continue fetching profile data. The cleaner model is for it not to; profile/card enrichment should happen outside the ATProto read function.
- Decide whether to keep compatibility aliases for `LoadedSketch` and `DraftSketch` during migration. They may reduce churn but should not become permanent names if the goal is simplification.
- Consider a future helper for AT URI parsing/link generation, since sketch detail links currently parse AT URIs manually in more than one conceptual place.
