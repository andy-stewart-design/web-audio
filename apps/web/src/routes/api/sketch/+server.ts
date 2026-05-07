import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSketch } from '$lib/server/atproto/reads';

export const GET: RequestHandler = async ({ url }) => {
	const uri = url.searchParams.get('uri');
	if (!uri) error(400, 'Missing uri parameter');

	try {
		const sketch = await getSketch(uri);
		return json({ code: sketch.code });
	} catch (err) {
		error(500, err instanceof Error ? err.message : 'Failed to fetch sketch');
	}
};
