import { getSession } from '$lib/server/auth/session';
import { getAccount } from '$lib/server/db/queries';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const session = await getSession(event.cookies);
	const account = session ? await getAccount(session.did) : null;

	if (session && account) {
		event.locals.did = session.did;
		event.locals.handle = account.handle;
		event.locals.displayName = account.displayName;
		event.locals.avatar = account.avatar;
	} else {
		event.locals.did = null;
		event.locals.handle = null;
		event.locals.displayName = null;
		event.locals.avatar = null;
	}

	return resolve(event);
};
