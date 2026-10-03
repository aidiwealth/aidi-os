-- 009_governance.sql — parties to each entity, resolutions (incl. minutes and distributions) and signatory approvals.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/009_governance.sql
BEGIN;
CREATE SCHEMA IF NOT EXISTS governance;

CREATE TABLE IF NOT EXISTS governance.parties (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   uuid        NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,
  name        text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  email       text        CHECK (email IS NULL OR (email = lower(email) AND position('@' IN email) > 1)),
  role        text        NOT NULL CHECK (role IN ('settlor','trustee','successor_trustee','protector','beneficiary','director','officer','member','shareholder','signatory')),
  share_pct   numeric(7,4) CHECK (share_pct IS NULL OR (share_pct >= 0 AND share_pct <= 100)),
  notes       text        CHECK (length(notes) <= 1000),
  start_date  date,
  end_date    date,
  created_by  uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS parties_entity_idx ON governance.parties (entity_id);

CREATE TABLE IF NOT EXISTS governance.resolutions (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           uuid          NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,
  kind                text          NOT NULL CHECK (kind IN ('resolution','minutes','distribution','consent')),
  title               text          NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body                text          NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  status              text          NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','circulating','approved','rejected','withdrawn')),
  required_approvals  integer       NOT NULL CHECK (required_approvals >= 1),
  meeting_date        date,
  amount              numeric(18,2) CHECK (amount IS NULL OR amount > 0),
  currency            text          CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  beneficiary_id      uuid          REFERENCES governance.parties(id) ON DELETE RESTRICT,
  document_id         uuid          REFERENCES core.documents(id) ON DELETE SET NULL,
  created_by          uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  circulated_at       timestamptz,
  decided_at          timestamptz,
  CHECK (kind <> 'distribution' OR (amount IS NOT NULL AND currency IS NOT NULL AND beneficiary_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS resolutions_entity_idx ON governance.resolutions (entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS governance.approvals (
  resolution_id  uuid        NOT NULL REFERENCES governance.resolutions(id) ON DELETE RESTRICT,
  user_id        uuid        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  party_id       uuid        NOT NULL REFERENCES governance.parties(id) ON DELETE RESTRICT,
  decision       text        NOT NULL CHECK (decision IN ('approve','reject')),
  note           text        CHECK (length(note) <= 2000),
  decided_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resolution_id, user_id)
);

INSERT INTO core.modules (code) VALUES ('governance') ON CONFLICT (code) DO NOTHING;

GRANT USAGE ON SCHEMA governance TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE ON governance.parties, governance.resolutions TO aidi_os_app;
GRANT SELECT, INSERT ON governance.approvals TO aidi_os_app;
COMMIT;
