-- Finvry: saved forecasts, and cap tables (share classes, holders, issuances, option plans and grants, SAFEs and
-- notes; a company can keep several, e.g. today's and a pro forma). Both can be shared with private links that record
-- who opened them, and a forecast can be put on a board. Aidi OS: people (team members and consultants), their
-- agreements and pay. Forecasts and the cap table are added to the paid company plans.
BEGIN;
CREATE TABLE IF NOT EXISTS financials.forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  assumptions jsonb NOT NULL,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE financials.boards ADD COLUMN IF NOT EXISTS forecast_id uuid REFERENCES financials.forecasts(id) ON DELETE SET NULL;

CREATE SCHEMA IF NOT EXISTS equity;
GRANT USAGE ON SCHEMA equity TO aidi_os_app;
CREATE TABLE IF NOT EXISTS equity.captables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  note text CHECK (length(note) <= 1000),
  is_main boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS equity.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  captable_id uuid NOT NULL REFERENCES equity.captables(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  kind text NOT NULL DEFAULT 'common' CHECK (kind IN ('common', 'preferred')),
  liq_pref numeric(6,2) NOT NULL DEFAULT 1 CHECK (liq_pref >= 0),
  participating boolean NOT NULL DEFAULT false,
  seniority int NOT NULL DEFAULT 0,
  issue_price numeric(18,6),
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS equity.holders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  captable_id uuid NOT NULL REFERENCES equity.captables(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  email text CHECK (length(email) <= 254),
  kind text NOT NULL DEFAULT 'investor' CHECK (kind IN ('founder', 'employee', 'advisor', 'investor', 'other')),
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS equity.issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  captable_id uuid NOT NULL REFERENCES equity.captables(id) ON DELETE CASCADE,
  holder_id uuid NOT NULL REFERENCES equity.holders(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES equity.classes(id) ON DELETE RESTRICT,
  shares numeric(20,0) NOT NULL CHECK (shares > 0),
  price numeric(18,6) CHECK (price >= 0),
  issued_on date NOT NULL,
  certificate text CHECK (length(certificate) <= 60),
  notes text CHECK (length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS equity.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  captable_id uuid NOT NULL REFERENCES equity.captables(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  reserved numeric(20,0) NOT NULL CHECK (reserved >= 0),
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS equity.grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  captable_id uuid NOT NULL REFERENCES equity.captables(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES equity.plans(id) ON DELETE CASCADE,
  holder_id uuid NOT NULL REFERENCES equity.holders(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'option' CHECK (kind IN ('option', 'rsu', 'restricted')),
  shares numeric(20,0) NOT NULL CHECK (shares > 0),
  strike numeric(18,6) CHECK (strike >= 0),
  granted_on date NOT NULL,
  vest_start date NOT NULL,
  vest_months int NOT NULL DEFAULT 48 CHECK (vest_months BETWEEN 0 AND 120),
  cliff_months int NOT NULL DEFAULT 12 CHECK (cliff_months BETWEEN 0 AND 60),
  exercised numeric(20,0) NOT NULL DEFAULT 0,
  cancelled_on date,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS equity.convertibles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  captable_id uuid NOT NULL REFERENCES equity.captables(id) ON DELETE CASCADE,
  holder_id uuid NOT NULL REFERENCES equity.holders(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'safe' CHECK (kind IN ('safe', 'note')),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  valuation_cap numeric(18,2) CHECK (valuation_cap > 0),
  discount_pct numeric(5,2) CHECK (discount_pct >= 0 AND discount_pct < 100),
  post_money boolean NOT NULL DEFAULT true,
  mfn boolean NOT NULL DEFAULT false,
  interest_pct numeric(5,2) CHECK (interest_pct >= 0),
  issued_on date NOT NULL,
  maturity_on date,
  status text NOT NULL DEFAULT 'outstanding' CHECK (status IN ('outstanding', 'converted', 'cancelled')),
  safe_id uuid,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE SCHEMA IF NOT EXISTS hr;
GRANT USAGE ON SCHEMA hr TO aidi_os_app;
CREATE TABLE IF NOT EXISTS hr.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES core.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  email text CHECK (length(email) <= 254),
  phone text CHECK (length(phone) <= 40),
  kind text NOT NULL DEFAULT 'employee' CHECK (kind IN ('employee', 'consultant', 'contractor', 'intern', 'advisor')),
  title text CHECK (length(title) <= 120),
  entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL,
  location text CHECK (length(location) <= 120),
  start_date date, end_date date, contract_end date,
  pay_amount numeric(18,2) CHECK (pay_amount >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  pay_frequency text NOT NULL DEFAULT 'monthly' CHECK (pay_frequency IN ('monthly', 'biweekly', 'weekly', 'quarterly', 'per_invoice', 'none')),
  pay_day int NOT NULL DEFAULT 25 CHECK (pay_day BETWEEN 1 AND 31),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'onboarding', 'ended')),
  notes text CHECK (length(notes) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hr.agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES hr.people(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind ~ '^[a-z_]{2,40}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  document_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'ended')),
  starts_on date, ends_on date, signed_on date,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hr.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES hr.people(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period ~ '^\d{4}-\d{2}(-\d{2})?$'),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  paid_on date NOT NULL,
  method text CHECK (length(method) <= 60),
  reference text CHECK (length(reference) <= 120),
  expense_id uuid REFERENCES finance.expenses(id) ON DELETE SET NULL,
  notes text CHECK (length(notes) <= 1000),
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS hr_payments_person ON hr.payments (person_id, period);

CREATE INDEX IF NOT EXISTS eq_classes_ct ON equity.classes (captable_id);
CREATE INDEX IF NOT EXISTS eq_holders_ct ON equity.holders (captable_id);
CREATE INDEX IF NOT EXISTS eq_issuances_ct ON equity.issuances (captable_id);
CREATE INDEX IF NOT EXISTS eq_grants_ct ON equity.grants (captable_id);
CREATE INDEX IF NOT EXISTS eq_conv_ct ON equity.convertibles (captable_id);

-- Private links to a forecast or a cap table, and each visit (email when the link asks for one, time spent).
CREATE TABLE IF NOT EXISTS financials.share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('forecast', 'captable')),
  object_id uuid NOT NULL,
  token text NOT NULL UNIQUE CHECK (length(token) BETWEEN 16 AND 40),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  require_email boolean NOT NULL DEFAULT true,
  notify boolean NOT NULL DEFAULT true,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  views int NOT NULL DEFAULT 0, last_viewed_at timestamptz,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS share_links_obj ON financials.share_links (kind, object_id);
CREATE TABLE IF NOT EXISTS financials.share_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES financials.share_links(id) ON DELETE CASCADE,
  email text CHECK (length(email) <= 254), name text CHECK (length(name) <= 200),
  ip text, user_agent text CHECK (length(user_agent) <= 400),
  started_at timestamptz NOT NULL DEFAULT now(), last_at timestamptz NOT NULL DEFAULT now(),
  seconds int NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS share_views_link ON financials.share_views (link_id, started_at DESC);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['financials.forecasts','financials.share_links','financials.share_views','equity.captables','equity.classes','equity.holders','equity.issuances','equity.plans','equity.grants','equity.convertibles','hr.people','hr.agreements','hr.payments'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP; END $$;
-- People limited to some companies only see the people of those companies.
DROP POLICY IF EXISTS entity_scope ON hr.people;
CREATE POLICY entity_scope ON hr.people AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (true);

UPDATE core.plans SET modules = array(SELECT DISTINCT unnest(modules || ARRAY['forecast', 'equity'])) WHERE code IN ('company_startup', 'company_scale');
COMMIT;
