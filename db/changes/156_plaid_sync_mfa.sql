-- 156_plaid_sync_mfa.sql — Live bank connections kept up to date by the bank's own notices (webhooks) and an
-- incremental sync (a cursor per connection: new, changed and removed transactions), with the connection's state.
BEGIN;
ALTER TABLE banking.plaid_items ADD COLUMN IF NOT EXISTS tx_cursor text;
ALTER TABLE banking.plaid_items ADD COLUMN IF NOT EXISTS synced_at timestamptz;
ALTER TABLE banking.plaid_items ADD COLUMN IF NOT EXISTS needs_sync boolean NOT NULL DEFAULT false;
ALTER TABLE banking.plaid_items ADD COLUMN IF NOT EXISTS webhook_url text CHECK (length(webhook_url) <= 300);
ALTER TABLE banking.plaid_items ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz;
ALTER TABLE banking.plaid_items ADD COLUMN IF NOT EXISTS error_code text CHECK (length(error_code) <= 80);
CREATE INDEX IF NOT EXISTS plaid_items_item_idx ON banking.plaid_items (item_id);
COMMIT;
