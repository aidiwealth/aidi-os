-- 006_services.sql — client-service clients, jobs and job timelines.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/006_services.sql
BEGIN;
CREATE SCHEMA IF NOT EXISTS services;

CREATE TABLE IF NOT EXISTS services.clients (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  contact_name  text        NOT NULL CHECK (length(contact_name) BETWEEN 1 AND 200),
  email         text        NOT NULL CHECK (email = lower(email) AND position('@' IN email) > 1),
  phone         text        CHECK (length(phone) <= 40),
  country       text        CHECK (length(country) <= 100),
  created_by    uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services.jobs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid        NOT NULL REFERENCES services.clients(id) ON DELETE RESTRICT,
  service              text        NOT NULL CHECK (service IN ('company_formation','annual_compliance','tax_filing','registered_agent','legal_review','trust_setup','banking_setup','other')),
  title                text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description          text        CHECK (length(description) <= 5000),
  status               text        NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','waiting_client','completed','cancelled')),
  priority             text        NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  owner_id             uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  provider_entity_id   uuid        REFERENCES core.entities(id) ON DELETE RESTRICT,
  fee_usd              numeric(14,2) CHECK (fee_usd >= 0),
  due_date             date,
  client_token_hash    text        UNIQUE,
  client_token_expires timestamptz,
  created_by           uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON services.jobs (status, due_date);
CREATE INDEX IF NOT EXISTS jobs_client_idx ON services.jobs (client_id);

-- Timeline. visible_to_client controls what the client sees on their link.
CREATE TABLE IF NOT EXISTS services.job_events (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid        NOT NULL REFERENCES services.jobs(id) ON DELETE RESTRICT,
  kind               text        NOT NULL CHECK (kind IN ('note','status','document','message','client_message','client_document')),
  body               text        CHECK (length(body) <= 5000),
  from_status        text,
  to_status          text,
  document_id        uuid        REFERENCES core.documents(id) ON DELETE RESTRICT,
  visible_to_client  boolean     NOT NULL DEFAULT false,
  created_by         uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_events_job_idx ON services.job_events (job_id, created_at DESC);

INSERT INTO core.modules (code) VALUES ('services') ON CONFLICT (code) DO NOTHING;

GRANT USAGE ON SCHEMA services TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE ON services.clients, services.jobs TO aidi_os_app;
GRANT SELECT, INSERT ON services.job_events TO aidi_os_app;
COMMIT;
