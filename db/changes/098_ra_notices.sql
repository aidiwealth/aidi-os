-- 098_ra_notices.sql — notice of intent to resign as registered agent, sent automatically when a registered agent
-- renewal is unpaid 30 days after it was due (a wallet subscription or a services invoice). One notice per due date.
BEGIN;
ALTER TABLE wallet.subscriptions ADD COLUMN IF NOT EXISTS overdue_since date;
-- Renewals already failing: the original due date is about 3 days before the retry date.
UPDATE wallet.subscriptions SET overdue_since = next_charge_at - 3 WHERE overdue_since IS NULL AND (failures > 0 OR status = 'suspended');
CREATE TABLE IF NOT EXISTS services.ra_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES services.clients(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('subscription', 'invoice')),
  source_id uuid NOT NULL,
  due_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL,
  company text,
  document_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES services.threads(id) ON DELETE SET NULL,
  emailed int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id, due_date));
CREATE INDEX IF NOT EXISTS ra_notices_client ON services.ra_notices (client_id, created_at DESC);
ALTER TABLE services.ra_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON services.ra_notices;
CREATE POLICY tenant_isolation ON services.ra_notices USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON services.ra_notices TO aidi_os_app;
COMMIT;
