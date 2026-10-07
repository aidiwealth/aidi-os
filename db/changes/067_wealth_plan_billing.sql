-- 067_wealth_plan_billing.sql — market prices, interest rates, financial profiles and plans, net-worth history, fee billing.
BEGIN;
CREATE TABLE IF NOT EXISTS wm.market (symbol text NOT NULL, price numeric(14,4) NOT NULL, as_of timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS market_sym ON wm.market (symbol, as_of DESC);
GRANT SELECT, INSERT ON wm.market TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  country text NOT NULL CHECK (country IN ('US','NG')), product text NOT NULL, rate numeric(7,3) NOT NULL, as_of date NOT NULL, source text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, country, product, as_of));
ALTER TABLE wm.rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.rates;
CREATE POLICY tenant_isolation ON wm.rates USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.rates TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL UNIQUE REFERENCES wm.clients(id) ON DELETE CASCADE, data jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.profiles;
CREATE POLICY tenant_isolation ON wm.profiles USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.profiles TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.profile_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, document_id uuid NOT NULL REFERENCES core.documents(id) ON DELETE CASCADE, kind text NOT NULL DEFAULT 'other', name text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.profile_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.profile_docs;
CREATE POLICY tenant_isolation ON wm.profile_docs USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.profile_docs TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, content jsonb NOT NULL, created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.reports;
CREATE POLICY tenant_isolation ON wm.reports USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.reports TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.report_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, revoked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.report_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.report_links;
CREATE POLICY tenant_isolation ON wm.report_links USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.report_links TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.snapshots (
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE, client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE,
  as_of date NOT NULL, net_worth numeric(18,2) NOT NULL, invested numeric(18,2) NOT NULL, cash numeric(18,2) NOT NULL, PRIMARY KEY (client_id, as_of));
ALTER TABLE wm.snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.snapshots;
CREATE POLICY tenant_isolation ON wm.snapshots USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.snapshots TO aidi_os_app;
ALTER TABLE wm.views ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'family';
ALTER TABLE wm.fees ADD COLUMN IF NOT EXISTS number text;
ALTER TABLE wm.fees ADD COLUMN IF NOT EXISTS method text;
ALTER TABLE wm.fees ADD COLUMN IF NOT EXISTS invoice_doc_id uuid REFERENCES core.documents(id) ON DELETE SET NULL;
ALTER TABLE wm.fees ADD COLUMN IF NOT EXISTS receipt_doc_id uuid REFERENCES core.documents(id) ON DELETE SET NULL;
ALTER TABLE wm.fees ADD COLUMN IF NOT EXISTS pay_ref text;
ALTER TABLE wm.fees ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE wm.fees ADD COLUMN IF NOT EXISTS due_date date;
COMMIT;
