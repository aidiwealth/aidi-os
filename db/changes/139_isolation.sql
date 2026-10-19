-- 139_isolation.sql — close the last company tables without row-level security, and record "Log in as" sessions.
--  legal.signatures  signed agreements (Finvry terms, client service level agreements): every read and write already
--                    goes through the platform path, so only that path sees rows; a company sees none directly.
--  core.seen         when each person last opened a notification area: their own company's rows only.
--  core.impersonations  each time Aidi staff open a customer's account as one of its users: who, whom, why, when it
--                    ends and whether changes were allowed. The customer sees these in their activity log.
BEGIN;
ALTER TABLE legal.signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON legal.signatures;
CREATE POLICY tenant_isolation ON legal.signatures
  USING (core.is_bypass() OR (organization_id IS NOT NULL AND organization_id = core.current_org()))
  WITH CHECK (core.is_bypass() OR (organization_id IS NOT NULL AND organization_id = core.current_org()));

ALTER TABLE core.seen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.seen;
CREATE POLICY tenant_isolation ON core.seen
  USING (core.is_bypass() OR organization_id = core.current_org())
  WITH CHECK (core.is_bypass() OR organization_id = core.current_org());

CREATE TABLE IF NOT EXISTS core.impersonations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  staff_user_id   uuid        NOT NULL,
  target_user_id  uuid        NOT NULL,
  reason          text        NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  can_edit        boolean     NOT NULL DEFAULT false,
  started_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  ip              text
);
CREATE INDEX IF NOT EXISTS impersonations_org_idx ON core.impersonations (organization_id, started_at DESC);
ALTER TABLE core.impersonations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.impersonations;
CREATE POLICY tenant_isolation ON core.impersonations
  USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())
  WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE ON core.impersonations TO aidi_os_app;
ALTER TABLE core.sessions ADD COLUMN IF NOT EXISTS impersonation_id uuid REFERENCES core.impersonations(id) ON DELETE SET NULL;
COMMIT;
