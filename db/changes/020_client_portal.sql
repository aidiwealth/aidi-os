-- 020_client_portal.sql — client portal sign-in (codes, sessions, invites) and the client message centre.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/020_client_portal.sql
BEGIN;
ALTER TABLE services.people ADD COLUMN IF NOT EXISTS invite_token_hash text UNIQUE;
ALTER TABLE services.people ADD COLUMN IF NOT EXISTS invite_expires timestamptz;
ALTER TABLE services.people ADD COLUMN IF NOT EXISTS last_login timestamptz;
CREATE TABLE IF NOT EXISTS services.portal_codes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES core.organizations(id),
  person_id        uuid        NOT NULL REFERENCES services.people(id) ON DELETE CASCADE,
  code_hash        text        NOT NULL,
  attempts         integer     NOT NULL DEFAULT 0,
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS services.portal_sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES core.organizations(id),
  person_id        uuid        NOT NULL REFERENCES services.people(id) ON DELETE CASCADE,
  token_hash       text        NOT NULL UNIQUE,
  expires_at       timestamptz NOT NULL,
  last_seen        timestamptz NOT NULL DEFAULT now(),
  ip               text,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS services.messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  client_id        uuid        NOT NULL REFERENCES services.clients(id) ON DELETE CASCADE,
  from_team        boolean     NOT NULL,
  author_user_id   uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  author_person_id uuid        REFERENCES services.people(id) ON DELETE SET NULL,
  body             text        NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  read_by_client   timestamptz,
  read_by_team     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_client_idx ON services.messages (client_id, created_at DESC);
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['services.portal_codes','services.portal_sessions','services.messages'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
  END LOOP;
END $rls$;
GRANT SELECT, INSERT, UPDATE, DELETE ON services.portal_codes, services.portal_sessions, services.messages TO aidi_os_app;
COMMIT;
