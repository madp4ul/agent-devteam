PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_activations` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`status` text NOT NULL,
	`payload_json` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_activations`("id", "task_id", "status", "payload_json") SELECT "id", "task_id", "status", "payload_json" FROM `activations`;--> statement-breakpoint
DROP TABLE `activations`;--> statement-breakpoint
ALTER TABLE `__new_activations` RENAME TO `activations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `one_running_activation_per_task` ON `activations` (`task_id`) WHERE "activations"."status" = 'running';--> statement-breakpoint
ALTER TABLE `tasks` ADD `category` text DEFAULT 'general' NOT NULL;
