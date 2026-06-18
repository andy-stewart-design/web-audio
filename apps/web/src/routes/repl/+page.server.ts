import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { publishSketch } from '$lib/server/atproto/records';
import { getSketch } from '$lib/server/atproto/reads';
import { db } from '$lib/server/db';
import { sketches } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ url }) => {
	const loadUri = url.searchParams.get('load');
	if (!loadUri) return { loadedSketch: null };

	try {
		const sketch = await getSketch(decodeURIComponent(loadUri));
		return { loadedSketch: sketch };
	} catch {
		return { loadedSketch: null };
	}
};

export const actions: Actions = {
	publish: async ({ request, locals, url }) => {
		if (!locals.session.did) {
			return fail(401, { error: 'You must be logged in to publish.' });
		}

		const data = await request.formData();
		const title = data.get('title');
		const code = data.get('code');
		const description = data.get('description');
		const tagsRaw = data.get('tags');
		const prevVersion = data.get('previousVersion');
		const rootVersion = data.get('rootVersion');

		if (typeof title !== 'string' || !title.trim()) {
			return fail(400, { error: 'Title is required.' });
		}
		if (typeof code !== 'string' || !code.trim()) {
			return fail(400, { error: 'Code is required.' });
		}

		const tags =
			typeof tagsRaw === 'string' && tagsRaw.trim()
				? tagsRaw
						.split(',')
						.map((t) => t.trim())
						.filter(Boolean)
						.slice(0, 8)
				: undefined;

		try {
			const result = await publishSketch(
				locals.session.did,
				{
					title: title.trim(),
					code,
					description: (typeof description === 'string' && description.trim()) || undefined,
					tags,
					previousVersion: (typeof prevVersion === 'string' && prevVersion.trim()) || undefined,
					rootVersion: (typeof rootVersion === 'string' && rootVersion.trim()) || undefined
				},
				url.origin
			);

			await db
				.insert(sketches)
				.values({
					uri: result.uri,
					cid: result.cid,
					authorDid: locals.session.did,
					title: title.trim(),
					code,
					description: (typeof description === 'string' && description.trim()) || null,
					tags: tags ?? null,
					previousVersion: (typeof prevVersion === 'string' && prevVersion.trim()) || null,
					rootVersion: (typeof rootVersion === 'string' && rootVersion.trim()) || null,
					createdAt: new Date()
				})
				.onConflictDoUpdate({ target: sketches.uri, set: { cid: result.cid } });

			return { uri: result.uri, cid: result.cid };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to publish.';
			return fail(500, { error: message });
		}
	}
};
