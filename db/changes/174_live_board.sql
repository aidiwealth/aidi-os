-- 174_live_board.sql — The group live board: one screen of the key numbers, for the office TV.
--  core.live_boards  one row per workspace: the layout (which numbers and panels show, in what order) and the
--                    view-only screen link (only a hash of its token is kept; it can be revoked or replaced).
BEGIN;
CREATE TABLE IF NOT EXISTS core.live_boards (
  organization_id   uuid        PRIMARY KEY DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  layout            jsonb       NOT NULL DEFAULT '{}',
  screen_hash       text        UNIQUE,
  screen_created_at timestamptz,
  screen_created_by uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  screen_seen_at    timestamptz,
  updated_by        uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now());
ALTER TABLE core.live_boards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.live_boards;
CREATE POLICY tenant_isolation ON core.live_boards USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE ON core.live_boards TO aidi_os_app;
UPDATE core.plans SET modules = array_append(modules, 'live_board') WHERE code = 'internal' AND NOT ('live_board' = ANY(modules));
COMMIT;
