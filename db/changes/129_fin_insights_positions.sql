-- Financial analysis kept until the figures change; whether a linked sheet may be shown to investors as the source of
-- the figures; ownership and round figures founders give with their monthly report; and the team's marks.
CREATE TABLE IF NOT EXISTS financials.analyses (
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(subject) <= 80),
  hash text NOT NULL,
  analysis jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, subject));
ALTER TABLE financials.analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON financials.analyses;
CREATE POLICY tenant_isolation ON financials.analyses USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON financials.analyses TO aidi_os_app;

ALTER TABLE financials.sheet_links ADD COLUMN IF NOT EXISTS show_source boolean NOT NULL DEFAULT false;

-- What the founder says about new money and ownership (all optional), per report.
CREATE TABLE IF NOT EXISTS portfolio.cap_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES portfolio.companies(id) ON DELETE CASCADE,
  period date NOT NULL,
  source text NOT NULL DEFAULT 'report' CHECK (source IN ('report', 'finvry', 'team')),
  new_money boolean,
  kind text CHECK (kind IN ('priced', 'safe', 'note', 'other')),
  round_name text CHECK (length(round_name) <= 80),
  amount numeric(20,2) CHECK (amount IS NULL OR amount >= 0),
  price_per_share numeric(20,6) CHECK (price_per_share IS NULL OR price_per_share >= 0),
  valuation_cap numeric(20,2) CHECK (valuation_cap IS NULL OR valuation_cap >= 0),
  post_money numeric(20,2) CHECK (post_money IS NULL OR post_money >= 0),
  fd_shares numeric(20,2) CHECK (fd_shares IS NULL OR fd_shares >= 0),
  our_shares numeric(20,2) CHECK (our_shares IS NULL OR our_shares >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  note text CHECK (length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period, source));
ALTER TABLE portfolio.cap_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON portfolio.cap_updates;
CREATE POLICY tenant_isolation ON portfolio.cap_updates USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON portfolio.cap_updates TO aidi_os_app;

-- The holdings (Investments & AUM) behind a portfolio company, chosen by the team (else matched by name).
ALTER TABLE portfolio.companies ADD COLUMN IF NOT EXISTS holding_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE portfolio.companies ADD COLUMN IF NOT EXISTS finvry_auto boolean NOT NULL DEFAULT true;
