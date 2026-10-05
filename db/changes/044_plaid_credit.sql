-- 044_plaid_credit.sql — Plaid bank connections and balances; credit checks and borrower monitoring.
BEGIN;
CREATE SCHEMA IF NOT EXISTS banking;
GRANT USAGE ON SCHEMA banking TO aidi_os_app;
CREATE TABLE IF NOT EXISTS banking.plaid_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  item_id text NOT NULL UNIQUE, access_token_enc text NOT NULL, institution text, entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL, error text, created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS banking.plaid_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES banking.plaid_items(id) ON DELETE CASCADE, account_id text NOT NULL UNIQUE, name text NOT NULL, mask text, type text, subtype text, currency text NOT NULL DEFAULT 'USD',
  current numeric(18,2), available numeric(18,2), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE credit.borrowers ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'business' CHECK (kind IN ('individual','business'));
ALTER TABLE credit.borrowers ADD COLUMN IF NOT EXISTS monitor boolean NOT NULL DEFAULT false;
ALTER TABLE credit.borrowers ADD COLUMN IF NOT EXISTS identifier_enc text;
ALTER TABLE credit.borrowers ADD COLUMN IF NOT EXISTS identifier_last4 text;
CREATE TABLE IF NOT EXISTS credit.checks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  borrower_id uuid NOT NULL REFERENCES credit.borrowers(id) ON DELETE CASCADE, provider text NOT NULL CHECK (provider IN ('creditchek','us_bureau','manual')), kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','no_data','manual','error')), score integer CHECK (score IS NULL OR score BETWEEN 300 AND 850), band text, summary jsonb NOT NULL DEFAULT '{}'::jsonb, note text,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS credit_checks_borrower ON credit.checks (borrower_id, created_at DESC);
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['banking.plaid_items','banking.plaid_accounts','credit.checks'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP;
END $rls$;
COMMIT;
