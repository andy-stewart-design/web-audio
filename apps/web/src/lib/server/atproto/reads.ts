import { $parse, $safeParse } from '$lib/lexicons/live/drome/sketch';
import type { Profile } from '$lib/types/profile';
import type { Sketch } from '$lib/types/sketch';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubjectRecord = { uri: string; subject: string };

// ── Identity resolution ───────────────────────────────────────────────────────

/**
 * Resolve a handle or DID to a DID.
 * If the identifier already looks like a DID, returns it as-is.
 */
export async function resolveIdentifier(identifier: string) {
	if (identifier.startsWith('did:')) return identifier;
	return resolveHandleToDid(identifier);
}

/**
 * Resolve an AT Protocol handle to a DID via the Bluesky AppView.
 */
async function resolveHandleToDid(handle: string) {
	const url = new URL('https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle');
	url.searchParams.set('handle', handle);

	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to resolve handle "${handle}": ${res.status}`);

	const data = (await res.json()) as { did?: unknown };
	if (typeof data.did !== 'string') throw new Error(`No DID found for handle "${handle}"`);

	return data.did;
}

/**
 * Resolve a DID to its PDS service URL via the PLC directory.
 */
export async function resolveDidToPds(did: string) {
	const res = await fetch(`https://plc.directory/${did}`);
	if (!res.ok) throw new Error(`Failed to resolve DID ${did}: ${res.status}`);

	const doc = (await res.json()) as { service?: { type?: unknown; serviceEndpoint?: unknown }[] };
	const service = (Array.isArray(doc.service) ? doc.service : []).find(
		(s) => s.type === 'AtprotoPersonalDataServer'
	);
	if (typeof service?.serviceEndpoint !== 'string') throw new Error(`No PDS found for DID ${did}`);

	return service.serviceEndpoint;
}

// ── Profile ───────────────────────────────────────────────────────────────────

/**
 * Fetch a user's profile (handle, displayName, avatar) from the Bluesky AppView.
 */
export async function getProfile(did: string) {
	const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile');
	url.searchParams.set('actor', did);

	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch profile for ${did}: ${res.status}`);

	const data = await res.json();
	return {
		did: data.did,
		handle: data.handle,
		displayName: data.displayName ?? null,
		avatar: data.avatar ?? null
	} satisfies Profile;
}

// ── Records ───────────────────────────────────────────────────────────────────

/**
 * Fetch all live.drome.follow records for a given DID.
 */
export async function getFollows(did: string) {
	const pds = await resolveDidToPds(did);
	const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
	url.searchParams.set('repo', did);
	url.searchParams.set('collection', 'live.drome.follow');
	url.searchParams.set('limit', '100');

	const res = await fetch(url);
	if (!res.ok) return [];

	const data = await res.json();
	const seen = new Set<string>();
	const follows: SubjectRecord[] = [];

	for (const r of data.records ?? []) {
		const subject = r.value.subject as string;
		if (seen.has(subject)) continue;
		seen.add(subject);
		follows.push({ uri: r.uri, subject });
	}

	return follows;
}

/**
 * Fetch the latest live.drome.sketch records for a given DID and return them
 * as normalized app-level sketches.
 */
export async function listSketches(did: string, limit = 50) {
	const pds = await resolveDidToPds(did);

	const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
	url.searchParams.set('repo', did);
	url.searchParams.set('collection', 'live.drome.sketch');
	url.searchParams.set('limit', String(limit));

	const res = await fetch(url);
	if (!res.ok) return [];

	const data = await res.json();
	const sketches: Sketch[] = [];

	for (const r of data.records ?? []) {
		const result = $safeParse(r.value);
		if (!result.success) continue;
		const v = result.value;
		sketches.push({
			uri: r.uri,
			cid: r.cid,
			authorDid: did,
			code: v.code,
			title: v.title,
			description: v.description ?? null,
			tags: v.tags ?? null,
			previousVersion: v.previousVersion ?? null,
			rootVersion: v.rootVersion ?? null,
			createdAt: v.createdAt
		});
	}

	return sketches;
}

/**
 * Fetch a single live.drome.sketch record by AT URI.
 */
export async function getSketch(atUri: string) {
	const [, did, collection, rkey] =
		atUri.replace('at://', '').match(/^([^/]+)\/([^/]+)\/(.+)$/) ?? [];
	if (!did) throw new Error(`Invalid AT URI: ${atUri}`);

	const pds = await resolveDidToPds(did);
	const url = new URL(`${pds}/xrpc/com.atproto.repo.getRecord`);
	url.searchParams.set('repo', did);
	url.searchParams.set('collection', collection);
	url.searchParams.set('rkey', rkey);

	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch record ${atUri}: ${res.status}`);

	const data = await res.json();
	const v = $parse(data.value); // throws if the record doesn't match the lexicon
	return {
		uri: atUri,
		cid: data.cid,
		authorDid: did,
		title: v.title,
		code: v.code,
		description: v.description ?? null,
		tags: v.tags ?? null,
		previousVersion: v.previousVersion ?? null,
		rootVersion: v.rootVersion ?? null,
		createdAt: v.createdAt
	} satisfies Sketch;
}

/**
 * Fetch all live.drome.bookmark records for a given DID.
 */
export async function getBookmarks(did: string) {
	const pds = await resolveDidToPds(did);
	const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
	url.searchParams.set('repo', did);
	url.searchParams.set('collection', 'live.drome.bookmark');
	url.searchParams.set('limit', '100');

	const res = await fetch(url);
	if (!res.ok) return [];

	const data = await res.json();
	const seen = new Set<string>();
	const bookmarks: SubjectRecord[] = [];

	for (const r of data.records ?? []) {
		const subject = r.value.subject as string;
		if (seen.has(subject)) continue;
		seen.add(subject);
		bookmarks.push({ uri: r.uri, subject });
	}

	return bookmarks;
}
