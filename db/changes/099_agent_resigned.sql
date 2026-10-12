-- 099_agent_resigned.sql — when a registered agent renewal is 30 days unpaid the agent resigns: the company records
-- the date (cleared when the team sets the registered agent back to ours).
BEGIN;
ALTER TABLE services.companies ADD COLUMN IF NOT EXISTS agent_resigned_on date;
COMMIT;
