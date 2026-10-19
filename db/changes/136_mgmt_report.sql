-- 136_mgmt_report.sql — the monthly management report (fin_report) is on Startup and Scale, and in Aidi OS.
UPDATE core.plans SET modules = array_append(modules, 'fin_report') WHERE code IN ('internal', 'company_startup', 'company_scale') AND NOT ('fin_report' = ANY(modules));
-- The investor page can show revenue by customer sector (shares only, no customer names).
ALTER TABLE financials.public_pages ADD COLUMN IF NOT EXISTS show_sectors boolean NOT NULL DEFAULT false;
