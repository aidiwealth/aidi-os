-- 028_company_compliance.sql — every company plan includes the compliance calendar.
BEGIN;
UPDATE core.plans SET modules = array_append(modules, 'compliance') WHERE code = 'company_free' AND NOT ('compliance' = ANY(modules));
COMMIT;
