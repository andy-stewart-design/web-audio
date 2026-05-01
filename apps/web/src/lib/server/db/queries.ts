import { eq } from 'drizzle-orm';
import { db } from '.';
import { account } from './schema';

export type Account = typeof account.$inferSelect;

export async function upsertAccount(data: typeof account.$inferInsert) {
	return db
		.insert(account)
		.values(data)
		.onConflictDoUpdate({
			target: account.did,
			set: {
				handle: data.handle,
				displayName: data.displayName,
				avatar: data.avatar
			}
		});
}

export async function getAccount(did: string): Promise<Account | null> {
	const row = await db.select().from(account).where(eq(account.did, did)).limit(1);
	return row[0] ?? null;
}
