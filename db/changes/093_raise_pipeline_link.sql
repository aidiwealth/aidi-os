-- 093_raise_pipeline_link.sql — investors the services team adds to a managed raise can also go into the founder's own
-- Fundraising pipeline (crm.deals). Those deals are marked as added by the team and carry no contact details.
BEGIN;
ALTER TABLE crm.deals ADD COLUMN IF NOT EXISTS added_by_team boolean NOT NULL DEFAULT false;
ALTER TABLE services.raise_investors ADD COLUMN IF NOT EXISTS deal_id uuid;
ALTER TABLE services.raise_programs ADD COLUMN IF NOT EXISTS pipeline_id uuid;
COMMIT;
