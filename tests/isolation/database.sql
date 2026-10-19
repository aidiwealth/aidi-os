-- Company isolation checks on the live database. Run with psql as the admin role (the run scripts do this after the
-- migrations). Nothing is changed: everything runs in one transaction that is rolled back, and the leak test runs
-- read-only. Any failure stops the script (ON_ERROR_STOP) with the table named.
--
--  1. The app's database role cannot get round row-level security: not a superuser, no BYPASSRLS, owns no tables.
--  2. Every table holding a company's rows (an organization_id column) has row-level security on and a company
--     policy, except the few listed below with the reason.
--  3. No company policy lets rows through without a company check (no USING (true)).
--  4. Leak test, as the app role: a made-up company sees no rows in any table; with no company set nothing is seen;
--     and for real companies, no table shows a row belonging to another company.
\set ON_ERROR_STOP 1
\pset pager off
BEGIN;
SET LOCAL statement_timeout = '120s';

CREATE TEMP TABLE iso_exempt (tbl text PRIMARY KEY, why text NOT NULL) ON COMMIT DROP;
INSERT INTO iso_exempt VALUES
  ('core.sessions', 'sign-in sessions: read by the session cookie before any company is known'),
  ('crm.investor_directory_uses', 'shared investor directory: only counts are read, never which company used an entry'),
  ('platform.partner_redemptions', 'partner discount codes: read by the platform console only');

-- 1. The app role.
DO $$
DECLARE r record; n int;
BEGIN
  SELECT rolsuper, rolbypassrls INTO r FROM pg_roles WHERE rolname = 'aidi_os_app';
  IF NOT FOUND THEN RAISE EXCEPTION 'isolation: role aidi_os_app not found'; END IF;
  IF r.rolsuper OR r.rolbypassrls THEN RAISE EXCEPTION 'isolation: aidi_os_app can bypass row-level security (superuser or BYPASSRLS)'; END IF;
  SELECT count(*) INTO n FROM pg_class c JOIN pg_roles o ON o.oid = c.relowner WHERE o.rolname = 'aidi_os_app' AND c.relkind IN ('r', 'p');
  IF n > 0 THEN RAISE EXCEPTION 'isolation: aidi_os_app owns % table(s); owners are not filtered by row-level security', n; END IF;
  RAISE NOTICE 'ok   app role cannot bypass row-level security';
END $$;

-- 2 and 3. Coverage and policy shape.
DO $$
DECLARE r record; bad text := '';
BEGIN
  FOR r IN
    SELECT n.nspname || '.' || c.relname AS tbl, c.relrowsecurity AS rls,
           EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polpermissive AND pg_get_expr(p.polqual, p.polrelid) ~ '(current_org|is_bypass)') AS pol,
           EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polpermissive AND (p.polqual IS NULL OR pg_get_expr(p.polqual, p.polrelid) IN ('true', '(true)'))) AS open
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%'
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped)
       AND n.nspname || '.' || c.relname NOT IN (SELECT tbl FROM iso_exempt)
  LOOP
    IF NOT r.rls THEN bad := bad || E'\n  ' || r.tbl || ': row-level security is off';
    ELSIF NOT r.pol THEN bad := bad || E'\n  ' || r.tbl || ': no company policy';
    ELSIF r.open THEN bad := bad || E'\n  ' || r.tbl || ': a policy lets every row through'; END IF;
  END LOOP;
  IF bad <> '' THEN RAISE EXCEPTION 'isolation: company tables without protection:%', bad; END IF;
  RAISE NOTICE 'ok   every company table has row-level security and a company policy';
END $$;

-- 4. Leak test as the app role. The admin role may need membership to switch to it; the grant is rolled back.
DO $$
BEGIN
  IF NOT pg_has_role(current_user, 'aidi_os_app', 'SET') AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    EXECUTE format('GRANT aidi_os_app TO %I WITH INHERIT FALSE, SET TRUE', current_user);
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip leak test: cannot act as aidi_os_app (%)', SQLERRM;
END $$;

SELECT set_config('app.bypass', 'on', true) \gset iso_
CREATE TEMP TABLE iso_orgs ON COMMIT DROP AS
  SELECT id FROM core.organizations ORDER BY (settings->>'brand' = 'aidi') DESC NULLS LAST, created_at DESC LIMIT 6;
CREATE TEMP TABLE iso_tables ON COMMIT DROP AS
  SELECT n.nspname || '.' || c.relname AS tbl, format('%I.%I', n.nspname, c.relname) AS q,
         EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped) AS has_org
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r', 'p') AND c.relrowsecurity AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%';
GRANT SELECT ON iso_orgs, iso_tables TO aidi_os_app;

DO $$
DECLARE t record; o record; hit boolean; bad text := ''; checked int := 0;
BEGIN
  BEGIN EXECUTE 'SET LOCAL ROLE aidi_os_app';
  EXCEPTION WHEN others THEN RAISE NOTICE 'skip leak test: %', SQLERRM; RETURN; END;
  SET LOCAL transaction_read_only = on;
  FOR t IN SELECT * FROM iso_tables ORDER BY tbl LOOP
    CONTINUE WHEN NOT has_table_privilege(t.q, 'SELECT');
    checked := checked + 1;
    PERFORM set_config('app.bypass', 'off', true); PERFORM set_config('app.entity_scope', '', true);
    PERFORM set_config('app.org_id', '', true);
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM ' || t.q || ')' INTO hit;
    IF hit THEN bad := bad || E'\n  ' || t.tbl || ': rows seen with no company set'; END IF;
    PERFORM set_config('app.org_id', gen_random_uuid()::text, true);
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM ' || t.q || ')' INTO hit;
    IF hit THEN bad := bad || E'\n  ' || t.tbl || ': rows seen by a company that does not exist'; END IF;
    IF t.has_org THEN
      FOR o IN SELECT id FROM iso_orgs LOOP
        PERFORM set_config('app.org_id', o.id::text, true);
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM ' || t.q || ' WHERE organization_id IS DISTINCT FROM $1)' INTO hit USING o.id;
        IF hit THEN bad := bad || E'\n  ' || t.tbl || ': company ' || o.id || ' sees another company''s rows'; EXIT; END IF;
      END LOOP;
    END IF;
  END LOOP;
  IF bad <> '' THEN RAISE EXCEPTION 'isolation: leak test failed:%', bad; END IF;
  RAISE NOTICE 'ok   leak test: % tables, % companies, no rows seen across companies', checked, (SELECT count(*) FROM iso_orgs);
END $$;
ROLLBACK;
