# AT Protocol Auth Extraction Implementation Plan

## Context

This plan implements the internal AT Protocol auth facade described in `atproto-auth-extraction-prd.md`.

**Key design decisions:**

- Start as an internal `apps/web` server module.
- Keep current OAuth behavior intact.
- Keep `requestLocalLock` for now.
- Preserve the recent origin fix: restore/revoke/client operations must use the current request origin in dev.
- Do this before the DB-backed lock plan unless production urgently needs cross-process lock safety first.
- Keep app-specific record operations outside the auth module.

---

## Phase 1: Module Scaffold

### Step 1.1 — Create module directory

**Files:**

```txt
apps/web/src/lib/server/atproto-auth/
  index.ts
  config.ts
  client.ts
  stores.ts
  cookies.ts
  session.ts
  profile.ts
```

Create empty module files and decide which functions are public from `index.ts`.

**Acceptance criteria:**

- [ ] Directory exists
- [ ] `index.ts` exports the intended facade functions
- [ ] No behavior has changed yet

---

### Step 1.2 — Move constants/config

**From:** `apps/web/src/lib/server/auth/client.ts`  
**To:** `apps/web/src/lib/server/atproto-auth/config.ts`

Move:

- `SCOPE`
- `PRODUCTION_CLIENT_ID`
- cookie options if added during extraction

**Acceptance criteria:**

- [ ] OAuth scope remains unchanged
- [ ] Production client ID remains unchanged
- [ ] Existing imports compile

---

## Phase 2: Move OAuth Client Infrastructure

### Step 2.1 — Move state/session stores

**From:** `apps/web/src/lib/server/auth/client.ts`  
**To:** `apps/web/src/lib/server/atproto-auth/stores.ts`

Move the Drizzle-backed stores for:

- `authState`
- `authSession`

**Acceptance criteria:**

- [ ] Store behavior is unchanged
- [ ] Existing OAuth sessions remain readable
- [ ] No table or migration changes are introduced

---

### Step 2.2 — Move OAuth client construction

**From:** `apps/web/src/lib/server/auth/client.ts`  
**To:** `apps/web/src/lib/server/atproto-auth/client.ts`

Move `getOAuthClient(origin?: string)` and client cache behavior.

Keep:

```ts
requestLock: requestLocalLock
```

Keep production URL behavior:

```ts
const publicUrl = !dev && env.APP_URL ? env.APP_URL : origin;
```

**Acceptance criteria:**

- [ ] Dev loopback metadata still uses request origin
- [ ] Production still prefers `APP_URL`
- [ ] Clients are still cached by public URL/cache key
- [ ] `requestLocalLock` remains configured
- [ ] No `Token was not issued to this client` regression in dev-port scenarios

---

## Phase 3: Cookies and Session Facade

### Step 3.1 — Add cookie helpers

**File:** `apps/web/src/lib/server/atproto-auth/cookies.ts`

Centralize:

- read DID cookie
- set DID cookie
- delete DID cookie
- cookie name
- cookie options

Current cookie behavior to preserve:

```ts
cookies.set('did', session.did, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 7,
  path: '/'
});
```

**Acceptance criteria:**

- [ ] Cookie name remains `did`
- [ ] Cookie options remain equivalent
- [ ] Stale sessions delete the cookie at path `/`

---

### Step 3.2 — Move session restore

**From:** `apps/web/src/lib/server/auth/session.ts`  
**To:** `apps/web/src/lib/server/atproto-auth/session.ts`

Implement:

```ts
getSession(event)
```

It should:

1. Read DID from cookie.
2. Return `null` if absent.
3. Restore with `getOAuthClient(event.url.origin)`.
4. Delete the DID cookie and return `null` on restore failure.

**Acceptance criteria:**

- [ ] Restore uses `event.url.origin`
- [ ] Missing cookie returns `null`
- [ ] Restore failure deletes stale cookie
- [ ] Error logging remains useful

---

### Step 3.3 — Add Lex client helper

**File:** `apps/web/src/lib/server/atproto-auth/session.ts`

Implement:

```ts
getLexClient(sessionDid: string, origin: string)
```

It should restore the OAuth session with the origin-specific client and return an authenticated `@atproto/lex` `Client`.

**Acceptance criteria:**

- [ ] Existing record helpers can use `getLexClient`
- [ ] Restore uses the correct origin
- [ ] No app-specific record creation logic is moved into auth module

---

## Phase 4: Login, Callback, Logout Facade

### Step 4.1 — Add login URL helper

**File:** `apps/web/src/lib/server/atproto-auth/session.ts`

Implement:

```ts
getAuthorizationUrl(event, handle)
```

It should:

1. Get OAuth client for `event.url.origin`.
2. Call `authorize(handle, { scope: SCOPE })`.
3. Return the URL string.

**Acceptance criteria:**

- [ ] Login route no longer constructs OAuth client directly
- [ ] Scope remains unchanged
- [ ] Returned URL matches existing behavior

---

### Step 4.2 — Move profile/account hydration

**From:** `apps/web/src/routes/oauth/callback/+server.ts`  
**To:** `apps/web/src/lib/server/atproto-auth/profile.ts`

Move `fetchAndCacheProfile(did)` or equivalent.

**Acceptance criteria:**

- [ ] Callback still upserts account profile
- [ ] Failed profile fetch does not fail login
- [ ] App-specific DB write remains isolated to `profile.ts`

---

### Step 4.3 — Add callback handler

**File:** `apps/web/src/lib/server/atproto-auth/session.ts`

Implement:

```ts
handleCallback(event)
```

It should:

1. Get OAuth client for `event.url.origin`.
2. Call `client.callback(event.url.searchParams)`.
3. Set DID cookie.
4. Fetch/cache profile.
5. Return the session or DID if useful.

**Acceptance criteria:**

- [ ] Callback route becomes thin
- [ ] DID cookie is set correctly
- [ ] Profile/account cache still updates
- [ ] Errors still route to login failure behavior

---

### Step 4.4 — Add logout helper

**File:** `apps/web/src/lib/server/atproto-auth/session.ts`

Implement:

```ts
logout(event)
```

It should:

1. Read DID cookie.
2. If present, revoke with `getOAuthClient(event.url.origin)`.
3. Always delete the DID cookie in `finally`.

**Acceptance criteria:**

- [ ] Logout route no longer constructs OAuth client directly
- [ ] Revoke uses request origin
- [ ] Cookie is deleted even if revoke fails

---

## Phase 5: Update Call Sites

### Step 5.1 — Update hooks

**File:** `apps/web/src/hooks.server.ts`

Use facade `getSession(event)`.

**Acceptance criteria:**

- [ ] Locals shape remains unchanged
- [ ] Account lookup behavior remains unchanged unless intentionally folded into facade

---

### Step 5.2 — Update OAuth routes

**Files:**

- `apps/web/src/routes/oauth/login/+server.ts`
- `apps/web/src/routes/oauth/callback/+server.ts`
- `apps/web/src/routes/oauth/logout/+server.ts`

Replace direct auth plumbing with facade calls.

**Acceptance criteria:**

- [ ] Routes are thinner
- [ ] Response status/redirect behavior remains unchanged

---

### Step 5.3 — Update record helpers

**File:** `apps/web/src/lib/server/atproto/records.ts`

Use `getLexClient(sessionDid, origin)` from the auth module.

**Acceptance criteria:**

- [ ] Publish/bookmark/follow/unfollow still work
- [ ] Origin is still threaded from request handlers

---

### Step 5.4 — Remove old auth module or leave compatibility shim

**Files:**

- `apps/web/src/lib/server/auth/client.ts`
- `apps/web/src/lib/server/auth/session.ts`

Prefer removing these if no imports remain. If removal is too disruptive, leave temporary re-export shims.

**Acceptance criteria:**

- [ ] No stale direct OAuth helper imports remain outside the new module
- [ ] `grep` confirms `getOAuthClient()` is only used internally by `atproto-auth`

---

## Phase 6: Verification

Run:

```sh
pnpm check
```

Manual verification:

- [ ] Login works
- [ ] Callback redirects to `/`
- [ ] Account profile appears after login
- [ ] Session survives server restart
- [ ] Dev port mismatch does not reappear
- [ ] Logout works
- [ ] Publish/bookmark/follow/unfollow work
- [ ] OAuth lock warning remains gone
