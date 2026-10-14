-- 103_platform_staff_grants.sql — console owners give or remove Finvry console access from the Modules page; the app
-- role could only read core.platform_staff, so saving failed.
BEGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.platform_staff TO aidi_os_app;
COMMIT;
