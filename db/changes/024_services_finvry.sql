-- 024_services_finvry.sql — services clients linked to Finvry company workspaces; the services operator; a services-desk role.
BEGIN;
ALTER TABLE services.clients ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES core.organizations(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clients_workspace_uniq ON services.clients (workspace_id) WHERE workspace_id IS NOT NULL;
INSERT INTO core.roles (code, description) VALUES ('services', 'Services desk: clients, jobs, invoices and filings only') ON CONFLICT (code) DO NOTHING;
UPDATE core.organizations SET settings = settings || '{"services_operator":"true"}'::jsonb WHERE slug = 'the-aidi-group';
UPDATE core.plans SET modules = array_append(modules, 'company_services') WHERE code IN ('company_free','company_startup','company_scale') AND NOT ('company_services' = ANY(modules));
COMMIT;
