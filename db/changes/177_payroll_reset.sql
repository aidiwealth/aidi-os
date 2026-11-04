-- 177_payroll_reset.sql — a payment and its pay-run record are one thing: deleting either deletes the other.
--  - Deleting a logged payment (Payments) deletes the pay run it recorded (Team → Pay), so that pay shows as due again.
--  - Deleting a pay run deletes its entry under Payments (and so its book entries, which go with the payment).
-- Then, as asked, every pay run logged in Aidi OS (the Aidi Group workspace) is deleted with the payments it recorded,
-- so each person's pay shows as due again. Finvry companies' records are not touched.
BEGIN;
DO $$ DECLARE c text; BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'hr.payments'::regclass AND contype = 'f' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'hr.payments'::regclass AND attname = 'expense_id')];
  IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE hr.payments DROP CONSTRAINT ' || quote_ident(c); END IF;
END $$;
ALTER TABLE hr.payments ADD CONSTRAINT hr_payments_expense_fk FOREIGN KEY (expense_id) REFERENCES finance.expenses(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION hr.drop_payment_expense() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.expense_id IS NOT NULL THEN DELETE FROM finance.expenses WHERE id = OLD.expense_id; END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS hr_payment_drop_expense ON hr.payments;
CREATE TRIGGER hr_payment_drop_expense AFTER DELETE ON hr.payments FOR EACH ROW EXECUTE FUNCTION hr.drop_payment_expense();

-- The reset: Aidi OS pay runs and the payments they recorded.
DELETE FROM hr.payments p USING core.organizations o WHERE o.id = p.organization_id AND o.kind = 'family_office';
COMMIT;
