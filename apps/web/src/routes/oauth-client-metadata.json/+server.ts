import { json } from '@sveltejs/kit';
import { getOAuthClient } from '$lib/server/auth/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const client = await getOAuthClient(url.origin);
	return json(client.clientMetadata);
};
