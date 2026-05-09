import { NodeOAuthClient, buildAtprotoLoopbackClientMetadata } from '@atproto/oauth-client-node';
import type { NodeSavedSession, NodeSavedState } from '@atproto/oauth-client-node';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { authState, authSession } from '$lib/server/db/schema';
import { env } from '$env/dynamic/private';

export const SCOPE =
	'atproto repo:live.drome.sketch repo:live.drome.like repo:live.drome.repost repo:live.drome.follow repo:live.drome.bookmark';

const PRODUCTION_CLIENT_ID = 'https://drome-at.vercel.app/client-metadata.json';

let client: NodeOAuthClient | null = null;

const stateStore = {
	async get(key: string) {
		const rows = await db.select().from(authState).where(eq(authState.key, key)).limit(1);
		return rows[0] ? (rows[0].value as NodeSavedState) : undefined;
	},
	async set(key: string, value: NodeSavedState) {
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
		await db
			.insert(authState)
			.values({ key, value, expiresAt })
			.onConflictDoUpdate({ target: authState.key, set: { value, expiresAt } });
	},
	async del(key: string) {
		await db.delete(authState).where(eq(authState.key, key));
	}
};

const sessionStore = {
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
};

export async function getOAuthClient(): Promise<NodeOAuthClient> {
	if (client) return client;

	const publicUrl = env.APP_URL;

	if (publicUrl) {
		client = new NodeOAuthClient({
			clientMetadata: {
				client_id: PRODUCTION_CLIENT_ID,
				client_name: 'Drome',
				client_uri: publicUrl,
				redirect_uris: [`${publicUrl}/oauth/callback`],
				scope: SCOPE,
				grant_types: ['authorization_code', 'refresh_token'],
				response_types: ['code'],
				token_endpoint_auth_method: 'none',
				application_type: 'web',
				dpop_bound_access_tokens: true
			},
			stateStore,
			sessionStore
		});
	} else {
		client = new NodeOAuthClient({
			clientMetadata: buildAtprotoLoopbackClientMetadata({
				scope: SCOPE,
				redirect_uris: ['http://127.0.0.1:3000/oauth/callback']
			}),
			stateStore,
			sessionStore
		});
	}

	return client;
}
