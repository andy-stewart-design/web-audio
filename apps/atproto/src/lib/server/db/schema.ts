import { pgTable, text, integer, index } from 'drizzle-orm/pg-core';

export const authState = pgTable('auth_state', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const authSession = pgTable('auth_session', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const account = pgTable('account', {
	did: text('did').primaryKey(),
	handle: text('handle').notNull(),
	active: integer('active').notNull().default(1)
});

export const status = pgTable(
	'status',
	{
		uri: text('uri').primaryKey(),
		authorDid: text('authorDid').notNull(),
		status: text('status').notNull(),
		createdAt: text('createdAt').notNull(),
		indexedAt: text('indexedAt').notNull(),
		current: integer('current').notNull().default(0)
	},
	(table) => [index('status_current_idx').on(table.current, table.indexedAt)]
);
