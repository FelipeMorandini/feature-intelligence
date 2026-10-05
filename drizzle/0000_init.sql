CREATE TABLE `feature_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`triage_status` text NOT NULL,
	`triage_run_id` text,
	`problem_statement` text,
	`theme` text,
	`enrichment` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`triage_run_id`) REFERENCES `triage_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "feature_requests_triage_status_check" CHECK("feature_requests"."triage_status" in ('complete', 'failed')),
	CONSTRAINT "feature_requests_theme_check" CHECK("feature_requests"."theme" is null or "feature_requests"."theme" in ('notifications', 'reporting', 'automation', 'integrations', 'planning', 'collaboration', 'permissions', 'experience', 'other')),
	CONSTRAINT "feature_requests_enrichment_check" CHECK(("feature_requests"."triage_status" = 'complete'
            and "feature_requests"."problem_statement" is not null
            and "feature_requests"."theme" is not null
            and "feature_requests"."enrichment" is not null)
          or ("feature_requests"."triage_status" = 'failed'
            and "feature_requests"."problem_statement" is null
            and "feature_requests"."theme" is null
            and "feature_requests"."enrichment" is null))
);
--> statement-breakpoint
CREATE INDEX `feature_requests_theme_idx` ON `feature_requests` (`theme`);--> statement-breakpoint
CREATE INDEX `feature_requests_created_at_idx` ON `feature_requests` (`created_at`);--> statement-breakpoint
CREATE TABLE `supports` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`voter_id` text NOT NULL,
	`comment` text,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `feature_requests`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "supports_source_check" CHECK("supports"."source" in ('direct', 'duplicate_redirect'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supports_request_voter_unique` ON `supports` (`request_id`,`voter_id`);--> statement-breakpoint
CREATE TABLE `triage_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`triage_run_id` text NOT NULL,
	`suggested_request_id` text NOT NULL,
	`ai_confidence` text NOT NULL,
	`decision` text NOT NULL,
	`resulting_request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`triage_run_id`) REFERENCES `triage_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`suggested_request_id`) REFERENCES `feature_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resulting_request_id`) REFERENCES `feature_requests`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "triage_decisions_decision_check" CHECK("triage_decisions"."decision" in ('supported_existing', 'created_new')),
	CONSTRAINT "triage_decisions_confidence_check" CHECK("triage_decisions"."ai_confidence" in ('high', 'medium', 'low'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `triage_decisions_run_unique` ON `triage_decisions` (`triage_run_id`);--> statement-breakpoint
CREATE TABLE `triage_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`input_title` text NOT NULL,
	`input_description` text NOT NULL,
	`input_hash` text NOT NULL,
	`candidate_ids` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`status` text NOT NULL,
	`raw_output` text,
	`validated_output` text,
	`error` text,
	`latency_ms` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "triage_runs_status_check" CHECK("triage_runs"."status" in ('succeeded', 'invalid_output', 'provider_error', 'unavailable')),
	CONSTRAINT "triage_runs_validated_output_check" CHECK(("triage_runs"."status" = 'succeeded') = ("triage_runs"."validated_output" is not null))
);
