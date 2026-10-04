-- 019_cs_intake.sql — tax filing information requests (no-login links) and their uploaded files.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/019_cs_intake.sql
BEGIN;
CREATE TABLE IF NOT EXISTS services.info_requests (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  client_id        uuid        NOT NULL REFERENCES services.clients(id) ON DELETE RESTRICT,
  company_id       uuid        REFERENCES services.companies(id) ON DELETE SET NULL,
  job_id           uuid        REFERENCES services.jobs(id) ON DELETE SET NULL,
  kind             text        NOT NULL DEFAULT 'tax_filing' CHECK (kind IN ('tax_filing')),
  tax_year         integer     NOT NULL CHECK (tax_year BETWEEN 2015 AND 2100),
  sent_to          text        NOT NULL CHECK (position('@' IN sent_to) > 1),
  token_hash       text        NOT NULL UNIQUE,
  expires_at       timestamptz NOT NULL,
  status           text        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','in_progress','submitted','cancelled')),
  answers          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  submitted_at     timestamptz,
  created_by       uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS services.request_files (
  request_id       uuid        NOT NULL REFERENCES services.info_requests(id) ON DELETE CASCADE,
  document_id      uuid        NOT NULL REFERENCES core.documents(id) ON DELETE CASCADE,
  organization_id  uuid        NOT NULL REFERENCES core.organizations(id),
  field            text        NOT NULL CHECK (field ~ '^[a-z_]{2,40}$'),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, document_id)
);
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['services.info_requests','services.request_files'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
  END LOOP;
END $rls$;
GRANT SELECT, INSERT, UPDATE, DELETE ON services.info_requests, services.request_files TO aidi_os_app;
COMMIT;
