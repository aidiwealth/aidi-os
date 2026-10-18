-- 131_customers.sql — customer revenue by month, for revenue retention, churn and customer analysis in Financials.
-- Uploads are kept as a preview first (duplicates checked) and applied when the founder confirms.
CREATE TABLE IF NOT EXISTS financials.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 200),
  segment text CHECK (length(segment) <= 60),
  sector text CHECK (length(sector) <= 80),
  country text CHECK (length(country) <= 60),
  plan text CHECK (length(plan) <= 80),
  started_on date,
  acquisition_cost numeric(20,2) CHECK (acquisition_cost IS NULL OR acquisition_cost >= 0),
  gross_margin_pct numeric(6,2) CHECK (gross_margin_pct IS NULL OR gross_margin_pct BETWEEN -100 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key));
CREATE TABLE IF NOT EXISTS financials.customer_revenue (
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES financials.customers(id) ON DELETE CASCADE,
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  amount numeric(20,2) NOT NULL,
  PRIMARY KEY (customer_id, month));
CREATE INDEX IF NOT EXISTS customer_revenue_org_idx ON financials.customer_revenue (organization_id, month);
CREATE TABLE IF NOT EXISTS financials.customer_config (
  organization_id uuid PRIMARY KEY DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  group_by text NOT NULL DEFAULT 'size' CHECK (group_by IN ('size', 'segment', 'sector', 'plan', 'country')),
  enterprise_arr numeric(20,2) NOT NULL DEFAULT 100000,
  midmarket_arr numeric(20,2) NOT NULL DEFAULT 25000,
  scheme jsonb,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS financials.customer_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  filename text CHECK (length(filename) <= 200),
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'applied', 'discarded')),
  data jsonb NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz);
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['financials.customers', 'financials.customer_revenue', 'financials.customer_config', 'financials.customer_imports'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP;
END $rls$;
-- Customers & retention is a paid feature (Startup and Scale). Subsidiaries keep their own reporting currency.
UPDATE core.plans SET modules = array_append(modules, 'fin_customers') WHERE code IN ('company_startup', 'company_scale') AND NOT ('fin_customers' = ANY(modules));
ALTER TABLE core.entities ADD COLUMN IF NOT EXISTS currency text CHECK (currency ~ '^[A-Z]{3}$');
