-- 032_autobilling.sql — recurring charges (plans and services) and Monnify reserved accounts; wallet settings.
BEGIN;
CREATE TABLE IF NOT EXISTS wallet.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('plan','service')), code text NOT NULL, name text NOT NULL, client_id uuid,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0), currency text NOT NULL CHECK (currency IN ('USD','NGN')), interval text NOT NULL CHECK (interval IN ('month','year')),
  next_charge_at date NOT NULL, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled')),
  failures integer NOT NULL DEFAULT 0, last_error text, reminded_for date, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS subs_one_plan ON wallet.subscriptions (organization_id) WHERE kind = 'plan' AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS subs_due ON wallet.subscriptions (status, next_charge_at);
CREATE TABLE IF NOT EXISTS wallet.virtual_accounts (
  organization_id uuid PRIMARY KEY REFERENCES core.organizations(id) ON DELETE CASCADE, account_reference text NOT NULL UNIQUE,
  bank_name text, account_number text, account_name text, accounts jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['wallet.subscriptions','wallet.virtual_accounts'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %s TO aidi_os_app', t);
  END LOOP;
END $rls$;
ALTER TABLE wallet.topups DROP CONSTRAINT IF EXISTS topups_provider_check;
INSERT INTO platform.settings (key, value) VALUES ('wallet', '{"monnify_enabled": false, "monnify_env": "sandbox"}'::jsonb) ON CONFLICT (key) DO NOTHING;
COMMIT;
