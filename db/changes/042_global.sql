-- 042_global.sql — naira prices and regions for services; retire Fund services (directory) and Trusted partners.
BEGIN;
ALTER TABLE services.catalog ADD COLUMN IF NOT EXISTS price_ngn numeric(14,2) CHECK (price_ngn IS NULL OR price_ngn >= 0);
ALTER TABLE services.catalog ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'us' CHECK (region IN ('us','ng','all'));
UPDATE core.plans SET modules = array_remove(modules, 'directory');
-- Deleting a workspace or removing a person runs as the database owner, called only from guarded console/admin endpoints.
CREATE OR REPLACE FUNCTION core.delete_organization(org uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = core, public AS $f$
DECLARE u uuid; users uuid[]; r record;
BEGIN
  SELECT array_agg(DISTINCT user_id) INTO users FROM core.memberships WHERE organization_id = org;
  UPDATE services.clients SET workspace_id = NULL WHERE workspace_id = org;
  UPDATE core.users SET last_org_id = NULL WHERE last_org_id = org;
  -- remove the workspace's rows from every table that refers to it (several passes, so dependent rows go first)
  FOR pass IN 1..10 LOOP
    FOR r IN SELECT c.conrelid::regclass AS tbl, a.attname AS col FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
             WHERE c.confrelid = 'core.organizations'::regclass AND c.contype = 'f' AND c.conrelid <> 'core.organizations'::regclass LOOP
      BEGIN EXECUTE format('DELETE FROM %s WHERE %I = $1', r.tbl, r.col) USING org; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    END LOOP;
    BEGIN DELETE FROM core.organizations WHERE id = org; EXIT; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  END LOOP;
  IF EXISTS (SELECT 1 FROM core.organizations WHERE id = org) THEN RAISE EXCEPTION 'workspace still referenced'; END IF;
  FOREACH u IN ARRAY coalesce(users, '{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM core.memberships WHERE user_id = u) THEN
      BEGIN DELETE FROM core.users WHERE id = u; EXCEPTION WHEN foreign_key_violation THEN UPDATE core.users SET status = 'disabled' WHERE id = u; END;
    END IF;
  END LOOP;
END $f$;
CREATE OR REPLACE FUNCTION core.remove_member(usr uuid, org uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = core, public AS $f$
BEGIN
  DELETE FROM core.user_roles WHERE user_id = usr AND organization_id = org;
  DELETE FROM core.memberships WHERE user_id = usr AND organization_id = org;
  DELETE FROM core.sessions WHERE user_id = usr AND organization_id = org;
  UPDATE core.users SET last_org_id = NULL WHERE id = usr AND last_org_id = org;
  IF NOT EXISTS (SELECT 1 FROM core.memberships WHERE user_id = usr) THEN
    BEGIN DELETE FROM core.users WHERE id = usr; EXCEPTION WHEN foreign_key_violation THEN UPDATE core.users SET status = 'disabled' WHERE id = usr; END;
  END IF;
END $f$;
REVOKE ALL ON FUNCTION core.delete_organization(uuid), core.remove_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.delete_organization(uuid), core.remove_member(uuid, uuid) TO aidi_os_app;
COMMIT;
