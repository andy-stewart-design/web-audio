import type { PageServerLoad } from './$types';
import { getFollows, listSketches } from '$lib/server/atproto/reads';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session.did) return { sketches: [] };

	const follows = await getFollows(locals.session.did);
	const dids = [locals.session.did, ...follows.map((f) => f.subject)];

	const results = await Promise.allSettled(dids.map((did) => listSketches(did)));

	const sketches = results
		.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
		.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
		.slice(0, 50);

	return { sketches };
};
