-- 140_intercompany.sql — group view: take out intercompany balances and trading, and convert at the company's own monthly rates.
BEGIN;
-- A category the company marks as intercompany (besides names that already say so, e.g. "Intercompany receivable").
ALTER TABLE financials.accounts ADD COLUMN IF NOT EXISTS intercompany boolean NOT NULL DEFAULT false;
-- The company's own monthly exchange rates (units of each currency per 1 USD), e.g. from the Exchange rates tab of a
-- template. Used for the group view of that period; the latest daily rate (fx.rates) is the fallback.
CREATE TABLE IF NOT EXISTS fx.monthly (
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  quote text NOT NULL CHECK (quote ~ '^[A-Z]{3}$'),
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  per_usd numeric(20,8) NOT NULL CHECK (per_usd > 0),
  source text NOT NULL DEFAULT 'upload' CHECK (length(source) <= 40),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, quote, month));
ALTER TABLE fx.monthly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fx.monthly;
CREATE POLICY tenant_isolation ON fx.monthly USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON fx.monthly TO aidi_os_app;
COMMIT;
