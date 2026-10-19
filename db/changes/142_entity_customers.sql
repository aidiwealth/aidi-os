-- 142_entity_customers.sql — customer revenue per company in a group, and exchange-rate history.
--  Customers: each company (core.entities, operating) keeps its own customers, revenue, settings, linked sheet and
--  uploads. A request names the company it works on (app.cust_entity, set by the app from ?cust=); the database then
--  shows and writes only that company's rows. With no company named, every company's rows are read and the app
--  combines them for the group. Existing data belongs to the main company.
--  fx.history: the daily rate as last seen in each month, for months a company has no book rate for.
BEGIN;
CREATE OR REPLACE FUNCTION core.cust_entity() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.cust_entity', true), '')::uuid $$;

DO $m$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['financials.customers', 'financials.customer_revenue', 'financials.customer_config', 'financials.customer_imports'] LOOP
    EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES core.entities(id) ON DELETE CASCADE', t);
    EXECUTE format($q$UPDATE %s t SET entity_id = (SELECT e.id FROM core.entities e WHERE e.organization_id = t.organization_id AND e.kind = 'operating'
                      ORDER BY (e.parent_id IS NOT NULL), e.created_at LIMIT 1) WHERE t.entity_id IS NULL$q$, t);
    EXECUTE format('ALTER TABLE %s ALTER COLUMN entity_id SET DEFAULT core.cust_entity()', t);
    EXECUTE format('DROP POLICY IF EXISTS cust_entity ON %s', t);
    EXECUTE format('CREATE POLICY cust_entity ON %s AS RESTRICTIVE USING (core.cust_entity() IS NULL OR entity_id = core.cust_entity()) WITH CHECK (core.cust_entity() IS NULL OR entity_id = core.cust_entity())', t);
  END LOOP;
END $m$;

-- One customer per name per company (it was per workspace), and one settings row per company.
ALTER TABLE financials.customers DROP CONSTRAINT IF EXISTS customers_organization_id_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS customers_org_entity_key ON financials.customers (organization_id, (coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)), key);
CREATE INDEX IF NOT EXISTS customers_entity_idx ON financials.customers (entity_id);
CREATE INDEX IF NOT EXISTS customer_revenue_entity_idx ON financials.customer_revenue (entity_id, month);
ALTER TABLE financials.customer_config DROP CONSTRAINT IF EXISTS customer_config_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS customer_config_org_entity ON financials.customer_config (organization_id, (coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)));

CREATE TABLE IF NOT EXISTS fx.history (
  quote    text    NOT NULL CHECK (quote ~ '^[A-Z]{3}$'),
  month    date    NOT NULL CHECK (extract(day FROM month) = 1),
  per_usd  numeric(20,8) NOT NULL CHECK (per_usd > 0),
  PRIMARY KEY (quote, month));
GRANT SELECT, INSERT, UPDATE ON fx.history TO aidi_os_app;
INSERT INTO fx.history (quote, month, per_usd) SELECT quote, date_trunc('month', fetched_at)::date, per_usd FROM fx.rates ON CONFLICT DO NOTHING;
COMMIT;
