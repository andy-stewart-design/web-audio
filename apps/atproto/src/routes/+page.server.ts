import { getSession } from '$lib/server/auth/session';
import { db } from '$lib/server/db';
import { status } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const session = await getSession(cookies);
	if (!session) return { did: null, currentStatus: null };

	const row = await db
		.select()
		.from(status)
		.where(eq(status.authorDid, session.did))
		.orderBy(desc(status.createdAt))
		.limit(1);

	return {
		did: session.did,
		currentStatus: row[0]?.status ?? null
	};
};
