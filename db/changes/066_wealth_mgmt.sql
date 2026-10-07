-- 066_wealth_mgmt.sql — Aidi Wealth as a module: wealth clients (households), family view links, firms (referrals),
-- fees, external accounts; consolidates existing client holdings; APMEX metals import.
BEGIN;
INSERT INTO core.roles (code, description) VALUES ('wealth_client', 'Wealth client: sees only their own household in the wealth portal') ON CONFLICT (code) DO NOTHING;
CREATE SCHEMA IF NOT EXISTS wm;
GRANT USAGE ON SCHEMA wm TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200), kind text NOT NULL DEFAULT 'individual' CHECK (kind IN ('individual','business','family')), tag text,
  country text NOT NULL CHECK (country IN ('US','NG')), model text NOT NULL DEFAULT 'advisor' CHECK (model IN ('managed','advisor','self_directed')), entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect','onboarding','active','paused','closed')),
  contact_name text, email text, phone text, user_id uuid REFERENCES core.users(id) ON DELETE SET NULL,
  kyc_status text NOT NULL DEFAULT 'not_started' CHECK (kyc_status IN ('not_started','pending','verified','failed')), kyc_provider text, kyc_ref text, kyc_detail jsonb NOT NULL DEFAULT '{}'::jsonb, kyc_checked_at timestamptz,
  bvn_enc text, bvn_last4 text, nin_enc text, nin_last4 text, kyc_doc_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  subscription jsonb NOT NULL DEFAULT '{}'::jsonb, risk_profile text, notes text, disclosures_at timestamptz, created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.clients;
CREATE POLICY tenant_isolation ON wm.clients USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.clients TO aidi_os_app;
DROP POLICY IF EXISTS entity_scope ON wm.clients;
CREATE POLICY entity_scope ON wm.clients AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
CREATE TABLE IF NOT EXISTS wm.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, name text NOT NULL, relationship text, email text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.members;
CREATE POLICY tenant_isolation ON wm.members USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.members TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.view_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, revoked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.view_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.view_links;
CREATE POLICY tenant_isolation ON wm.view_links USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.view_links TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, name text NOT NULL, email text NOT NULL, viewed_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.views;
CREATE POLICY tenant_isolation ON wm.views USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.views TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.firms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL, kind text NOT NULL DEFAULT 'adviser' CHECK (kind IN ('adviser','platform','dealer','other')), country text CHECK (country IN ('US','NG')), contact_name text, email text, website text,
  terms_type text NOT NULL DEFAULT 'percent_of_fee' CHECK (terms_type IN ('percent_of_fee','flat')), terms_rate numeric(6,3), terms_amount numeric(16,2), terms_currency text NOT NULL DEFAULT 'USD',
  terms_frequency text NOT NULL DEFAULT 'annual' CHECK (terms_frequency IN ('one_off','monthly','quarterly','annual')), agreement_doc_id uuid REFERENCES core.documents(id) ON DELETE SET NULL, notes text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.firms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.firms;
CREATE POLICY tenant_isolation ON wm.firms USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.firms TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.client_firms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, firm_id uuid NOT NULL REFERENCES wm.firms(id) ON DELETE CASCADE, adviser_name text, started_on date, notes text, UNIQUE (client_id, firm_id));
ALTER TABLE wm.client_firms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.client_firms;
CREATE POLICY tenant_isolation ON wm.client_firms USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.client_firms TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, provider text NOT NULL DEFAULT 'manual', institution text NOT NULL, kind text NOT NULL DEFAULT 'brokerage' CHECK (kind IN ('bank','brokerage','crypto','savings','retirement','other')),
  name text, currency text NOT NULL DEFAULT 'USD', balance numeric(18,2) NOT NULL DEFAULT 0, cash_part numeric(18,2), as_of date NOT NULL DEFAULT current_date, managed_by text, notes text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.accounts;
CREATE POLICY tenant_isolation ON wm.accounts USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.accounts TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES wm.clients(id) ON DELETE SET NULL, firm_id uuid REFERENCES wm.firms(id) ON DELETE SET NULL, kind text NOT NULL CHECK (kind IN ('subscription','advisory','referral')),
  period text, amount numeric(16,2) NOT NULL CHECK (amount >= 0), currency text NOT NULL DEFAULT 'USD', status text NOT NULL DEFAULT 'due' CHECK (status IN ('due','paid','waived')), paid_on date, entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL, note text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.fees;
CREATE POLICY tenant_isolation ON wm.fees USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.fees TO aidi_os_app;
ALTER TABLE finance.journal ADD COLUMN IF NOT EXISTS wm_fee_id uuid REFERENCES wm.fees(id) ON DELETE CASCADE;
ALTER TABLE wealth.holdings ADD COLUMN IF NOT EXISTS wm_client_id uuid REFERENCES wm.clients(id) ON DELETE SET NULL;
ALTER TABLE banking.plaid_items ADD COLUMN IF NOT EXISTS wm_client_id uuid REFERENCES wm.clients(id) ON DELETE CASCADE;
UPDATE core.plans SET modules = array_append(modules, 'wealth_mgmt') WHERE code = 'internal' AND NOT ('wealth_mgmt' = ANY(modules));
UPDATE core.plans SET modules = array_append(modules, 'wm_portal') WHERE code = 'internal' AND NOT ('wm_portal' = ANY(modules));
-- consolidate: existing Aidi Wealth client holdings become wealth clients (US, Aidi Wealth LLC)
INSERT INTO wm.clients (organization_id, name, kind, country, model, entity_id, status, tag)
SELECT DISTINCT h.organization_id, h.client_name, CASE WHEN h.client_name ~* '(llc|inc|ltd|limited|holdings)' THEN 'business' ELSE 'individual' END, 'US', 'advisor',
  (SELECT e.id FROM core.entities e WHERE e.organization_id = h.organization_id AND regexp_replace(lower(e.name), '[^a-z0-9]', '', 'g') = 'aidiwealthllc' LIMIT 1), 'active', 'Aidi Wealth'
FROM wealth.holdings h WHERE h.section = 'client' AND h.client_name IS NOT NULL AND NOT EXISTS (SELECT 1 FROM wm.clients c WHERE c.organization_id = h.organization_id AND c.name = h.client_name);
UPDATE wealth.holdings h SET wm_client_id = c.id FROM wm.clients c WHERE h.section = 'client' AND h.wm_client_id IS NULL AND c.organization_id = h.organization_id AND c.name = h.client_name;
INSERT INTO wealth.holdings (organization_id, section, category, name, platform, currency, cost, current_value, status, as_of, notes, meta, in_nav, in_aum, import_key)
SELECT o.id, 'family', 'precious_metals', '1 oz Gold Bar - PAMP (In Assay)', 'APMEX', 'USD', 9031.47, 13103.97, 'active', '2026-10-06', 'APMEX holdings statement 6 Oct 2026 (held by Emmanuel Gbolade).',
  '{"metal":"gold","product":"1 oz Gold Bar - PAMP (In Assay)","quantity":3,"ounces":3.0,"dealer":"APMEX","vault":"APMEX Citadel vault","valuation":"manual"}'::jsonb, true, false, 'apmex-2026-10-06-0'
FROM core.organizations o WHERE o.plan_code = 'internal' AND NOT EXISTS (SELECT 1 FROM wealth.holdings h WHERE h.import_key = 'apmex-2026-10-06-0') ORDER BY o.created_at LIMIT 1;
INSERT INTO wealth.holdings (organization_id, section, category, name, platform, currency, cost, current_value, status, as_of, notes, meta, in_nav, in_aum, import_key)
SELECT o.id, 'family', 'precious_metals', '2025 1/2 oz American Gold Eagle MS-70 PCGS (FS, Black Label)', 'APMEX', 'USD', 1676.55, 2309.0, 'active', '2026-10-06', 'APMEX holdings statement 6 Oct 2026 (held by Emmanuel Gbolade).',
  '{"metal":"gold","product":"2025 1/2 oz American Gold Eagle MS-70 PCGS (FS, Black Label)","quantity":1,"ounces":0.5,"dealer":"APMEX","vault":"APMEX Citadel vault","valuation":"manual"}'::jsonb, true, false, 'apmex-2026-10-06-1'
FROM core.organizations o WHERE o.plan_code = 'internal' AND NOT EXISTS (SELECT 1 FROM wealth.holdings h WHERE h.import_key = 'apmex-2026-10-06-1') ORDER BY o.created_at LIMIT 1;
INSERT INTO wealth.holdings (organization_id, section, category, name, platform, currency, cost, current_value, status, as_of, notes, meta, in_nav, in_aum, import_key)
SELECT o.id, 'family', 'precious_metals', '2025 1/4 oz American Gold Eagle MS-70 PCGS (FirstStrike, Black)', 'APMEX', 'USD', 925.77, 1237.0, 'active', '2026-10-06', 'APMEX holdings statement 6 Oct 2026 (held by Emmanuel Gbolade).',
  '{"metal":"gold","product":"2025 1/4 oz American Gold Eagle MS-70 PCGS (FirstStrike, Black)","quantity":1,"ounces":0.25,"dealer":"APMEX","vault":"APMEX Citadel vault","valuation":"manual"}'::jsonb, true, false, 'apmex-2026-10-06-2'
FROM core.organizations o WHERE o.plan_code = 'internal' AND NOT EXISTS (SELECT 1 FROM wealth.holdings h WHERE h.import_key = 'apmex-2026-10-06-2') ORDER BY o.created_at LIMIT 1;
INSERT INTO wealth.holdings (organization_id, section, category, name, platform, currency, cost, current_value, status, as_of, notes, meta, in_nav, in_aum, import_key)
SELECT o.id, 'family', 'precious_metals', '2025 American Silver Eagle MS-70 PCGS (FirstStrike, Black Label)', 'APMEX', 'USD', 332.15, 480.8, 'active', '2026-10-06', 'APMEX holdings statement 6 Oct 2026 (held by Emmanuel Gbolade).',
  '{"metal":"silver","product":"2025 American Silver Eagle MS-70 PCGS (FirstStrike, Black Label)","quantity":5,"ounces":5.0,"dealer":"APMEX","vault":"APMEX Citadel vault","valuation":"manual"}'::jsonb, true, false, 'apmex-2026-10-06-3'
FROM core.organizations o WHERE o.plan_code = 'internal' AND NOT EXISTS (SELECT 1 FROM wealth.holdings h WHERE h.import_key = 'apmex-2026-10-06-3') ORDER BY o.created_at LIMIT 1;
COMMIT;
