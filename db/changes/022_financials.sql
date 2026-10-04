-- 022_financials.sql — financial statements per entity or company and period, share links and their views.
BEGIN;
CREATE SCHEMA IF NOT EXISTS financials;
GRANT USAGE ON SCHEMA financials TO aidi_os_app;
CREATE TABLE IF NOT EXISTS financials.statements (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  entity_id        uuid        REFERENCES core.entities(id) ON DELETE RESTRICT,
  company_id       uuid        REFERENCES portfolio.companies(id) ON DELETE RESTRICT,
  period_type      text        NOT NULL CHECK (period_type IN ('month','quarter','year')),
  period_end       date        NOT NULL,
  currency         text        NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  lines            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  kpis             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  notes            text,
  show_to_lps      boolean     NOT NULL DEFAULT false,
  source           text        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','upload')),
  document_id      uuid        REFERENCES core.documents(id) ON DELETE SET NULL,
  created_by       uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((entity_id IS NULL) <> (company_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS statements_subject_period ON financials.statements (organization_id, coalesce(entity_id, company_id), period_type, period_end);
CREATE TABLE IF NOT EXISTS financials.shares (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  title            text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  subject          text        NOT NULL CHECK (subject ~ '^(group|entity:[0-9a-f-]{36}|company:[0-9a-f-]{36})$'),
  currency         text        NOT NULL DEFAULT 'USD',
  period_type      text        NOT NULL DEFAULT 'month',
  metrics          text[]      NOT NULL,
  token_hash       text        NOT NULL UNIQUE,
  expires_at       timestamptz NOT NULL,
  views            integer     NOT NULL DEFAULT 0,
  last_viewed_at   timestamptz,
  created_by       uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['financials.statements','financials.shares'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
  END LOOP;
END $rls$;
GRANT SELECT, INSERT, UPDATE, DELETE ON financials.statements, financials.shares TO aidi_os_app;
UPDATE core.plans SET modules = array_append(modules, 'financials') WHERE code IN ('vc_growth','vc_enterprise','fo_starter','fo_growth','fo_enterprise','internal') AND NOT ('financials' = ANY(modules));
COMMIT;
