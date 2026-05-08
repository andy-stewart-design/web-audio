import { NodeOAuthClient, buildAtprotoLoopbackClientMetadata } from '@atproto/oauth-client-node';
import type { NodeSavedSession, NodeSavedState } from '@atproto/oauth-client-node';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { authState, authSession } from '$lib/server/db/schema';

export const SCOPE =
	'atproto repo:live.drome.sketch repo:live.drome.like repo:live.drome.repost repo:live.drome.follow repo:live.drome.bookmark';

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
				const rows = await db.select().from(authState).where(eq(authState.key, key)).limit(1);
				return rows[0] ? (rows[0].value as NodeSavedState) : undefined;
			},
			async set(key: string, value: NodeSavedState) {
				const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min TTL
				await db
					.insert(authState)
					.values({ key, value, expiresAt })
					.onConflictDoUpdate({ target: authState.key, set: { value, expiresAt } });
			},
			async del(key: string) {
				await db.delete(authState).where(eq(authState.key, key));
			}
		},

		sessionStore: {
			async get(key: string) {
				const rows = await db.select().from(authSession).where(eq(authSession.key, key)).limit(1);
				return rows[0] ? (rows[0].value as NodeSavedSession) : undefined;
			},
			async set(key: string, value: NodeSavedSession) {
				await db
					.insert(authSession)
					.values({ key, value })
					.onConflictDoUpdate({ target: authSession.key, set: { value } });
			},
			async del(key: string) {
				await db.delete(authSession).where(eq(authSession.key, key));
			}
		}
	});

	return client;
}
