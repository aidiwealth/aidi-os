-- 160_exports.sql — Exports too large to download on the spot (more than a month of data, up to a year): built in the
-- background, kept for a week and emailed to the person who asked, who must be signed in to download.
BEGIN;
CREATE TABLE IF NOT EXISTS core.exports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  kind            text        NOT NULL CHECK (length(kind) <= 40),
  params          jsonb       NOT NULL DEFAULT '{}',
  status          text        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  storage_key     text        CHECK (length(storage_key) <= 200),
  file_name       text        CHECK (length(file_name) <= 200),
  rows            integer,
  error           text        CHECK (length(error) <= 500),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '7 days');
CREATE INDEX IF NOT EXISTS exports_user_idx ON core.exports (user_id, created_at DESC);
ALTER TABLE core.exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.exports;
CREATE POLICY tenant_isolation ON core.exports USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON core.exports TO aidi_os_app;
COMMIT;
