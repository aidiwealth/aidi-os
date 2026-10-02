-- 002_deals.sql — pitches from aidiventures.com, AI screenings, and the decisions people make on them.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/002_deals.sql
BEGIN;
CREATE SCHEMA IF NOT EXISTS deals;

CREATE TABLE IF NOT EXISTS deals.pitches (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at     timestamptz NOT NULL DEFAULT now(),
  source          text        NOT NULL DEFAULT 'aidiventures.com',
  founder_name    text        NOT NULL CHECK (length(founder_name) BETWEEN 1 AND 200),
  email           text        NOT NULL CHECK (email = lower(email) AND position('@' IN email) > 1),
  company         text        NOT NULL CHECK (length(company) BETWEEN 1 AND 200),
  website         text        CHECK (length(website) <= 500),
  deck_url        text        CHECK (length(deck_url) <= 1000),
  country         text        CHECK (length(country) <= 100),
  stage           text        NOT NULL CHECK (stage IN ('pre_seed','seed','series_a','series_b','later')),
  sector          text        CHECK (length(sector) <= 100),
  raising_usd     bigint      CHECK (raising_usd >= 0),
  one_liner       text        NOT NULL CHECK (length(one_liner) BETWEEN 1 AND 300),
  description     text        NOT NULL CHECK (length(description) BETWEEN 1 AND 5000),
  traction        text        CHECK (length(traction) <= 3000),
  team            text        CHECK (length(team) <= 3000),
  female_founder  boolean,
  status          text        NOT NULL DEFAULT 'new' CHECK (status IN ('new','screened','advancing','on_hold','declined','spam')),
  ip              inet
);
CREATE INDEX IF NOT EXISTS pitches_received_idx ON deals.pitches (received_at DESC);
CREATE INDEX IF NOT EXISTS pitches_status_idx ON deals.pitches (status);

CREATE TABLE IF NOT EXISTS deals.screenings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id        uuid        NOT NULL REFERENCES deals.pitches(id) ON DELETE RESTRICT,
  ai_run_id       uuid        NOT NULL REFERENCES core.ai_runs(id) ON DELETE RESTRICT,
  score           integer     NOT NULL CHECK (score BETWEEN 0 AND 100),
  recommendation  text        NOT NULL CHECK (recommendation IN ('prioritise','review','likely_pass')),
  thesis_fit      smallint    NOT NULL CHECK (thesis_fit BETWEEN 1 AND 5),
  team_score      smallint    NOT NULL CHECK (team_score BETWEEN 1 AND 5),
  market_score    smallint    NOT NULL CHECK (market_score BETWEEN 1 AND 5),
  traction_score  smallint    NOT NULL CHECK (traction_score BETWEEN 1 AND 5),
  detail          jsonb       NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS screenings_pitch_idx ON deals.screenings (pitch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deals.decisions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id    uuid        NOT NULL REFERENCES deals.pitches(id) ON DELETE RESTRICT,
  decision    text        NOT NULL CHECK (decision IN ('advance','hold','decline')),
  note        text        NOT NULL CHECK (length(note) BETWEEN 3 AND 2000),
  decided_by  uuid        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  decided_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decisions_pitch_idx ON deals.decisions (pitch_id, decided_at DESC);

GRANT USAGE ON SCHEMA deals TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE ON deals.pitches, deals.screenings TO aidi_os_app;
GRANT SELECT, INSERT ON deals.decisions TO aidi_os_app;
COMMIT;
