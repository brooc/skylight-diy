CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  admin_pin_hash text,
  admin_pin_set_at timestamptz,
  setup_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  color text NOT NULL,
  role text NOT NULL DEFAULT 'child',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  assigned_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  points integer NOT NULL DEFAULT 1,
  frequency text NOT NULL DEFAULT 'daily',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chore_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  chore_id uuid NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  completed_for_date date NOT NULL,
  points_awarded integer NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chore_completions_unique_by_chore_date
  ON chore_completions (chore_id, completed_for_date);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  title text NOT NULL,
  points_spent integer NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  meal_id uuid REFERENCES meals(id) ON DELETE SET NULL,
  planned_date date NOT NULL,
  slot text NOT NULL DEFAULT 'dinner',
  custom_title text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_account_id text,
  display_name text,
  email text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  access_token_expires_at timestamptz,
  reauthorization_required boolean NOT NULL DEFAULT false,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  connected_account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_calendar_id text NOT NULL,
  display_name text NOT NULL,
  color text,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_sources_unique_connected_external_calendar
  ON calendar_sources (connected_account_id, external_calendar_id);

CREATE TABLE IF NOT EXISTS calendar_fetch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  calendar_source_id uuid REFERENCES calendar_sources(id) ON DELETE SET NULL,
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  status text NOT NULL,
  error_message text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_event_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  timezone text NOT NULL,
  source_fingerprint text NOT NULL,
  payload_jsonb jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  stale_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_event_cache_unique_household_cache_key
  ON calendar_event_cache (household_id, cache_key);
