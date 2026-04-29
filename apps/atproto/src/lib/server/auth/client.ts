import { NodeOAuthClient, buildAtprotoLoopbackClientMetadata } from '@atproto/oauth-client-node';
import type { NodeSavedSession, NodeSavedState } from '@atproto/oauth-client-node';
import { db } from '$lib/server/db';
import { authState, authSession } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const SCOPE = 'atproto';

let client: NodeOAuthClient | null = null;

export async function getOAuthClient(): Promise<NodeOAuthClient> {
	if (client) return client;

	client = new NodeOAuthClient({
		clientMetadata: buildAtprotoLoopbackClientMetadata({
			scope: SCOPE,
			redirect_uris: ['http://127.0.0.1:3000/oauth/callback']
		}),

		stateStore: {
			async get(key: string) {
				const row = await db
					.select()
					.from(authState)
					.where(eq(authState.key, key))
					.limit(1);
				return row[0] ? JSON.parse(row[0].value) : undefined;
			},
			async set(key: string, value: NodeSavedState) {
				const json = JSON.stringify(value);
				await db
					.insert(authState)
					.values({ key, value: json })
					.onConflictDoUpdate({ target: authState.key, set: { value: json } });
			},
			async del(key: string) {
				await db.delete(authState).where(eq(authState.key, key));
			}
		},

		sessionStore: {
			async get(key: string) {
				const row = await db
					.select()
					.from(authSession)
					.where(eq(authSession.key, key))
					.limit(1);
				return row[0] ? JSON.parse(row[0].value) : undefined;
			},
			async set(key: string, value: NodeSavedSession) {
				const json = JSON.stringify(value);
				await db
					.insert(authSession)
					.values({ key, value: json })
					.onConflictDoUpdate({ target: authSession.key, set: { value: json } });
			},
			async del(key: string) {
				await db.delete(authSession).where(eq(authSession.key, key));
			}
		}
	});

	return client;
}
