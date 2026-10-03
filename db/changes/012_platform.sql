-- 012_platform.sql — the Aidi workspace keeps the Aidi OS brand (new customer workspaces default to Finvry);
-- platform staff can maintain plans.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/012_platform.sql
BEGIN;
UPDATE core.organizations SET settings = settings || '{"brand":"aidi"}'::jsonb WHERE slug = 'the-aidi-group';
GRANT INSERT, UPDATE ON core.plans TO aidi_os_app;
COMMIT;
