-- 063_loans_deployments.sql — guarantors and loan applications (pitch form), fund deployments and the books.
BEGIN;
CREATE TABLE IF NOT EXISTS credit.guarantors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  borrower_id uuid NOT NULL REFERENCES credit.borrowers(id) ON DELETE CASCADE, name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200), email text, phone text, relationship text,
  bvn_enc text, bvn_last4 text, nin_enc text, nin_last4 text, dob date, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE credit.guarantors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON credit.guarantors;
CREATE POLICY tenant_isolation ON credit.guarantors USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON credit.guarantors TO aidi_os_app;
ALTER TABLE credit.checks ADD COLUMN IF NOT EXISTS guarantor_id uuid REFERENCES credit.guarantors(id) ON DELETE CASCADE;
CREATE TABLE IF NOT EXISTS credit.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  pitch_id uuid REFERENCES deals.pitches(id) ON DELETE SET NULL, borrower_id uuid NOT NULL REFERENCES credit.borrowers(id) ON DELETE CASCADE,
  amount numeric(16,2) NOT NULL CHECK (amount > 0), currency text NOT NULL DEFAULT 'USD', tenor_months integer, purpose text, monthly_revenue numeric(16,2), rc_number text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','checking','review','approved','declined','disbursed','withdrawn')),
  decision_note text, decided_by uuid REFERENCES core.users(id) ON DELETE SET NULL, decided_at timestamptz, loan_id uuid REFERENCES credit.loans(id) ON DELETE SET NULL,
  terms jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE credit.applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON credit.applications;
CREATE POLICY tenant_isolation ON credit.applications USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON credit.applications TO aidi_os_app;
ALTER TABLE deals.pitches ADD COLUMN IF NOT EXISTS funding_type text NOT NULL DEFAULT 'equity' CHECK (funding_type IN ('equity','loan'));
ALTER TABLE deals.pitches ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES credit.applications(id) ON DELETE SET NULL;
CREATE SCHEMA IF NOT EXISTS finance;
GRANT USAGE ON SCHEMA finance TO aidi_os_app;
CREATE TABLE IF NOT EXISTS finance.deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  paid_on date NOT NULL, source text NOT NULL CHECK (source IN ('credit','angel_fund','venture_fund','other')), paying_entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL,
  fund_id uuid REFERENCES funds.funds(id) ON DELETE SET NULL, loan_id uuid REFERENCES credit.loans(id) ON DELETE SET NULL, application_id uuid REFERENCES credit.applications(id) ON DELETE SET NULL,
  holding_id uuid REFERENCES wealth.holdings(id) ON DELETE SET NULL, company text NOT NULL, founder_name text, founder_email text,
  amount numeric(16,2) NOT NULL CHECK (amount > 0), currency text NOT NULL DEFAULT 'USD', instrument text, reference text, bank_account_id uuid REFERENCES banking.accounts(id) ON DELETE SET NULL,
  funded_by jsonb NOT NULL DEFAULT '[]'::jsonb, notes text, created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE finance.deployments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON finance.deployments;
CREATE POLICY tenant_isolation ON finance.deployments USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON finance.deployments TO aidi_os_app;
CREATE TABLE IF NOT EXISTS finance.journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL, entry_date date NOT NULL, account text NOT NULL, debit numeric(16,2) NOT NULL DEFAULT 0, credit numeric(16,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD', memo text, deployment_id uuid REFERENCES finance.deployments(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS journal_entity ON finance.journal (entity_id, entry_date);
ALTER TABLE finance.journal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON finance.journal;
CREATE POLICY tenant_isolation ON finance.journal USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON finance.journal TO aidi_os_app;
DROP POLICY IF EXISTS entity_scope ON finance.journal;
CREATE POLICY entity_scope ON finance.journal AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
DROP POLICY IF EXISTS entity_scope ON finance.deployments;
CREATE POLICY entity_scope ON finance.deployments AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(paying_entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(paying_entity_id));
UPDATE core.plans SET modules = array_append(modules, 'deployments') WHERE code = 'internal' AND NOT ('deployments' = ANY(modules));
COMMIT;
