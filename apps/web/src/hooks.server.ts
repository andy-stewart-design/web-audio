import { getSession } from '$lib/server/auth/session';
import { getAccount } from '$lib/server/db/queries';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const session = await getSession(event.cookies);

	if (session) {
		const account = await getAccount(session.did);
		event.locals.did = session.did;
		event.locals.handle = account?.handle ?? null;
		event.locals.displayName = account?.displayName ?? null;
		event.locals.avatar = account?.avatar ?? null;
	} else {
		event.locals.did = null;
		event.locals.handle = null;
		event.locals.displayName = null;
		event.locals.avatar = null;
	}

	return resolve(event);
};
