-- 137_valuation.sql — Cap table → Valuation: trading peers and comparable deals (found with AI, edited by the founder),
-- the discounts and the basis, one per cap table. The peer search runs in the background; the page follows it here.
CREATE TABLE IF NOT EXISTS equity.valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  captable_id uuid NOT NULL UNIQUE REFERENCES equity.captables(id) ON DELETE CASCADE,
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb, peers jsonb NOT NULL DEFAULT '[]'::jsonb, searched_at timestamptz,
  search_status text NOT NULL DEFAULT 'idle' CHECK (search_status IN ('idle', 'running', 'failed')), search_error text, search_started_at timestamptz, search_note text,
  updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE equity.valuations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON equity.valuations;
CREATE POLICY tenant_isolation ON equity.valuations USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON equity.valuations TO aidi_os_app;

-- Customer uploads kept a full copy of every file after it was saved (several MB each for a large customer base):
-- the copy is dropped once saved, and unsaved uploads after a day. The app now does both as it goes.
UPDATE financials.customer_imports SET data = '[]'::jsonb WHERE status = 'applied' AND data <> '[]'::jsonb;
DELETE FROM financials.customer_imports WHERE status = 'preview' AND created_at < now() - interval '1 day';
