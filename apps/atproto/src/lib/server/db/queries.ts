import { eq, desc, and } from 'drizzle-orm';
import { getHandle } from '@atproto/common-web';
import type { AtUri } from '@atproto/syntax';
import { db } from '.';
import { account, status } from './schema';
import { getTap } from '$lib/server/tap';

// --- Status queries ---

export async function getAccountStatus(did: string) {
	const row = await db
		.select()
		.from(status)
		.where(and(eq(status.authorDid, did), eq(status.current, 1)))
		.limit(1);
	return row.at(0) ?? null;
}

export async function insertStatus(data: typeof status.$inferInsert) {
	await db
		.insert(status)
		.values(data)
		.onConflictDoUpdate({
			target: status.uri,
			set: {
				status: data.status,
				createdAt: data.createdAt,
				indexedAt: data.indexedAt
			}
		});
	await setCurrStatus(data.authorDid);
}

export async function deleteStatus(uri: AtUri) {
	await db.delete(status).where(eq(status.uri, uri.toString()));
	await setCurrStatus(uri.hostname);
}

// --- Account queries ---

export async function upsertAccount(data: typeof account.$inferInsert) {
	await db
		.insert(account)
		.values(data)
		.onConflictDoUpdate({
			target: account.did,
			set: { handle: data.handle, active: data.active }
		});
}

export async function deleteAccount(did: string) {
	await db.delete(account).where(eq(account.did, did));
	await db.delete(status).where(eq(status.authorDid, did));
}

// --- Feed queries ---

export async function getAccountHandle(did: string): Promise<string | null> {
	const row = await db
		.select({ handle: account.handle })
		.from(account)
		.where(eq(account.did, did))
		.limit(1);
	if (row[0]) return row[0].handle;

	try {
		const didDoc = await getTap().resolveDid(did);
		if (!didDoc) return null;
		return getHandle(didDoc) ?? null;
	} catch {
		return null;
	}
}

export async function getRecentStatuses(limit = 5) {
	return db
		.select()
		.from(status)
		.innerJoin(account, eq(status.authorDid, account.did))
		.orderBy(desc(status.createdAt))
		.limit(limit);
}

export async function getTopStatuses(limit = 10) {
	const { sql, count } = await import('drizzle-orm');
	return db
		.select({ status: status.status, count: count(status.uri) })
		.from(status)
		.where(eq(status.current, 1))
		.groupBy(status.status)
		.orderBy(desc(sql`count(${status.uri})`))
		.limit(limit);
}

// --- Helpers ---

async function setCurrStatus(did: string) {
	await db.update(status).set({ current: 0 }).where(eq(status.authorDid, did));

	const latest = await db
		.select({ uri: status.uri })
		.from(status)
		.where(eq(status.authorDid, did))
		.orderBy(desc(status.createdAt))
		.limit(1);

	if (latest[0]) {
		await db.update(status).set({ current: 1 }).where(eq(status.uri, latest[0].uri));
	}
}
