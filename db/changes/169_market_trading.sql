-- 169_market_trading.sql — Public Markets, step 2: brokerage accounts, positions, trade proposals, tickets and fills.
--  markets.accounts       a brokerage account and who owns it: a group entity (its journals post), a wealth client, or a
--                         retirement plan (holdings and cash only). How trades are placed: manual ticket or Alpaca.
--  markets.positions      what each account holds (shares, cost), linked to its line in Investments & AUM
--  markets.proposals      trades sized for an account from the valuations; approved with a fresh code
--  markets.fills          what actually filled (entered from the broker's confirmation, or from Alpaca later); nothing
--                         is written to holdings, cash or the books until someone confirms the fill
--  markets.confirm_codes  one-time email codes for approving when a person has no authenticator app
--  finance.journal.market_fill_id: journal lines posted by a confirmed fill (Journals shows them as Public markets).
BEGIN;
CREATE TABLE IF NOT EXISTS markets.accounts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  broker          text        NOT NULL CHECK (broker IN ('alpaca', 'robinhood', 'schwab', 'fidelity', 'vanguard', 'other')),
  broker_label    text        CHECK (broker_label IS NULL OR length(broker_label) <= 80),
  kind            text        NOT NULL DEFAULT 'taxable' CHECK (kind IN ('taxable', 'retirement')),
  owner_type      text        NOT NULL CHECK (owner_type IN ('entity', 'client', 'plan')),
  entity_id       uuid        REFERENCES core.entities(id) ON DELETE RESTRICT,
  wm_client_id    uuid        REFERENCES wm.clients(id) ON DELETE RESTRICT,
  execution       text        NOT NULL DEFAULT 'manual' CHECK (execution IN ('manual', 'alpaca')),
  external_id     text        CHECK (external_id IS NULL OR length(external_id) <= 80),
  risk_level      text        NOT NULL DEFAULT 'moderate',
  model           jsonb       NOT NULL DEFAULT '{"stocks": 60, "etf": 30, "crypto": 0, "cash": 10}',
  cash            numeric(18,2) NOT NULL DEFAULT 0,
  cash_as_of      timestamptz NOT NULL DEFAULT now(),
  daily_limit     numeric(18,2) NOT NULL DEFAULT 25000 CHECK (daily_limit >= 0),
  post_journals   boolean     NOT NULL DEFAULT true,
  status          text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((owner_type = 'entity' AND entity_id IS NOT NULL) OR (owner_type = 'client' AND wm_client_id IS NOT NULL) OR owner_type = 'plan'));
CREATE TABLE IF NOT EXISTS markets.positions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  account_id      uuid        NOT NULL REFERENCES markets.accounts(id) ON DELETE CASCADE,
  symbol          text        NOT NULL REFERENCES markets.instruments(symbol) ON DELETE RESTRICT,
  qty             numeric(24,8) NOT NULL CHECK (qty >= 0),
  cost            numeric(18,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  holding_id      uuid        REFERENCES wealth.holdings(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, symbol));
CREATE TABLE IF NOT EXISTS markets.proposals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  account_id      uuid        NOT NULL REFERENCES markets.accounts(id) ON DELETE CASCADE,
  symbol          text        NOT NULL REFERENCES markets.instruments(symbol) ON DELETE RESTRICT,
  side            text        NOT NULL CHECK (side IN ('buy', 'sell')),
  qty             numeric(24,8) NOT NULL CHECK (qty > 0),
  limit_price     numeric(20,6) NOT NULL CHECK (limit_price > 0),
  notional        numeric(18,2) NOT NULL,
  reason          text        NOT NULL,
  checks          jsonb       NOT NULL DEFAULT '[]',
  valuation_id    uuid        REFERENCES markets.valuations(id) ON DELETE SET NULL,
  status          text        NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'approved', 'ticket', 'filled', 'rejected', 'expired', 'cancelled')),
  expires_at      timestamptz NOT NULL,
  created_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  decided_at      timestamptz,
  decision_note   text        CHECK (decision_note IS NULL OR length(decision_note) <= 500));
CREATE INDEX IF NOT EXISTS markets_proposals_open ON markets.proposals (organization_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS markets.fills (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  account_id      uuid        NOT NULL REFERENCES markets.accounts(id) ON DELETE CASCADE,
  proposal_id     uuid        REFERENCES markets.proposals(id) ON DELETE SET NULL,
  symbol          text        NOT NULL REFERENCES markets.instruments(symbol) ON DELETE RESTRICT,
  side            text        NOT NULL CHECK (side IN ('buy', 'sell')),
  qty             numeric(24,8) NOT NULL CHECK (qty > 0),
  price           numeric(20,6) NOT NULL CHECK (price > 0),
  fees            numeric(18,2) NOT NULL DEFAULT 0 CHECK (fees >= 0),
  filled_at       timestamptz NOT NULL,
  source          text        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'alpaca')),
  status          text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  effects         jsonb,
  entered_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  decided_at      timestamptz,
  note            text        CHECK (note IS NULL OR length(note) <= 500));
CREATE INDEX IF NOT EXISTS markets_fills_open ON markets.fills (organization_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS markets.confirm_codes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  code_hash       text        NOT NULL,
  attempts        int         NOT NULL DEFAULT 0,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['accounts', 'positions', 'proposals', 'fills', 'confirm_codes'] LOOP
    EXECUTE format('ALTER TABLE markets.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON markets.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON markets.%I USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
  END LOOP; END $$;
GRANT SELECT, INSERT, UPDATE ON markets.accounts, markets.positions, markets.proposals, markets.fills, markets.confirm_codes TO aidi_os_app;
GRANT DELETE ON markets.positions TO aidi_os_app;

ALTER TABLE finance.journal ADD COLUMN IF NOT EXISTS market_fill_id uuid REFERENCES markets.fills(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS journal_market_fill ON finance.journal (market_fill_id) WHERE market_fill_id IS NOT NULL;
COMMIT;
