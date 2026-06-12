CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`key_prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`permissions` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `apps` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`tagline` text,
	`icon` text,
	`description` text,
	`app_store_url` text,
	`app_store_id` text,
	`bundle_id` text,
	`platform` text DEFAULT 'iOS' NOT NULL,
	`price` text,
	`rating` real,
	`rating_count` integer,
	`accent_color` text,
	`features` text,
	`screenshots` text,
	`links` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`sort_order` integer DEFAULT 0,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`meta` text,
	`category` text,
	`version` text,
	`release_date` integer,
	`current_version_release_date` integer,
	`minimum_os_version` text,
	`subtitle` text,
	`whats_new` text,
	`featured` integer DEFAULT 0 NOT NULL,
	`last_synced_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apps_slug_unique` ON `apps` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_apps_app_store_id` ON `apps` (`app_store_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`parent_id` text,
	`author_name` text NOT NULL,
	`author_email` text,
	`author_url` text,
	`content` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `episode_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`reaction` text,
	`category` text NOT NULL,
	`note` text,
	`listener` text,
	`ip_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_feedback_episode` ON `episode_feedback` (`episode_id`);--> statement-breakpoint
CREATE INDEX `ix_feedback_created` ON `episode_feedback` (`created_at`);--> statement-breakpoint
CREATE TABLE `i18n_cache` (
	`source_hash` text NOT NULL,
	`lang` text NOT NULL,
	`text` text NOT NULL,
	`model` text NOT NULL,
	`human_edited` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`source_hash`, `lang`)
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`path` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`alt_text` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `page_views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`referrer` text,
	`user_agent` text,
	`ip_hash` text,
	`country` text,
	`visitor_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_page_views_created` ON `page_views` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_page_views_path` ON `page_views` (`path`);--> statement-breakpoint
CREATE INDEX `ix_page_views_country` ON `page_views` (`country`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	`status` text DEFAULT 'draft' NOT NULL,
	`meta` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_slug_unique` ON `pages` (`slug`);--> statement-breakpoint
CREATE TABLE `podcast_episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`podcast_id` text NOT NULL,
	`slug` text NOT NULL,
	`guid` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`show_notes` text,
	`transcript` text,
	`audio_url` text NOT NULL,
	`audio_type` text DEFAULT 'audio/mpeg' NOT NULL,
	`audio_size` integer DEFAULT 0 NOT NULL,
	`duration` integer,
	`cover_image` text,
	`episode_number` integer,
	`season_number` integer,
	`episode_type` text DEFAULT 'full' NOT NULL,
	`explicit` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`external_source` text,
	`external_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`meta` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `podcast_episodes_slug_unique` ON `podcast_episodes` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `podcast_episodes_guid_unique` ON `podcast_episodes` (`guid`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_episode_external` ON `podcast_episodes` (`external_source`,`external_id`);--> statement-breakpoint
CREATE INDEX `ix_episode_podcast` ON `podcast_episodes` (`podcast_id`);--> statement-breakpoint
CREATE TABLE `podcast_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`podcast_id` text NOT NULL,
	`episode_id` text,
	`ip_hash` text,
	`user_agent` text,
	`referrer` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_podcast_events_created` ON `podcast_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_podcast_events_episode` ON `podcast_events` (`event_type`,`episode_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_podcast_events_podcast` ON `podcast_events` (`event_type`,`podcast_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `podcasts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`cover_image` text,
	`author` text,
	`owner_name` text,
	`owner_email` text,
	`language` text DEFAULT 'zh-CN' NOT NULL,
	`category` text,
	`explicit` integer DEFAULT 0 NOT NULL,
	`link` text,
	`apple_url` text,
	`spotify_url` text,
	`copyright` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`sort_order` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`meta` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `podcasts_slug_unique` ON `podcasts` (`slug`);--> statement-breakpoint
CREATE TABLE `post_categories` (
	`post_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`post_id`, `category_id`)
);
--> statement-breakpoint
CREATE TABLE `post_tags` (
	`post_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`post_id`, `tag_id`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`excerpt` text,
	`cover_image` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`share_token` text,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`meta` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_share_token_unique` ON `posts` (`share_token`);--> statement-breakpoint
CREATE TABLE `redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`from_path` text NOT NULL,
	`to_path` text NOT NULL,
	`status_code` integer DEFAULT 301,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `redirects_from_path_unique` ON `redirects` (`from_path`);--> statement-breakpoint
CREATE TABLE `request_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`method` text NOT NULL,
	`route` text NOT NULL,
	`status` integer NOT NULL,
	`duration_ms` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_request_metrics_created` ON `request_metrics` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_request_metrics_route` ON `request_metrics` (`method`,`route`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `share_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`target` text NOT NULL,
	`ip_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_share_events_created` ON `share_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_share_events_target` ON `share_events` (`target`,`created_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_unique` ON `tags` (`slug`);