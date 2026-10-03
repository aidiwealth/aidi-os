-- 011_tenancy.sql — workspaces (organisations), plans, memberships, platform staff, and row-level security on every
-- tenant table. Existing data moves into the first workspace, The Aidi Group.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/011_tenancy.sql
BEGIN;

CREATE TABLE IF NOT EXISTS core.plans (
  code               text          PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name               text          NOT NULL,
  description        text,
  modules            text[]        NOT NULL,
  seat_limit         integer,
  storage_gb         integer,
  ai_runs_month      integer,
  price_monthly_usd  numeric(10,2),
  price_annual_usd   numeric(10,2),
  public             boolean       NOT NULL DEFAULT true,
  active             boolean       NOT NULL DEFAULT true,
  sort               integer       NOT NULL DEFAULT 0,
  created_at         timestamptz   NOT NULL DEFAULT now()
);
INSERT INTO core.plans (code, name, description, modules, seat_limit, storage_gb, ai_runs_month, public, sort) VALUES
  ('starter', 'Starter', 'Emerging managers and small funds', '{pitches,pipeline,portfolio,analytics,entities,documents}', 5, 25, 300, true, 1),
  ('growth', 'Growth', 'Established venture firms', '{pitches,pipeline,portfolio,credit,analytics,entities,documents,compliance,services,cs_analytics,fo_analytics}', 20, 200, 2000, true, 2),
  ('family_office', 'Family Office', 'Single and multi-family offices', '{entities,documents,compliance,governance,banking,fo_analytics,portfolio,analytics}', 15, 250, 1000, true, 3),
  ('enterprise', 'Enterprise', 'Large firms; custom terms, invoiced', '{pitches,pipeline,portfolio,credit,analytics,entities,documents,compliance,governance,banking,fo_analytics,services,cs_analytics}', NULL, NULL, NULL, true, 4),
  ('internal', 'Internal', 'Aidi group workspaces', '{pitches,pipeline,portfolio,credit,analytics,entities,documents,compliance,governance,banking,fo_analytics,services,cs_analytics}', NULL, NULL, NULL, false, 9)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.organizations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  slug           text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  kind           text        NOT NULL DEFAULT 'vc' CHECK (kind IN ('vc','family_office','company','fund_admin','other')),
  status         text        NOT NULL DEFAULT 'active' CHECK (status IN ('trial','active','past_due','suspended','closed')),
  plan_code      text        NOT NULL REFERENCES core.plans(code),
  trial_ends_at  timestamptz,
  settings       jsonb       NOT NULL DEFAULT '{}',
  created_by     uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- The workspace a database session is acting for, and whether it is a platform-level (all workspaces) operation.
-- Both are set by the app on every connection checkout; a connection without them sees nothing.
CREATE OR REPLACE FUNCTION core.current_org() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION core.is_bypass() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.bypass', true), '') = 'on' $$;

INSERT INTO core.organizations (name, slug, kind, status, plan_code, settings)
VALUES ('The Aidi Group', 'the-aidi-group', 'family_office', 'active', 'internal',
  jsonb_build_object(
    'default_vehicle_id', (SELECT id FROM core.entities WHERE name = 'Aidi Ventures Fund I' LIMIT 1),
    'notify_emails', jsonb_build_array('company@aidiventures.com'),
    'investor_name', 'Aidi Ventures, the venture arm of The Aidi Group',
    'thesis', $thesis$Fund I thesis:
- Backs exceptional African and diaspora technical talent building AI, infrastructure and financial services for the world.
- Open to founders of any background. It is not a gender-only or Africa-only fund.
- Prefers companies building for global customers; signals such as Y Combinator, Stanford or similar programmes are a plus, never a requirement.
- Stages: pre-seed to Series A.
- Investing in companies that operate only in Africa is done through debt, not equity: flag these as "Africa debt sleeve" rather than marking them down.
- A disclosed female founder is a positive signal only.$thesis$))
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.memberships (
  organization_id  uuid        NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE DEFAULT core.current_org(),
  user_id          uuid        NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  status           text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  invited_by       uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON core.memberships (user_id);

-- Aidi staff who run the Finvry platform (console access only; never tenant data)
CREATE TABLE IF NOT EXISTS core.platform_staff (
  user_id     uuid        PRIMARY KEY REFERENCES core.users(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('owner','sales','support')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE core.users ADD COLUMN IF NOT EXISTS last_org_id uuid REFERENCES core.organizations(id) ON DELETE SET NULL;
ALTER TABLE core.sessions ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES core.organizations(id) ON DELETE SET NULL;

DO $mig$
DECLARE
  aidi uuid := (SELECT id FROM core.organizations WHERE slug = 'the-aidi-group');
  t text;
BEGIN
  ALTER TABLE core.audit_log DISABLE TRIGGER audit_log_no_change;
  FOREACH t IN ARRAY ARRAY['core.entities', 'core.user_roles', 'core.audit_log', 'core.documents', 'core.ai_runs', 'core.modules', 'deals.pitches', 'deals.screenings', 'deals.decisions', 'deals.deals', 'deals.deal_events', 'deals.ic_votes', 'portfolio.companies', 'portfolio.requests', 'portfolio.metric_values', 'portfolio.updates', 'services.clients', 'services.jobs', 'services.job_events', 'compliance.obligations', 'compliance.completions', 'compliance.reminders_sent', 'banking.accounts', 'banking.statements', 'banking.transactions', 'banking.imports', 'governance.parties', 'governance.resolutions', 'governance.approvals', 'credit.borrowers', 'credit.loans', 'credit.schedule', 'credit.repayments', 'credit.covenants', 'credit.covenant_checks', 'credit.reminders_sent'] LOOP
    EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES core.organizations(id)', t);
    EXECUTE format('UPDATE %s SET organization_id = $1 WHERE organization_id IS NULL', t) USING aidi;
    IF t <> 'core.audit_log' THEN EXECUTE format('ALTER TABLE %s ALTER COLUMN organization_id SET NOT NULL', t); END IF;
    EXECUTE format('ALTER TABLE %s ALTER COLUMN organization_id SET DEFAULT core.current_org()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %s ON %s (organization_id)', replace(t, '.', '_') || '_org_idx', t);
  END LOOP;
  ALTER TABLE core.audit_log ENABLE TRIGGER audit_log_no_change;

  INSERT INTO core.memberships (organization_id, user_id, status)
    SELECT aidi, u.id, CASE WHEN u.status = 'active' THEN 'active' ELSE 'disabled' END FROM core.users u
     WHERE EXISTS (SELECT 1 FROM core.user_roles r WHERE r.user_id = u.id)
  ON CONFLICT DO NOTHING;
  UPDATE core.users SET last_org_id = aidi WHERE last_org_id IS NULL;
  UPDATE core.sessions SET organization_id = aidi WHERE organization_id IS NULL AND revoked_at IS NULL;
  INSERT INTO core.platform_staff (user_id, role) SELECT id, 'owner' FROM core.users WHERE email = 'gbolademmanuel@aidiventures.com' ON CONFLICT DO NOTHING;
END $mig$;

-- Uniqueness is now per workspace
ALTER TABLE core.entities DROP CONSTRAINT IF EXISTS entities_name_key;
ALTER TABLE core.entities DROP CONSTRAINT IF EXISTS entities_org_name_key;
ALTER TABLE core.entities ADD CONSTRAINT entities_org_name_key UNIQUE (organization_id, name);
ALTER TABLE core.modules DROP CONSTRAINT IF EXISTS modules_pkey;
ALTER TABLE core.modules ADD PRIMARY KEY (organization_id, code);
ALTER TABLE core.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_code_scope_entity_id_key;
ALTER TABLE core.user_roles DROP CONSTRAINT IF EXISTS user_roles_org_user_role_scope_key;
ALTER TABLE core.user_roles ADD CONSTRAINT user_roles_org_user_role_scope_key UNIQUE NULLS NOT DISTINCT (organization_id, user_id, role_code, scope_entity_id);

-- The workspace's default investing vehicle (its setting, else its first fund)
CREATE OR REPLACE FUNCTION core.default_vehicle() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (SELECT (settings->>'default_vehicle_id')::uuid FROM core.organizations WHERE id = core.current_org()),
    (SELECT id FROM core.entities WHERE kind = 'fund' AND organization_id = core.current_org() ORDER BY created_at LIMIT 1))
$$;

-- Row-level security: a row is visible only to its own workspace (or to a platform-level operation)
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['core.entities', 'core.user_roles', 'core.audit_log', 'core.documents', 'core.ai_runs', 'core.modules', 'deals.pitches', 'deals.screenings', 'deals.decisions', 'deals.deals', 'deals.deal_events', 'deals.ic_votes', 'portfolio.companies', 'portfolio.requests', 'portfolio.metric_values', 'portfolio.updates', 'services.clients', 'services.jobs', 'services.job_events', 'compliance.obligations', 'compliance.completions', 'compliance.reminders_sent', 'banking.accounts', 'banking.statements', 'banking.transactions', 'banking.imports', 'governance.parties', 'governance.resolutions', 'governance.approvals', 'credit.borrowers', 'credit.loans', 'credit.schedule', 'credit.repayments', 'credit.covenants', 'credit.covenant_checks', 'credit.reminders_sent', 'core.memberships'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
  END LOOP;
END $rls$;
ALTER TABLE core.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_org ON core.organizations;
CREATE POLICY own_org ON core.organizations USING (id = core.current_org() OR core.is_bypass()) WITH CHECK (core.is_bypass() OR id = core.current_org());

GRANT SELECT ON core.plans TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE ON core.organizations TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.memberships TO aidi_os_app;
GRANT SELECT ON core.platform_staff TO aidi_os_app;
GRANT SELECT, UPDATE ON core.users, core.sessions TO aidi_os_app;
COMMIT;
