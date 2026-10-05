-- 038_inbox.sql — conversation threads (tickets) with attachments; per-user "last seen" for notification counts.
BEGIN;
CREATE TABLE IF NOT EXISTS services.threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES services.clients(id) ON DELETE CASCADE, subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')), opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
  closed_by text CHECK (closed_by IN ('team','client')), last_message_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS threads_client ON services.threads (client_id, last_message_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS threads_one_open ON services.threads (client_id) WHERE status = 'open';
ALTER TABLE services.messages ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES services.threads(id) ON DELETE CASCADE;
ALTER TABLE services.messages ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES core.documents(id) ON DELETE SET NULL;
ALTER TABLE services.messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE services.threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON services.threads;
CREATE POLICY tenant_isolation ON services.threads USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON services.threads TO aidi_os_app;
-- existing chats become one open conversation per client
INSERT INTO services.threads (organization_id, client_id, subject, opened_at, last_message_at)
  SELECT m.organization_id, m.client_id, 'Conversation', min(m.created_at), max(m.created_at) FROM services.messages m WHERE m.thread_id IS NULL GROUP BY m.organization_id, m.client_id
  ON CONFLICT DO NOTHING;
UPDATE services.messages m SET thread_id = t.id FROM services.threads t WHERE m.thread_id IS NULL AND t.client_id = m.client_id AND t.status = 'open';
CREATE TABLE IF NOT EXISTS core.seen (user_id uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE, organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE, area text NOT NULL, seen_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, organization_id, area));
GRANT SELECT, INSERT, UPDATE ON core.seen TO aidi_os_app;
UPDATE core.plans SET modules = array_append(modules, 'cs_inbox') WHERE code = 'internal' AND NOT ('cs_inbox' = ANY(modules));
COMMIT;
