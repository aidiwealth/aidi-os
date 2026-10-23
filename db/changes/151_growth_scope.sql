-- 151_growth_scope.sql — Sales, Marketing, Banking and the Stage Monitor follow the company chosen at the top (or the
-- whole group), like Financials.
--  growth.processes.entity_id: the company a sales or marketing process belongs to (NULL: used across the group).
--  growth.deals.entity_id: the company a deal is for (NULL: the main company).
--  banking.budgets.scope: a budget for one company (its id) or the group ('group').
--  financials.stage_snapshots: a snapshot for the group has no company (entity_id NULL).
BEGIN;
ALTER TABLE growth.processes ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL;
ALTER TABLE growth.deals ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS deals_entity_idx ON growth.deals (entity_id);
CREATE INDEX IF NOT EXISTS ledger_entity_idx ON banking.ledger (organization_id, entity_id, txn_date DESC);

ALTER TABLE banking.budgets ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'group';
ALTER TABLE banking.budgets DROP CONSTRAINT IF EXISTS budgets_organization_id_category_key;
CREATE UNIQUE INDEX IF NOT EXISTS budgets_scope_category ON banking.budgets (organization_id, scope, category);

ALTER TABLE financials.stage_snapshots ALTER COLUMN entity_id DROP NOT NULL;
ALTER TABLE financials.stage_snapshots DROP CONSTRAINT IF EXISTS stage_snapshots_organization_id_entity_id_period_key;
CREATE UNIQUE INDEX IF NOT EXISTS stage_snapshots_scope ON financials.stage_snapshots (organization_id, (coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)), period);
COMMIT;
