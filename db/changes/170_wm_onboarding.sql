-- 170_wm_onboarding.sql — Aidi Wealth client onboarding as one conversation.
--  wm.onboarding  one row per client going through it: how they came in (an adviser's invite, or a request from the
--                 website), where they are, their answers, the conversation itself, and the Social Security number
--                 held encrypted only until the investing account is opened (then cleared). Website requests wait
--                 for an adviser to approve; invited clients go straight to their dashboard.
BEGIN;
CREATE TABLE IF NOT EXISTS wm.onboarding (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id       uuid        NOT NULL UNIQUE REFERENCES wm.clients(id) ON DELETE CASCADE,
  source          text        NOT NULL CHECK (source IN ('invite', 'request')),
  status          text        NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'done', 'declined')),
  step            text        NOT NULL DEFAULT 'household',
  answers         jsonb       NOT NULL DEFAULT '{}',
  messages        jsonb       NOT NULL DEFAULT '[]',
  request         jsonb       NOT NULL DEFAULT '{}',
  ssn_enc         text,
  account_status  text        CHECK (account_status IS NULL OR account_status IN ('not_needed', 'waiting', 'opened', 'failed', 'held')),
  account_note    text        CHECK (account_note IS NULL OR length(account_note) <= 500),
  invited_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  submitted_at    timestamptz,
  decided_at      timestamptz,
  decided_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  decision_note   text        CHECK (decision_note IS NULL OR length(decision_note) <= 1000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS wm_onboarding_status ON wm.onboarding (organization_id, status, updated_at DESC);
ALTER TABLE wm.onboarding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.onboarding;
CREATE POLICY tenant_isolation ON wm.onboarding USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE ON wm.onboarding TO aidi_os_app;
COMMIT;
