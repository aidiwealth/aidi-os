-- Reading a workbook with AI runs in the background (a big model can take minutes): the page starts a read and
-- follows its progress here. Rows older than a day are removed on the next read.
CREATE TABLE IF NOT EXISTS financials.sheet_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  stage text NOT NULL DEFAULT 'fetch', progress jsonb NOT NULL DEFAULT '{}'::jsonb, result jsonb, error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE financials.sheet_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON financials.sheet_reads;
CREATE POLICY tenant_isolation ON financials.sheet_reads USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON financials.sheet_reads TO aidi_os_app;

-- Rate limits shared by every app instance (fixed windows; old windows are swept as new ones start).
CREATE TABLE IF NOT EXISTS core.rate_hits (
  key text NOT NULL, window_start timestamptz NOT NULL, hits int NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start));
GRANT SELECT, INSERT, UPDATE, DELETE ON core.rate_hits TO aidi_os_app;
