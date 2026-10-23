-- 155_speed.sql — Indexes for the queries Banking, Reconcile and the Growth pages run most as data grows.
BEGIN;
CREATE INDEX IF NOT EXISTS ledger_account_idx ON banking.ledger (organization_id, account_label, txn_date);
CREATE INDEX IF NOT EXISTS ledger_source_idx ON banking.ledger (organization_id, source, txn_date DESC);
CREATE INDEX IF NOT EXISTS ledger_auto_out_idx ON banking.ledger (organization_id, direction, category_by) WHERE category_by = 'auto';
CREATE INDEX IF NOT EXISTS links_kind_idx ON growth.links (organization_id, kind, last_synced_at);
CREATE INDEX IF NOT EXISTS processes_kind_idx ON growth.processes (organization_id, kind);
CREATE INDEX IF NOT EXISTS statements_source_idx ON financials.statements (organization_id, entity_id, source) WHERE source = 'bank';
ANALYZE banking.ledger; ANALYZE growth.deals; ANALYZE financials.statements;
COMMIT;
