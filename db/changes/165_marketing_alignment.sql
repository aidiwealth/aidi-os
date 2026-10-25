-- 165_marketing_alignment.sql — the latest AI review of how marketing activity is tracking against the strategy.
BEGIN;
ALTER TABLE growth.processes ADD COLUMN IF NOT EXISTS alignment text;
ALTER TABLE growth.processes ADD COLUMN IF NOT EXISTS alignment_at timestamptz;
ALTER TABLE growth.processes DROP CONSTRAINT IF EXISTS processes_alignment_check;
ALTER TABLE growth.processes ADD CONSTRAINT processes_alignment_check CHECK (alignment IS NULL OR length(alignment) <= 30000);
COMMIT;
