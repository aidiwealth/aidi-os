-- 062_storage_scope.sql — storage add-ons; entity-scoped access for roles limited to an entity.
BEGIN;
CREATE TABLE IF NOT EXISTS core.storage_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  gb integer NOT NULL CHECK (gb > 0), price_minor bigint NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'USD', starts_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  auto_renew boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','lapsed','cancelled')), created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS storage_addons_org ON core.storage_addons (organization_id, status);
ALTER TABLE core.storage_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.storage_addons;
CREATE POLICY tenant_isolation ON core.storage_addons USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE ON core.storage_addons TO aidi_os_app;
-- Entity scope: the app sets app.entity_scope to the entities (and their subsidiaries) a person may see; empty = all.
CREATE OR REPLACE FUNCTION core.entity_ok(eid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT eid IS NULL OR coalesce(current_setting('app.entity_scope', true), '') = '' OR eid::text = ANY (string_to_array(current_setting('app.entity_scope', true), ','))
$$;
GRANT EXECUTE ON FUNCTION core.entity_ok(uuid) TO aidi_os_app;
DROP POLICY IF EXISTS entity_scope ON core.documents;
CREATE POLICY entity_scope ON core.documents AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
DROP POLICY IF EXISTS entity_scope ON financials.statements;
CREATE POLICY entity_scope ON financials.statements AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
DROP POLICY IF EXISTS entity_scope ON banking.accounts;
CREATE POLICY entity_scope ON banking.accounts AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
DROP POLICY IF EXISTS entity_scope ON compliance.obligations;
CREATE POLICY entity_scope ON compliance.obligations AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
DROP POLICY IF EXISTS entity_scope ON funds.funds;
CREATE POLICY entity_scope ON funds.funds AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
DROP POLICY IF EXISTS entity_scope ON governance.parties;
CREATE POLICY entity_scope ON governance.parties AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
DROP POLICY IF EXISTS entity_scope ON governance.resolutions;
CREATE POLICY entity_scope ON governance.resolutions AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
DROP POLICY IF EXISTS entity_scope ON wealth.holdings;
CREATE POLICY entity_scope ON wealth.holdings AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
DROP POLICY IF EXISTS entity_scope ON credit.loans;
CREATE POLICY entity_scope ON credit.loans AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(lender_entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(lender_entity_id));
DROP POLICY IF EXISTS entity_scope ON core.entities;
CREATE POLICY entity_scope ON core.entities AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(id)) WITH CHECK (core.is_bypass() OR core.entity_ok(id));
-- client assets managed by Aidi Wealth belong to Aidi Wealth (so only people with access to it see them)
UPDATE wealth.holdings h SET entity_id = e.id FROM core.entities e WHERE h.section = 'client' AND h.entity_id IS NULL AND e.organization_id = h.organization_id AND regexp_replace(lower(e.name), '[^a-z0-9]', '', 'g') = 'aidiwealthllc';
DROP POLICY IF EXISTS entity_scope ON banking.statements;
CREATE POLICY entity_scope ON banking.statements AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok((SELECT a.entity_id FROM banking.accounts a WHERE a.id = account_id))) WITH CHECK (core.is_bypass() OR core.entity_ok((SELECT a.entity_id FROM banking.accounts a WHERE a.id = account_id)));
COMMIT;
