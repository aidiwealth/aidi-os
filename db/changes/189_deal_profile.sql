-- More about each company in the pipeline: what it does, where, founders, the round, traction. AI can fill these from
-- the web; ai_unchecked lists the fields it filled that nobody has checked or edited yet, ai_sources the pages it used.
BEGIN;
ALTER TABLE deals.deals
  ADD COLUMN IF NOT EXISTS description text CHECK (length(description) <= 3000),
  ADD COLUMN IF NOT EXISTS sector text CHECK (length(sector) <= 100),
  ADD COLUMN IF NOT EXISTS country text CHECK (length(country) <= 100),
  ADD COLUMN IF NOT EXISTS city text CHECK (length(city) <= 100),
  ADD COLUMN IF NOT EXISTS founded smallint CHECK (founded BETWEEN 1900 AND 2100),
  ADD COLUMN IF NOT EXISTS business_model text CHECK (length(business_model) <= 60),
  ADD COLUMN IF NOT EXISTS team_size text CHECK (length(team_size) <= 40),
  ADD COLUMN IF NOT EXISTS linkedin text CHECK (length(linkedin) <= 500),
  ADD COLUMN IF NOT EXISTS founders jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(founders) = 'array'),
  ADD COLUMN IF NOT EXISTS lead_investor text CHECK (length(lead_investor) <= 200),
  ADD COLUMN IF NOT EXISTS investors text CHECK (length(investors) <= 1000),
  ADD COLUMN IF NOT EXISTS traction text CHECK (length(traction) <= 2000),
  ADD COLUMN IF NOT EXISTS deck_url text CHECK (length(deck_url) <= 1000),
  ADD COLUMN IF NOT EXISTS referred_by text CHECK (length(referred_by) <= 200),
  ADD COLUMN IF NOT EXISTS ai_unchecked text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_sources jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(ai_sources) = 'array'),
  ADD COLUMN IF NOT EXISTS ai_looked_up_at timestamptz;
COMMIT;
