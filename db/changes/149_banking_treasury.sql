-- 149_banking_treasury.sql — Finvry Banking & Treasury foundations (read-only; Finvry never holds or moves money).
--  banking.ledger: every bank transaction in one place, from any rail (the bank feed, uploaded statements, later
--  Fincra), with the vendor, direction, amount in its own currency, in the company's currency and in US dollars, and
--  the category it counts under (the standard lines or the company's own categories, cat:<line>:<name>).
--  banking.category_rules: "always put this vendor under that category", learned from the founder's corrections.
--  banking.vendors: per vendor, what the founder decided (keep, to cancel, cancelled) and when to be reminded — the
--  cut list. banking.budgets: a monthly budget per category, to compare spend against.
BEGIN;
CREATE TABLE IF NOT EXISTS banking.ledger (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  entity_id       uuid          REFERENCES core.entities(id) ON DELETE SET NULL,
  source          text          NOT NULL CHECK (source IN ('bank_feed', 'upload', 'fincra', 'manual')),
  source_ref      text          NOT NULL CHECK (length(source_ref) <= 200),
  account_label   text          CHECK (length(account_label) <= 160),
  txn_date        date          NOT NULL,
  description     text          NOT NULL CHECK (length(description) <= 500),
  vendor_key      text          NOT NULL CHECK (length(vendor_key) <= 80),
  vendor          text          NOT NULL CHECK (length(vendor) <= 120),
  direction       text          NOT NULL CHECK (direction IN ('in', 'out')),
  amount          numeric(18,2) NOT NULL CHECK (amount >= 0),
  currency        text          NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_base     numeric(18,2) NOT NULL,
  base_currency   text          NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
  amount_usd      numeric(18,2),
  category        text          CHECK (length(category) <= 140),
  category_by     text          NOT NULL DEFAULT 'auto' CHECK (category_by IN ('auto', 'rule', 'manual')),
  bank_category   text          CHECK (length(bank_category) <= 80),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source, source_ref));
CREATE INDEX IF NOT EXISTS ledger_date_idx ON banking.ledger (organization_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS ledger_vendor_idx ON banking.ledger (organization_id, vendor_key);

CREATE TABLE IF NOT EXISTS banking.category_rules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  vendor_key      text        NOT NULL CHECK (length(vendor_key) <= 80),
  category        text        NOT NULL CHECK (length(category) <= 140),
  created_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, vendor_key));

CREATE TABLE IF NOT EXISTS banking.vendors (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  vendor_key      text        NOT NULL CHECK (length(vendor_key) <= 80),
  status          text        NOT NULL DEFAULT 'keep' CHECK (status IN ('keep', 'to_cancel', 'cancelled')),
  remind_on       date,
  note            text        CHECK (length(note) <= 500),
  updated_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, vendor_key));

CREATE TABLE IF NOT EXISTS banking.budgets (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  category        text          NOT NULL CHECK (length(category) <= 140),
  monthly         numeric(18,2) NOT NULL CHECK (monthly >= 0),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (organization_id, category));

DO $rls$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['banking.ledger', 'banking.category_rules', 'banking.vendors', 'banking.budgets'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP; END $rls$;

UPDATE core.plans SET modules = array_append(modules, 'banking_treasury') WHERE code IN ('company_startup', 'company_medium', 'company_scale') AND NOT ('banking_treasury' = ANY (modules));
COMMIT;
