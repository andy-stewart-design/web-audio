import { pgTable, text } from 'drizzle-orm/pg-core';

export const authState = pgTable('auth_state', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const authSession = pgTable('auth_session', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});
