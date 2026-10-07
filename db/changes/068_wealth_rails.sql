-- 068_wealth_rails.sql — provider accounts (Alpaca, Busha), Fincra virtual accounts and wallet ledger, savings plans.
BEGIN;
CREATE TABLE IF NOT EXISTS wm.provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, provider text NOT NULL CHECK (provider IN ('alpaca','busha')), external_id text, status text, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (client_id, provider));
ALTER TABLE wm.provider_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.provider_accounts;
CREATE POLICY tenant_isolation ON wm.provider_accounts USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.provider_accounts TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.virtual_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, currency text NOT NULL CHECK (currency IN ('NGN','USD')), fincra_id text UNIQUE, status text NOT NULL DEFAULT 'pending',
  account jsonb NOT NULL DEFAULT '{}'::jsonb, reason text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (client_id, currency));
ALTER TABLE wm.virtual_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.virtual_accounts;
CREATE POLICY tenant_isolation ON wm.virtual_accounts USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.virtual_accounts TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.wallet_txns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, currency text NOT NULL, kind text NOT NULL CHECK (kind IN ('deposit','withdrawal','fee','adjustment')), amount numeric(16,2) NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('requested','confirmed','rejected')), reference text UNIQUE, source text NOT NULL DEFAULT 'fincra', detail jsonb NOT NULL DEFAULT '{}'::jsonb, created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.wallet_txns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.wallet_txns;
CREATE POLICY tenant_isolation ON wm.wallet_txns USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.wallet_txns TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.provider_events (id bigserial PRIMARY KEY, provider text NOT NULL, event text, reference text, payload jsonb NOT NULL, verified boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT ON wm.provider_events TO aidi_os_app; GRANT USAGE ON SEQUENCE wm.provider_events_id_seq TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.savings_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, name text NOT NULL, currency text NOT NULL DEFAULT 'USD', rate numeric(6,3) NOT NULL, target numeric(16,2), monthly numeric(16,2),
  provider text NOT NULL DEFAULT 'manual', vendor text, started_on date NOT NULL DEFAULT current_date, matures_on date, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','matured','closed')),
  certificate_doc_id uuid REFERENCES core.documents(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.savings_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.savings_plans;
CREATE POLICY tenant_isolation ON wm.savings_plans USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.savings_plans TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.savings_txns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES wm.savings_plans(id) ON DELETE CASCADE, kind text NOT NULL CHECK (kind IN ('deposit','withdrawal','interest')), amount numeric(16,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('requested','confirmed','rejected')), txn_date date NOT NULL DEFAULT current_date, period text, note text, created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS savings_interest_once ON wm.savings_txns (plan_id, period) WHERE kind = 'interest';
ALTER TABLE wm.savings_txns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.savings_txns;
CREATE POLICY tenant_isolation ON wm.savings_txns USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.savings_txns TO aidi_os_app;
COMMIT;
