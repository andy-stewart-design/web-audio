# AT Protocol Auth Extraction PRD

## Overview

Extract the web app's AT Protocol OAuth/auth plumbing behind a small server-side facade. The extraction should reduce route-level complexity, centralize auth behavior, and make future auth infrastructure changes, especially the DB-backed lock, easier to implement safely.

This begins as an internal `apps/web` module, not a reusable workspace package. The module can be promoted later if the API stabilizes or another app needs the same auth flow.

## Goals

- Hide AT Protocol OAuth client construction from routes and app-domain modules
- Centralize dev/prod client metadata behavior, including origin-sensitive loopback clients in dev
- Centralize OAuth state/session stores
- Centralize DID cookie handling
- Centralize session restore, stale-session cleanup, callback handling, logout, and revoke
- Provide one place to configure token refresh locking
- Expose a small interface for authenticated AT Protocol client access
- Preserve current behavior and recent fixes for dev-port/client-origin mismatches
- Keep app-specific record operations separate from auth mechanics

## Non-goals

- Do not create a standalone package in the first pass
- Do not redesign the OAuth flow
- Do not change login UX
- Do not change database schema as part of the extraction
- Do not implement the DB-backed lock in this feature; that is covered by `atproto-auth-db-lock-prd.md` and `atproto-auth-db-lock-plan.md`
- Do not hide app-domain record behavior such as publishing sketches, bookmarks, follows, or custom lexicon record creation

---

## Current Problem

Auth complexity is currently spread across:

- `apps/web/src/lib/server/auth/client.ts`
- `apps/web/src/lib/server/auth/session.ts`
- `apps/web/src/hooks.server.ts`
- `apps/web/src/routes/oauth/login/+server.ts`
- `apps/web/src/routes/oauth/callback/+server.ts`
- `apps/web/src/routes/oauth/logout/+server.ts`
- `apps/web/src/lib/server/atproto/records.ts`

As a result, routes and domain modules need to know too much about:

- `NodeOAuthClient`
- loopback metadata
- production client metadata
- origin-specific dev clients
- session restore details
- token refresh locks
- cookie names/options
- profile caching after login
- constructing authenticated AT Protocol `Client` instances

This makes auth behavior harder to reason about and increases the chance of regressions like restoring a dev session with the wrong OAuth client origin.

---

## Proposed Abstraction

Create an internal module:

```txt
apps/web/src/lib/server/atproto-auth/
```

The rest of the app should interact with this module through a small facade.

## Public API

Initial function-based API:

```ts
getSession(event)
getAuthorizationUrl(event, handle)
handleCallback(event)
logout(event)
getLexClient(sessionDid, origin)
```

Expected usage:

```ts
const session = await atprotoAuth.getSession(event);
const redirectUrl = await atprotoAuth.getAuthorizationUrl(event, handle);
await atprotoAuth.handleCallback(event);
await atprotoAuth.logout(event);
const client = await atprotoAuth.getLexClient(sessionDid, event.url.origin);
```

## Responsibilities

The auth module owns:

- OAuth scope
- production client ID
- client metadata construction
- per-origin client caching
- state/session stores
- DID cookie read/write/delete
- callback processing
- session restore
- session revoke/logout
- `requestLock` configuration
- authenticated Lex client construction
- profile/account hydration hook after successful login

The app/domain layer owns:

- `event.locals.session` shape
- database account model
- custom record creation/deletion
- Drome lexicon-specific operations
- route redirects/responses

---

## Target Route Shape

### Hook

```ts
const session = await atprotoAuth.getSession(event);

event.locals.session = session
  ? session
  : { did: null, handle: null, displayName: null, avatar: null };
```

### Login

```ts
const redirectUrl = await atprotoAuth.getAuthorizationUrl(event, handle);
return json({ redirectUrl });
```

### Callback

```ts
await atprotoAuth.handleCallback(event);
redirect(302, '/');
```

### Logout

```ts
await atprotoAuth.logout(event);
return json({ success: true });
```

### Record writes

```ts
const client = await atprotoAuth.getLexClient(sessionDid, origin);
```

---

## Sequencing

This extraction should happen before the DB-backed lock feature.

`requestLocalLock` is already in place as a temporary single-process fix. Extracting auth first lets the later DB-backed lock become an internal implementation detail of the auth module instead of adding more lock-related code to the currently scattered structure and moving it afterward.

Only reverse this order if production deployment urgently requires cross-process/serverless refresh-token safety before extraction can happen.

---

## Acceptance Criteria

- Routes no longer import `NodeOAuthClient` helpers directly
- OAuth login still redirects correctly
- OAuth callback still sets the DID cookie
- Callback still fetches/caches the user's profile/account
- Session restore still works after server restart
- Dev-port/client-origin mismatch does not regress
- Logout still revokes using the correct origin-specific client
- Record writes can still obtain an authenticated AT Protocol `Client`
- `requestLocalLock` remains configured
- `pnpm check` passes

---

## Future Package Extraction

Consider promoting this to `packages/atproto-auth` only after:

- another app needs the same auth flow
- the facade API stabilizes
- the DB-backed lock is implemented and stable
- storage/profile behavior is adapter-based
- tests exist around cookie, store, lock, and restore behavior
