-- 048_support_inbox.sql — support sign-in sessions; Inbox for companies; Delaware mailbox retired.
BEGIN;
ALTER TABLE core.sessions ADD COLUMN IF NOT EXISTS impersonated_by uuid REFERENCES core.users(id) ON DELETE SET NULL;
UPDATE core.plans SET modules = array_append(modules, 'client_inbox') WHERE 'company_services' = ANY(modules) AND code <> 'internal' AND NOT ('client_inbox' = ANY(modules));
UPDATE services.catalog SET active = false WHERE code = 'de_mailbox';
UPDATE services.catalog SET description = 'A business address with mail handling in the state you choose, or in Lagos, Nigeria.' WHERE code = 'virtual_office' AND (description IS NULL OR description ILIKE '%US business address%');
COMMIT;
