-- 132_customer_link.sql — customer revenue from a live linked sheet (re-read daily), with the founder's confirmed
-- duplicate merges kept so they apply on every read.
ALTER TABLE financials.customer_config ADD COLUMN IF NOT EXISTS link_url text CHECK (length(link_url) <= 600);
ALTER TABLE financials.customer_config ADD COLUMN IF NOT EXISTS link_name text CHECK (length(link_name) <= 120);
ALTER TABLE financials.customer_config ADD COLUMN IF NOT EXISTS link_auto boolean NOT NULL DEFAULT true;
ALTER TABLE financials.customer_config ADD COLUMN IF NOT EXISTS link_synced_at timestamptz;
ALTER TABLE financials.customer_config ADD COLUMN IF NOT EXISTS link_error text;
ALTER TABLE financials.customer_config ADD COLUMN IF NOT EXISTS link_result jsonb;
ALTER TABLE financials.customer_config ADD COLUMN IF NOT EXISTS aliases jsonb NOT NULL DEFAULT '{}'::jsonb;
