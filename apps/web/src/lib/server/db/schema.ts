import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';

export const authState = sqliteTable('auth_state', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const authSession = sqliteTable('auth_session', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const account = sqliteTable('account', {
	did: text('did').primaryKey(),
	handle: text('handle').notNull(),
	displayName: text('displayName'),
	avatar: text('avatar')
});

export const sketch = sqliteTable('sketch', {
	uri:             text('uri').primaryKey(),
	cid:             text('cid').notNull(),
	authorDid:       text('author_did').notNull(),
	title:           text('title').notNull(),
	code:            text('code').notNull(),
	description:     text('description'),
	tags:            text('tags'),
	origin:          text('origin'),
	previousVersion: text('previous_version'),
	rootVersion:     text('root_version'),
	createdAt:       text('created_at').notNull(),
	indexedAt:       text('indexed_at').notNull(),
	isLatestVersion: integer('is_latest_version', { mode: 'boolean' }).notNull().default(true)
});

export const like = sqliteTable('like', {
	uri:        text('uri').primaryKey(),
	authorDid:  text('author_did').notNull(),
	subjectUri: text('subject_uri').notNull(),
	subjectCid: text('subject_cid').notNull(),
	createdAt:  text('created_at').notNull(),
	indexedAt:  text('indexed_at').notNull()
});

export const repost = sqliteTable('repost', {
	uri:        text('uri').primaryKey(),
	authorDid:  text('author_did').notNull(),
	subjectUri: text('subject_uri').notNull(),
	subjectCid: text('subject_cid').notNull(),
	createdAt:  text('created_at').notNull(),
	indexedAt:  text('indexed_at').notNull()
});

export const sketchTag = sqliteTable('sketch_tag', {
	sketchUri: text('sketch_uri').notNull().references(() => sketch.uri, { onDelete: 'cascade' }),
	tag:       text('tag').notNull()
}, (t) => [
	primaryKey({ columns: [t.sketchUri, t.tag] }),
	index('idx_sketch_tag_tag').on(t.tag)
]);
