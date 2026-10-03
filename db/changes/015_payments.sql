-- 015_payments.sql — online payments (Stripe, Paystack), saved cards, NGN subscriptions, renewal invoices.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/015_payments.sql
BEGIN;
ALTER TABLE platform.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_method_check;
ALTER TABLE platform.subscriptions ADD CONSTRAINT subscriptions_method_check CHECK (method IN ('invoice','stripe','paystack'));
ALTER TABLE platform.subscriptions ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','NGN'));
ALTER TABLE platform.invoices ADD COLUMN IF NOT EXISTS paid_via text CHECK (paid_via IN ('manual','stripe','paystack'));
ALTER TABLE platform.invoices ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_sub_period ON platform.invoices (subscription_id, period_start)
  WHERE subscription_id IS NOT NULL AND period_start IS NOT NULL AND status <> 'void';

CREATE TABLE IF NOT EXISTS platform.payment_methods (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  provider         text        NOT NULL CHECK (provider IN ('stripe','paystack')),
  customer_ref     text,
  method_ref       text        NOT NULL,
  email            text,
  brand            text,
  last4            text        CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$'),
  exp_month        integer,
  exp_year         integer,
  is_default       boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, method_ref)
);
CREATE INDEX IF NOT EXISTS payment_methods_org_idx ON platform.payment_methods (organization_id);

CREATE TABLE IF NOT EXISTS platform.payments (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid          NOT NULL REFERENCES platform.invoices(id) ON DELETE CASCADE,
  organization_id  uuid          NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  provider         text          NOT NULL CHECK (provider IN ('stripe','paystack')),
  kind             text          NOT NULL CHECK (kind IN ('checkout','auto')),
  reference        text          NOT NULL UNIQUE,
  amount           numeric(12,2) NOT NULL,
  currency         text          NOT NULL,
  status           text          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  failure          text          CHECK (length(failure) <= 500),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  completed_at     timestamptz
);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON platform.payments (invoice_id);

DO $p$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform.payment_methods','platform.payments'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_only ON %s', t);
    EXECUTE format('CREATE POLICY platform_only ON %s USING (core.is_bypass()) WITH CHECK (core.is_bypass())', t);
  END LOOP;
END $p$;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.payment_methods TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE ON platform.payments TO aidi_os_app;
UPDATE platform.settings SET value = value || '{"ngn_per_usd": 1600}'::jsonb WHERE key = 'billing' AND NOT value ? 'ngn_per_usd';
COMMIT;
