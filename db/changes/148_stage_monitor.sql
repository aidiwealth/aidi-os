-- 148_stage_monitor.sql — Finvry Venture & Business Stage Monitor.
--  financials.stage_snapshots: each company's stage, health, runway and readiness scores, one row per month (the
--  current month is refreshed whenever the page is opened or the nightly run passes), so founders see them move.
--  platform.capital_providers: the directory of who funds whom (equity, debt, grants), curated by the Finvry team in the
--  console; founders only ever see providers marked verified. Seeded from the shared investor directory (names only,
--  unverified) and the two Aidi options (labelled Aidi affiliate, unverified until the team checks them).
--  platform.settings 'stage_rules': stage thresholds per region and score weights (DEFAULT_RULES in shared/stage.ts
--  applies until the team saves its own). The module is on every paid Finvry plan; scores need Medium, funders Scale.
BEGIN;
CREATE TABLE IF NOT EXISTS financials.stage_snapshots (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  entity_id       uuid        NOT NULL REFERENCES core.entities(id) ON DELETE CASCADE,
  period          text        NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  funding_stage   text        NOT NULL,
  operating_stage text        NOT NULL,
  health          text        NOT NULL,
  runway          numeric(8,1),
  cash_out        text,
  equity_score    integer,
  debt_score      integer,
  inputs          jsonb       NOT NULL DEFAULT '{}',
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, entity_id, period));
ALTER TABLE financials.stage_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON financials.stage_snapshots;
CREATE POLICY tenant_isolation ON financials.stage_snapshots USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON financials.stage_snapshots TO aidi_os_app;

CREATE TABLE IF NOT EXISTS platform.capital_providers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  kind        text        NOT NULL DEFAULT 'vc' CHECK (kind IN ('vc', 'angel_network', 'accelerator', 'grant', 'bank', 'venture_debt', 'revenue_based', 'dfi', 'government', 'other')),
  instrument  text        NOT NULL DEFAULT 'equity' CHECK (instrument IN ('equity', 'debt', 'grant')),
  countries   text[]      NOT NULL DEFAULT '{}',
  stages      text[]      NOT NULL DEFAULT '{}',
  sectors     text[]      NOT NULL DEFAULT '{}',
  ticket_min  numeric(16,2),
  ticket_max  numeric(16,2),
  currency    text        NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  criteria    text        CHECK (length(criteria) <= 2000),
  link        text        CHECK (length(link) <= 400),
  source      text        CHECK (length(source) <= 200),
  verified_on date,
  affiliate   boolean     NOT NULL DEFAULT false,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS capital_providers_name ON platform.capital_providers (lower(name));
ALTER TABLE platform.capital_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_only ON platform.capital_providers;
CREATE POLICY platform_only ON platform.capital_providers USING (core.is_bypass()) WITH CHECK (core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.capital_providers TO aidi_os_app;

INSERT INTO platform.capital_providers (name, kind, instrument, countries, stages, affiliate, source, criteria) VALUES
  ('Aidi Ventures', 'vc', 'equity', ARRAY['Nigeria', 'United States'], ARRAY['pre_seed', 'seed'], true, 'Aidi', 'Check details, criteria and ticket size before marking verified.'),
  ('Aidi startup lending', 'venture_debt', 'debt', ARRAY['Nigeria', 'United States'], ARRAY['seed', 'series_a'], true, 'Aidi', 'Check details, criteria and ticket size before marking verified.')
  ON CONFLICT DO NOTHING;
INSERT INTO platform.capital_providers (name, kind, instrument, source)
  SELECT d.name, 'other', 'equity', 'Investor directory' FROM crm.investor_directory d ON CONFLICT DO NOTHING;

UPDATE core.plans SET modules = array_append(modules, 'stage_monitor') WHERE code IN ('company_startup', 'company_medium', 'company_scale') AND NOT ('stage_monitor' = ANY (modules));
COMMIT;
