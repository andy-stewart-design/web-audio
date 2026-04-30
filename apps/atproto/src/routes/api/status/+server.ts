import { json, error } from '@sveltejs/kit';
import { Client, type DatetimeString } from '@atproto/lex';
import { getSession } from '$lib/server/auth/session';
import { getOAuthClient } from '$lib/server/auth/client';
import * as xyz from '$lexicons/xyz';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const session = await getSession(cookies);
	if (!session) error(401, 'Unauthorized');

	const { status } = await request.json();
	if (!status || typeof status !== 'string') error(400, 'Status is required');

	const client = await getOAuthClient();
	const oauthSession = await client.restore(session.did);
	const lexClient = new Client(oauthSession);

	const res = await lexClient.create(xyz.statusphere.status, {
		status,
		createdAt: new Date().toISOString() as DatetimeString
	});

	return json({ success: true, uri: res.uri });
};
