-- 161_brokerage.sql — Brokerage and investment accounts: besides cash, they hold securities (Treasury notes, bonds,
-- money market funds). Their value at each month end comes from the statement's valuation (cash, holdings at market
-- value, total, accrued interest), so the account shows what it is worth, not just its cash.
--  banking.account_settings: per uploaded account, what kind it is and whether its holdings count in the total.
--  banking.valuations: an account's month-end valuation.
BEGIN;
CREATE TABLE IF NOT EXISTS banking.account_settings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  entity_id        uuid        NOT NULL REFERENCES core.entities(id) ON DELETE CASCADE,
  account_label    text        NOT NULL CHECK (length(account_label) <= 160),
  kind             text        NOT NULL DEFAULT 'bank' CHECK (kind IN ('bank', 'brokerage')),
  currency         text        CHECK (currency ~ '^[A-Z]{3}$'),
  include_holdings boolean     NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, entity_id, account_label));
CREATE TABLE IF NOT EXISTS banking.valuations (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  entity_id       uuid          NOT NULL REFERENCES core.entities(id) ON DELETE CASCADE,
  account_label   text          NOT NULL CHECK (length(account_label) <= 160),
  month_end       date          NOT NULL,
  currency        text          NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  cash            numeric(18,2) NOT NULL,
  holdings        numeric(18,2) NOT NULL,
  total           numeric(18,2) NOT NULL,
  accrued         numeric(18,2),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (organization_id, entity_id, account_label, month_end));
DO $rls$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['banking.account_settings', 'banking.valuations'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP; END $rls$;
COMMIT;
