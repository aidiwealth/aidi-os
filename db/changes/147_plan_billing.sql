-- 147_plan_billing.sql — plan billing set by the Finvry team: monthly, yearly, or the company's choice (default), with
-- a discount for paying yearly (default 5%). Companies already billed yearly keep yearly; the plans' stored yearly
-- prices follow the discount (the app works them out the same way).
BEGIN;
INSERT INTO platform.settings (key, value) VALUES ('plan_billing', '{"cycles": "both", "annual_discount_pct": 5}'::jsonb) ON CONFLICT (key) DO NOTHING;
UPDATE core.organizations o SET settings = o.settings || '{"billing_cycle": "year"}'::jsonb
  WHERE o.kind = 'company' AND NOT (o.settings ? 'billing_cycle') AND NOT (o.settings ? 'price_override')
    AND EXISTS (SELECT 1 FROM wallet.subscriptions s WHERE s.organization_id = o.id AND s.kind = 'plan' AND s.status <> 'cancelled' AND s.interval = 'year');
UPDATE core.plans SET price_annual_usd = round(price_monthly_usd * 12 * 0.95, 2), price_annual_ngn = round(price_monthly_ngn * 12 * 0.95, 2)
  WHERE code IN ('company_startup', 'company_medium', 'company_scale');
COMMIT;
