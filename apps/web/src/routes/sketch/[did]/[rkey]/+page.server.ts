import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSketch, getProfile } from '$lib/server/atproto/reads';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
	const atUri = `at://${params.did}/live.drome.sketch/${params.rkey}`;

	const [sketch, profile] = await Promise.all([
		getSketch(atUri).catch(() => null),
		getProfile(params.did).catch(() => null)
	]);

	if (!sketch || !profile) error(404, 'Sketch not found');

	// Bookmark state from DB
	let bookmarkUri: string | null = null;
	if (locals.session.did) {
		const row = await db
			.select({ uri: bookmarks.uri })
			.from(bookmarks)
			.where(and(eq(bookmarks.subjectUri, atUri), eq(bookmarks.authorDid, locals.session.did)))
			.limit(1);
		bookmarkUri = row[0]?.uri ?? null;
	}

	// Parent sketch title for "Remixed from" display
	let remixedFrom: { uri: string; title: string } | null = null;
	if (sketch.previousVersion) {
		const parent = await getSketch(sketch.previousVersion).catch(() => null);
		if (parent) remixedFrom = { uri: sketch.previousVersion, title: parent.title };
	}

	return { sketch, profile, bookmarkUri, remixedFrom };
};
