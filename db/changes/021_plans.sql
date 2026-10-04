-- 021_plans.sql — two customer kinds (venture fund, family office), three plans each. Old plans retire; workspaces,
-- subscriptions and leads move to the matching new plan.
BEGIN;
INSERT INTO core.plans (code, name, description, modules, seat_limit, storage_gb, ai_runs_month, price_monthly_usd, price_annual_usd, public, active, sort) VALUES
 ('vc_starter', 'VC Starter', 'For venture funds: pitches, pipeline, portfolio and analytics.', '{pitches,pipeline,portfolio,analytics}', 3, 10, 200, 199, 1990, true, true, 1),
 ('vc_growth', 'VC Growth', 'Venture funds: adds Funds & LPs and Credit.', '{pitches,pipeline,portfolio,analytics,funds,credit}', 10, 50, 1000, 599, 5990, true, true, 2),
 ('vc_enterprise', 'VC Enterprise', 'Venture funds: everything in Growth plus Client Services.', '{pitches,pipeline,portfolio,analytics,funds,credit,services,cs_analytics}', NULL, 200, 5000, NULL, NULL, true, true, 3),
 ('fo_starter', 'Family Office Starter', 'For family offices: entities, documents, compliance and analytics, plus the VC tools.', '{pitches,pipeline,portfolio,analytics,entities,documents,compliance,fo_analytics}', 3, 20, 200, NULL, NULL, true, true, 11),
 ('fo_growth', 'Family Office Growth', 'Family offices: adds trusts and governance, bank and cash, Funds & LPs and Credit.', '{pitches,pipeline,portfolio,analytics,entities,documents,compliance,fo_analytics,governance,banking,funds,credit}', 10, 100, 1000, 1500, 15000, true, true, 12),
 ('fo_enterprise', 'Family Office Enterprise', 'Family offices: everything in Growth plus Client Services.', '{pitches,pipeline,portfolio,analytics,entities,documents,compliance,fo_analytics,governance,banking,funds,credit,services,cs_analytics}', NULL, 500, 5000, NULL, NULL, true, true, 13)
ON CONFLICT (code) DO NOTHING;
UPDATE core.plans SET modules = '{pitches,pipeline,portfolio,analytics,entities,documents,compliance,fo_analytics,governance,banking,funds,credit,services,cs_analytics}' WHERE code = 'internal';

UPDATE core.organizations SET kind = 'vc' WHERE kind NOT IN ('vc','family_office');
UPDATE core.organizations SET plan_code = CASE WHEN kind = 'vc' THEN (CASE plan_code WHEN 'starter' THEN 'vc_starter' WHEN 'enterprise' THEN 'vc_enterprise' ELSE 'vc_growth' END)
  ELSE (CASE plan_code WHEN 'starter' THEN 'fo_starter' WHEN 'enterprise' THEN 'fo_enterprise' ELSE 'fo_growth' END) END
 WHERE plan_code IN ('starter','growth','family_office','enterprise');
UPDATE platform.subscriptions s SET plan_code = o.plan_code FROM core.organizations o WHERE o.id = s.organization_id AND s.plan_code IN ('starter','growth','family_office','enterprise');
UPDATE platform.leads SET kind = 'vc' WHERE kind NOT IN ('vc','family_office');
UPDATE platform.leads SET plan_code = CASE WHEN kind = 'vc' THEN (CASE plan_code WHEN 'starter' THEN 'vc_starter' WHEN 'enterprise' THEN 'vc_enterprise' ELSE 'vc_growth' END)
  ELSE (CASE plan_code WHEN 'starter' THEN 'fo_starter' WHEN 'enterprise' THEN 'fo_enterprise' ELSE 'fo_growth' END) END
 WHERE plan_code IN ('starter','growth','family_office','enterprise');
UPDATE core.plans SET active = false, public = false WHERE code IN ('starter','growth','family_office','enterprise');
COMMIT;
