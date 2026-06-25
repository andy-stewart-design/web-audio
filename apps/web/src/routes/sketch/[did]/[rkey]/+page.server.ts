import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSketch, getProfile } from '$lib/server/atproto/reads';
import { getBookmarkUri } from '$lib/server/bookmarks';

function getSketchHref(uri: string) {
	const match = uri.replace('at://', '').match(/^([^/]+)\/([^/]+)\/(.+)$/);
	if (!match) return null;
	const [, did, , rkey] = match;
	return `/sketch/${did}/${rkey}`;
}

function getSketchPageDisplay(input: {
	createdAt: string;
	authorHandle: string;
	authorDisplayName: string | null;
}) {
	return {
		formattedDate: new Intl.DateTimeFormat('en', {
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		}).format(new Date(input.createdAt)),
		authorPrimaryLabel: input.authorDisplayName ?? `@${input.authorHandle}`,
		authorSecondaryLabel: input.authorDisplayName ? `@${input.authorHandle}` : null
	};
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const atUri = `at://${params.did}/live.drome.sketch/${params.rkey}`;

	const [sketch, profile] = await Promise.all([
		getSketch(atUri).catch(() => null),
		getProfile(params.did).catch(() => null)
	]);

	if (!sketch || !profile) error(404, 'Sketch not found');

	const bookmarkUri = locals.session.did
		? await getBookmarkUri(locals.session.did, sketch.uri)
		: null;

	// Parent sketch title for "Remixed from" display
	let remixedFrom: { uri: string; title: string; href: string } | null = null;
	if (sketch.previousVersion) {
		const href = getSketchHref(sketch.previousVersion);
		const parent = await getSketch(sketch.previousVersion).catch(() => null);

		if (parent && href) {
			remixedFrom = {
				uri: sketch.previousVersion,
				title: parent.title,
				href
			};
		}
	}

	return {
		sketch,
		profile,
		bookmarkUri,
		remixedFrom,
		...getSketchPageDisplay({
			createdAt: sketch.createdAt,
			authorHandle: profile.handle,
			authorDisplayName: profile.displayName
		})
	};
};
