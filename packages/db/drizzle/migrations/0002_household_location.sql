ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "location_name" text;
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "latitude" double precision;
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "longitude" double precision;
