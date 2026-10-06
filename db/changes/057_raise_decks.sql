-- 057_raise_decks.sql — managed fundraising (per client, admin-enabled) and decks with viewer analytics.
BEGIN;
CREATE TABLE IF NOT EXISTS services.raise_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL UNIQUE REFERENCES services.clients(id) ON DELETE CASCADE, workspace_id uuid REFERENCES core.organizations(id) ON DELETE SET NULL, job_id uuid REFERENCES services.jobs(id) ON DELETE SET NULL,
  fee_pct numeric(5,2) NOT NULL DEFAULT 4, currency text NOT NULL DEFAULT 'USD', target numeric(16,2), round text, instrument text, valuation numeric(16,2),
  status text NOT NULL DEFAULT 'intake' CHECK (status IN ('intake','active','paused','closed')), intake jsonb NOT NULL DEFAULT '{}'::jsonb, intake_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE services.raise_programs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON services.raise_programs;
CREATE POLICY tenant_isolation ON services.raise_programs USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON services.raise_programs TO aidi_os_app;
CREATE TABLE IF NOT EXISTS services.raise_investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES services.raise_programs(id) ON DELETE CASCADE, name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200), firm text, email text,
  ticket numeric(16,2), committed numeric(16,2), status text NOT NULL DEFAULT 'target' CHECK (status IN ('target','contacted','meeting','diligence','term_sheet','committed','closed','passed')),
  next_step text, notes text, terms text, visible boolean NOT NULL DEFAULT true, sort integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE services.raise_investors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON services.raise_investors;
CREATE POLICY tenant_isolation ON services.raise_investors USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON services.raise_investors TO aidi_os_app;
CREATE TABLE IF NOT EXISTS services.raise_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES services.raise_programs(id) ON DELETE CASCADE, investor_id uuid REFERENCES services.raise_investors(id) ON DELETE SET NULL,
  title text NOT NULL, starts_at timestamptz NOT NULL, minutes integer NOT NULL DEFAULT 30, location text, agenda text, reminded_day timestamptz, reminded_hour timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS raise_meetings_due ON services.raise_meetings (starts_at) WHERE reminded_hour IS NULL;
ALTER TABLE services.raise_meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON services.raise_meetings;
CREATE POLICY tenant_isolation ON services.raise_meetings USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON services.raise_meetings TO aidi_os_app;
CREATE TABLE IF NOT EXISTS fundraise.decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200), token text NOT NULL UNIQUE, primary_deck boolean NOT NULL DEFAULT false, require_email boolean NOT NULL DEFAULT true, allow_download boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true, created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE fundraise.decks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fundraise.decks;
CREATE POLICY tenant_isolation ON fundraise.decks USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON fundraise.decks TO aidi_os_app;
CREATE TABLE IF NOT EXISTS fundraise.deck_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES fundraise.decks(id) ON DELETE CASCADE, document_id uuid NOT NULL REFERENCES core.documents(id) ON DELETE CASCADE, filename text, pages integer, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE fundraise.deck_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fundraise.deck_versions;
CREATE POLICY tenant_isolation ON fundraise.deck_versions USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON fundraise.deck_versions TO aidi_os_app;
CREATE TABLE IF NOT EXISTS fundraise.deck_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES fundraise.decks(id) ON DELETE CASCADE, version_id uuid REFERENCES fundraise.deck_versions(id) ON DELETE SET NULL,
  email text, name text, visitor_key text, started_at timestamptz NOT NULL DEFAULT now(), last_at timestamptz NOT NULL DEFAULT now(), seconds integer NOT NULL DEFAULT 0,
  slides jsonb NOT NULL DEFAULT '{}'::jsonb, pages integer, downloads integer NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS deck_visits_deck ON fundraise.deck_visits (deck_id, started_at DESC);
ALTER TABLE fundraise.deck_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fundraise.deck_visits;
CREATE POLICY tenant_isolation ON fundraise.deck_visits USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON fundraise.deck_visits TO aidi_os_app;
UPDATE core.plans SET modules = array_append(modules, 'client_raise') WHERE 'company_services' = ANY(modules) AND code <> 'internal' AND NOT ('client_raise' = ANY(modules));
UPDATE core.plans SET modules = array_append(modules, 'cs_raise') WHERE code = 'internal' AND NOT ('cs_raise' = ANY(modules));
COMMIT;
