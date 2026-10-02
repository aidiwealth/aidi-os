-- 003_pipeline.sql — deals in the pipeline, their timeline, and IC votes.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/003_pipeline.sql
BEGIN;
CREATE TABLE IF NOT EXISTS deals.deals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id       uuid        UNIQUE REFERENCES deals.pitches(id) ON DELETE RESTRICT,
  company        text        NOT NULL CHECK (length(company) BETWEEN 1 AND 200),
  one_liner      text        CHECK (length(one_liner) <= 300),
  website        text        CHECK (length(website) <= 500),
  stage          text        NOT NULL DEFAULT 'screening' CHECK (stage IN ('screening','first_call','diligence','ic','invested','passed')),
  round          text        CHECK (round IN ('pre_seed','seed','series_a','series_b','later')),
  raise_usd      bigint      CHECK (raise_usd >= 0),
  check_usd      bigint      CHECK (check_usd >= 0),
  valuation_usd  bigint      CHECK (valuation_usd >= 0),
  source         text        NOT NULL DEFAULT 'other' CHECK (source IN ('pitch_form','referral','outbound','network','other')),
  owner_id       uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_by     uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  stage_since    timestamptz NOT NULL DEFAULT now(),
  closed_at      timestamptz
);
CREATE INDEX IF NOT EXISTS deals_stage_idx ON deals.deals (stage, stage_since DESC);

CREATE TABLE IF NOT EXISTS deals.deal_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id      uuid        NOT NULL REFERENCES deals.deals(id) ON DELETE RESTRICT,
  kind         text        NOT NULL CHECK (kind IN ('note','meeting','stage','document','ic_vote')),
  body         text        CHECK (length(body) <= 5000),
  meeting_at   timestamptz,
  from_stage   text,
  to_stage     text,
  document_id  uuid        REFERENCES core.documents(id) ON DELETE RESTRICT,
  created_by   uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deal_events_deal_idx ON deals.deal_events (deal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deals.ic_votes (
  deal_id     uuid        NOT NULL REFERENCES deals.deals(id) ON DELETE RESTRICT,
  voter_id    uuid        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  vote        text        NOT NULL CHECK (vote IN ('approve','reject')),
  note        text        CHECK (length(note) <= 2000),
  voted_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, voter_id)
);

GRANT SELECT, INSERT, UPDATE ON deals.deals, deals.ic_votes TO aidi_os_app;
GRANT SELECT, INSERT ON deals.deal_events TO aidi_os_app;
COMMIT;
