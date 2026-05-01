import { getSession } from '$lib/server/auth/session';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const session = await getSession(event.cookies);
	event.locals.did = session?.did ?? null;
	return resolve(event);
};
