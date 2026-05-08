import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { bookmarkSketch, unbookmarkSketch } from '$lib/server/atproto/records';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session.did) error(401, 'Not logged in');

	const { subjectUri, subjectCid } = await request.json();
	if (!subjectUri || !subjectCid) error(400, 'Missing subjectUri or subjectCid');

	const ref = await bookmarkSketch(locals.session.did, { uri: subjectUri, cid: subjectCid });
	return json({ uri: ref.uri });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.session.did) error(401, 'Not logged in');

	const { bookmarkUri } = await request.json();
	if (!bookmarkUri) error(400, 'Missing bookmarkUri');

	await unbookmarkSketch(locals.session.did, bookmarkUri);
	return new Response(null, { status: 204 });
};
