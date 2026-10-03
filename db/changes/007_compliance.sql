-- 007_compliance.sql — compliance obligations per entity, their completion history, and reminders already sent.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/007_compliance.sql
BEGIN;
CREATE SCHEMA IF NOT EXISTS compliance;

CREATE TABLE IF NOT EXISTS compliance.obligations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id      uuid        NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,
  title          text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  category       text        NOT NULL CHECK (category IN ('tax','annual_return','franchise_tax','registered_agent','licence','regulatory','insurance','banking','other')),
  jurisdiction   text        CHECK (length(jurisdiction) <= 20),
  recurrence     text        NOT NULL DEFAULT 'annual' CHECK (recurrence IN ('none','monthly','quarterly','annual')),
  next_due       date        NOT NULL,
  reminder_days  integer     NOT NULL DEFAULT 14 CHECK (reminder_days BETWEEN 0 AND 120),
  owner_id       uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  notes          text        CHECK (length(notes) <= 3000),
  active         boolean     NOT NULL DEFAULT true,
  created_by     uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obligations_due_idx ON compliance.obligations (active, next_due);
CREATE INDEX IF NOT EXISTS obligations_entity_idx ON compliance.obligations (entity_id);

CREATE TABLE IF NOT EXISTS compliance.completions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id  uuid        NOT NULL REFERENCES compliance.obligations(id) ON DELETE RESTRICT,
  due_date       date        NOT NULL,
  completed_on   date        NOT NULL DEFAULT current_date,
  note           text        CHECK (length(note) <= 2000),
  document_id    uuid        REFERENCES core.documents(id) ON DELETE SET NULL,
  completed_by   uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS completions_obligation_idx ON compliance.completions (obligation_id, due_date DESC);

-- So each reminder goes out once per due date
CREATE TABLE IF NOT EXISTS compliance.reminders_sent (
  obligation_id  uuid        NOT NULL REFERENCES compliance.obligations(id) ON DELETE CASCADE,
  due_date       date        NOT NULL,
  kind           text        NOT NULL CHECK (kind IN ('upcoming','overdue')),
  sent_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (obligation_id, due_date, kind)
);

INSERT INTO core.modules (code) VALUES ('compliance') ON CONFLICT (code) DO NOTHING;

GRANT USAGE ON SCHEMA compliance TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE ON compliance.obligations TO aidi_os_app;
GRANT SELECT, INSERT ON compliance.completions, compliance.reminders_sent TO aidi_os_app;
COMMIT;
