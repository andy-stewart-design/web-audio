import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authState = pgTable('auth_state', {
	key: text('key').primaryKey(),
	value: jsonb('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

export const authSession = pgTable('auth_session', {
	key: text('key').primaryKey(),
	value: jsonb('value').notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const account = pgTable('account', {
	did: text('did').primaryKey(),
	handle: text('handle').notNull(),
	displayName: text('display_name'),
	avatar: text('avatar')
});

// ── App data ──────────────────────────────────────────────────────────────────

export const sketches = pgTable('sketches', {
	uri: text('uri').primaryKey(),
	cid: text('cid').notNull(),
	authorDid: text('author_did').notNull(),
	title: text('title').notNull(),
	code: text('code').notNull(),
	description: text('description'),
	tags: text('tags').array(),
	previousVersion: text('previous_version'),
	rootVersion: text('root_version'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull()
});

export const bookmarks = pgTable(
	'bookmarks',
	{
		uri: text('uri').primaryKey(),
		authorDid: text('author_did').notNull(),
		subjectUri: text('subject_uri').notNull(),
		subjectCid: text('subject_cid').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull()
	},
	(t) => [index('bookmarks_author_subject_idx').on(t.authorDid, t.subjectUri)]
);
