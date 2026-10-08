-- 074_support_inbox.sql — emails to support@finvry.com, threaded, answered from the Services desk.
BEGIN;
CREATE SCHEMA IF NOT EXISTS support;
GRANT USAGE ON SCHEMA support TO aidi_os_app;
CREATE TABLE IF NOT EXISTS support.threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  subject text NOT NULL, from_email text NOT NULL, from_name text, workspace_id uuid REFERENCES core.organizations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')), unread boolean NOT NULL DEFAULT true, last_message_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS support.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES support.threads(id) ON DELETE CASCADE, direction text NOT NULL CHECK (direction IN ('in','out')),
  from_email text, to_email text, subject text, text_body text, html_body text, body_md text, message_id text, attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS support_messages_mid ON support.messages (message_id);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['support.threads','support.messages'] LOOP
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
END LOOP; END $$;
COMMIT;
