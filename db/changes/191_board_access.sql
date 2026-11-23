-- A shared board link can be open to anyone with it, or only to people the company invites by email (or a whole firm
-- as @fund.com). Invited people confirm their email with a one-time code and stay signed in on that device.
BEGIN;
ALTER TABLE financials.boards
  ADD COLUMN IF NOT EXISTS share_access text NOT NULL DEFAULT 'public' CHECK (share_access IN ('public', 'invited')),
  ADD COLUMN IF NOT EXISTS share_emails text[] NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS financials.board_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES financials.boards(id) ON DELETE CASCADE, email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  code_hash text NOT NULL, attempts int NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS board_codes_lookup ON financials.board_codes (board_id, email, created_at DESC);
CREATE TABLE IF NOT EXISTS financials.board_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES financials.boards(id) ON DELETE CASCADE, email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_viewed_at timestamptz NOT NULL DEFAULT now(), views int NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS board_sessions_board ON financials.board_sessions (board_id, email);
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['financials.board_codes', 'financials.board_sessions'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP;
END $rls$;
COMMIT;
