-- 023_company_plans.sql — Finvry for companies: naira prices on plans, three company plans, VC and family-office
-- plans off sale, and the Termii, Telroi LLC and Aidi Ventures Fund workspaces closed (data kept).
BEGIN;
ALTER TABLE core.plans ADD COLUMN IF NOT EXISTS price_monthly_ngn numeric(14,2);
ALTER TABLE core.plans ADD COLUMN IF NOT EXISTS price_annual_ngn numeric(14,2);
INSERT INTO core.plans (code, name, description, modules, seat_limit, storage_gb, ai_runs_month, price_monthly_usd, price_annual_usd, price_monthly_ngn, price_annual_ngn, public, active, sort) VALUES
 ('company_free', 'Free', 'Your financials in one place: statements from spreadsheets, trends and share links.', '{financials,documents}', 1, 1, 20, 0, 0, 0, 0, true, true, 21),
 ('company_startup', 'Startup', 'For founders reporting to investors: everything in Free, compliance calendar, more seats and AI.', '{financials,documents,compliance}', 5, 10, 200, 29, 290, 25000, 250000, true, true, 22),
 ('company_scale', 'Scale', 'For growing companies: everything in Startup with more seats, storage and AI.', '{financials,documents,compliance}', 20, 50, 1000, 99, 990, 85000, 850000, true, true, 23)
ON CONFLICT (code) DO NOTHING;
UPDATE core.plans SET public = false, active = false WHERE code LIKE 'vc\_%' OR code LIKE 'fo\_%';
UPDATE core.organizations SET status = 'closed' WHERE slug IN ('termii','telroi-llc','aidi-ventures-fund');
COMMIT;
