import type { Profile } from '$lib/server/atproto/reads';
import { account, sketches } from '$lib/server/db/schema';
import type { Sketch, SketchCard } from '$lib/types/sketch';

export type DbSketch = typeof sketches.$inferSelect;
export type NewDbSketch = typeof sketches.$inferInsert;
export type DbAccount = typeof account.$inferSelect;

export function toSketchCard(row: {
	sketch: DbSketch;
	author: DbAccount | null;
	bookmarkUri: string | null;
}) {
	return {
		uri: row.sketch.uri,
		cid: row.sketch.cid,
		authorDid: row.sketch.authorDid,
		authorHandle: row.author?.handle ?? row.sketch.authorDid,
		authorDisplayName: row.author?.displayName ?? null,
		authorAvatar: row.author?.avatar ?? null,
		title: row.sketch.title,
		code: row.sketch.code,
		description: row.sketch.description ?? null,
		tags: row.sketch.tags ?? null,
		previousVersion: row.sketch.previousVersion ?? null,
		rootVersion: row.sketch.rootVersion ?? null,
		bookmarkUri: row.bookmarkUri,
		createdAt: row.sketch.createdAt.toISOString()
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
		bookmarkUri: input.bookmarkUri
	} satisfies SketchCard;
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
