import { json } from '@sveltejs/kit';
import { getOAuthClient } from '$lib/server/auth/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const client = await getOAuthClient();
	return json(client.clientMetadata);
};
