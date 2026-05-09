import type { PageServerLoad } from './$types';
import { getFollows } from '$lib/server/atproto/reads';
import { db } from '$lib/server/db';
import { sketches, bookmarks, account } from '$lib/server/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session.did) return { sketches: [] };

	const follows = await getFollows(locals.session.did);
	const followedDids = [locals.session.did, ...follows.map((f) => f.subject)];

	const rows = await db
		.select({ sketch: sketches, bookmarkUri: bookmarks.uri, author: account })
		.from(sketches)
		.leftJoin(account, eq(account.did, sketches.authorDid))
		.leftJoin(
			bookmarks,
			and(eq(bookmarks.subjectUri, sketches.uri), eq(bookmarks.authorDid, locals.session.did))
		)
		.where(inArray(sketches.authorDid, followedDids))
		.orderBy(desc(sketches.createdAt))
		.limit(50);

	return {
		sketches: rows.map((r) => ({
			...r.sketch,
			authorAvatar: r.author?.avatar,
			authorDisplayName: r.author?.displayName,
			authorHandle: r.author?.handle ?? r.sketch.authorDid,
			bookmarkUri: r.bookmarkUri,
			createdAt: r.sketch.createdAt.toISOString()
		}))
	};
};
