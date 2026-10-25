-- 162_statement_ledger.sql — Aidi OS bank statements (Bank & cash, tied out) feed the same ledger as Finvry's Banking,
-- so spend, the cut list, reconciliation, cash and burn read one set of transactions. New ledger source: 'statement'.
BEGIN;
ALTER TABLE banking.ledger DROP CONSTRAINT IF EXISTS ledger_source_check;
ALTER TABLE banking.ledger ADD CONSTRAINT ledger_source_check CHECK (source IN ('bank_feed', 'upload', 'fincra', 'manual', 'statement'));
COMMIT;
