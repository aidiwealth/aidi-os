-- 008_banking.sql — bank accounts per entity, imported statements that tie out, their transactions, and pending imports.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/008_banking.sql
BEGIN;
CREATE SCHEMA IF NOT EXISTS banking;

CREATE TABLE IF NOT EXISTS banking.accounts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     uuid        NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,
  bank_name     text        NOT NULL CHECK (length(bank_name) BETWEEN 1 AND 120),
  account_name  text        NOT NULL CHECK (length(account_name) BETWEEN 1 AND 160),
  last4         text        CHECK (last4 ~ '^[0-9]{4}$'),   -- never the full account number
  currency      text        NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  kind          text        NOT NULL DEFAULT 'current' CHECK (kind IN ('current','savings','money_market','brokerage','other')),
  active        boolean     NOT NULL DEFAULT true,
  created_by    uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS banking.statements (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid          NOT NULL REFERENCES banking.accounts(id) ON DELETE RESTRICT,
  period_start     date          NOT NULL,
  period_end       date          NOT NULL CHECK (period_end >= period_start),
  opening_balance  numeric(18,2) NOT NULL,
  closing_balance  numeric(18,2) NOT NULL,
  credits_total    numeric(18,2) NOT NULL,
  debits_total     numeric(18,2) NOT NULL,
  txn_count        integer       NOT NULL,
  continuity_ok    boolean,      -- opening equals the previous statement's closing (null when there is no previous)
  document_id      uuid          REFERENCES core.documents(id) ON DELETE SET NULL,
  source           text          NOT NULL CHECK (source IN ('csv','pdf')),
  uploaded_by      uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (account_id, period_start, period_end),
  CHECK (abs(opening_balance + credits_total - debits_total - closing_balance) < 0.005)
);
CREATE INDEX IF NOT EXISTS statements_account_idx ON banking.statements (account_id, period_end DESC);

CREATE TABLE IF NOT EXISTS banking.transactions (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id  uuid          NOT NULL REFERENCES banking.statements(id) ON DELETE RESTRICT,
  account_id    uuid          NOT NULL REFERENCES banking.accounts(id) ON DELETE RESTRICT,
  txn_date      date          NOT NULL,
  description   text          NOT NULL CHECK (length(description) <= 500),
  amount        numeric(18,2) NOT NULL,  -- money in is positive, money out is negative
  balance       numeric(18,2)
);
CREATE INDEX IF NOT EXISTS transactions_account_idx ON banking.transactions (account_id, txn_date DESC);

-- A parsed file waiting for confirmation (kept server-side so the saved figures are exactly what was read)
CREATE TABLE IF NOT EXISTS banking.imports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid        NOT NULL REFERENCES banking.accounts(id) ON DELETE CASCADE,
  document_id  uuid        REFERENCES core.documents(id) ON DELETE SET NULL,
  source       text        NOT NULL CHECK (source IN ('csv','pdf')),
  parsed       jsonb       NOT NULL,
  status       text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','saved')),
  created_by   uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO core.modules (code) VALUES ('banking') ON CONFLICT (code) DO NOTHING;

GRANT USAGE ON SCHEMA banking TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE ON banking.accounts, banking.imports TO aidi_os_app;
GRANT SELECT, INSERT ON banking.statements, banking.transactions TO aidi_os_app;
COMMIT;
