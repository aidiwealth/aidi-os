-- A forecast and a cap table can be shown on the public investor page (the cap table as ownership by group, or with
-- each holder).
BEGIN;
ALTER TABLE financials.public_pages ADD COLUMN IF NOT EXISTS forecast_id uuid REFERENCES financials.forecasts(id) ON DELETE SET NULL;
ALTER TABLE financials.public_pages ADD COLUMN IF NOT EXISTS captable_id uuid REFERENCES equity.captables(id) ON DELETE SET NULL;
ALTER TABLE financials.public_pages ADD COLUMN IF NOT EXISTS captable_detail text NOT NULL DEFAULT 'summary';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_pages_captable_detail') THEN
    ALTER TABLE financials.public_pages ADD CONSTRAINT public_pages_captable_detail CHECK (captable_detail IN ('summary', 'holders'));
  END IF; END $$;
COMMIT;
