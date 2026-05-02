import { redirect } from '@sveltejs/kit';
import { getOAuthClient } from '$lib/server/auth/client';
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

		redirect(302, '/');
	} catch (e) {
		console.error('OAuth callback error:', e);
		redirect(302, '/?error=login_failed');
	}
};
