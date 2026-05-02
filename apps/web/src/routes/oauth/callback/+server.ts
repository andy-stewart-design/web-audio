import { redirect } from '@sveltejs/kit';
import { getOAuthClient } from '$lib/server/auth/client';
import { upsertAccount } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	try {
		const client = await getOAuthClient();
		const { session } = await client.callback(url.searchParams);

		cookies.set('did', session.did, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 7,
			path: '/'
		});

		await fetchAndCacheProfile(session.did);

		redirect(302, '/');
	} catch (e) {
		console.error('OAuth callback error:', e);
		redirect(302, '/?error=login_failed');
	}
};

async function fetchAndCacheProfile(did: string) {
	const res = await fetch(
		`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`
	);
	if (!res.ok) return;

	const profile = await res.json();

	await upsertAccount({
		did,
		handle: profile.handle,
		displayName: profile.displayName ?? null,
		avatar: profile.avatar ?? null
	});
}
