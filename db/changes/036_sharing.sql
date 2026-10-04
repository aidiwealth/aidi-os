-- 036_sharing.sql — branding, watermark and NDA settings; NDA signatures; short names for data room links.
BEGIN;
CREATE TABLE IF NOT EXISTS fundraise.brand (
  organization_id uuid PRIMARY KEY DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  logo_id uuid REFERENCES core.documents(id) ON DELETE SET NULL, bg text CHECK (bg ~ '^#[0-9a-fA-F]{6}$'), fg text CHECK (fg ~ '^#[0-9a-fA-F]{6}$'),
  hide_finvry boolean NOT NULL DEFAULT false, watermark boolean NOT NULL DEFAULT false, nda_enabled boolean NOT NULL DEFAULT false,
  nda_scopes text[] NOT NULL DEFAULT '{room}', nda_text text CHECK (length(nda_text) <= 20000), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS fundraise.nda_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  scope text NOT NULL, name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200), email text NOT NULL, company text, signature text NOT NULL,
  nda_text text NOT NULL, ip_hash text, user_agent text, signed_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS nda_org_idx ON fundraise.nda_signatures (organization_id, signed_at DESC);
ALTER TABLE fundraise.links ADD COLUMN IF NOT EXISTS slug text CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$');
CREATE UNIQUE INDEX IF NOT EXISTS links_slug_uniq ON fundraise.links (organization_id, slug) WHERE slug IS NOT NULL;
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fundraise.brand','fundraise.nda_signatures'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP;
END $rls$;
COMMIT;
