import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFollows } from '$lib/server/atproto/reads';
import { queryFeed } from '$lib/server/db/queries';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.session.did) error(401, 'Not logged in');

	const cursorParam = url.searchParams.get('cursor');
	const cursor = cursorParam ? new Date(cursorParam) : null;

	const follows = await getFollows(locals.session.did);
	const followedDids = [locals.session.did, ...follows.map((f) => f.subject)];

	return json(await queryFeed(locals.session.did, followedDids, cursor));
};
