-- LP fundraising for Aidi OS (Funds & LPs): prospective LPs (family offices, funds of funds, endowments,
-- foundations, pensions, sovereign funds, insurers, corporates, banks, DFIs, private credit, HNWIs), pipelines tied
-- to a fund raise, a debt facility, or a co-investment / SPV into a deal or portfolio company, and the LPs in each.
CREATE TABLE IF NOT EXISTS funds.lp_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('family_office', 'fund_of_funds', 'endowment', 'foundation', 'pension', 'sovereign', 'insurance', 'corporate', 'bank', 'dfi', 'private_credit', 'asset_manager', 'hnwi', 'angel', 'other')),
  capital text NOT NULL DEFAULT 'equity' CHECK (capital IN ('equity', 'debt', 'both')),
  country text CHECK (length(country) <= 100),
  regions text[] NOT NULL DEFAULT '{}',
  sectors text[] NOT NULL DEFAULT '{}',
  aum_usd numeric(20,2) CHECK (aum_usd IS NULL OR aum_usd >= 0),
  ticket_min_usd numeric(20,2) CHECK (ticket_min_usd IS NULL OR ticket_min_usd >= 0),
  ticket_max_usd numeric(20,2) CHECK (ticket_max_usd IS NULL OR ticket_max_usd >= 0),
  mandate text CHECK (length(mandate) <= 2000),
  backs_emerging boolean,
  website text CHECK (website IS NULL OR website ~ '^https?://'),
  contact_name text CHECK (length(contact_name) <= 200),
  contact_title text CHECK (length(contact_title) <= 200),
  email text CHECK (email IS NULL OR (length(email) <= 254 AND position('@' in email) > 1)),
  linkedin text CHECK (linkedin IS NULL OR linkedin ~ '^https?://'),
  phone text CHECK (length(phone) <= 60),
  notes text CHECK (length(notes) <= 3000),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'sheet', 'ai')),
  lp_id uuid REFERENCES funds.lps(id) ON DELETE SET NULL,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
-- From the founder's own tracker: priority (P1/P2…), and what else it records (fit, hurdle, contact route, warm
-- intro, status, follow-up dates, investing entity, source quality).
ALTER TABLE funds.lp_prospects ADD COLUMN IF NOT EXISTS priority text CHECK (length(priority) <= 20);
ALTER TABLE funds.lp_prospects ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS lp_prospects_name_uq ON funds.lp_prospects (organization_id, lower(name));

CREATE TABLE IF NOT EXISTS funds.lp_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  kind text NOT NULL DEFAULT 'fund' CHECK (kind IN ('fund', 'debt', 'co_invest')),
  fund_id uuid REFERENCES funds.funds(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES deals.deals(id) ON DELETE SET NULL,
  company_id uuid REFERENCES portfolio.companies(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  target numeric(20,2) CHECK (target IS NULL OR target >= 0),
  target_close date,
  interest_pct numeric(6,2) CHECK (interest_pct IS NULL OR (interest_pct >= 0 AND interest_pct < 100)),
  tenor_months integer CHECK (tenor_months IS NULL OR tenor_months BETWEEN 1 AND 600),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes text CHECK (length(notes) <= 2000),
  mandate jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE funds.lp_pipelines ADD COLUMN IF NOT EXISTS mandate jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS funds.lp_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES funds.lp_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  kind text NOT NULL DEFAULT 'open' CHECK (kind IN ('open', 'committed', 'won', 'lost')),
  sort integer NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS lp_stages_pl_idx ON funds.lp_stages (pipeline_id, sort);

CREATE TABLE IF NOT EXISTS funds.lp_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES funds.lp_pipelines(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES funds.lp_stages(id) ON DELETE RESTRICT,
  prospect_id uuid NOT NULL REFERENCES funds.lp_prospects(id) ON DELETE CASCADE,
  amount numeric(20,2) CHECK (amount IS NULL OR amount >= 0),
  likelihood integer CHECK (likelihood IS NULL OR likelihood BETWEEN 0 AND 100),
  likelihood_note text CHECK (length(likelihood_note) <= 300),
  next_step text CHECK (length(next_step) <= 300),
  next_date date,
  notes text CHECK (length(notes) <= 3000),
  lp_id uuid REFERENCES funds.lps(id) ON DELETE SET NULL,
  commitment_id uuid REFERENCES funds.commitments(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, prospect_id));
CREATE INDEX IF NOT EXISTS lp_targets_pl_idx ON funds.lp_targets (pipeline_id);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['lp_prospects', 'lp_pipelines', 'lp_stages', 'lp_targets'] LOOP
    EXECUTE format('ALTER TABLE funds.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON funds.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON funds.%I USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON funds.%I TO aidi_os_app', t);
  END LOOP;
END $$;
