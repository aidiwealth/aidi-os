-- 043_reporting_api.sql — daily exchange rates (for reporting only), API keys, statements pushed by API.
BEGIN;
CREATE SCHEMA IF NOT EXISTS fx;
GRANT USAGE ON SCHEMA fx TO aidi_os_app;
CREATE TABLE IF NOT EXISTS fx.rates (quote text PRIMARY KEY CHECK (quote ~ '^[A-Z]{3}$'), per_usd numeric(20,8) NOT NULL CHECK (per_usd > 0), fetched_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON fx.rates TO aidi_os_app;
INSERT INTO fx.rates (quote, per_usd, fetched_at) VALUES ('USD', 1, now() - interval '2 days') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS core.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80), prefix text NOT NULL, key_hash text NOT NULL UNIQUE, scopes text[] NOT NULL DEFAULT '{read}',
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz, revoked_at timestamptz);
ALTER TABLE core.api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.api_keys;
CREATE POLICY tenant_isolation ON core.api_keys USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE ON core.api_keys TO aidi_os_app;
ALTER TABLE financials.statements DROP CONSTRAINT IF EXISTS statements_source_check;
ALTER TABLE financials.statements ADD CONSTRAINT statements_source_check CHECK (source IN ('manual','upload','api'));
COMMIT;
