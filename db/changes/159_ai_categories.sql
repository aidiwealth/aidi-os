-- 159_ai_categories.sql — Categories suggested by AI for each vendor and direction (money in or out), applied to every
-- payment past and future that the founder has not categorised themselves. The founder's own choices and "always"
-- rules come first; transfers between the company's own accounts are found before AI is asked.
--  banking.ai_rules: per vendor and direction, the category AI chose (NULL when it was not sure) and how sure it was.
--  banking.ledger.category_by: 'ai' for payments categorised by an AI rule.
BEGIN;
CREATE TABLE IF NOT EXISTS banking.ai_rules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  vendor_key      text        NOT NULL CHECK (length(vendor_key) <= 80),
  direction       text        NOT NULL CHECK (direction IN ('in', 'out')),
  category        text        CHECK (length(category) <= 140),
  confidence      numeric(3,2),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, vendor_key, direction));
ALTER TABLE banking.ai_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON banking.ai_rules;
CREATE POLICY tenant_isolation ON banking.ai_rules USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON banking.ai_rules TO aidi_os_app;
ALTER TABLE banking.ledger DROP CONSTRAINT IF EXISTS ledger_category_by_check;
ALTER TABLE banking.ledger ADD CONSTRAINT ledger_category_by_check CHECK (category_by IN ('auto', 'rule', 'manual', 'ai'));
CREATE INDEX IF NOT EXISTS ledger_vendor_dir_idx ON banking.ledger (organization_id, vendor_key, direction);
COMMIT;
