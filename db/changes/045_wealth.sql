-- 045_wealth.sql — Investments & AUM register; manual bank statements; the module on the internal plan.
BEGIN;
CREATE SCHEMA IF NOT EXISTS wealth;
GRANT USAGE ON SCHEMA wealth TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wealth.holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL, client_name text CHECK (length(client_name) <= 200),
  section text NOT NULL DEFAULT 'family' CHECK (section IN ('family','wealth','venture','real_estate','client')),
  category text NOT NULL CHECK (category IN ('venture','private_stake','public_securities','fund','bonds','retirement','cash','crypto','precious_metals','real_estate','other','liability')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200), platform text CHECK (length(platform) <= 120), currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  cost numeric(18,2), current_value numeric(18,2), realized numeric(18,2), ownership_pct numeric(7,3),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','realized','at_cost','nil','written_off','sold')),
  as_of date, notes text CHECK (length(notes) <= 3000), meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  in_nav boolean NOT NULL DEFAULT true, in_aum boolean NOT NULL DEFAULT true, import_key text,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS holdings_org ON wealth.holdings (organization_id, section);
CREATE TABLE IF NOT EXISTS wealth.valuations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL REFERENCES wealth.holdings(id) ON DELETE CASCADE, as_of date NOT NULL, value numeric(18,2) NOT NULL, note text, created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['wealth.holdings','wealth.valuations'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP;
END $rls$;
ALTER TABLE banking.statements DROP CONSTRAINT IF EXISTS statements_source_check;
ALTER TABLE banking.statements ADD CONSTRAINT statements_source_check CHECK (source IN ('csv','pdf','manual'));
UPDATE core.plans SET modules = array_append(modules, 'wealth') WHERE code = 'internal' AND NOT ('wealth' = ANY(modules));
COMMIT;
