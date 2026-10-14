-- 104_role_scope_subsidiaries.sql — a role given for one entity can cover just that company, or that company and its
-- subsidiaries. Existing entity roles keep covering subsidiaries.
BEGIN;
ALTER TABLE core.user_roles ADD COLUMN IF NOT EXISTS include_subsidiaries boolean NOT NULL DEFAULT true;
COMMIT;
