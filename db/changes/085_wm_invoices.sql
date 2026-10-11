-- Wealth invoices: the team writes invoices for wealth clients with their own line items, contracting entity and dates,
-- alongside the automatic subscription / advisory / referral fees. Drafts are not numbered or shown to the client.
BEGIN;
ALTER TABLE wm.fees ADD COLUMN IF NOT EXISTS lines jsonb;
ALTER TABLE wm.fees ADD COLUMN IF NOT EXISTS issue_date date;
ALTER TABLE wm.fees ADD COLUMN IF NOT EXISTS bill_to jsonb;
ALTER TABLE wm.fees DROP CONSTRAINT IF EXISTS fees_kind_check;
ALTER TABLE wm.fees DROP CONSTRAINT IF EXISTS wm_fees_kind_check;
ALTER TABLE wm.fees ADD CONSTRAINT wm_fees_kind_check CHECK (kind IN ('subscription','advisory','referral','invoice'));
ALTER TABLE wm.fees DROP CONSTRAINT IF EXISTS fees_status_check;
ALTER TABLE wm.fees DROP CONSTRAINT IF EXISTS wm_fees_status_check;
ALTER TABLE wm.fees ADD CONSTRAINT wm_fees_status_check CHECK (status IN ('draft','due','paid','waived'));
COMMIT;
