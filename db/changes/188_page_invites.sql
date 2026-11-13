-- Invite-only parts of the investor page (the data room, the cap table): the company lists who may see them (an email,
-- or a whole domain as "@fund.com"); visitors ask to be let in; a visitor proves their email with a one-time code and
-- a session cookie lets them back in for 30 days. Taking someone off the list shuts them out at once.
BEGIN;
ALTER TABLE financials.public_pages ADD COLUMN IF NOT EXISTS invite_only text[] NOT NULL DEFAULT '{}' CHECK (invite_only <@ ARRAY['room', 'captable']::text[]);
CREATE TABLE IF NOT EXISTS financials.page_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'requested', 'declined')),
  name text CHECK (length(name) <= 120), company text CHECK (length(company) <= 200), note text CHECK (length(note) <= 1000),
  invited_by uuid REFERENCES core.users(id) ON DELETE SET NULL, invited_at timestamptz, requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz, views int NOT NULL DEFAULT 0,
  UNIQUE (organization_id, email));
CREATE TABLE IF NOT EXISTS financials.page_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  email text NOT NULL, code_hash text NOT NULL, attempts int NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL, consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS page_invite_codes_lookup ON financials.page_invite_codes (organization_id, email, created_at DESC);
CREATE TABLE IF NOT EXISTS financials.page_invite_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['page_invites', 'page_invite_codes', 'page_invite_sessions'] LOOP
    EXECUTE format('ALTER TABLE financials.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON financials.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON financials.%I USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON financials.%I TO aidi_os_app', t);
  END LOOP; END $$;
COMMIT;
