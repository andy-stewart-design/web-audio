import { NodeOAuthClient, buildAtprotoLoopbackClientMetadata } from '@atproto/oauth-client-node';
import type { NodeSavedSession, NodeSavedState } from '@atproto/oauth-client-node';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { authState, authSession } from '$lib/server/db/schema';

export const SCOPE = 'atproto repo:live.drome.sketch repo:live.drome.like repo:live.drome.repost';

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
				const row = db.select().from(authState).where(eq(authState.key, key)).limit(1).all();
				return row[0] ? JSON.parse(row[0].value) : undefined;
			},
			async set(key: string, value: NodeSavedState) {
				const json = JSON.stringify(value);
				db.insert(authState)
					.values({ key, value: json })
					.onConflictDoUpdate({ target: authState.key, set: { value: json } })
					.run();
			},
			async del(key: string) {
				db.delete(authState).where(eq(authState.key, key)).run();
			}
		},

		sessionStore: {
			async get(key: string) {
				const row = db.select().from(authSession).where(eq(authSession.key, key)).limit(1).all();
				return row[0] ? JSON.parse(row[0].value) : undefined;
			},
			async set(key: string, value: NodeSavedSession) {
				const json = JSON.stringify(value);
				db.insert(authSession)
					.values({ key, value: json })
					.onConflictDoUpdate({ target: authSession.key, set: { value: json } })
					.run();
			},
			async del(key: string) {
				db.delete(authSession).where(eq(authSession.key, key)).run();
			}
		}
	});

	return client;
}
