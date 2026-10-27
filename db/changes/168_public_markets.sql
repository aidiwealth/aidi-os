-- 168_public_markets.sql — Public Markets, step 1 (read-only: data and valuation, no accounts or orders).
--  Public market data, the same for everyone and holding nothing about any company or client (no organization_id):
--   markets.instruments   stocks, ETFs and crypto we price (the S&P 100, a short ETF list and the crypto Alpaca trades
--                         to start; others are added when someone opens them)
--   markets.prices        daily closes (dividends and splits included), from Alpaca, else Stooq
--   markets.fundamentals  yearly figures from the company's SEC filings (EDGAR)
--   markets.rates         FRED series: DGS10 (10-year Treasury) and DTB3 (3-month T-bill)
--  Each workspace's own, with row-level security:
--   markets.assumptions   the market risk premium and other inputs, entered by an admin or GP with the date they apply
--                         from and the source; never changed or deleted, so every old valuation can be traced
--   markets.watchlist     symbols the team follows
--   markets.valuations    every valuation as its own version (inputs, drivers, result, model version); never changed.
--                         kind: auto (drivers from the company's history), ai (drivers set by the AI review), edit (team)
--   markets.ai_reviews    the AI's review of a symbol: drivers it chose with reasons, thesis, risks, recent news and the
--                         pages it read; the text is never changed, only whether its drivers were applied
--  The market risk premium is set by AI each month from its published sources (set_by = 'ai'); a person can override.
--  The public_markets module is added to the Aidi plan only (on unless an admin switches it off), for admins and GPs (changeable on the Modules page).
BEGIN;
CREATE SCHEMA IF NOT EXISTS markets;
GRANT USAGE ON SCHEMA markets TO aidi_os_app;

CREATE TABLE IF NOT EXISTS markets.instruments (
  symbol     text        PRIMARY KEY CHECK (symbol ~ '^[A-Z0-9][A-Z0-9.\-]{0,11}$'),
  name       text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  kind       text        NOT NULL CHECK (kind IN ('stock', 'etf', 'crypto')),
  exchange   text,
  sector     text,
  cik        text        CHECK (cik ~ '^\d{10}$'),
  universe   text[]      NOT NULL DEFAULT '{}',
  info       jsonb       NOT NULL DEFAULT '{}',
  facts_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS markets.prices (
  symbol text    NOT NULL REFERENCES markets.instruments(symbol) ON DELETE CASCADE,
  d      date    NOT NULL,
  close  numeric(20,6) NOT NULL CHECK (close > 0),
  volume numeric(24,4),
  source text    NOT NULL,
  PRIMARY KEY (symbol, d));
CREATE TABLE IF NOT EXISTS markets.fundamentals (
  symbol     text  NOT NULL REFERENCES markets.instruments(symbol) ON DELETE CASCADE,
  period_end date  NOT NULL,
  fy         int   NOT NULL,
  form       text  NOT NULL,
  filed      date,
  data       jsonb NOT NULL,
  PRIMARY KEY (symbol, period_end));
CREATE TABLE IF NOT EXISTS markets.rates (
  series text NOT NULL CHECK (series IN ('DGS10', 'DTB3')),
  d      date NOT NULL,
  value  numeric(10,4) NOT NULL,
  source text NOT NULL,
  PRIMARY KEY (series, d));
GRANT SELECT, INSERT, UPDATE ON markets.instruments, markets.prices, markets.fundamentals, markets.rates TO aidi_os_app;

CREATE TABLE IF NOT EXISTS markets.assumptions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  key             text        NOT NULL CHECK (key IN ('mrp_us', 'terminal_growth', 'horizon_years', 'tax_rate', 'prob_bear', 'prob_base', 'prob_bull')),
  value           numeric(12,4) NOT NULL,
  effective_date  date        NOT NULL,
  source_url      text        CHECK (source_url IS NULL OR source_url ~ '^https?://'),
  note            text        CHECK (note IS NULL OR length(note) <= 500),
  set_by          text        NOT NULL DEFAULT 'person' CHECK (set_by IN ('person', 'ai')),
  created_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS markets_assumptions_key ON markets.assumptions (organization_id, key, effective_date DESC, created_at DESC);
CREATE TABLE IF NOT EXISTS markets.watchlist (
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  symbol          text        NOT NULL REFERENCES markets.instruments(symbol) ON DELETE CASCADE,
  added_by        uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, symbol));
CREATE TABLE IF NOT EXISTS markets.valuations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  symbol          text        NOT NULL REFERENCES markets.instruments(symbol) ON DELETE CASCADE,
  version         int         NOT NULL CHECK (version > 0),
  model_version   text        NOT NULL,
  kind            text        NOT NULL CHECK (kind IN ('auto', 'ai', 'edit')),
  inputs          jsonb       NOT NULL,
  drivers         jsonb,
  result          jsonb       NOT NULL,
  fair_value      numeric(20,4),
  note            text        CHECK (note IS NULL OR length(note) <= 500),
  created_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, symbol, version));
CREATE TABLE IF NOT EXISTS markets.ai_reviews (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  symbol          text        NOT NULL REFERENCES markets.instruments(symbol) ON DELETE CASCADE,
  valuation_id    uuid        REFERENCES markets.valuations(id) ON DELETE SET NULL,
  model           text        NOT NULL,
  review          jsonb       NOT NULL,
  applied         boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS markets_ai_reviews_symbol ON markets.ai_reviews (organization_id, symbol, created_at DESC);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['assumptions', 'watchlist', 'valuations', 'ai_reviews'] LOOP
    EXECUTE format('ALTER TABLE markets.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON markets.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON markets.%I USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
  END LOOP; END $$;
-- Assumptions and valuations are a record: added to, never changed or removed.
GRANT SELECT, INSERT ON markets.assumptions, markets.valuations, markets.ai_reviews TO aidi_os_app;
-- A review's text never changes; only whether its drivers were applied, and to which version.
GRANT UPDATE (applied, valuation_id) ON markets.ai_reviews TO aidi_os_app;
GRANT SELECT, INSERT, DELETE ON markets.watchlist TO aidi_os_app;

INSERT INTO markets.instruments (symbol, name, kind, universe)
SELECT s, n, 'stock', ARRAY['sp100'] FROM (VALUES
  ('AAPL','Apple'),('ABBV','AbbVie'),('ABT','Abbott Laboratories'),('ACN','Accenture'),('ADBE','Adobe'),('AIG','American International Group'),('AMD','Advanced Micro Devices'),
  ('AMGN','Amgen'),('AMT','American Tower'),('AMZN','Amazon'),('AVGO','Broadcom'),('AXP','American Express'),('BA','Boeing'),('BAC','Bank of America'),('BK','BNY Mellon'),
  ('BKNG','Booking Holdings'),('BLK','BlackRock'),('BMY','Bristol-Myers Squibb'),('BRK.B','Berkshire Hathaway'),('C','Citigroup'),('CAT','Caterpillar'),('CHTR','Charter Communications'),
  ('CL','Colgate-Palmolive'),('CMCSA','Comcast'),('COF','Capital One'),('COP','ConocoPhillips'),('COST','Costco'),('CRM','Salesforce'),('CSCO','Cisco'),('CVS','CVS Health'),
  ('CVX','Chevron'),('DE','Deere'),('DHR','Danaher'),('DIS','Disney'),('DUK','Duke Energy'),('EMR','Emerson Electric'),('F','Ford'),('FDX','FedEx'),('GD','General Dynamics'),
  ('GE','GE Aerospace'),('GILD','Gilead Sciences'),('GM','General Motors'),('GOOG','Alphabet (Class C)'),('GOOGL','Alphabet (Class A)'),('GS','Goldman Sachs'),('HD','Home Depot'),
  ('HON','Honeywell'),('IBM','IBM'),('INTC','Intel'),('INTU','Intuit'),('ISRG','Intuitive Surgical'),('JNJ','Johnson & Johnson'),('JPM','JPMorgan Chase'),('KO','Coca-Cola'),
  ('LIN','Linde'),('LLY','Eli Lilly'),('LMT','Lockheed Martin'),('LOW','Lowe''s'),('MA','Mastercard'),('MCD','McDonald''s'),('MDLZ','Mondelez'),('MDT','Medtronic'),('MET','MetLife'),
  ('META','Meta Platforms'),('MMM','3M'),('MO','Altria'),('MRK','Merck'),('MS','Morgan Stanley'),('MSFT','Microsoft'),('NEE','NextEra Energy'),('NFLX','Netflix'),('NKE','Nike'),
  ('NOW','ServiceNow'),('NVDA','Nvidia'),('ORCL','Oracle'),('PEP','PepsiCo'),('PFE','Pfizer'),('PG','Procter & Gamble'),('PLTR','Palantir'),('PM','Philip Morris International'),
  ('PYPL','PayPal'),('QCOM','Qualcomm'),('RTX','RTX'),('SBUX','Starbucks'),('SCHW','Charles Schwab'),('SO','Southern Company'),('SPG','Simon Property Group'),('T','AT&T'),
  ('TGT','Target'),('TMO','Thermo Fisher Scientific'),('TMUS','T-Mobile US'),('TSLA','Tesla'),('TXN','Texas Instruments'),('UBER','Uber'),('UNH','UnitedHealth'),('UNP','Union Pacific'),
  ('UPS','UPS'),('USB','U.S. Bancorp'),('V','Visa'),('VZ','Verizon'),('WFC','Wells Fargo'),('WMT','Walmart'),('XOM','ExxonMobil')) AS x(s, n)
ON CONFLICT (symbol) DO UPDATE SET universe = (SELECT array_agg(DISTINCT u) FROM unnest(markets.instruments.universe || EXCLUDED.universe) u);
INSERT INTO markets.instruments (symbol, name, kind, universe)
SELECT s, n, 'etf', ARRAY['etf'] FROM (VALUES
  ('SPY','SPDR S&P 500 ETF'),('QQQ','Invesco QQQ (Nasdaq 100)'),('IWM','iShares Russell 2000 ETF'),('VTI','Vanguard Total Stock Market ETF'),('VOO','Vanguard S&P 500 ETF'),
  ('VEA','Vanguard Developed Markets ETF'),('VWO','Vanguard Emerging Markets ETF'),('AGG','iShares Core US Aggregate Bond ETF'),('BND','Vanguard Total Bond Market ETF'),
  ('TLT','iShares 20+ Year Treasury Bond ETF'),('IEF','iShares 7-10 Year Treasury Bond ETF'),('SHY','iShares 1-3 Year Treasury Bond ETF'),('BIL','SPDR 1-3 Month T-Bill ETF'),
  ('SGOV','iShares 0-3 Month Treasury Bond ETF'),('GLD','SPDR Gold Shares'),('IAU','iShares Gold Trust'),('SLV','iShares Silver Trust'),('VNQ','Vanguard Real Estate ETF')) AS x(s, n)
ON CONFLICT (symbol) DO UPDATE SET universe = (SELECT array_agg(DISTINCT u) FROM unnest(markets.instruments.universe || EXCLUDED.universe) u);
INSERT INTO markets.instruments (symbol, name, kind, universe)
SELECT s, n, 'crypto', ARRAY['crypto'] FROM (VALUES
  ('BTC','Bitcoin'),('ETH','Ether'),('SOL','Solana'),('XRP','XRP'),('DOGE','Dogecoin'),('LTC','Litecoin'),('AVAX','Avalanche'),('LINK','Chainlink')) AS x(s, n)
ON CONFLICT (symbol) DO NOTHING;

UPDATE core.plans SET modules = array_append(modules, 'public_markets') WHERE code = 'internal' AND NOT ('public_markets' = ANY(modules));
COMMIT;
