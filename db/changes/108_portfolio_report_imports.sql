-- Past portfolio reports uploaded as files (PDF investor updates, emails, fund-utilisation reports): the file, the
-- period it covers and what was taken from it into the company's figures and notes.
BEGIN;
CREATE TABLE IF NOT EXISTS portfolio.report_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES portfolio.companies(id) ON DELETE CASCADE,
  document_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  period_label text CHECK (length(period_label) <= 80),
  period_end date,
  currency text CHECK (currency ~ '^[A-Z]{3}$'),
  usd_rate numeric(18,6),
  months int NOT NULL DEFAULT 0,
  values_saved int NOT NULL DEFAULT 0,
  extracted jsonb,
  imported_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS report_imports_company ON portfolio.report_imports (company_id, period_end DESC);
ALTER TABLE portfolio.report_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON portfolio.report_imports;
CREATE POLICY tenant_isolation ON portfolio.report_imports USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON portfolio.report_imports TO aidi_os_app;
COMMIT;
