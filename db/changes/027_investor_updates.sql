-- 027_investor_updates.sql — investor updates, the investor list, and who each update was sent to and opened by.
BEGIN;
CREATE TABLE IF NOT EXISTS financials.investors (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name             text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  email            text        NOT NULL CHECK (position('@' IN email) > 1),
  firm             text        CHECK (length(firm) <= 200),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);
CREATE TABLE IF NOT EXISTS financials.updates (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  title            text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  period_type      text        NOT NULL CHECK (period_type IN ('month','quarter')),
  period_end       date        NOT NULL,
  highlights       text        CHECK (length(highlights) <= 4000),
  challenges       text        CHECK (length(challenges) <= 4000),
  asks             text        CHECK (length(asks) <= 2000),
  body             text        CHECK (length(body) <= 30000),
  status           text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at     timestamptz,
  created_by       uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS financials.update_sends (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  update_id        uuid        NOT NULL REFERENCES financials.updates(id) ON DELETE CASCADE,
  investor_id      uuid        NOT NULL REFERENCES financials.investors(id) ON DELETE CASCADE,
  token_hash       text        NOT NULL UNIQUE,
  sent_at          timestamptz NOT NULL DEFAULT now(),
  opened_at        timestamptz,
  opens            integer     NOT NULL DEFAULT 0,
  UNIQUE (update_id, investor_id)
);
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['financials.investors','financials.updates','financials.update_sends'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
  END LOOP;
END $rls$;
GRANT SELECT, INSERT, UPDATE, DELETE ON financials.investors, financials.updates, financials.update_sends TO aidi_os_app;
UPDATE core.plans SET modules = array_append(modules, 'updates') WHERE code IN ('company_startup','company_scale','internal') AND NOT ('updates' = ANY(modules));
COMMIT;
