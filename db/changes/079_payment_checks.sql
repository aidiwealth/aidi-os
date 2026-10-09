-- 079_payment_checks.sql — what the attached receipt or invoice says (read by AI when it is uploaded) and how it compares
-- with the payment as logged, so a wrong amount or receipt number is flagged.
ALTER TABLE finance.expenses ADD COLUMN IF NOT EXISTS receipt_number text;
ALTER TABLE finance.expenses ADD COLUMN IF NOT EXISTS receipt_amount numeric(16,2);
ALTER TABLE finance.expenses ADD COLUMN IF NOT EXISTS receipt_currency text;
ALTER TABLE finance.expenses ADD COLUMN IF NOT EXISTS receipt_date date;
ALTER TABLE finance.expenses ADD COLUMN IF NOT EXISTS receipt_payee text;
ALTER TABLE finance.expenses ADD COLUMN IF NOT EXISTS receipt_status text;
ALTER TABLE finance.expenses ADD COLUMN IF NOT EXISTS receipt_issues jsonb NOT NULL DEFAULT '[]'::jsonb;
DO $$ BEGIN
  ALTER TABLE finance.expenses ADD CONSTRAINT expenses_receipt_status_chk CHECK (receipt_status IS NULL OR receipt_status IN ('match','mismatch','unreadable'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
