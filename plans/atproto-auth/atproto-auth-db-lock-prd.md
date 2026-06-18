# AT Protocol Auth DB-backed Lock PRD

## Overview

Replace the temporary `requestLocalLock` OAuth refresh lock with a database-backed lock that works across processes, serverless invocations, and horizontally scaled app instances.

The lock should implement the AT Protocol OAuth client's `RuntimeLock` interface and become an internal detail of the extracted AT Protocol auth module.

## Goals

- Prevent concurrent OAuth token refresh races across all app instances
- Avoid refresh-token rotation conflicts that can revoke or invalidate credentials
- Work in serverless and multi-instance production environments
- Use the same database infrastructure as the existing OAuth session/state stores
- Recover safely from crashed processes through lock expiration
- Keep lock behavior invisible to routes and app-domain modules
- Replace `requestLocalLock` without changing the auth facade API

## Non-goals

- Do not change the OAuth login/callback flow
- Do not change cookie behavior
- Do not change the saved OAuth session format
- Do not introduce Redis or another new infrastructure dependency
- Do not implement this before auth extraction unless production urgency requires it
- Do not use an in-memory lock for production correctness

---

## Background

The AT Protocol OAuth client can refresh credentials during session restore. Refresh tokens are sensitive to concurrent use because refresh-token rotation may invalidate the old refresh token after the first successful refresh.

Without a cross-request lock, this race can happen:

1. Two requests restore the same session at the same time.
2. Both see an expired access token.
3. Request A refreshes successfully and stores a new refresh token.
4. Request B attempts to refresh with the old token.
5. The OAuth server rejects or revokes credentials.

`requestLocalLock` prevents this only within a single Node.js process. It does not protect separate serverless invocations or multiple deployed instances.

---

## Required Interface

The OAuth client expects a `RuntimeLock`:

```ts
type RuntimeLock = <T>(name: string, fn: () => Awaitable<T>) => Awaitable<T>;
```

The DB-backed implementation should provide:

```ts
requestDbLock<T>(name: string, fn: () => Promise<T> | T): Promise<T>
```

The OAuth client remains configured the same way:

```ts
requestLock: requestDbLock
```

---

## Proposed Storage

Add a database table for auth locks:

```ts
export const authLock = pgTable('auth_lock', {
  name: text('name').primaryKey(),
  owner: text('owner').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
```

## Lock Semantics

A lock is identified by `name`, supplied by the OAuth client.

Each acquisition attempt generates a unique `owner` token.

Acquisition should:

1. Insert the lock row if it does not exist.
2. If it exists but is expired, atomically take it over with the new owner and new expiration.
3. If it exists and is not expired, wait and retry.
4. Fail with a clear timeout error if not acquired within the max wait period.

Release should:

1. Run in a `finally` block.
2. Delete the row only if both `name` and `owner` match.
3. Never delete another request's lock after expiration/takeover.

## TTL and Retry Policy

Initial defaults:

- lock TTL: 30 seconds
- retry delay: 25-100ms with jitter
- max wait: 5-10 seconds

If the lock cannot be acquired before timeout, OAuth work should fail rather than risk concurrent refresh-token rotation.

---

## Sequencing

Implement this after `atproto-auth-extraction-prd.md` / `atproto-auth-extraction-plan.md`.

The extraction centralizes auth client construction, so the DB-backed lock can be introduced by replacing one internal implementation detail:

```ts
requestLock: requestLocalLock
```

with:

```ts
requestLock: requestDbLock
```

Only reverse this order if production needs cross-process/serverless lock safety immediately.

---

## Acceptance Criteria

- `auth_lock` table exists via Drizzle schema and migration
- `requestDbLock` implements the OAuth `RuntimeLock` contract
- Lock acquisition is atomic
- Expired locks can be safely taken over
- Lock release is owner-safe
- Timed-out acquisition throws a clear error
- OAuth client uses `requestDbLock` instead of `requestLocalLock`
- Routes and app-domain modules do not change
- `pnpm check` passes
- Migration is applied before deployment

---

## Operational Notes

- Lock rows should normally be short-lived and absent after successful requests.
- Expired rows may remain after crashes and should be recoverable by takeover.
- Table-based locks are preferred here over Postgres advisory locks because they are easy to inspect, work with serverless DB access patterns, and support TTL-based recovery.
