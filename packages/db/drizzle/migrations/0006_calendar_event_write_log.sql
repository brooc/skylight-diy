CREATE TABLE "calendar_event_write_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "calendar_source_id" uuid REFERENCES "calendar_sources"("id") ON DELETE SET NULL,
  "request_id" uuid NOT NULL,
  "provider_event_id" text NOT NULL,
  "title" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "calendar_event_write_logs_unique_household_request"
ON "calendar_event_write_logs" ("household_id", "request_id");
