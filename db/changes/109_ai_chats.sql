-- AI analyst conversations: each person's chats are kept so they can start a new one and come back to an old one.
BEGIN;
CREATE TABLE IF NOT EXISTS core.ai_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ai_chats_user ON core.ai_chats (user_id, updated_at DESC);
ALTER TABLE core.ai_chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.ai_chats;
CREATE POLICY tenant_isolation ON core.ai_chats USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON core.ai_chats TO aidi_os_app;
COMMIT;
