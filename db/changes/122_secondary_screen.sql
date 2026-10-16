-- Secondaries: an AI screen of each opportunity against our criteria and thesis (advice for the team).
ALTER TABLE wm.secondaries ADD COLUMN IF NOT EXISTS ai_screen jsonb, ADD COLUMN IF NOT EXISTS ai_screened_at timestamptz;
