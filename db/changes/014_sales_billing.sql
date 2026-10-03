-- 014_sales_billing.sql — Finvry sales pipeline, subscriptions, invoices and billing settings (platform only).
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/014_sales_billing.sql
BEGIN;
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.leads (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company            text          NOT NULL CHECK (length(company) BETWEEN 1 AND 200),
  contact_name       text          CHECK (length(contact_name) <= 200),
  contact_email      text          CHECK (contact_email IS NULL OR position('@' IN contact_email) > 1),
  contact_phone      text          CHECK (length(contact_phone) <= 40),
  kind               text          NOT NULL DEFAULT 'vc' CHECK (kind IN ('vc','family_office','company','fund_admin','other')),
  country            text          CHECK (length(country) <= 100),
  source             text          NOT NULL DEFAULT 'inbound' CHECK (source IN ('website','referral','event','outbound','inbound','partner','other')),
  stage              text          NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead','qualified','demo','proposal','negotiation','won','lost')),
  plan_code          text          REFERENCES core.plans(code),
  seats              integer       CHECK (seats IS NULL OR seats >= 0),
  value_monthly_usd  numeric(12,2) CHECK (value_monthly_usd IS NULL OR value_monthly_usd >= 0),
  billing            text          NOT NULL DEFAULT 'monthly' CHECK (billing IN ('monthly','annual')),
  owner_id           uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  expected_close     date,
  lost_reason        text          CHECK (length(lost_reason) <= 500),
  notes              text          CHECK (length(notes) <= 5000),
  organization_id    uuid          REFERENCES core.organizations(id) ON DELETE SET NULL,
  stage_changed_at   timestamptz   NOT NULL DEFAULT now(),
  created_by         uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_stage_idx ON platform.leads (stage);

CREATE TABLE IF NOT EXISTS platform.lead_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid        NOT NULL REFERENCES platform.leads(id) ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('note','call','email','meeting','stage','converted')),
  body        text        CHECK (length(body) <= 5000),
  from_stage  text,
  to_stage    text,
  created_by  uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_events_lead_idx ON platform.lead_events (lead_id, created_at DESC);

-- A subscription is a price for a period; changing plan or price ends one and starts the next, so history is kept.
CREATE TABLE IF NOT EXISTS platform.subscriptions (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid          NOT NULL REFERENCES core.organizations(id) ON DELETE RESTRICT,
  plan_code               text          NOT NULL REFERENCES core.plans(code),
  billing                 text          NOT NULL CHECK (billing IN ('monthly','annual')),
  method                  text          NOT NULL DEFAULT 'invoice' CHECK (method IN ('invoice','stripe')),
  amount_usd              numeric(12,2) NOT NULL CHECK (amount_usd >= 0),
  status                  text          NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','ended')),
  start_date              date          NOT NULL,
  ended_at                date,
  end_reason              text          CHECK (end_reason IN ('changed','cancelled','churned') OR end_reason IS NULL),
  stripe_subscription_id  text          UNIQUE,
  notes                   text          CHECK (length(notes) <= 2000),
  created_by              uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_live ON platform.subscriptions (organization_id) WHERE status <> 'ended';

CREATE SEQUENCE IF NOT EXISTS platform.invoice_number_seq START 1;
CREATE TABLE IF NOT EXISTS platform.invoices (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  number           text          NOT NULL UNIQUE,
  organization_id  uuid          NOT NULL REFERENCES core.organizations(id) ON DELETE RESTRICT,
  subscription_id  uuid          REFERENCES platform.subscriptions(id) ON DELETE SET NULL,
  issue_date       date          NOT NULL,
  due_date         date          NOT NULL CHECK (due_date >= issue_date),
  period_start     date,
  period_end       date,
  currency         text          NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  lines            jsonb         NOT NULL,
  amount           numeric(12,2) NOT NULL CHECK (amount >= 0),
  bill_to          jsonb         NOT NULL,
  status           text          NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
  sent_at          timestamptz,
  paid_at          date,
  paid_note        text          CHECK (length(paid_note) <= 500),
  created_by       uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_org_idx ON platform.invoices (organization_id, issue_date DESC);

CREATE TABLE IF NOT EXISTS platform.settings (
  key         text        PRIMARY KEY,
  value       jsonb       NOT NULL,
  updated_by  uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform.settings (key, value) VALUES ('billing', jsonb_build_object(
  'issuer_name', 'Finvry', 'issuer_address', '', 'issuer_email', '', 'invoice_prefix', 'FIN', 'payment_terms_days', 14,
  'payment_instructions', 'Pay by bank transfer to the account below, quoting the invoice number.')) ON CONFLICT (key) DO NOTHING;

-- Platform tables: only platform-level operations may read or write them.
DO $p$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform.leads','platform.lead_events','platform.subscriptions','platform.invoices','platform.settings'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_only ON %s', t);
    EXECUTE format('CREATE POLICY platform_only ON %s USING (core.is_bypass()) WITH CHECK (core.is_bypass())', t);
  END LOOP;
END $p$;

GRANT USAGE ON SCHEMA platform TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE ON platform.leads, platform.subscriptions, platform.invoices, platform.settings TO aidi_os_app;
GRANT SELECT, INSERT ON platform.lead_events TO aidi_os_app;
GRANT USAGE ON SEQUENCE platform.invoice_number_seq TO aidi_os_app;
COMMIT;
