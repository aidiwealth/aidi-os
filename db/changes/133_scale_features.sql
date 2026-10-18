-- 133_scale_features.sql — Revenue retention and Customers, subsidiaries and forecasts move to the Scale plan.
-- Prices are unchanged; Startup keeps everything else.
UPDATE core.plans SET modules = array_remove(array_remove(modules, 'fin_customers'), 'forecast') WHERE code = 'company_startup';
UPDATE core.plans SET modules = array(SELECT DISTINCT unnest(modules || ARRAY['fin_customers', 'forecast'])) WHERE code = 'company_scale';
