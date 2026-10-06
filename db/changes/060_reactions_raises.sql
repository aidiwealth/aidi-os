-- 060_reactions_raises.sql — reactions on investor updates; several raises per client; per-investor meeting emails.
BEGIN;
CREATE TABLE IF NOT EXISTS financials.update_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  update_id uuid NOT NULL REFERENCES financials.updates(id) ON DELETE CASCADE, send_id uuid NOT NULL REFERENCES financials.update_sends(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('up','love','party','rocket','clap','think')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (send_id, emoji));
CREATE TABLE IF NOT EXISTS financials.update_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  update_id uuid NOT NULL REFERENCES financials.updates(id) ON DELETE CASCADE, send_id uuid NOT NULL REFERENCES financials.update_sends(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['financials.update_reactions','financials.update_notes'] LOOP
  EXECUTE 'ALTER TABLE ' || t || ' ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON ' || t;
  EXECUTE 'CREATE POLICY tenant_isolation ON ' || t || ' USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ' || t || ' TO aidi_os_app'; END LOOP; END $$;
ALTER TABLE services.raise_programs DROP CONSTRAINT IF EXISTS raise_programs_client_id_key;
CREATE INDEX IF NOT EXISTS raise_programs_client ON services.raise_programs (client_id);
ALTER TABLE services.raise_investors ADD COLUMN IF NOT EXISTS notify boolean NOT NULL DEFAULT false;
ALTER TABLE services.raise_meetings ADD COLUMN IF NOT EXISTS investor_notified boolean NOT NULL DEFAULT false;
COMMIT;
