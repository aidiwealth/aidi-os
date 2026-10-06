-- 056_intake_brand.sql — client filing forms on jobs; logo and cover image on the investor page.
BEGIN;
CREATE TABLE IF NOT EXISTS services.intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES services.clients(id) ON DELETE CASCADE, job_id uuid REFERENCES services.jobs(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('incorporation','filing')), answers jsonb NOT NULL DEFAULT '{}'::jsonb, files jsonb NOT NULL DEFAULT '[]'::jsonb,
  ssn_enc text, ssn_last4 text, submitted_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS intakes_job ON services.intakes (job_id);
ALTER TABLE services.intakes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON services.intakes;
CREATE POLICY tenant_isolation ON services.intakes USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON services.intakes TO aidi_os_app;
ALTER TABLE financials.public_pages ADD COLUMN IF NOT EXISTS logo_id uuid;
ALTER TABLE financials.public_pages ADD COLUMN IF NOT EXISTS cover_id uuid;
COMMIT;
