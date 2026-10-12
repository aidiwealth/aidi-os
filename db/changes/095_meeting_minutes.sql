-- 095_meeting_minutes.sql — team meeting minutes (board, team, investor, client…), optionally for one entity or
-- company in the group; people limited to some entities only see minutes for those. A "Meeting minutes" module.
BEGIN;
CREATE TABLE IF NOT EXISTS core.meeting_minutes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  entity_id       uuid        REFERENCES core.entities(id) ON DELETE SET NULL,
  title           text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  kind            text        NOT NULL DEFAULT 'team' CHECK (kind IN ('team', 'board', 'investor', 'client', 'partner', 'one_on_one', 'other')),
  held_at         timestamptz NOT NULL DEFAULT now(),
  minutes_long    int         CHECK (minutes_long BETWEEN 1 AND 1440),
  location        text        CHECK (length(location) <= 300),
  attendees       uuid[]      NOT NULL DEFAULT '{}',
  guests          text        CHECK (length(guests) <= 1000),
  agenda          text        CHECK (length(agenda) <= 20000),
  summary         text        CHECK (length(summary) <= 4000),
  notes           text        CHECK (length(notes) <= 60000),
  decisions       text        CHECK (length(decisions) <= 20000),
  actions         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status          text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  created_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_minutes_held ON core.meeting_minutes (organization_id, held_at DESC);
ALTER TABLE core.meeting_minutes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.meeting_minutes;
CREATE POLICY tenant_isolation ON core.meeting_minutes USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
DROP POLICY IF EXISTS entity_scope ON core.meeting_minutes;
CREATE POLICY entity_scope ON core.meeting_minutes AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON core.meeting_minutes TO aidi_os_app;
UPDATE core.plans SET modules = array_append(modules, 'meetings') WHERE code IN ('internal', 'vc_growth', 'vc_enterprise', 'fo_starter', 'fo_growth', 'fo_enterprise', 'growth', 'enterprise') AND NOT ('meetings' = ANY(modules));
COMMIT;
