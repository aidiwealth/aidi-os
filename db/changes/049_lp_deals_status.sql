-- 049_lp_deals_status.sql — deal flow shared with LPs, LP interest, status-check history.
BEGIN;
ALTER TABLE deals.pitches ADD COLUMN IF NOT EXISTS lp_share text NOT NULL DEFAULT 'auto' CHECK (lp_share IN ('auto','show','hide'));
CREATE TABLE IF NOT EXISTS deals.lp_interest (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  pitch_id uuid NOT NULL REFERENCES deals.pitches(id) ON DELETE CASCADE, lp_id uuid NOT NULL REFERENCES funds.lps(id) ON DELETE CASCADE, note text CHECK (length(note) <= 1000), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (pitch_id, lp_id));
ALTER TABLE deals.lp_interest ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON deals.lp_interest;
CREATE POLICY tenant_isolation ON deals.lp_interest USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON deals.lp_interest TO aidi_os_app;
CREATE TABLE IF NOT EXISTS core.status_checks (id bigserial PRIMARY KEY, checked_at timestamptz NOT NULL DEFAULT now(), component text NOT NULL, ok boolean NOT NULL, latency_ms integer, note text);
CREATE INDEX IF NOT EXISTS status_checks_time ON core.status_checks (component, checked_at DESC);
GRANT SELECT, INSERT, DELETE ON core.status_checks TO aidi_os_app;
GRANT USAGE ON SEQUENCE core.status_checks_id_seq TO aidi_os_app;
COMMIT;
