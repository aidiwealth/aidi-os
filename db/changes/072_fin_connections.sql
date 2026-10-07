-- 072_fin_connections.sql — financial data sources per subject (entity or company): QuickBooks, Google Sheets.
BEGIN;
CREATE TABLE IF NOT EXISTS financials.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  subject text NOT NULL, provider text NOT NULL CHECK (provider IN ('quickbooks','gsheet')), realm_id text, company_name text, access_enc text, refresh_enc text, expires_at timestamptz, refresh_expires_at timestamptz,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb, connected_by uuid REFERENCES core.users(id) ON DELETE SET NULL, last_pulled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, subject, provider));
ALTER TABLE financials.connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON financials.connections;
CREATE POLICY tenant_isolation ON financials.connections USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON financials.connections TO aidi_os_app;
COMMIT;
