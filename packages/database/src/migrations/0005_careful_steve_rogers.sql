CREATE TABLE "browser_sessions" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"desired_state" text DEFAULT 'stopped' NOT NULL,
	"actual_state" text DEFAULT 'stopped' NOT NULL,
	"stream_port" integer,
	"last_heartbeat" timestamp with time zone,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_containers" ALTER COLUMN "status" SET DEFAULT 'starting';--> statement-breakpoint
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;