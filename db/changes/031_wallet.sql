-- 031_wallet.sql — company wallets, their ledger and card top-ups; invoices can be paid from the wallet.
BEGIN;
CREATE SCHEMA IF NOT EXISTS wallet;
GRANT USAGE ON SCHEMA wallet TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wallet.wallets (
  organization_id uuid PRIMARY KEY DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','NGN')), balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS wallet.ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('credit','debit')), amount_minor bigint NOT NULL CHECK (amount_minor > 0), balance_after_minor bigint NOT NULL, currency text NOT NULL,
  category text NOT NULL CHECK (category IN ('topup','admin_credit','admin_debit','service','subscription','refund')), reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 300),
  reference text UNIQUE, created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ledger_org_idx ON wallet.ledger (organization_id, created_at DESC);
CREATE TABLE IF NOT EXISTS wallet.topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0), currency text NOT NULL, provider text NOT NULL, reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')), created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz);
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['wallet.wallets','wallet.ledger','wallet.topups'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %s TO aidi_os_app', t);
  END LOOP;
END $rls$;
ALTER TABLE services.invoices DROP CONSTRAINT IF EXISTS invoices_paid_via_check;
ALTER TABLE services.invoices ADD CONSTRAINT invoices_paid_via_check CHECK (paid_via = ANY (ARRAY['manual','stripe','paystack','wallet']));
UPDATE core.plans SET modules = array_append(modules, 'wallet') WHERE code IN ('company_free','company_startup','company_scale','internal') AND NOT ('wallet' = ANY(modules));
COMMIT;
