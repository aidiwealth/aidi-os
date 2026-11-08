-- 178_inline_charts.sql — charts placed in text (About the company, memos, updates, notes…). Each chart is worked out
-- from the workspace's own figures when shown, until it is frozen: then the picture saved at that moment is shown.
-- The text keeps only a link to the chart (/api/public/charts/<id>.svg); the id is random, like a shared document link.
BEGIN;
CREATE TABLE IF NOT EXISTS core.inline_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  spec jsonb NOT NULL,
  svg text,
  frozen_at timestamptz,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS inline_charts_org ON core.inline_charts (organization_id, created_at DESC);
ALTER TABLE core.inline_charts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.inline_charts;
CREATE POLICY tenant_isolation ON core.inline_charts USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON core.inline_charts TO aidi_os_app;
COMMIT;
