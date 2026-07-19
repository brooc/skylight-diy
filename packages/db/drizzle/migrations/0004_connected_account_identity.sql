CREATE UNIQUE INDEX IF NOT EXISTS "connected_accounts_unique_provider_account"
ON "connected_accounts" USING btree ("household_id", "provider", "provider_account_id");
