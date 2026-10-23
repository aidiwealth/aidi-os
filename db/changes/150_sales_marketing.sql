-- 150_sales_marketing.sql — Finvry Sales and Marketing: each company designs its own process and runs it.
--  growth.processes: a sales or marketing process — its stages (name, won/lost/open, target conversion to the next
--  stage, usual days in the stage, the steps that move a deal on), its monthly target and, for marketing, its
--  channels (with a monthly budget and the bank vendors whose payments count as that channel's spend).
--  growth.deals and growth.deal_moves: deals moving through a sales process (every move kept, for actual conversion
--  and cycle time). growth.campaigns: marketing campaigns with budget, spend, leads and a checklist.
--  growth.channel_months: a marketing channel's results for a month (spend, visitors, leads, qualified leads,
--  customers, revenue), entered or brought in from Banking and won deals.
BEGIN;
CREATE SCHEMA IF NOT EXISTS growth;
GRANT USAGE ON SCHEMA growth TO aidi_os_app;
CREATE TABLE IF NOT EXISTS growth.processes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  kind            text        NOT NULL CHECK (kind IN ('sales', 'marketing')),
  name            text        NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  currency        text        NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  target_monthly  numeric(18,2) CHECK (target_monthly >= 0),
  target_kind     text        NOT NULL DEFAULT 'revenue' CHECK (target_kind IN ('revenue', 'deals', 'leads', 'customers')),
  stages          jsonb       NOT NULL DEFAULT '[]',
  channels        jsonb       NOT NULL DEFAULT '[]',
  sort            int         NOT NULL DEFAULT 0,
  created_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS growth.deals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  process_id      uuid        NOT NULL REFERENCES growth.processes(id) ON DELETE CASCADE,
  name            text        NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  contact         text        CHECK (length(contact) <= 200),
  value           numeric(18,2) CHECK (value >= 0),
  recurring       boolean     NOT NULL DEFAULT false,
  stage_key       text        NOT NULL CHECK (length(stage_key) <= 40),
  owner_id        uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  source_channel  text        CHECK (length(source_channel) <= 40),
  expected_close  date,
  steps_done      jsonb       NOT NULL DEFAULT '{}',
  notes           text        CHECK (length(notes) <= 4000),
  lost_reason     text        CHECK (length(lost_reason) <= 300),
  closed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS deals_process_idx ON growth.deals (process_id, stage_key);
CREATE TABLE IF NOT EXISTS growth.deal_moves (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  deal_id         uuid        NOT NULL REFERENCES growth.deals(id) ON DELETE CASCADE,
  from_stage      text,
  to_stage        text        NOT NULL,
  at              timestamptz NOT NULL DEFAULT now(),
  by_user         uuid        REFERENCES core.users(id) ON DELETE SET NULL);
CREATE INDEX IF NOT EXISTS deal_moves_deal_idx ON growth.deal_moves (deal_id, at);
CREATE TABLE IF NOT EXISTS growth.campaigns (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  process_id      uuid        NOT NULL REFERENCES growth.processes(id) ON DELETE CASCADE,
  name            text        NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  channel_key     text        CHECK (length(channel_key) <= 40),
  status          text        NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'live', 'done')),
  starts_on       date,
  ends_on         date,
  budget          numeric(18,2) CHECK (budget >= 0),
  spend           numeric(18,2) CHECK (spend >= 0),
  leads           int         CHECK (leads >= 0),
  customers       int         CHECK (customers >= 0),
  goal            text        CHECK (length(goal) <= 300),
  steps           jsonb       NOT NULL DEFAULT '[]',
  notes           text        CHECK (length(notes) <= 4000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS growth.channel_months (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  process_id      uuid        NOT NULL REFERENCES growth.processes(id) ON DELETE CASCADE,
  channel_key     text        NOT NULL CHECK (length(channel_key) <= 40),
  month           text        NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  spend           numeric(18,2), visitors int, leads int, mqls int, sqls int, customers int, revenue numeric(18,2),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_id, channel_key, month));
-- growth.links: a spreadsheet (uploaded once, or a Google Sheet / Excel online link kept in step) feeding deals,
-- marketing channel results or bank transactions, with the column mapping AI worked out the first time.
CREATE TABLE IF NOT EXISTS growth.links (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  kind            text        NOT NULL CHECK (kind IN ('sales_deals', 'marketing_months', 'bank_txns')),
  process_id      uuid        REFERENCES growth.processes(id) ON DELETE CASCADE,
  name            text        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  url             text        NOT NULL CHECK (length(url) <= 600),
  mapping         jsonb       NOT NULL DEFAULT '{}',
  auto            boolean     NOT NULL DEFAULT true,
  last_synced_at  timestamptz,
  last_result     jsonb,
  last_error      text,
  created_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now());
DO $rls$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['growth.processes', 'growth.deals', 'growth.deal_moves', 'growth.campaigns', 'growth.channel_months', 'growth.links'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP; END $rls$;
UPDATE core.plans SET modules = array_append(modules, 'sales') WHERE code IN ('company_startup', 'company_medium', 'company_scale') AND NOT ('sales' = ANY (modules));
UPDATE core.plans SET modules = array_append(modules, 'marketing') WHERE code IN ('company_startup', 'company_medium', 'company_scale') AND NOT ('marketing' = ANY (modules));
COMMIT;
