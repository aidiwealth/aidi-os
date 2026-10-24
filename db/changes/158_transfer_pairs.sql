-- 158_transfer_pairs.sql — Finding money moved between a company's own accounts: a payment out of one account matched
-- with the same amount into another within three days (banking.ledger, by organisation, currency and amount).
BEGIN;
CREATE INDEX IF NOT EXISTS ledger_pair_idx ON banking.ledger (organization_id, currency, amount, txn_date) WHERE direction = 'in';
COMMIT;
