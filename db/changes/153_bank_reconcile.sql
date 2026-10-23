-- 153_bank_reconcile.sql — Reconciling Banking with Financials, month by month.
--  banking.balances: an account's balance on a day, from a statement's closing balance or running-balance column, a
--  linked sheet's balance column, or the live feed's current balance. Month-end balances are worked out from the
--  nearest of these and the transactions in between.
--  banking.reconciled: a month the founder has marked as reconciled (bank against Financials) for a company or the
--  group, with a note.
BEGIN;
CREATE TABLE IF NOT EXISTS banking.balances (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  entity_id       uuid          REFERENCES core.entities(id) ON DELETE SET NULL,
  account_label   text          NOT NULL CHECK (length(account_label) <= 160),
  as_of           date          NOT NULL,
  balance         numeric(18,2) NOT NULL,
  currency        text          NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  source          text          NOT NULL CHECK (source IN ('statement', 'sheet', 'bank_feed')),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (organization_id, account_label, as_of));
CREATE TABLE IF NOT EXISTS banking.reconciled (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  scope           text        NOT NULL CHECK (length(scope) <= 60),
  month           text        NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  note            text        CHECK (length(note) <= 1000),
  gap             numeric(18,2),
  by_user         uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, scope, month));
DO $rls$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['banking.balances', 'banking.reconciled'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP; END $rls$;
COMMIT;
