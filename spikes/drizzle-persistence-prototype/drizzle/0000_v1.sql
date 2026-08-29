CREATE TABLE `activations` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`status` text NOT NULL,
	`payload_json` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_running_activation_per_task` ON `activations` (`task_id`) WHERE "activations"."status" = 'running';--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`metadata_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
