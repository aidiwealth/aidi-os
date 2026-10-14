-- Money in and out by month from connected bank accounts (kept for a few hours), used to build forecasts.
BEGIN;
ALTER TABLE banking.plaid_items ADD COLUMN IF NOT EXISTS flows jsonb;
ALTER TABLE banking.plaid_items ADD COLUMN IF NOT EXISTS flows_at timestamptz;
COMMIT;
