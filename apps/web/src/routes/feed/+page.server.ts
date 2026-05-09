import type { PageServerLoad } from './$types';
import { getFollows } from '$lib/server/atproto/reads';
import { queryFeed } from '$lib/server/db/queries';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.session.did) return { sketches: [], hasMore: false, nextCursor: null };

	const cursorParam = url.searchParams.get('cursor');
	const cursor = cursorParam ? new Date(cursorParam) : null;

	const follows = await getFollows(locals.session.did);
	const followedDids = [locals.session.did, ...follows.map((f) => f.subject)];

	return queryFeed(locals.session.did, followedDids, cursor);
};
