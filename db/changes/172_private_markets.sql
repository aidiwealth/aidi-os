-- 172_private_markets.sql — Pre-IPO secondaries in the trading process.
--  wm.secondaries     the deal's terms (offer price per share, last round, SPV fee and carry, lock-up), the AI's value
--                     range and review, the latest mark, and the listing once the company goes public
--  markets.commitments  a pre-IPO trade for one account: proposed with its checks, approved with a fresh code, then
--                     signed, wired and confirmed (units from the SPV statement) before anything is booked
--  markets.positions.lockup_until  shares that came from a pre-IPO holding cannot be sold until the lock-up ends
--  wm.clients.accredited  confirmed by an adviser; only accredited clients see pre-IPO deals
BEGIN;
ALTER TABLE wm.secondaries
  ADD COLUMN IF NOT EXISTS offer_price numeric(20,6) CHECK (offer_price IS NULL OR offer_price > 0),
  ADD COLUMN IF NOT EXISTS last_round_price numeric(20,6) CHECK (last_round_price IS NULL OR last_round_price > 0),
  ADD COLUMN IF NOT EXISTS last_round text CHECK (last_round IS NULL OR length(last_round) <= 80),
  ADD COLUMN IF NOT EXISTS fee_pct numeric(6,3) NOT NULL DEFAULT 0 CHECK (fee_pct >= 0 AND fee_pct <= 20),
  ADD COLUMN IF NOT EXISTS carry_pct numeric(6,3) NOT NULL DEFAULT 0 CHECK (carry_pct >= 0 AND carry_pct <= 50),
  ADD COLUMN IF NOT EXISTS lockup_days int NOT NULL DEFAULT 180 CHECK (lockup_days BETWEEN 0 AND 1095),
  ADD COLUMN IF NOT EXISTS spv_name text CHECK (spv_name IS NULL OR length(spv_name) <= 200),
  ADD COLUMN IF NOT EXISTS value_low numeric(20,6), ADD COLUMN IF NOT EXISTS value_base numeric(20,6), ADD COLUMN IF NOT EXISTS value_high numeric(20,6),
  ADD COLUMN IF NOT EXISTS ai_value jsonb, ADD COLUMN IF NOT EXISTS ai_value_at timestamptz,
  ADD COLUMN IF NOT EXISTS mark_price numeric(20,6), ADD COLUMN IF NOT EXISTS mark_on date, ADD COLUMN IF NOT EXISTS mark_note text CHECK (mark_note IS NULL OR length(mark_note) <= 300),
  ADD COLUMN IF NOT EXISTS listed_symbol text CHECK (listed_symbol IS NULL OR listed_symbol ~ '^[A-Z0-9.\-]{1,12}$'), ADD COLUMN IF NOT EXISTS listed_on date;
ALTER TABLE wm.secondaries DROP CONSTRAINT IF EXISTS secondaries_status_check;
ALTER TABLE wm.secondaries ADD CONSTRAINT secondaries_status_check CHECK (status IN ('new', 'reviewing', 'interested', 'invested', 'passed', 'expired', 'listed'));
CREATE TABLE IF NOT EXISTS markets.commitments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  account_id      uuid        NOT NULL REFERENCES markets.accounts(id) ON DELETE CASCADE,
  secondary_id    uuid        NOT NULL REFERENCES wm.secondaries(id) ON DELETE RESTRICT,
  amount          numeric(18,2) NOT NULL CHECK (amount > 0),
  reason          text        NOT NULL,
  checks          jsonb       NOT NULL DEFAULT '[]',
  status          text        NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'approved', 'signed', 'wired', 'confirmed', 'rejected', 'cancelled')),
  units           numeric(24,8) CHECK (units IS NULL OR units > 0),
  price           numeric(20,6) CHECK (price IS NULL OR price > 0),
  fees            numeric(18,2) CHECK (fees IS NULL OR fees >= 0),
  holding_id      uuid        REFERENCES wealth.holdings(id) ON DELETE SET NULL,
  effects         jsonb,
  note            text        CHECK (note IS NULL OR length(note) <= 500),
  created_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  approved_by     uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  signed_at       timestamptz,
  wired_at        timestamptz,
  confirmed_by    uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  confirmed_at    timestamptz);
CREATE INDEX IF NOT EXISTS markets_commitments_open ON markets.commitments (organization_id, status, created_at DESC);
ALTER TABLE markets.commitments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON markets.commitments;
CREATE POLICY tenant_isolation ON markets.commitments USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE ON markets.commitments TO aidi_os_app;
ALTER TABLE markets.positions ADD COLUMN IF NOT EXISTS lockup_until date;
ALTER TABLE finance.journal ADD COLUMN IF NOT EXISTS market_commitment_id uuid REFERENCES markets.commitments(id) ON DELETE RESTRICT;
ALTER TABLE wm.clients ADD COLUMN IF NOT EXISTS accredited boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS accredited_at timestamptz, ADD COLUMN IF NOT EXISTS accredited_by uuid REFERENCES core.users(id) ON DELETE SET NULL;
COMMIT;
