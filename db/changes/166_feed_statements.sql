-- 166_feed_statements.sql — Aidi OS: a bank connected directly (live feed) also keeps the monthly statement view that
-- Overview, Family Office analytics, Rentals and the Journals check read. Each connected bank account gets a Bank & cash
-- account (linked to the feed account), a statement per month (source 'feed', tied out from the live balance), and its
-- transactions (keyed by the feed's own reference, so matches made on them survive each refresh).
ALTER TABLE banking.accounts ADD COLUMN IF NOT EXISTS plaid_account_id uuid REFERENCES banking.plaid_accounts(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_plaid_uidx ON banking.accounts (plaid_account_id) WHERE plaid_account_id IS NOT NULL;
ALTER TABLE banking.statements DROP CONSTRAINT IF EXISTS statements_source_check;
ALTER TABLE banking.statements ADD CONSTRAINT statements_source_check CHECK (source IN ('csv', 'pdf', 'manual', 'feed'));
ALTER TABLE banking.transactions ADD COLUMN IF NOT EXISTS feed_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_feed_uidx ON banking.transactions (account_id, feed_ref) WHERE feed_ref IS NOT NULL;
-- Uploaded statements stay as filed; only the months made from a live feed are brought up to date.
GRANT UPDATE (opening_balance, closing_balance, credits_total, debits_total, txn_count, continuity_ok, source) ON banking.statements TO aidi_os_app;
GRANT UPDATE (statement_id, txn_date, description, amount, balance) ON banking.transactions TO aidi_os_app;
CREATE OR REPLACE FUNCTION banking.feed_statements_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.source <> 'feed' THEN RAISE EXCEPTION 'Uploaded bank statements cannot be changed'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION banking.feed_transactions_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.feed_ref IS NULL THEN RAISE EXCEPTION 'Uploaded bank statements cannot be changed'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS statements_feed_only ON banking.statements;
CREATE TRIGGER statements_feed_only BEFORE UPDATE ON banking.statements FOR EACH ROW EXECUTE FUNCTION banking.feed_statements_only();
DROP TRIGGER IF EXISTS transactions_feed_only ON banking.transactions;
CREATE TRIGGER transactions_feed_only BEFORE UPDATE ON banking.transactions FOR EACH ROW EXECUTE FUNCTION banking.feed_transactions_only();
