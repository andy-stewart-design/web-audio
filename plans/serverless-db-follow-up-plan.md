# Plan: Serverless DB Follow-up

## Context

The Neon/Postgres and Vercel migration in `serverless-db-plan.md` is complete. This plan captures the remaining work discovered after that migration.

## 1. Publish the `live.drome.*` lexicons

### Current state

- The five local lexicons exist: `sketch`, `like`, `repost`, `follow`, and `bookmark`.
- `goat lex check-dns lexicons/` currently reports that `live.drome.*` does not resolve through DNS.
- `goat lex status lexicons/` reports all five local lexicons as out of sync.

### What to do

1. Identify the DID that owns the lexicon namespace:

   ```sh
   goat account whoami
   ```

2. Add this DNS TXT record for `drome.live`:

   ```text
   _lexicon.drome.live  TXT  "did=<owner-did>"
   ```

   DNS provider UIs commonly expect only `_lexicon.drome` as the record name when the zone is `drome.live`.

3. Wait for propagation and verify ownership:

   ```sh
   goat lex check-dns lexicons/
   ```

4. Publish all local lexicons:

   ```sh
   goat lex publish lexicons/
   ```

5. Confirm they are synchronized:

   ```sh
   goat lex status lexicons/
   ```

### Acceptance criteria

- [ ] `goat lex check-dns lexicons/` resolves `live.drome.*`.
- [ ] All five `live.drome.*` lexicons are published.
- [ ] `goat lex status lexicons/` reports all five as in sync.

## 2. Decide and implement republish semantics

### Current state

The publish action contains an `onConflictDoUpdate` for `sketches.uri`, but `publishSketch()` always creates a new TID/rkey and therefore a new AT URI. In ordinary use the conflict branch is unreachable.

The current product behavior is versioned publishing: a remix or later publish creates a new record and links it through `previousVersion` and `rootVersion`. That is distinct from updating an existing AT Protocol record in place.

### Decision

Choose one model:

1. **Versioned records only** (the current behavior): remove the misleading conflict update and document that every publish creates a new sketch version.
2. **In-place republishing:** add an explicit update path that writes to the existing record URI/rkey, then update every mutable DB column after the PDS write succeeds.

### Acceptance criteria

- [ ] The intended publish/republish model is documented.
- [ ] The database write matches that model.
- [ ] If in-place republishing is supported, a republish updates the PDS record and all relevant database fields (`cid`, title, code, description, tags, version metadata, and timestamp as appropriate).
- [ ] If versioned-only publishing is retained, no unreachable upsert behavior remains.
