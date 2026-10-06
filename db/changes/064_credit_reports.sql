-- 064_credit_reports.sql — a bureau report file kept with a manual credit score.
BEGIN;
ALTER TABLE credit.checks ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES core.documents(id) ON DELETE SET NULL;
ALTER TABLE credit.checks ADD COLUMN IF NOT EXISTS source text;
COMMIT;
