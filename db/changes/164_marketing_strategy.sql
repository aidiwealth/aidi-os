-- 164_marketing_strategy.sql — the marketing strategy written from a founder's document (or by hand), shown on the
-- Marketing dashboard with the funnel, channels and campaigns built from it.
BEGIN;
ALTER TABLE growth.processes ADD COLUMN IF NOT EXISTS strategy text;
ALTER TABLE growth.processes DROP CONSTRAINT IF EXISTS processes_strategy_check;
ALTER TABLE growth.processes ADD CONSTRAINT processes_strategy_check CHECK (strategy IS NULL OR length(strategy) <= 40000);
COMMIT;
