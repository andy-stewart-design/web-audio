import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFollows, listSketches, resolveDidToPds } from '$lib/server/atproto/reads';
import { db } from '$lib/server/db';
import { sketches, bookmarks } from '$lib/server/db/schema';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.session.did) error(401, 'Not logged in');
	if (locals.session.did !== env.ADMIN_DID) error(403, 'Forbidden');

	const follows = await getFollows(locals.session.did);
	const dids = [locals.session.did, ...follows.map((f) => f.subject)];

	// ── Backfill sketches ──────────────────────────────────────────────────────

	const sketchResults = await Promise.allSettled(dids.map((did) => listSketches(did, 100)));
	const cards = sketchResults.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

	let sketchCount = 0;
	if (cards.length > 0) {
		const result = await db
			.insert(sketches)
			.values(
				cards.map((s) => ({
					uri: s.uri,
					cid: s.cid,
					authorDid: s.authorDid,
					title: s.title,
					code: s.code,
					description: s.description ?? null,
					tags: s.tags ?? null,
					previousVersion: null,
					rootVersion: null,
					createdAt: new Date(s.createdAt)
				}))
			)
			.onConflictDoNothing();
		sketchCount = result.rowCount ?? cards.length;
	}

	// ── Backfill bookmarks ─────────────────────────────────────────────────────

	const pds = await resolveDidToPds(locals.session.did);
	const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
	url.searchParams.set('repo', locals.session.did);
	url.searchParams.set('collection', 'live.drome.bookmark');
	url.searchParams.set('limit', '100');

	const res = await fetch(url);
	const bookmarkRecords: { uri: string; authorDid: string; subjectUri: string; subjectCid: string; createdAt: Date }[] = [];

	if (res.ok) {
		const data = await res.json();
		const seen = new Set<string>();
		for (const r of data.records ?? []) {
			const subjectUri = r.value.subject as string;
			if (seen.has(subjectUri)) continue;
			seen.add(subjectUri);
			bookmarkRecords.push({
				uri: r.uri,
				authorDid: locals.session.did,
				subjectUri,
				subjectCid: r.value.subjectCid as string,
				createdAt: new Date(r.value.createdAt as string)
			});
		}
	}

	let bookmarkCount = 0;
	if (bookmarkRecords.length > 0) {
		const result = await db.insert(bookmarks).values(bookmarkRecords).onConflictDoNothing();
		bookmarkCount = result.rowCount ?? bookmarkRecords.length;
	}

	return json({ sketches: sketchCount, bookmarks: bookmarkCount });
};
