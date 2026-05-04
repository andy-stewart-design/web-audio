import { Client, type AtUriString, type DatetimeString, type NsidString } from '@atproto/lex';
import { TID } from '@atproto/common-web';
import { getOAuthClient } from '$lib/server/auth/client';
import { main as sketchMain, type Main as SketchRecord } from '$lib/lexicons/live/drome/sketch';
import { main as likeMain } from '$lib/lexicons/live/drome/like';
import { main as repostMain } from '$lib/lexicons/live/drome/repost';

type PublishInput = Omit<SketchRecord, '$type' | 'createdAt'>;

async function getLexClient(sessionDid: string): Promise<Client> {
	const oauthClient = await getOAuthClient();
	const session = await oauthClient.restore(sessionDid);
	return new Client(session);
}

export async function publishSketch(
	sessionDid: string,
	input: PublishInput
): Promise<{ uri: string; cid: string }> {
	const client = await getLexClient(sessionDid);
	const rkey = TID.nextStr();
	return client.create(
		sketchMain,
		{ ...input, createdAt: new Date().toISOString() as DatetimeString },
		{ rkey }
	);
}

export async function likeSketch(
	sessionDid: string,
	subject: { uri: string; cid: string }
): Promise<{ uri: string; cid: string }> {
	const client = await getLexClient(sessionDid);
	const rkey = TID.nextStr();
	return client.create(
		likeMain,
		{
			subject: { uri: subject.uri as AtUriString, cid: subject.cid },
			createdAt: new Date().toISOString() as DatetimeString
		},
		{ rkey }
	);
}

export async function repostSketch(
	sessionDid: string,
	subject: { uri: string; cid: string }
): Promise<{ uri: string; cid: string }> {
	const client = await getLexClient(sessionDid);
	const rkey = TID.nextStr();
	return client.create(
		repostMain,
		{
			subject: { uri: subject.uri as AtUriString, cid: subject.cid },
			createdAt: new Date().toISOString() as DatetimeString
		},
		{ rkey }
	);
}

export async function deleteRecord(sessionDid: string, uri: string): Promise<void> {
	const client = await getLexClient(sessionDid);
	// Parse AT URI: at://did/collection/rkey
	const parts = uri.replace('at://', '').split('/');
	await client.deleteRecord(parts[1] as NsidString, parts[2]);
}
