-- 157_bank_uploads.sql — Uploaded bank statements as records of their own, so a statement can be deleted (taking out
-- the transactions it brought in), an uploaded account cleared, and a newer statement added to an account already there.
--  banking.uploads: one row per statement uploaded: the account it is for, its period, closing balance and the file.
--  banking.ledger.upload_id: the statement a transaction came in with (none for older uploads and linked sheets).
BEGIN;
CREATE TABLE IF NOT EXISTS banking.uploads (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  entity_id       uuid          REFERENCES core.entities(id) ON DELETE SET NULL,
  account_label   text          NOT NULL CHECK (length(account_label) <= 160),
  currency        text          NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  file_name       text          CHECK (length(file_name) <= 200),
  file_kind       text          NOT NULL CHECK (file_kind IN ('csv', 'xlsx', 'pdf', 'image')),
  period_start    date,
  period_end      date,
  closing         numeric(18,2),
  read_count      integer       NOT NULL DEFAULT 0,
  added_count     integer       NOT NULL DEFAULT 0,
  doc_id          uuid,
  by_user         uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz   NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS uploads_account_idx ON banking.uploads (organization_id, account_label);
ALTER TABLE banking.ledger ADD COLUMN IF NOT EXISTS upload_id uuid;
CREATE INDEX IF NOT EXISTS ledger_upload_idx ON banking.ledger (upload_id) WHERE upload_id IS NOT NULL;
ALTER TABLE banking.uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON banking.uploads;
CREATE POLICY tenant_isolation ON banking.uploads USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON banking.uploads TO aidi_os_app;
COMMIT;
