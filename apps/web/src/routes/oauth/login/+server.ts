import { json, error } from '@sveltejs/kit';
import { getOAuthClient, SCOPE } from '$lib/server/auth/client';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { handle } = await request.json();

	if (!handle || typeof handle !== 'string') {
		error(400, 'Handle is required');
	}

	try {
		const client = await getOAuthClient();
		const authUrl = await client.authorize(handle, { scope: SCOPE });
		return json({ redirectUrl: authUrl.toString() });
	} catch (e) {
		error(500, e instanceof Error ? e.message : 'Login failed');
	}
};
