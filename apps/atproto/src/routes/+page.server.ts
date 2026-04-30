import { getSession } from '$lib/server/auth/session';
import { getAccountStatus } from '$lib/server/db/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const session = await getSession(cookies);
	if (!session) return { did: null, currentStatus: null };

	const accountStatus = await getAccountStatus(session.did);

	return {
		did: session.did,
		currentStatus: accountStatus?.status ?? null
	};
};
