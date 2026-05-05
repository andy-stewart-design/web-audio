export type FollowRecord = {
	uri: string;
	subject: string; // DID of the followed user
};

/**
 * Fetch all live.drome.follow records for a given DID.
 * Uses the PLC directory to resolve the PDS endpoint first.
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
