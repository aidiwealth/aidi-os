-- 004_portfolio.sql — portfolio companies, monthly report links, reported values (with team overrides) and founder updates.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/004_portfolio.sql
BEGIN;
CREATE SCHEMA IF NOT EXISTS portfolio;

CREATE TABLE IF NOT EXISTS portfolio.companies (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id        uuid        UNIQUE REFERENCES deals.deals(id) ON DELETE RESTRICT,
  name           text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  founder_name   text        NOT NULL CHECK (length(founder_name) BETWEEN 1 AND 200),
  founder_email  text        NOT NULL CHECK (founder_email = lower(founder_email) AND position('@' IN founder_email) > 1),
  active         boolean     NOT NULL DEFAULT true,
  created_by     uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- One emailed link per company and month. Only a hash of the link token is stored.
CREATE TABLE IF NOT EXISTS portfolio.requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        NOT NULL REFERENCES portfolio.companies(id) ON DELETE RESTRICT,
  period            date        NOT NULL CHECK (extract(day FROM period) = 1),
  token_hash        text        NOT NULL UNIQUE,
  status            text        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','in_progress','submitted')),
  expires_at        timestamptz NOT NULL,
  draft             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  file_document_id  uuid        REFERENCES core.documents(id) ON DELETE SET NULL,
  sent_by           uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  opened_at         timestamptz,
  submitted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS requests_company_idx ON portfolio.requests (company_id, period DESC);

-- What the founder reported, and any correction by the team (the correction wins; both are kept).
CREATE TABLE IF NOT EXISTS portfolio.metric_values (
  company_id      uuid        NOT NULL REFERENCES portfolio.companies(id) ON DELETE RESTRICT,
  period          date        NOT NULL CHECK (extract(day FROM period) = 1),
  metric          text        NOT NULL CHECK (metric IN ('revenue','gross_margin','net_burn','cash','customers','headcount')),
  founder_value   numeric,
  override_value  numeric,
  override_note   text        CHECK (length(override_note) <= 500),
  override_by     uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  override_at     timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, period, metric)
);

CREATE TABLE IF NOT EXISTS portfolio.updates (
  company_id    uuid        NOT NULL REFERENCES portfolio.companies(id) ON DELETE RESTRICT,
  period        date        NOT NULL,
  highlights    text        CHECK (length(highlights) <= 4000),
  challenges    text        CHECK (length(challenges) <= 4000),
  asks          text        CHECK (length(asks) <= 4000),
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, period)
);

GRANT USAGE ON SCHEMA portfolio TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE ON portfolio.companies, portfolio.requests, portfolio.metric_values, portfolio.updates TO aidi_os_app;
COMMIT;
