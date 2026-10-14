-- 105_entity_scope_more.sql — people limited to some companies:
--  * see a loan when it was lent by one of their companies, or paid out from one of their companies' bank accounts
--    (loans booked without a lender default to the main fund);
--  * see only the live bank connections (Plaid) of their companies;
--  * see only the decks of their companies (decks can now belong to a company).
-- Tax documents: team members can also file internal tax documents (for GPs and admins, optionally for a company).
BEGIN;
-- Strict: inside the person's scope (no company = not inside, unless they see everything).
CREATE OR REPLACE FUNCTION core.entity_in(eid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.entity_scope', true), '') = '' OR (eid IS NOT NULL AND eid::text = ANY (string_to_array(current_setting('app.entity_scope', true), ',')))
$$;
GRANT EXECUTE ON FUNCTION core.entity_in(uuid) TO aidi_os_app;

DROP POLICY IF EXISTS entity_scope ON credit.loans;
CREATE POLICY entity_scope ON credit.loans AS RESTRICTIVE
  USING (core.is_bypass() OR core.entity_ok(lender_entity_id) OR EXISTS (SELECT 1 FROM finance.deployments d LEFT JOIN banking.accounts a ON a.id = d.bank_account_id WHERE d.loan_id = loans.id AND (core.entity_in(d.paying_entity_id) OR core.entity_in(a.entity_id))))
  WITH CHECK (core.is_bypass() OR core.entity_ok(lender_entity_id));

DROP POLICY IF EXISTS entity_scope ON banking.plaid_items;
CREATE POLICY entity_scope ON banking.plaid_items AS RESTRICTIVE USING (core.is_bypass() OR core.entity_in(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
DROP POLICY IF EXISTS entity_scope ON banking.plaid_accounts;
CREATE POLICY entity_scope ON banking.plaid_accounts AS RESTRICTIVE USING (core.is_bypass() OR EXISTS (SELECT 1 FROM banking.plaid_items i WHERE i.id = plaid_accounts.item_id)) WITH CHECK (true);

ALTER TABLE fundraise.decks ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL;
DROP POLICY IF EXISTS entity_scope ON fundraise.decks;
CREATE POLICY entity_scope ON fundraise.decks AS RESTRICTIVE USING (core.is_bypass() OR core.entity_in(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));

ALTER TABLE core.tax_docs ADD COLUMN IF NOT EXISTS internal boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL;
ALTER TABLE core.tax_docs DROP CONSTRAINT IF EXISTS tax_docs_check;
ALTER TABLE core.tax_docs ADD CONSTRAINT tax_docs_check CHECK ((internal AND lp_id IS NULL AND wm_client_id IS NULL) OR (NOT internal AND (lp_id IS NULL) <> (wm_client_id IS NULL)));
DROP POLICY IF EXISTS entity_scope ON core.tax_docs;
CREATE POLICY entity_scope ON core.tax_docs AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
COMMIT;
