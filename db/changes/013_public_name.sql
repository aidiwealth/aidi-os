-- 013_public_name.sql — the name founders see for the Aidi workspace.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/013_public_name.sql
BEGIN;
UPDATE core.organizations SET settings = settings || '{"public_name":"Aidi Ventures"}'::jsonb WHERE slug = 'the-aidi-group' AND NOT settings ? 'public_name';
COMMIT;
