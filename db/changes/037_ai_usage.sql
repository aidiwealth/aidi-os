-- 037_ai_usage.sql — AI allowances per plan (5-hour session and weekly, in tokens), AI credits and their purchases.
BEGIN;
ALTER TABLE core.plans ADD COLUMN IF NOT EXISTS ai_session_tokens bigint;
ALTER TABLE core.plans ADD COLUMN IF NOT EXISTS ai_weekly_tokens bigint;
UPDATE core.plans SET ai_session_tokens = 60000, ai_weekly_tokens = 300000 WHERE code = 'company_free' AND ai_session_tokens IS NULL;
UPDATE core.plans SET ai_session_tokens = 200000, ai_weekly_tokens = 1500000 WHERE code = 'company_startup' AND ai_session_tokens IS NULL;
UPDATE core.plans SET ai_session_tokens = 600000, ai_weekly_tokens = 5000000 WHERE code = 'company_scale' AND ai_session_tokens IS NULL;
ALTER TABLE core.ai_runs ADD COLUMN IF NOT EXISTS billed_to text NOT NULL DEFAULT 'plan' CHECK (billed_to IN ('plan','credits'));
CREATE INDEX IF NOT EXISTS ai_runs_org_time ON core.ai_runs (organization_id, created_at DESC);
CREATE SCHEMA IF NOT EXISTS ai;
GRANT USAGE ON SCHEMA ai TO aidi_os_app;
CREATE TABLE IF NOT EXISTS ai.credits (organization_id uuid PRIMARY KEY DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE, tokens bigint NOT NULL DEFAULT 0 CHECK (tokens >= 0), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai.purchases (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  pack text NOT NULL, tokens bigint NOT NULL, amount_minor bigint NOT NULL, currency text NOT NULL, created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai.credits','ai.purchases'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %s TO aidi_os_app', t);
  END LOOP;
END $rls$;
COMMIT;
