import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { db } from '.';
import { account, bookmarks, sketches } from './schema';
import type { SketchCard } from '$lib/server/atproto/reads';

const PAGE_SIZE = 50;

export type FeedPage = {
	sketches: SketchCard[];
	hasMore: boolean;
	nextCursor: string | null;
};

export async function queryFeed(
	sessionDid: string,
	followedDids: string[],
	cursor: Date | null
): Promise<FeedPage> {
	const whereClause = cursor
		? and(inArray(sketches.authorDid, followedDids), lt(sketches.createdAt, cursor))
		: inArray(sketches.authorDid, followedDids);

	const rows = await db
		.select({ sketch: sketches, bookmarkUri: bookmarks.uri, author: account })
		.from(sketches)
		.leftJoin(account, eq(account.did, sketches.authorDid))
		.leftJoin(
			bookmarks,
			and(eq(bookmarks.subjectUri, sketches.uri), eq(bookmarks.authorDid, sessionDid))
		)
		.where(whereClause)
		.orderBy(desc(sketches.createdAt))
		.limit(PAGE_SIZE + 1);

	const hasMore = rows.length > PAGE_SIZE;
	const page = rows.slice(0, PAGE_SIZE);
	const nextCursor = hasMore ? page[page.length - 1].sketch.createdAt.toISOString() : null;

	return {
		sketches: page.map((r) => ({
			...r.sketch,
			authorAvatar: r.author?.avatar,
			authorDisplayName: r.author?.displayName,
			authorHandle: r.author?.handle ?? r.sketch.authorDid,
			bookmarkUri: r.bookmarkUri,
			createdAt: r.sketch.createdAt.toISOString()
		})),
		hasMore,
		nextCursor
	};
}

export type Account = typeof account.$inferSelect;

export async function upsertAccount(data: typeof account.$inferInsert) {
	return db
		.insert(account)
		.values(data)
		.onConflictDoUpdate({
			target: account.did,
			set: {
				handle: data.handle,
				displayName: data.displayName,
				avatar: data.avatar
			}
		});
}

export async function getAccount(did: string): Promise<Account | null> {
	const row = await db.select().from(account).where(eq(account.did, did)).limit(1);
	return row[0] ?? null;
}
