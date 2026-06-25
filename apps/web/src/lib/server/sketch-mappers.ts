import { sketches } from '$lib/server/db/schema';
import type { Profile } from '$lib/types/profile';
import type { Sketch, SketchCard } from '$lib/types/sketch';

type DbSketch = typeof sketches.$inferSelect;
type NewDbSketch = typeof sketches.$inferInsert;

type SketchCardDisplayInput = {
	uri: string;
	authorDid: string;
	authorHandle: string;
	authorDisplayName: string | null;
	createdAt: string;
};

function getSketchCardDisplay(input: SketchCardDisplayInput) {
	const rkey = input.uri.split('/').at(-1);

	return {
		href: `/sketch/${input.authorDid}/${rkey}`,
		remixHref: `/repl?load=${encodeURIComponent(input.uri)}`,
		formattedDate: new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(new Date(input.createdAt)),
		authorPrimaryLabel: input.authorDisplayName ?? `@${input.authorHandle}`,
		authorSecondaryLabel: input.authorDisplayName ? `@${input.authorHandle}` : null
	};
}

export function toSketchCard(row: {
	sketch: DbSketch;
	author: Profile | null;
	bookmarkUri: string | null;
}) {
	const authorHandle = row.author?.handle ?? row.sketch.authorDid;
	const authorDisplayName = row.author?.displayName ?? null;
	const createdAt = row.sketch.createdAt.toISOString();

	return {
		uri: row.sketch.uri,
		cid: row.sketch.cid,
		authorDid: row.sketch.authorDid,
		authorHandle,
		authorDisplayName,
		authorAvatar: row.author?.avatar ?? null,
		title: row.sketch.title,
		code: row.sketch.code,
		description: row.sketch.description ?? null,
		tags: row.sketch.tags ?? null,
		previousVersion: row.sketch.previousVersion ?? null,
		rootVersion: row.sketch.rootVersion ?? null,
		bookmarkUri: row.bookmarkUri,
		createdAt,
		...getSketchCardDisplay({
			uri: row.sketch.uri,
			authorDid: row.sketch.authorDid,
			authorHandle,
			authorDisplayName,
			createdAt
		})
	} satisfies SketchCard;
}

export function toAuthorSketchCard(input: {
	sketch: Sketch;
	profile: Profile;
	bookmarkUri: string | null;
}) {
	return {
		...input.sketch,
		authorHandle: input.profile.handle,
		authorDisplayName: input.profile.displayName,
		authorAvatar: input.profile.avatar,
		bookmarkUri: input.bookmarkUri,
		...getSketchCardDisplay({
			uri: input.sketch.uri,
			authorDid: input.sketch.authorDid,
			authorHandle: input.profile.handle,
			authorDisplayName: input.profile.displayName,
			createdAt: input.sketch.createdAt
		})
	} satisfies SketchCard;
}

export function toAuthorSketchCards(input: {
	sketches: Sketch[];
	profile: Profile;
	bookmarkMap: Map<string, string>;
}) {
	return input.sketches.map((sketch) =>
		toAuthorSketchCard({
			sketch,
			profile: input.profile,
			bookmarkUri: input.bookmarkMap.get(sketch.uri) ?? null
		})
	);
}

export function toSketchInsert(sketch: Sketch) {
	return {
		uri: sketch.uri,
		cid: sketch.cid,
		authorDid: sketch.authorDid,
		title: sketch.title,
		code: sketch.code,
		description: sketch.description,
		tags: sketch.tags,
		previousVersion: sketch.previousVersion,
		rootVersion: sketch.rootVersion,
		createdAt: new Date(sketch.createdAt)
	} satisfies NewDbSketch;
}
