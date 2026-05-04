import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { publishSketch } from '$lib/server/atproto/records';
import type { AtUriString } from '@atproto/lex';

export const actions: Actions = {
	publish: async ({ request, locals }) => {
		if (!locals.session.did) {
			return fail(401, { error: 'You must be logged in to publish.' });
		}

		const data = await request.formData();
		const title = data.get('title');
		const code = data.get('code');
		const description = data.get('description');
		const tagsRaw = data.get('tags');
		const previousVersion = data.get('previousVersion');
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
			const result = await publishSketch(locals.session.did, {
				title: title.trim(),
				code,
				description:
					typeof description === 'string' && description.trim() ? description.trim() : undefined,
				tags,
				previousVersion:
					typeof previousVersion === 'string' && previousVersion
						? (previousVersion as AtUriString)
						: undefined,
				rootVersion:
					typeof rootVersion === 'string' && rootVersion
						? (rootVersion as AtUriString)
						: undefined
			});
			return { uri: result.uri, cid: result.cid };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to publish.';
			return fail(500, { error: message });
		}
	}
};
