import type { PageServerLoad } from './$types';
import { getFollows, listSketches, getBookmarks } from '$lib/server/atproto/reads';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session.did) return { sketches: [] };

	const [follows, bookmarks] = await Promise.all([
		getFollows(locals.session.did),
		getBookmarks(locals.session.did)
	]);

	const bookmarkMap = new Map(bookmarks.map((b) => [b.subject, b.uri]));
	const dids = [locals.session.did, ...follows.map((f) => f.subject)];

	const results = await Promise.allSettled(dids.map((did) => listSketches(did)));

	const sketches = results
		.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
		.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
		.slice(0, 50)
		.map((s) => ({ ...s, bookmarkUri: bookmarkMap.get(s.uri) ?? null }));

	return { sketches };
};
