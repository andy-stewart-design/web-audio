import {
	Client,
	type AtUriString,
	type DatetimeString,
	type DidString,
	type NsidString
} from '@atproto/lex';
import { TID } from '@atproto/common-web';
import { getOAuthClient } from '$lib/server/auth/client';
import { main as sketchMain, type Main as SketchRecord } from '$lib/lexicons/live/drome/sketch';
import { main as likeMain } from '$lib/lexicons/live/drome/like';
import { main as repostMain } from '$lib/lexicons/live/drome/repost';
import { main as followMain } from '$lib/lexicons/live/drome/follow';

/**
 * A strong reference to a specific version of an AT Protocol record.
 * The URI identifies the record; the CID identifies the exact version.
 * Mirrors com.atproto.repo.strongRef.
 */
export type StrongRef = { uri: string; cid: string };

type WithStringUris<T> = T extends AtUriString
	? string
	: T extends (infer U)[]
		? WithStringUris<U>[]
		: T extends object
			? { [K in keyof T]: WithStringUris<T[K]> }
			: T;

export type PublishInput = WithStringUris<Omit<SketchRecord, '$type' | 'createdAt'>>;

async function getLexClient(sessionDid: string): Promise<Client> {
	const oauthClient = await getOAuthClient();
	const session = await oauthClient.restore(sessionDid);
	return new Client(session);
}

export async function publishSketch(sessionDid: string, input: PublishInput): Promise<StrongRef> {
	const client = await getLexClient(sessionDid);
	const rkey = TID.nextStr();
	return client.create(
		sketchMain,
		{
			...input,
			origin: input.origin as AtUriString | undefined,
			previousVersion: input.previousVersion as AtUriString | undefined,
			rootVersion: input.rootVersion as AtUriString | undefined,
			createdAt: new Date().toISOString() as DatetimeString
		},
		{ rkey }
	);
}

export async function likeSketch(sessionDid: string, subject: StrongRef): Promise<StrongRef> {
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

export async function repostSketch(sessionDid: string, subject: StrongRef): Promise<StrongRef> {
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

export async function followUser(sessionDid: string, subjectDid: string): Promise<StrongRef> {
	const client = await getLexClient(sessionDid);
	const rkey = TID.nextStr();
	return client.create(
		followMain,
		{ subject: subjectDid as DidString, createdAt: new Date().toISOString() as DatetimeString },
		{ rkey }
	);
}

export async function unfollowUser(sessionDid: string, followUri: string): Promise<void> {
	return deleteRecord(sessionDid, followUri);
}

export async function deleteRecord(sessionDid: string, uri: string): Promise<void> {
	const client = await getLexClient(sessionDid);
	// Parse AT URI: at://did/collection/rkey
	const parts = uri.replace('at://', '').split('/');
	await client.deleteRecord(parts[1] as NsidString, parts[2]);
}
