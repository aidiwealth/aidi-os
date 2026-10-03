-- 010_credit.sql — borrowers, loans, repayment schedules, repayments, covenants and checks, reminder log.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/010_credit.sql
BEGIN;
CREATE SCHEMA IF NOT EXISTS credit;

CREATE TABLE IF NOT EXISTS credit.borrowers (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  country        text        CHECK (length(country) <= 100),
  sector         text        CHECK (length(sector) <= 100),
  contact_name   text        CHECK (length(contact_name) <= 200),
  contact_email  text        CHECK (contact_email IS NULL OR position('@' IN contact_email) > 1),
  created_by     uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit.loans (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id       uuid          NOT NULL REFERENCES credit.borrowers(id) ON DELETE RESTRICT,
  lender_entity_id  uuid          REFERENCES core.entities(id) ON DELETE RESTRICT,
  reference         text          CHECK (length(reference) <= 60),
  principal         numeric(18,2) NOT NULL CHECK (principal > 0),
  currency          text          NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  annual_rate       numeric(7,4)  NOT NULL CHECK (annual_rate >= 0 AND annual_rate <= 200),
  tenor_months      integer       NOT NULL CHECK (tenor_months BETWEEN 1 AND 360),
  repayment_type    text          NOT NULL CHECK (repayment_type IN ('amortising','interest_only','bullet')),
  frequency         text          NOT NULL CHECK (frequency IN ('monthly','quarterly')),
  disbursed_on      date          NOT NULL,
  first_payment_on  date          NOT NULL,
  status            text          NOT NULL DEFAULT 'active' CHECK (status IN ('active','repaid','written_off','restructured')),
  security          text          CHECK (length(security) <= 1000),
  notes             text          CHECK (length(notes) <= 3000),
  created_by        uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit.schedule (
  loan_id        uuid          NOT NULL REFERENCES credit.loans(id) ON DELETE RESTRICT,
  seq            integer       NOT NULL,
  due_date       date          NOT NULL,
  principal_due  numeric(18,2) NOT NULL,
  interest_due   numeric(18,2) NOT NULL,
  PRIMARY KEY (loan_id, seq)
);

CREATE TABLE IF NOT EXISTS credit.repayments (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id      uuid          NOT NULL REFERENCES credit.loans(id) ON DELETE RESTRICT,
  received_on  date          NOT NULL,
  amount       numeric(18,2) NOT NULL CHECK (amount > 0),
  note         text          CHECK (length(note) <= 1000),
  created_by   uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  created_at   timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS repayments_loan_idx ON credit.repayments (loan_id, received_on);

CREATE TABLE IF NOT EXISTS credit.covenants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id     uuid        NOT NULL REFERENCES credit.loans(id) ON DELETE RESTRICT,
  title       text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  kind        text        NOT NULL CHECK (kind IN ('financial','reporting','other')),
  threshold   text        CHECK (length(threshold) <= 300),
  frequency   text        NOT NULL CHECK (frequency IN ('once','monthly','quarterly','annual')),
  next_due    date        NOT NULL,
  active      boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit.covenant_checks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  covenant_id  uuid        NOT NULL REFERENCES credit.covenants(id) ON DELETE RESTRICT,
  due_date     date        NOT NULL,
  checked_on   date        NOT NULL DEFAULT current_date,
  result       text        NOT NULL CHECK (result IN ('met','breached','waived')),
  note         text        CHECK (length(note) <= 2000),
  document_id  uuid        REFERENCES core.documents(id) ON DELETE SET NULL,
  created_by   uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit.reminders_sent (
  key      text        PRIMARY KEY,
  sent_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO core.modules (code) VALUES ('credit') ON CONFLICT (code) DO NOTHING;

GRANT USAGE ON SCHEMA credit TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE ON credit.borrowers, credit.loans, credit.covenants TO aidi_os_app;
GRANT SELECT, INSERT ON credit.schedule, credit.repayments, credit.covenant_checks, credit.reminders_sent TO aidi_os_app;
COMMIT;
