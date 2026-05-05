import { error } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolveIdentifier, getProfile, listSketches, getFollows } from '$lib/server/atproto/reads';
import { followUser, unfollowUser } from '$lib/server/atproto/records';

export const load: PageServerLoad = async ({ params, locals }) => {
	let did: string;
	try {
		did = await resolveIdentifier(params.identifier);
	} catch {
		error(404, 'Profile not found');
	}

	const [profile, sketches] = await Promise.all([getProfile(did), listSketches(did)]);

	// Check if the logged-in user is following this profile
	let followUri: string | null = null;
	if (locals.session.did && locals.session.did !== did) {
		const follows = await getFollows(locals.session.did);
		followUri = follows.find((f) => f.subject === did)?.uri ?? null;
	}

	return {
		profile,
		sketches,
		isOwnProfile: locals.session.did === did,
		followUri
	};
};

export const actions: Actions = {
	follow: async ({ params, locals }) => {
		if (!locals.session.did) return fail(401, { error: 'Not logged in' });

		let did: string;
		try {
			did = await resolveIdentifier(params.identifier);
		} catch {
			return fail(404, { error: 'Profile not found' });
		}

		try {
			const result = await followUser(locals.session.did, did);
			return { followUri: result.uri };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to follow';
			return fail(500, { error: message });
		}
	},

	unfollow: async ({ request, locals }) => {
		if (!locals.session.did) return fail(401, { error: 'Not logged in' });

		const data = await request.formData();
		const followUri = data.get('followUri');
		if (typeof followUri !== 'string') return fail(400, { error: 'Missing followUri' });

		try {
			await unfollowUser(locals.session.did, followUri);
			return {};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to unfollow';
			return fail(500, { error: message });
		}
	}
};
