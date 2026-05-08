import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBookmarkedSketches } from '$lib/server/atproto/reads';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session.did) redirect(302, '/');

	const sketches = await getBookmarkedSketches(locals.session.did);
	return { sketches };
};
