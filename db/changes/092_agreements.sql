-- 092_agreements.sql — signed agreements: the service level agreement on each job, and the Terms of Service and Data
-- Privacy Agreement every Finvry sign-up accepts. Templates are edited by the services team (rows here override the
-- built-in defaults); every signature keeps the exact text signed, the signature image and a signed PDF.
BEGIN;
CREATE SCHEMA IF NOT EXISTS legal;
CREATE TABLE IF NOT EXISTS legal.templates (
  code        text        PRIMARY KEY CHECK (code IN ('sla', 'terms_us', 'terms_ng', 'privacy_us', 'privacy_ng')),
  title       text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body        text        NOT NULL CHECK (length(body) <= 100000),
  version     int         NOT NULL DEFAULT 2,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);
CREATE TABLE IF NOT EXISTS legal.signatures (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text        NOT NULL,
  version         int         NOT NULL DEFAULT 1,
  title           text        NOT NULL,
  body            text        NOT NULL,
  status          text        NOT NULL DEFAULT 'signed' CHECK (status IN ('pending', 'signed', 'void')),
  effective_date  date        NOT NULL DEFAULT current_date,
  organization_id uuid        REFERENCES core.organizations(id) ON DELETE SET NULL,
  user_id         uuid,
  client_id       uuid,
  job_id          uuid,
  signer_name     text        CHECK (length(signer_name) <= 200),
  signer_email    text        CHECK (length(signer_email) <= 254),
  signature_kind  text        CHECK (signature_kind IN ('typed', 'drawn', 'uploaded', 'accepted')),
  signature_png   text        CHECK (length(signature_png) <= 700000),
  signed_at       timestamptz,
  ip              text,
  user_agent      text,
  sha256          text,
  pdf_key         text,
  document_id     uuid,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signatures_job_idx ON legal.signatures (job_id);
CREATE INDEX IF NOT EXISTS signatures_org_idx ON legal.signatures (organization_id);
CREATE INDEX IF NOT EXISTS signatures_client_idx ON legal.signatures (client_id);
GRANT USAGE ON SCHEMA legal TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON legal.templates, legal.signatures TO aidi_os_app;
COMMIT;
