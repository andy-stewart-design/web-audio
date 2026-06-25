import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { sketches, bookmarks, account } from '$lib/server/db/schema';
import { toSketchCard } from '$lib/server/sketch-mappers';
import { desc, eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session.did) redirect(302, '/');

	const rows = await db
		.select({ sketch: sketches, bookmarkUri: bookmarks.uri, author: account })
		.from(bookmarks)
		.innerJoin(sketches, eq(sketches.uri, bookmarks.subjectUri))
		.leftJoin(account, eq(account.did, sketches.authorDid))
		.where(eq(bookmarks.authorDid, locals.session.did))
		.orderBy(desc(bookmarks.createdAt))
		.limit(50);

	return {
		sketches: rows.map(toSketchCard)
	};
};
