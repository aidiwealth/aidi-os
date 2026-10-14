-- 106_bank_scope_credit_fix.sql
-- Bank transactions and imports follow their account: someone limited to some companies sees only those companies'
-- bank lines (Payments "bank payments not logged", reconciliations).
BEGIN;
DROP POLICY IF EXISTS entity_scope ON banking.transactions;
CREATE POLICY entity_scope ON banking.transactions AS RESTRICTIVE USING (core.is_bypass() OR EXISTS (SELECT 1 FROM banking.accounts a WHERE a.id = transactions.account_id)) WITH CHECK (true);
DROP POLICY IF EXISTS entity_scope ON banking.imports;
CREATE POLICY entity_scope ON banking.imports AS RESTRICTIVE USING (core.is_bypass() OR account_id IS NULL OR EXISTS (SELECT 1 FROM banking.accounts a WHERE a.id = imports.account_id)) WITH CHECK (true);

-- The NGN 10m loan to Newllyon Limited (AV-NEWLLYON) was paid from Aidi Technology Limited, not Aidi Ventures LLC:
-- the loan, its deployment and that deployment's journal lines move to Aidi Technology Limited.
WITH tech AS (SELECT id, organization_id FROM core.entities WHERE name = 'Aidi Technology Limited'),
     l AS (UPDATE credit.loans x SET lender_entity_id = tech.id FROM tech WHERE x.organization_id = tech.organization_id AND x.reference = 'AV-NEWLLYON' RETURNING x.id, tech.id AS tech_id),
     d AS (UPDATE finance.deployments dp SET paying_entity_id = l.tech_id FROM l WHERE dp.loan_id = l.id RETURNING dp.id, l.tech_id)
UPDATE finance.journal j SET entity_id = d.tech_id FROM d WHERE j.deployment_id = d.id;
COMMIT;
