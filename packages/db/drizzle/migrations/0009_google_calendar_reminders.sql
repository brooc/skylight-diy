ALTER TABLE "calendar_sources"
  ADD COLUMN IF NOT EXISTS "google_default_reminders" jsonb;
