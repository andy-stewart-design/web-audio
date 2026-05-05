// ── Types ─────────────────────────────────────────────────────────────────────

export type FollowRecord = {
	uri: string;
	subject: string; // DID of the followed user
};

export type Profile = {
	did: string;
	handle: string;
	displayName: string | null;
	avatar: string | null;
};

export type SketchCard = {
	uri: string;
	cid: string;
	authorDid: string;
	authorHandle: string;
	authorDisplayName: string | null;
	title: string;
	description: string | undefined;
	tags: string[] | undefined;
	createdAt: string;
};

export type SketchRecord = {
	uri: string;
	cid: string;
	title: string;
	code: string;
	description: string | undefined;
	tags: string[] | undefined;
	previousVersion: string | undefined;
	rootVersion: string | undefined;
	createdAt: string;
};

// ── Identity resolution ───────────────────────────────────────────────────────

/**
 * Resolve a handle or DID to a DID.
 * If the identifier already looks like a DID, returns it as-is.
 */
export async function resolveIdentifier(identifier: string): Promise<string> {
	if (identifier.startsWith('did:')) return identifier;
	return resolveHandleToDid(identifier);
}

/**
 * Resolve an AT Protocol handle to a DID via the Bluesky AppView.
 */
async function resolveHandleToDid(handle: string): Promise<string> {
	const url = new URL('https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle');
	url.searchParams.set('handle', handle);

	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to resolve handle "${handle}": ${res.status}`);

	const data = await res.json();
	if (!data.did) throw new Error(`No DID found for handle "${handle}"`);
	return data.did;
}

/**
 * Resolve a DID to its PDS service URL via the PLC directory.
 */
export async function resolveDidToPds(did: string): Promise<string> {
	const res = await fetch(`https://plc.directory/${did}`);
	if (!res.ok) throw new Error(`Failed to resolve DID ${did}: ${res.status}`);

	const doc = await res.json();
	const service = (doc.service ?? []).find(
		(s: { type: string; serviceEndpoint: string }) => s.type === 'AtprotoPersonalDataServer'
	);
	if (!service) throw new Error(`No PDS found for DID ${did}`);

	return service.serviceEndpoint;
}

// ── Profile ───────────────────────────────────────────────────────────────────

/**
 * Fetch a user's profile (handle, displayName, avatar) from the Bluesky AppView.
 */
export async function getProfile(did: string): Promise<Profile> {
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
	};
}

// ── Records ───────────────────────────────────────────────────────────────────

/**
 * Fetch all live.drome.follow records for a given DID.
 */
export async function getFollows(did: string): Promise<FollowRecord[]> {
	const pds = await resolveDidToPds(did);
	const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
	url.searchParams.set('repo', did);
	url.searchParams.set('collection', 'live.drome.follow');
	url.searchParams.set('limit', '100');

	const res = await fetch(url);
	if (!res.ok) return [];

	const data = await res.json();
	return (data.records ?? []).map((r: { uri: string; value: { subject: string } }) => ({
		uri: r.uri,
		subject: r.value.subject
	}));
}

/**
 * Fetch the latest live.drome.sketch records for a given DID and return them
 * as SketchCards, enriched with the author's profile.
 */
export async function listSketches(did: string, limit = 50): Promise<SketchCard[]> {
	const [pds, profile] = await Promise.all([resolveDidToPds(did), getProfile(did)]);

	const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
	url.searchParams.set('repo', did);
	url.searchParams.set('collection', 'live.drome.sketch');
	url.searchParams.set('limit', String(limit));

	const res = await fetch(url);
	if (!res.ok) return [];

	const data = await res.json();
	return (
		data.records ?? []
	).map(
		(r: {
			uri: string;
			cid: string;
			value: {
				title: string;
				description?: string;
				tags?: string[];
				createdAt: string;
			};
		}) => ({
			uri: r.uri,
			cid: r.cid,
			authorDid: did,
			authorHandle: profile.handle,
			authorDisplayName: profile.displayName,
			title: r.value.title,
			description: r.value.description,
			tags: r.value.tags,
			createdAt: r.value.createdAt
		})
	);
}

/**
 * Fetch a single live.drome.sketch record by AT URI.
 */
export async function getSketch(atUri: string): Promise<SketchRecord> {
	const [, did, collection, rkey] = atUri.replace('at://', '').match(/^([^/]+)\/([^/]+)\/(.+)$/) ?? [];
	if (!did) throw new Error(`Invalid AT URI: ${atUri}`);

	const pds = await resolveDidToPds(did);
	const url = new URL(`${pds}/xrpc/com.atproto.repo.getRecord`);
	url.searchParams.set('repo', did);
	url.searchParams.set('collection', collection);
	url.searchParams.set('rkey', rkey);

	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch record ${atUri}: ${res.status}`);

	const data = await res.json();
	const v = data.value;
	return {
		uri: atUri,
		cid: data.cid,
		title: v.title,
		code: v.code,
		description: v.description,
		tags: v.tags,
		previousVersion: v.previousVersion,
		rootVersion: v.rootVersion,
		createdAt: v.createdAt
	};
}
