-- Fundraising pipelines can hold grants and debt as well as equity: a pipeline's instrument can be a grant, debt or a
-- mix, and each investor can have their own kind, with a deadline (grants), rate and tenor (debt). Imported investor
-- lists keep how likely each is to invest (and why) and the extra columns of the list.
ALTER TABLE crm.pipelines DROP CONSTRAINT IF EXISTS pipelines_instrument_check;
ALTER TABLE crm.pipelines ADD CONSTRAINT pipelines_instrument_check CHECK (instrument IN ('safe', 'priced', 'convertible_note', 'grant', 'debt', 'mixed'));
ALTER TABLE crm.deals ADD COLUMN IF NOT EXISTS instrument text CHECK (instrument IN ('safe', 'priced', 'convertible_note', 'grant', 'debt')),
  ADD COLUMN IF NOT EXISTS deadline date, ADD COLUMN IF NOT EXISTS interest_pct numeric(6,2) CHECK (interest_pct >= 0 AND interest_pct < 100),
  ADD COLUMN IF NOT EXISTS tenor_months int CHECK (tenor_months BETWEEN 1 AND 600),
  ADD COLUMN IF NOT EXISTS likelihood int CHECK (likelihood BETWEEN 0 AND 100), ADD COLUMN IF NOT EXISTS likelihood_note text CHECK (length(likelihood_note) <= 500),
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rounds_instrument_check') THEN
    ALTER TABLE fundraise.rounds DROP CONSTRAINT rounds_instrument_check;
    ALTER TABLE fundraise.rounds ADD CONSTRAINT rounds_instrument_check CHECK (instrument IN ('safe', 'priced', 'convertible_note', 'grant', 'debt', 'mixed'));
  END IF;
END $$;

-- Background AI work the page follows (reading investor lists, side letters).
CREATE TABLE IF NOT EXISTS core.ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (length(kind) <= 40),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  stage text NOT NULL DEFAULT 'start', progress jsonb NOT NULL DEFAULT '{}'::jsonb, result jsonb, error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE core.ai_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.ai_jobs;
CREATE POLICY tenant_isolation ON core.ai_jobs USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON core.ai_jobs TO aidi_os_app;

-- Rights from side letters, pro-rata letters and similar documents, for investors and founders: what each holder is
-- entitled to (pro rata, information, board seat or observer, MFN, vetoes, ROFR / co-sale, drag / tag, redemption,
-- anti-dilution, preference terms) and the clause it comes from. AI proposes; the founder maps each to a holder.
CREATE TABLE IF NOT EXISTS equity.rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  captable_id uuid NOT NULL REFERENCES equity.captables(id) ON DELETE CASCADE,
  holder_id uuid REFERENCES equity.holders(id) ON DELETE CASCADE,
  party text CHECK (length(party) <= 200),
  kind text NOT NULL CHECK (kind IN ('pro_rata', 'super_pro_rata', 'information', 'board_seat', 'board_observer', 'mfn', 'veto', 'rofr', 'co_sale', 'drag_along', 'tag_along', 'redemption', 'anti_dilution', 'liquidation_pref', 'participation', 'vesting', 'acceleration', 'other')),
  summary text NOT NULL CHECK (length(summary) <= 600),
  impact text CHECK (length(impact) <= 600),
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  clause text CHECK (length(clause) <= 300),
  document_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS rights_ct_idx ON equity.rights (captable_id);
ALTER TABLE equity.rights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON equity.rights;
CREATE POLICY tenant_isolation ON equity.rights USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON equity.rights TO aidi_os_app;

-- The founder's own row order for the cap table (e.g. founders and common holders first), as holder names.
ALTER TABLE equity.captables ADD COLUMN IF NOT EXISTS row_order jsonb NOT NULL DEFAULT '[]'::jsonb;
