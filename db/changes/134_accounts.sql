-- 134_accounts.sql — the company's own categories (chart of accounts): rows in uploaded or linked sheets that are not a
-- standard line are kept as categories under a standard line (or as a detail only) instead of failing. Each statement
-- keeps the category figures in `detail`; the standard line is their sum when the sheet does not give it.
CREATE TABLE IF NOT EXISTS financials.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  parent text NOT NULL DEFAULT '' CHECK (length(parent) <= 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS accounts_org_name ON financials.accounts (organization_id, lower(name));
ALTER TABLE financials.accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON financials.accounts;
CREATE POLICY tenant_isolation ON financials.accounts USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON financials.accounts TO aidi_os_app;
ALTER TABLE financials.statements ADD COLUMN IF NOT EXISTS detail jsonb NOT NULL DEFAULT '{}'::jsonb;
