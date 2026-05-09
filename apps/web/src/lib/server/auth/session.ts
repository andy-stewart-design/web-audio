import type { Cookies } from '@sveltejs/kit';
import { getOAuthClient } from './client';

export async function getSession(cookies: Cookies) {
	const did = getDid(cookies);
	if (!did) return null;

	try {
		const client = await getOAuthClient();
		return await client.restore(did);
	} catch (e) {
		console.error('Failed to restore OAuth session:', e);
		cookies.delete('did', { path: '/' });
		return null;
	}
}

export function getDid(cookies: Cookies) {
	return cookies.get('did') ?? null;
}
