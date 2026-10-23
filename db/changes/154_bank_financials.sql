-- 154_bank_financials.sql — Financials can start from the bank: monthly figures drafted from the categorised bank
-- transactions and month-end bank cash (cash basis), accepted by the founder, marked as from the bank, and replaced
-- by the company's own accounts (upload, sheet, QuickBooks or typed) whenever those come in.
BEGIN;
ALTER TABLE financials.statements DROP CONSTRAINT IF EXISTS statements_source_check;
ALTER TABLE financials.statements ADD CONSTRAINT statements_source_check CHECK (source IN ('manual', 'upload', 'api', 'sheet', 'bank'));
COMMIT;
