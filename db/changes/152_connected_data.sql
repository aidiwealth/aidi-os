-- 152_connected_data.sql — Finvry data that joins up across features, with updates to review before they land.
--  banking.vendors: the cut list's flags from a founder's own working sheet (keep, cut, downgrade, review, personal,
--  cancelled) and the share of a payment a downgrade saves. banking.ledger.spender: who made a card payment (from
--  card and expense exports), for spend by person.
--  growth.deals: the customer in Financials a deal is for (key accounts, upsell, renewal), and the deal type.
--  growth.links: where deals come from (a sheet, HubSpot, Pipedrive) and the connection's key, encrypted.
--  growth.pending_imports: what a sheet, file or connection would change (new and changed rows), held until someone
--  accepts it; kept-in-step links and connections leave their updates here instead of writing them straight in.
BEGIN;
ALTER TABLE banking.vendors DROP CONSTRAINT IF EXISTS vendors_status_check;
ALTER TABLE banking.vendors ADD CONSTRAINT vendors_status_check CHECK (status IN ('keep', 'to_cancel', 'downgrade', 'review', 'personal', 'cancelled'));
ALTER TABLE banking.vendors ADD COLUMN IF NOT EXISTS saving_pct numeric(5,2) CHECK (saving_pct BETWEEN 0 AND 100);
ALTER TABLE banking.ledger ADD COLUMN IF NOT EXISTS spender text CHECK (length(spender) <= 120);

ALTER TABLE growth.deals ADD COLUMN IF NOT EXISTS deal_type text NOT NULL DEFAULT 'new' CHECK (deal_type IN ('new', 'expansion', 'renewal'));
ALTER TABLE growth.deals ADD COLUMN IF NOT EXISTS customer_key text CHECK (length(customer_key) <= 200);
ALTER TABLE growth.deals ADD COLUMN IF NOT EXISTS customer_name text CHECK (length(customer_name) <= 200);
ALTER TABLE growth.deals ADD COLUMN IF NOT EXISTS external_id text CHECK (length(external_id) <= 120);
CREATE INDEX IF NOT EXISTS deals_external_idx ON growth.deals (process_id, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE growth.links ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'sheet' CHECK (source IN ('sheet', 'hubspot', 'pipedrive'));
ALTER TABLE growth.links ADD COLUMN IF NOT EXISTS secret_enc text;
ALTER TABLE growth.links ALTER COLUMN url DROP NOT NULL;

CREATE TABLE IF NOT EXISTS growth.pending_imports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  kind            text        NOT NULL CHECK (kind IN ('sales_deals', 'marketing_months', 'bank_txns')),
  process_id      uuid        REFERENCES growth.processes(id) ON DELETE CASCADE,
  link_id         uuid        REFERENCES growth.links(id) ON DELETE CASCADE,
  name            text        NOT NULL CHECK (length(name) <= 200),
  ref             text        CHECK (length(ref) <= 500),
  tbl             jsonb       NOT NULL,
  mapping         jsonb       NOT NULL,
  summary         jsonb       NOT NULL,
  keep_link       jsonb,
  created_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS pending_imports_kind ON growth.pending_imports (organization_id, kind, created_at DESC);
ALTER TABLE growth.pending_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON growth.pending_imports;
CREATE POLICY tenant_isolation ON growth.pending_imports USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON growth.pending_imports TO aidi_os_app;
COMMIT;
