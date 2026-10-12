-- 100_portfolio_finvry.sql — a portfolio company can be linked to its Finvry workspace: when it sends an investor
-- update, the team is told and can import that update's figures and text into the portfolio.
BEGIN;
ALTER TABLE portfolio.companies ADD COLUMN IF NOT EXISTS finvry_org_id uuid REFERENCES core.organizations(id) ON DELETE SET NULL;
ALTER TABLE portfolio.companies ADD COLUMN IF NOT EXISTS finvry_new_update uuid;
CREATE INDEX IF NOT EXISTS portfolio_companies_finvry ON portfolio.companies (finvry_org_id) WHERE finvry_org_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS portfolio.finvry_imports (
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES portfolio.companies(id) ON DELETE CASCADE,
  update_id uuid NOT NULL,
  months int NOT NULL DEFAULT 0,
  imported_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, update_id));
ALTER TABLE portfolio.finvry_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON portfolio.finvry_imports;
CREATE POLICY tenant_isolation ON portfolio.finvry_imports USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON portfolio.finvry_imports TO aidi_os_app;
COMMIT;
