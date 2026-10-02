-- 001_core.sql — Aidi OS core: entities, people, users and roles, sign-in codes, sessions,
-- an append-only audit log, documents and the AI call log.
-- Apply once, as the database admin (take a backup first on any database with data):
--   read -s PW && sed "s/CHANGE_ME_BEFORE_RUNNING/$PW/" db/changes/001_core.sql | psql "$ADMIN_DATABASE_URL"
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS core;

-- Companies, funds, trusts and households the group tracks
CREATE TABLE IF NOT EXISTS core.entities (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL UNIQUE,
  legal_name   text,
  kind         text        NOT NULL CHECK (kind IN ('holding','operating','fund','gp','management_company','trust','household','spv','other')),
  jurisdiction text,
  status       text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','forming','dormant','closed')),
  parent_id    uuid        REFERENCES core.entities(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Everyone Aidi OS knows about: family, team, founders, investors, clients, advisers
CREATE TABLE IF NOT EXISTS core.people (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text        NOT NULL,
  email       text        CHECK (email IS NULL OR (email = lower(email) AND position('@' IN email) > 1)),
  phone_e164  text        CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  kind        text        NOT NULL CHECK (kind IN ('family','team','founder','investor','client','adviser','other')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS people_email_uq ON core.people (email) WHERE email IS NOT NULL;

-- People who can sign in
CREATE TABLE IF NOT EXISTS core.users (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id      uuid        NOT NULL UNIQUE REFERENCES core.people(id) ON DELETE RESTRICT,
  email          text        NOT NULL UNIQUE CHECK (email = lower(email) AND position('@' IN email) > 1),
  status         text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.roles (
  code        text PRIMARY KEY,
  description text NOT NULL
);
INSERT INTO core.roles (code, description) VALUES
  ('admin',    'Full access, including user and role management'),
  ('gp',       'General partner: funds, deals and approvals'),
  ('family',   'Family member: family-office records they are named on'),
  ('team',     'Aidi team member: deals, clients and operations'),
  ('adviser',  'External adviser: records they are named on'),
  ('founder',  'Portfolio founder: own company reporting only'),
  ('investor', 'Fund investor: own records only'),
  ('client',   'Service client: own jobs only')
ON CONFLICT (code) DO NOTHING;

-- A role can apply group-wide (scope_entity_id NULL) or to one entity
CREATE TABLE IF NOT EXISTS core.user_roles (
  user_id          uuid        NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  role_code        text        NOT NULL REFERENCES core.roles(code) ON DELETE RESTRICT,
  scope_entity_id  uuid        REFERENCES core.entities(id) ON DELETE CASCADE,
  granted_by       uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  granted_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, role_code, scope_entity_id)
);

-- Sign-in tokens, as on Telroi: one email carries a magic link and a 6-digit code.
-- Only hashes are stored; codes live 10 minutes, allow 5 attempts, and a new request voids older ones.
CREATE TABLE IF NOT EXISTS core.login_codes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text        NOT NULL CHECK (email = lower(email)),
  token_hash   text        NOT NULL,
  otp_hash     text        NOT NULL,
  attempts     integer     NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_ip   inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_codes_email_idx ON core.login_codes (email, created_at DESC);
CREATE INDEX IF NOT EXISTS login_codes_token_idx ON core.login_codes (token_hash);

-- Recorded sessions, as on Telroi: the signed cookie carries this id, so any session can be revoked
CREATE TABLE IF NOT EXISTS core.sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  revoked_reason  text,
  ip              inet,
  user_agent      text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON core.sessions (user_id);

-- Append-only record of sign-ins, approvals, sensitive views, exports and AI outputs (keep at least 5 years)
CREATE TABLE IF NOT EXISTS core.audit_log (
  id             bigserial   PRIMARY KEY,
  at             timestamptz NOT NULL DEFAULT now(),
  actor_user_id  uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  action         text        NOT NULL,
  object_type    text,
  object_id      text,
  entity_id      uuid        REFERENCES core.entities(id) ON DELETE SET NULL,
  detail         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip             inet
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON core.audit_log (at DESC);
CREATE INDEX IF NOT EXISTS audit_log_object_idx ON core.audit_log (object_type, object_id);

CREATE OR REPLACE FUNCTION core.audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'core.audit_log is append-only';
END $$;
DROP TRIGGER IF EXISTS audit_log_no_change ON core.audit_log;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON core.audit_log
  FOR EACH ROW EXECUTE FUNCTION core.audit_log_append_only();

-- Files kept in private storage; only metadata lives here
CREATE TABLE IF NOT EXISTS core.documents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    uuid        REFERENCES core.entities(id) ON DELETE RESTRICT,
  title        text        NOT NULL,
  kind         text        NOT NULL DEFAULT 'other',
  sensitivity  text        NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal','family','restricted')),
  storage_key  text        NOT NULL UNIQUE,
  mime_type    text        NOT NULL,
  size_bytes   bigint      NOT NULL CHECK (size_bytes >= 0),
  sha256       text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by  uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Every AI call: model, prompt version, input reference, validated output, tokens, cost and who acted on it
CREATE TABLE IF NOT EXISTS core.ai_runs (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  task            text          NOT NULL,
  model           text          NOT NULL,
  prompt_version  text          NOT NULL,
  input_ref       text          NOT NULL,
  output          jsonb,
  valid           boolean       NOT NULL,
  error           text,
  input_tokens    integer       CHECK (input_tokens >= 0),
  output_tokens   integer       CHECK (output_tokens >= 0),
  cost_usd        numeric(12,6) CHECK (cost_usd >= 0),
  acted_by        uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  acted_at        timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  CHECK (valid OR error IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ai_runs_task_idx ON core.ai_runs (task, created_at DESC);

-- Group entities known today (edit names/status in the app later)
INSERT INTO core.entities (name, kind, jurisdiction, status) VALUES
  ('Aidi Group Holdings LLC',  'holding',     'US',      'forming'),
  ('Aidi Ventures LLC',        'holding',     'US-DE',   'active'),
  ('Aidi Wealth LLC',          'operating',   'US',      'active'),
  ('Aidi Haven LLC',           'operating',   'US-CA',   'active'),
  ('Telroi LLC',               'operating',   'US',      'active'),
  ('Aidi Technology Limited',  'operating',   'NG',      'active'),
  ('Telroi Limited',           'operating',   'NG',      'active'),
  ('Aidi Finance Limited',     'operating',   'NG',      'forming'),
  ('TAG Trust',                'trust',       'US',      'forming'),
  ('TAG Family Trust',         'trust',       'US',      'forming'),
  ('Aidi Ventures Fund I',     'fund',        'US-DE',   'forming'),
  ('Aidi Angel Fund',          'fund',        'US',      'active')
ON CONFLICT (name) DO NOTHING;

-- Least-privilege role for the app: no DELETE anywhere, and the audit log is insert/read only
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidi_os_app') THEN
    CREATE ROLE aidi_os_app LOGIN PASSWORD 'CHANGE_ME_BEFORE_RUNNING';
  END IF;
END $$;
GRANT USAGE ON SCHEMA core TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE ON core.entities, core.people, core.users, core.user_roles,
  core.login_codes, core.sessions, core.documents, core.ai_runs TO aidi_os_app;
GRANT DELETE ON core.user_roles TO aidi_os_app;
GRANT SELECT ON core.roles TO aidi_os_app;
GRANT SELECT, INSERT ON core.audit_log TO aidi_os_app;
GRANT USAGE ON SEQUENCE core.audit_log_id_seq TO aidi_os_app;

COMMIT;
