import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/db/schema';

export async function getBookmarkUri(authorDid: string, subjectUri: string) {
	const row = await db
		.select({ uri: bookmarks.uri })
		.from(bookmarks)
		.where(and(eq(bookmarks.subjectUri, subjectUri), eq(bookmarks.authorDid, authorDid)))
		.limit(1);

	return row[0]?.uri ?? null;
}
