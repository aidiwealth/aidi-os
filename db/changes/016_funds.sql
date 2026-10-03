-- 016_funds.sql — fund management (funds, LPs, commitments, calls and distributions tracked, NAV) and delete rights.
-- Finvry tracks and reports; formation, KYC, money movement, tax and filings stay with the fund's administrator.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/016_funds.sql
BEGIN;
CREATE SCHEMA IF NOT EXISTS funds;

CREATE TABLE IF NOT EXISTS funds.funds (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid          NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  entity_id             uuid          NOT NULL UNIQUE REFERENCES core.entities(id) ON DELETE RESTRICT,
  currency              text          NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  target_size           numeric(16,2) CHECK (target_size IS NULL OR target_size >= 0),
  vintage               integer       CHECK (vintage IS NULL OR vintage BETWEEN 1990 AND 2100),
  first_close           date,
  final_close           date,
  term_years            integer       CHECK (term_years IS NULL OR term_years BETWEEN 1 AND 30),
  mgmt_fee_pct          numeric(6,3)  CHECK (mgmt_fee_pct IS NULL OR mgmt_fee_pct BETWEEN 0 AND 100),
  carry_pct             numeric(6,3)  CHECK (carry_pct IS NULL OR carry_pct BETWEEN 0 AND 100),
  hurdle_pct            numeric(6,3)  CHECK (hurdle_pct IS NULL OR hurdle_pct BETWEEN 0 AND 100),
  status                text          NOT NULL DEFAULT 'raising' CHECK (status IN ('raising','investing','harvesting','closed')),
  administrator         text          NOT NULL DEFAULT 'self' CHECK (administrator IN ('sydecar','carta','angellist','other','self')),
  administrator_name    text          CHECK (length(administrator_name) <= 200),
  admin_portal_url      text          CHECK (admin_portal_url IS NULL OR admin_portal_url ~ '^https://'),
  notify_lps            boolean       NOT NULL DEFAULT true,
  created_by            uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  created_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS funds.lps (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  name                  text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  kind                  text        NOT NULL DEFAULT 'individual' CHECK (kind IN ('individual','entity','institution','gp')),
  contact_name          text        CHECK (length(contact_name) <= 200),
  email                 text        CHECK (email IS NULL OR position('@' IN email) > 1),
  country               text        CHECK (length(country) <= 100),
  kyc_status            text        NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending','approved','expired')),
  notes                 text        CHECK (length(notes) <= 3000),
  portal_token_hash     text        UNIQUE,
  portal_token_expires  timestamptz,
  created_by            uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS funds.commitments (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  fund_id          uuid          NOT NULL REFERENCES funds.funds(id) ON DELETE RESTRICT,
  lp_id            uuid          NOT NULL REFERENCES funds.lps(id) ON DELETE RESTRICT,
  amount           numeric(16,2) NOT NULL CHECK (amount > 0),
  committed_on     date          NOT NULL DEFAULT current_date,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (fund_id, lp_id)
);

CREATE TABLE IF NOT EXISTS funds.calls (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  fund_id          uuid          NOT NULL REFERENCES funds.funds(id) ON DELETE RESTRICT,
  kind             text          NOT NULL CHECK (kind IN ('call','distribution')),
  number           integer       NOT NULL,
  purpose          text          CHECK (length(purpose) <= 1000),
  total_amount     numeric(16,2) NOT NULL CHECK (total_amount > 0),
  due_date         date          NOT NULL,
  status           text          NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','sent','completed','cancelled')),
  required_approvals integer     NOT NULL DEFAULT 2,
  created_by       uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  approved_at      timestamptz,
  sent_at          timestamptz,
  UNIQUE (fund_id, kind, number)
);

CREATE TABLE IF NOT EXISTS funds.call_approvals (
  call_id          uuid        NOT NULL REFERENCES funds.calls(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  organization_id  uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  decided_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (call_id, user_id)
);

CREATE TABLE IF NOT EXISTS funds.call_lines (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  call_id          uuid          NOT NULL REFERENCES funds.calls(id) ON DELETE CASCADE,
  lp_id            uuid          NOT NULL REFERENCES funds.lps(id) ON DELETE RESTRICT,
  amount           numeric(16,2) NOT NULL CHECK (amount >= 0),
  paid_amount      numeric(16,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  paid_on          date,
  UNIQUE (call_id, lp_id)
);

CREATE TABLE IF NOT EXISTS funds.navs (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  fund_id          uuid          NOT NULL REFERENCES funds.funds(id) ON DELETE CASCADE,
  as_of            date          NOT NULL,
  nav              numeric(16,2) NOT NULL CHECK (nav >= 0),
  note             text          CHECK (length(note) <= 500),
  created_by       uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (fund_id, as_of)
);

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['funds.funds','funds.lps','funds.commitments','funds.calls','funds.call_approvals','funds.call_lines','funds.navs'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
  END LOOP;
END $rls$;

GRANT USAGE ON SCHEMA funds TO aidi_os_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA funds TO aidi_os_app;

-- Deleting records the team created (guarded in the app; history tables such as the audit log stay append-only)
GRANT DELETE ON core.entities, core.documents, compliance.obligations, compliance.completions, banking.accounts, banking.statements,
  banking.transactions, banking.imports, governance.parties, governance.resolutions, governance.approvals, credit.borrowers, credit.loans,
  credit.schedule, credit.repayments, credit.covenants, credit.covenant_checks, services.clients, services.jobs, services.job_events,
  portfolio.companies, portfolio.metric_values, portfolio.requests, portfolio.updates, deals.deals, deals.deal_events, deals.ic_votes,
  deals.pitches, deals.screenings, deals.decisions, platform.leads, platform.lead_events TO aidi_os_app;

UPDATE core.plans SET modules = array_append(modules, 'funds') WHERE code IN ('growth','enterprise','internal') AND NOT ('funds' = ANY(modules));
COMMIT;
