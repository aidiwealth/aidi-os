-- 025_tidy.sql — retire the client-portal sign-in and the old plans. Stops if a client with portal access is not on Finvry yet.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM services.clients c WHERE c.workspace_id IS NULL AND EXISTS (SELECT 1 FROM services.people p WHERE p.client_id = c.id AND p.portal_access)) THEN
    RAISE EXCEPTION 'Some clients with portal access are not on Finvry yet. Run Services desk -> Clients -> Move clients to Finvry first.';
  END IF;
END $$;
DROP TABLE IF EXISTS services.portal_codes;
DROP TABLE IF EXISTS services.portal_sessions;
ALTER TABLE services.people DROP COLUMN IF EXISTS invite_token_hash, DROP COLUMN IF EXISTS invite_expires, DROP COLUMN IF EXISTS last_login;
UPDATE platform.leads SET plan_code = NULL WHERE plan_code IS NOT NULL AND plan_code NOT IN ('company_free','company_startup','company_scale','internal');
DELETE FROM core.plans p WHERE code IN ('starter','growth','family_office','enterprise','vc_starter','vc_growth','vc_enterprise','fo_starter','fo_growth','fo_enterprise')
  AND NOT EXISTS (SELECT 1 FROM core.organizations o WHERE o.plan_code = p.code) AND NOT EXISTS (SELECT 1 FROM platform.subscriptions s WHERE s.plan_code = p.code);
COMMIT;
