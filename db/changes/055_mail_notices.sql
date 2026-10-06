-- 055_mail_notices.sql — forwarded emails (notices) for the Aidi workspace.
BEGIN;
CREATE SCHEMA IF NOT EXISTS inbox;
GRANT USAGE ON SCHEMA inbox TO aidi_os_app;
CREATE TABLE IF NOT EXISTS inbox.notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  message_id text, from_name text, from_email text, to_email text, subject text, text_body text, html_body text, received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','done','archived')), summary text, due_date date, action text, entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb, done_by uuid REFERENCES core.users(id) ON DELETE SET NULL, done_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS notices_msg ON inbox.notices (organization_id, message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notices_status ON inbox.notices (organization_id, status, received_at DESC);
ALTER TABLE inbox.notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inbox.notices;
CREATE POLICY tenant_isolation ON inbox.notices USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON inbox.notices TO aidi_os_app;
UPDATE core.plans SET modules = array_append(modules, 'notices') WHERE code = 'internal' AND NOT ('notices' = ANY(modules));
COMMIT;
