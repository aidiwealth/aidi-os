-- 145_entity_forecasts.sql — forecasts per company in a group.
--  Each company (core.entities, operating) keeps its own forecasts, in its own currency; one of them is the one the
--  group forecast uses (is_main; else its most recently updated). The group forecast is every company's main forecast
--  converted to the reporting currency and added together, worked out when it is opened (nothing stored).
--  Existing forecasts belong to the main company.
BEGIN;
ALTER TABLE financials.forecasts ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL;
ALTER TABLE financials.forecasts ADD COLUMN IF NOT EXISTS is_main boolean NOT NULL DEFAULT false;
UPDATE financials.forecasts f SET entity_id = (SELECT e.id FROM core.entities e WHERE e.organization_id = f.organization_id AND e.kind = 'operating'
  ORDER BY (e.parent_id IS NOT NULL), e.created_at LIMIT 1) WHERE f.entity_id IS NULL;
CREATE INDEX IF NOT EXISTS forecasts_entity_idx ON financials.forecasts (entity_id, updated_at DESC);
COMMIT;
