CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" varchar(16) DEFAULT 'guest' NOT NULL,
	"display_name" varchar(24) NOT NULL,
	"email" varchar(254),
	"password_hash" text,
	"email_verified_at" timestamp with time zone,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"banned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"csrf_token" text NOT NULL,
	"mfa_verified" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"ip" varchar(64)
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(24) NOT NULL,
	"label" varchar(80),
	"max_uses" integer DEFAULT 1 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "email_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" varchar(16) NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_tokens_hash_uniq" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(6) NOT NULL,
	"status" varchar(16) DEFAULT 'waiting' NOT NULL,
	"host_user_id" uuid,
	"rematch_votes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"new_table_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "tables_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "table_seats" (
	"table_id" uuid NOT NULL,
	"seat" varchar(2) NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"reconnects" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "table_seats_pk" UNIQUE("table_id","seat"),
	CONSTRAINT "table_seats_user_uniq" UNIQUE("table_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "table_seats" ADD CONSTRAINT "table_seats_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "table_seats" ADD CONSTRAINT "table_seats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "games" (
	"table_id" uuid PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"rules_version" varchar(8) DEFAULT 'v1' NOT NULL,
	"seed" integer NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "game_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"table_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"command_id" varchar(64) NOT NULL,
	"actor" varchar(2),
	"action" jsonb NOT NULL,
	"server" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_events_command_uniq" UNIQUE("table_id","command_id"),
	CONSTRAINT "game_events_seq_uniq" UNIQUE("table_id","seq")
);
--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "game_events_table_idx" ON "game_events" USING btree ("table_id");
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reported_user_id" uuid,
	"table_id" uuid,
	"reason" text NOT NULL,
	"handled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "metrics_daily" (
	"day" date PRIMARY KEY NOT NULL,
	"tables_created" integer DEFAULT 0 NOT NULL,
	"matches_completed" integer DEFAULT 0 NOT NULL,
	"match_abandons" integer DEFAULT 0 NOT NULL,
	"signups" integer DEFAULT 0 NOT NULL,
	"guest_upgrades" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_admin" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_admin_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"admin_id" uuid,
	"action" varchar(64) NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_admin" ADD CONSTRAINT "audit_admin_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
