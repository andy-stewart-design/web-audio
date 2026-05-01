import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
