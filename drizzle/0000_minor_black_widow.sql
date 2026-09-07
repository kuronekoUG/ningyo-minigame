CREATE TABLE `scores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`score` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scores_score_created_idx` ON `scores` (`score`,`created_at`);