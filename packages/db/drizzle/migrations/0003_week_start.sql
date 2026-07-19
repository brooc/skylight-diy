ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "week_starts_on" text NOT NULL DEFAULT 'monday';
