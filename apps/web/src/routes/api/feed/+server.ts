import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFollows } from '$lib/server/atproto/reads';
import { db } from '$lib/server/db';
import { sketches, bookmarks, account } from '$lib/server/db/schema';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';

const PAGE_SIZE = 50;

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.session.did) error(401, 'Not logged in');

	const cursorParam = url.searchParams.get('cursor');
	const cursor = cursorParam ? new Date(cursorParam) : null;

	const follows = await getFollows(locals.session.did);
	const followedDids = [locals.session.did, ...follows.map((f) => f.subject)];

	const whereClause = cursor
		? and(inArray(sketches.authorDid, followedDids), lt(sketches.createdAt, cursor))
		: inArray(sketches.authorDid, followedDids);

	const rows = await db
		.select({ sketch: sketches, bookmarkUri: bookmarks.uri, author: account })
		.from(sketches)
		.leftJoin(account, eq(account.did, sketches.authorDid))
		.leftJoin(
			bookmarks,
			and(eq(bookmarks.subjectUri, sketches.uri), eq(bookmarks.authorDid, locals.session.did))
		)
		.where(whereClause)
		.orderBy(desc(sketches.createdAt))
		.limit(PAGE_SIZE + 1);

	const hasMore = rows.length > PAGE_SIZE;
	const page = rows.slice(0, PAGE_SIZE);
	const nextCursor = hasMore ? page[page.length - 1].sketch.createdAt.toISOString() : null;

	return json({
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
	});
};
