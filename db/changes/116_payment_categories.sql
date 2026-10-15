-- Payment categories a workspace adds on top of the built-in ones, each tied to a line of the financial statements so
-- payments, journals and statements stay in balance. Team payments can be linked to the bank transaction that paid them.
CREATE TABLE IF NOT EXISTS finance.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  statement_line text NOT NULL DEFAULT 'opex_other' CHECK (statement_line IN ('cogs','opex_payroll','opex_marketing','opex_rnd','opex_ga','opex_other')),
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name));
ALTER TABLE finance.expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON finance.expense_categories;
CREATE POLICY tenant_isolation ON finance.expense_categories USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON finance.expense_categories TO aidi_os_app;

ALTER TABLE hr.payments ADD COLUMN IF NOT EXISTS bank_txn_id uuid REFERENCES banking.transactions(id) ON DELETE SET NULL;
