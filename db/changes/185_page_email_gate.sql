-- An investor page can ask visitors for their email before showing it; each visitor's email is kept, with their visits.
BEGIN;
ALTER TABLE financials.public_pages ADD COLUMN IF NOT EXISTS email_gate boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS financials.page_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254), name text CHECK (length(name) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(), last_viewed_at timestamptz NOT NULL DEFAULT now(), views int NOT NULL DEFAULT 1,
  UNIQUE (organization_id, email));
ALTER TABLE financials.page_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON financials.page_access;
CREATE POLICY tenant_isolation ON financials.page_access USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON financials.page_access TO aidi_os_app;
COMMIT;
