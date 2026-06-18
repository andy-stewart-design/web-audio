# AT Protocol Auth DB-backed Lock Implementation Plan

## Context

This plan implements the DB-backed OAuth lock described in `atproto-auth-db-lock-prd.md`.

**Key design decisions:**

- Implement after AT Protocol auth extraction unless production urgency requires otherwise.
- The lock lives inside the extracted auth module.
- The lock implements the AT Protocol OAuth client's `RuntimeLock` interface.
- Use a table-based lock with owner tokens and TTL recovery.
- Do not change the public auth facade API.
- Do not change route handlers or app-domain record helpers.

---

## Phase 1: Schema and Migration

### Step 1.1 — Add `authLock` schema

**File:** `apps/web/src/lib/server/db/schema.ts`

Add:

```ts
export const authLock = pgTable('auth_lock', {
  name: text('name').primaryKey(),
  owner: text('owner').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
```

**Acceptance criteria:**

- [ ] Schema exports `authLock`
- [ ] Existing auth tables are unchanged
- [ ] TypeScript compiles

---

### Step 1.2 — Generate migration

Run:

```sh
pnpm --filter web db:generate
```

Review the generated migration.

**Acceptance criteria:**

- [ ] Migration creates `auth_lock`
- [ ] `name` is the primary key
- [ ] `owner` is non-null
- [ ] `expires_at` is non-null
- [ ] Migration does not modify unrelated tables

---

## Phase 2: Lock Helper

### Step 2.1 — Create lock module

**File:** `apps/web/src/lib/server/atproto-auth/lock.ts`

Create constants:

```ts
const LOCK_TTL_MS = 30_000;
const MAX_WAIT_MS = 10_000;
const MIN_RETRY_DELAY_MS = 25;
const MAX_RETRY_DELAY_MS = 100;
```

Create helpers:

```ts
function createOwnerId()
function sleep(ms: number)
function retryDelay()
```

**Acceptance criteria:**

- [ ] Module exists in extracted auth module
- [ ] No route imports this module directly
- [ ] Owner IDs are unique enough for concurrent requests

---

### Step 2.2 — Implement atomic acquisition

**File:** `apps/web/src/lib/server/atproto-auth/lock.ts`

Implement an internal function:

```ts
async function tryAcquireLock(name: string, owner: string, expiresAt: Date): Promise<boolean>
```

Behavior:

1. Try to insert `{ name, owner, expiresAt }`.
2. If insert succeeds, return `true`.
3. If conflict occurs, update the row only when existing `expiresAt < now()`.
4. Return `true` only if insert/update affected a row.
5. Otherwise return `false`.

**Acceptance criteria:**

- [ ] Only one contender can acquire an unexpired lock
- [ ] Expired locks can be taken over
- [ ] Acquisition updates owner and expiration together
- [ ] No unsafe read-then-write race

---

### Step 2.3 — Implement owner-safe release

**File:** `apps/web/src/lib/server/atproto-auth/lock.ts`

Implement:

```ts
async function releaseLock(name: string, owner: string): Promise<void>
```

Delete only when both `name` and `owner` match.

**Acceptance criteria:**

- [ ] A request cannot delete a lock it no longer owns
- [ ] Release is safe after timeout/takeover
- [ ] Release failure does not mask the result of `fn()` unless it is truly fatal

---

### Step 2.4 — Implement `requestDbLock`

**File:** `apps/web/src/lib/server/atproto-auth/lock.ts`

Implement:

```ts
export async function requestDbLock<T>(name: string, fn: () => Promise<T> | T): Promise<T>
```

Behavior:

1. Generate owner ID.
2. Retry acquisition until success or `MAX_WAIT_MS` elapses.
3. On success, execute `fn()`.
4. Release lock in `finally`.
5. Throw a clear timeout error if lock cannot be acquired.

**Acceptance criteria:**

- [ ] Implements `RuntimeLock` shape
- [ ] Runs `fn()` exactly once after acquisition
- [ ] Always attempts release after acquisition
- [ ] Timeout error includes the lock name
- [ ] Retry loop includes jitter

---

## Phase 3: OAuth Client Integration

### Step 3.1 — Replace local lock

**File:** `apps/web/src/lib/server/atproto-auth/client.ts`

Replace:

```ts
import { requestLocalLock } from '@atproto/oauth-client';
```

with:

```ts
import { requestDbLock } from './lock';
```

Replace:

```ts
requestLock: requestLocalLock
```

with:

```ts
requestLock: requestDbLock
```

in both OAuth client constructors.

**Acceptance criteria:**

- [ ] OAuth client uses DB-backed lock
- [ ] `requestLocalLock` import is removed
- [ ] Client construction behavior is otherwise unchanged

---

### Step 3.2 — Reconsider dependency

If `@atproto/oauth-client` is only used for `requestLocalLock`, remove the direct dependency from `apps/web/package.json` with an uninstall command.

```sh
pnpm --filter web remove @atproto/oauth-client
```

Only do this if no imports remain.

**Acceptance criteria:**

- [ ] No unused dependency remains
- [ ] Lockfile is updated via pnpm

---

## Phase 4: Verification

### Step 4.1 — Static checks

Run:

```sh
pnpm check
```

**Acceptance criteria:**

- [ ] TypeScript/Svelte checks pass
- [ ] No lint/type errors from Drizzle expressions

---

### Step 4.2 — Migration verification

Apply migration to the intended database environment before deploy.

Depending on workflow, run the appropriate command, for example:

```sh
pnpm --filter web db:migrate
```

or use the deployment migration process.

**Acceptance criteria:**

- [ ] `auth_lock` exists in target database
- [ ] App can start against migrated DB

---

### Step 4.3 — Manual concurrency verification

Create or use a logged-in account with an OAuth session near/after access-token expiry.

Trigger multiple authenticated requests concurrently, such as page load plus API requests, or a small script that calls an authenticated endpoint several times in parallel.

**Acceptance criteria:**

- [ ] Only one request holds a given lock at a time
- [ ] Other requests wait rather than refreshing concurrently
- [ ] No refresh-token rotation/revocation errors appear
- [ ] Lock row is removed after completion

---

### Step 4.4 — Expired lock verification

Manually insert or leave an expired lock row:

```txt
name = some test lock name
owner = stale-owner
expires_at = timestamp in the past
```

Then run a lock acquisition for the same name.

**Acceptance criteria:**

- [ ] Expired lock is taken over
- [ ] Owner changes to the new owner
- [ ] Lock releases cleanly afterward

---

## Phase 5: Cleanup and Documentation

### Step 5.1 — Update notes/comments

Document in the lock module:

- why this lock exists
- why owner-safe release is necessary
- why TTL exists
- why timeout fails closed

**Acceptance criteria:**

- [ ] Future readers understand the OAuth refresh-token race
- [ ] Constants are easy to tune

---

### Step 5.2 — Remove obsolete temporary notes

If any comments or docs still describe `requestLocalLock` as the active production lock, update them.

**Acceptance criteria:**

- [ ] Documentation reflects DB-backed lock as active implementation
- [ ] No stale references to the temporary lock remain except in historical context
