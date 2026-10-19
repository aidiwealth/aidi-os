-- 138_customer_billing.sql — how customers pay, for revenue retention and customer analysis: subscription, usage
-- (pay as you go) or prepaid credits (customers buy credit, like SMS units, and use it over months). For usage and
-- prepaid, a customer counts as lost only after dormant_months without revenue, and retention can use quarter or year
-- windows to even out seasons.
ALTER TABLE financials.customer_config ADD COLUMN IF NOT EXISTS billing text NOT NULL DEFAULT 'subscription' CHECK (billing IN ('subscription', 'usage', 'prepaid'));
ALTER TABLE financials.customer_config ADD COLUMN IF NOT EXISTS dormant_months integer NOT NULL DEFAULT 1 CHECK (dormant_months BETWEEN 1 AND 12);
ALTER TABLE financials.customer_config ADD COLUMN IF NOT EXISTS retention_basis text NOT NULL DEFAULT 'month' CHECK (retention_basis IN ('month', 'quarter', 'year'));
