-- Secondaries deal flow (Wealth management → Secondaries): equity / stock secondary and SPV opportunities picked up
-- automatically from Meridian (AngelList) and Wefunder emails in Notices, or added by hand.
CREATE TABLE IF NOT EXISTS wm.secondaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'other' CHECK (source IN ('meridian', 'wefunder', 'other')),
  ref text CHECK (length(ref) <= 200),
  company text CHECK (length(company) <= 200),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  sector text CHECK (length(sector) <= 120),
  stage text CHECK (length(stage) <= 60),
  lead text CHECK (length(lead) <= 300),
  co_investors text CHECK (length(co_investors) <= 300),
  min_investment numeric(16,2),
  valuation text CHECK (length(valuation) <= 120),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  url text CHECK (length(url) <= 1000),
  notice_id uuid REFERENCES inbox.notices(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new',
  amount numeric(16,2),
  notes text CHECK (length(notes) <= 5000),
  updated_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS secondaries_ref ON wm.secondaries (organization_id, source, ref) WHERE ref IS NOT NULL;
ALTER TABLE wm.secondaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.secondaries;
CREATE POLICY tenant_isolation ON wm.secondaries USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.secondaries TO aidi_os_app;
CREATE INDEX IF NOT EXISTS secondaries_status ON wm.secondaries (organization_id, status, received_at DESC);
-- The Secondaries page is part of the Aidi OS plan.
UPDATE core.plans SET modules = array_append(modules, 'secondaries') WHERE code = 'internal' AND NOT ('secondaries' = ANY(modules));

-- Criteria fit, client visibility, and the VC pipeline deal a secondary was moved to.
ALTER TABLE wm.secondaries ADD COLUMN IF NOT EXISTS fits boolean, ADD COLUMN IF NOT EXISTS fit_note text CHECK (length(fit_note) <= 300),
  ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS pipeline_deal_id uuid REFERENCES deals.deals(id) ON DELETE SET NULL;
-- Wealth clients who want in on a deal, and the holding each investment became.
CREATE TABLE IF NOT EXISTS wm.secondary_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  secondary_id uuid NOT NULL REFERENCES wm.secondaries(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE,
  amount numeric(16,2) CHECK (amount >= 0), note text CHECK (length(note) <= 1000),
  status text NOT NULL DEFAULT 'interested' CHECK (status IN ('interested', 'invested', 'withdrawn')),
  holding_id uuid REFERENCES wealth.holdings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (secondary_id, client_id));
ALTER TABLE wm.secondary_interest ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.secondary_interest;
CREATE POLICY tenant_isolation ON wm.secondary_interest USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.secondary_interest TO aidi_os_app;
-- Secondaries is an asset class across wealth management.
ALTER TABLE wealth.holdings DROP CONSTRAINT IF EXISTS holdings_category_check;
ALTER TABLE wealth.holdings ADD CONSTRAINT holdings_category_check CHECK (category IN ('venture','private_stake','secondaries','public_securities','fund','bonds','retirement','cash','crypto','precious_metals','real_estate','other','liability'));
CREATE INDEX IF NOT EXISTS holdings_secondary ON wealth.holdings ((meta->>'secondary_id')) WHERE meta ? 'secondary_id';

-- Deals have a closing date (from the alert, typed in, or a default number of days after it arrived): open deals
-- past it are marked expired. A secondary we invested in can become a portfolio company of a fund.
ALTER TABLE wm.secondaries ADD COLUMN IF NOT EXISTS closes_at date, ADD COLUMN IF NOT EXISTS portfolio_company_id uuid REFERENCES portfolio.companies(id) ON DELETE SET NULL;
ALTER TABLE wm.secondaries DROP CONSTRAINT IF EXISTS secondaries_status_check;
ALTER TABLE wm.secondaries ADD CONSTRAINT secondaries_status_check CHECK (status IN ('new', 'reviewing', 'interested', 'invested', 'passed', 'expired'));

-- Risk levels for wealth clients (chosen by the client on the portal, or set by their adviser) and who set them.
ALTER TABLE wm.clients ADD COLUMN IF NOT EXISTS risk_answers jsonb, ADD COLUMN IF NOT EXISTS risk_set_by text CHECK (risk_set_by IN ('client', 'adviser')), ADD COLUMN IF NOT EXISTS risk_set_at timestamptz;
UPDATE wm.clients SET notes = left(concat_ws(E'\n', notes, 'Risk profile (before levels): ' || risk_profile), 3000),
  risk_profile = CASE WHEN lower(risk_profile) LIKE '%moderately conservative%' OR lower(risk_profile) LIKE '%cautious%' THEN 'moderately_conservative'
    WHEN lower(risk_profile) LIKE '%conservative%' OR lower(risk_profile) LIKE '%low%' THEN 'conservative'
    WHEN lower(risk_profile) LIKE '%aggressive%' OR lower(risk_profile) LIKE '%high%' THEN 'aggressive'
    WHEN lower(risk_profile) LIKE '%growth%' THEN 'growth'
    WHEN lower(risk_profile) LIKE '%moderate%' OR lower(risk_profile) LIKE '%balanced%' OR lower(risk_profile) LIKE '%medium%' THEN 'moderate' ELSE NULL END
  WHERE risk_profile IS NOT NULL AND risk_profile NOT IN ('conservative', 'moderately_conservative', 'moderate', 'growth', 'aggressive');
UPDATE wm.clients SET risk_set_by = 'adviser', risk_set_at = coalesce(risk_set_at, updated_at, now()) WHERE risk_profile IS NOT NULL AND risk_set_by IS NULL;
ALTER TABLE wm.clients DROP CONSTRAINT IF EXISTS clients_risk_profile_check;
ALTER TABLE wm.clients ADD CONSTRAINT clients_risk_profile_check CHECK (risk_profile IS NULL OR risk_profile IN ('conservative', 'moderately_conservative', 'moderate', 'growth', 'aggressive'));
