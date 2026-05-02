CREATE TABLE `account` (
	`did` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`displayName` text,
	`avatar` text
);
--> statement-breakpoint
CREATE TABLE `auth_session` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `like` (
	`uri` text PRIMARY KEY NOT NULL,
	`author_did` text NOT NULL,
	`subject_uri` text NOT NULL,
	`subject_cid` text NOT NULL,
	`created_at` text NOT NULL,
	`indexed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repost` (
	`uri` text PRIMARY KEY NOT NULL,
	`author_did` text NOT NULL,
	`subject_uri` text NOT NULL,
	`subject_cid` text NOT NULL,
	`created_at` text NOT NULL,
	`indexed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sketch` (
	`uri` text PRIMARY KEY NOT NULL,
	`cid` text NOT NULL,
	`author_did` text NOT NULL,
	`title` text NOT NULL,
	`code` text NOT NULL,
	`description` text,
	`tags` text,
	`origin` text,
	`previous_version` text,
	`root_version` text,
	`created_at` text NOT NULL,
	`indexed_at` text NOT NULL,
	`is_latest_version` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sketch_tag` (
	`sketch_uri` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`sketch_uri`, `tag`),
	FOREIGN KEY (`sketch_uri`) REFERENCES `sketch`(`uri`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sketch_tag_tag` ON `sketch_tag` (`tag`);