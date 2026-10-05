-- 041_lp_reports.sql — which financials an update draws on (Aidi OS: a fund, entity or the group); LP contacts and
-- LP reports for the Aidi OS venture team.
BEGIN;
ALTER TABLE financials.updates ADD COLUMN IF NOT EXISTS subject text CHECK (subject IS NULL OR subject ~ '^(group|entity:[0-9a-f-]{36}|company:[0-9a-f-]{36})$');
UPDATE core.plans SET modules = array_append(modules, 'contacts') WHERE code = 'internal' AND NOT ('contacts' = ANY(modules));
UPDATE core.plans SET modules = array_append(modules, 'updates') WHERE code = 'internal' AND NOT ('updates' = ANY(modules));
COMMIT;
