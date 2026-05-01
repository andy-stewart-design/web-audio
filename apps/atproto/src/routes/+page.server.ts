import { getSession } from '$lib/server/auth/session';
import {
	getAccountStatus,
	getAccountHandle,
	getRecentStatuses,
	getTopStatuses
} from '$lib/server/db/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const session = await getSession(cookies);

	const [recentStatuses, topStatuses, accountStatus, accountHandle] = await Promise.all([
		getRecentStatuses(20),
		getTopStatuses(),
		session ? getAccountStatus(session.did) : null,
		session ? getAccountHandle(session.did) : null
	]);

	return {
		did: session?.did ?? null,
		accountHandle,
		currentStatus: accountStatus?.status ?? null,
		recentStatuses,
		topStatuses
	};
};
