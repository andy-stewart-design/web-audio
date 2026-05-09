import { getSession } from '$lib/server/auth/session';
import { getAccount } from '$lib/server/db/queries';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const session = await getSession(event.cookies);
	const account = session ? await getAccount(session.did) : null;

	if (session && account) {
		event.locals.session = {
			did: session.did,
			handle: account.handle,
			displayName: account.displayName,
			avatar: account.avatar
		};
	} else {
		event.locals.session = { did: null, handle: null, displayName: null, avatar: null };
	}

	return resolve(event);
};
