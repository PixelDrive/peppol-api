CREATE TYPE "public"."participant_registration_status" AS ENUM('UNKNOWN', 'NOT_REGISTERED', 'REGISTERING', 'REGISTERED', 'PARTIAL', 'DEREGISTERING', 'FAILED');--> statement-breakpoint
ALTER TABLE "enterprise_endpoints" ADD COLUMN "network_registration_status" "participant_registration_status" DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "enterprise_endpoints" ADD COLUMN "registration_provider" "provider";--> statement-breakpoint
ALTER TABLE "enterprise_endpoints" ADD COLUMN "provider_registration_id" text;--> statement-breakpoint
ALTER TABLE "enterprise_endpoints" ADD COLUMN "registration_details" jsonb;--> statement-breakpoint
ALTER TABLE "enterprise_endpoints" ADD COLUMN "registered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enterprise_endpoints" ADD COLUMN "registration_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enterprise_endpoints" ADD COLUMN "registration_error" text;