-- 039_meetings.sql — meetings on pipeline investors; calendar feed and calendar source per workspace.
BEGIN;
CREATE TABLE IF NOT EXISTS crm.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES crm.deals(id) ON DELETE CASCADE, contact_id uuid REFERENCES crm.contacts(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, location text CHECK (length(location) <= 500), notes text CHECK (length(notes) <= 3000),
  remind_minutes integer CHECK (remind_minutes IS NULL OR remind_minutes BETWEEN 5 AND 10080), reminded_at timestamptz, source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ics','calendar')),
  uid text, created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), CHECK (ends_at > starts_at));
CREATE INDEX IF NOT EXISTS meetings_deal ON crm.meetings (deal_id, starts_at);
CREATE INDEX IF NOT EXISTS meetings_due ON crm.meetings (starts_at) WHERE reminded_at IS NULL AND remind_minutes IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS meetings_uid ON crm.meetings (organization_id, uid) WHERE uid IS NOT NULL;
CREATE TABLE IF NOT EXISTS crm.calendar (organization_id uuid PRIMARY KEY DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE, feed_token text NOT NULL, source_url text, scanned_at timestamptz);
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm.meetings','crm.calendar'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP;
END $rls$;
COMMIT;
