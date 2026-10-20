-- 146_plans_access.sql — the October 2026 Finvry plans, invite-only access, and price overrides.
--  Plans: Startup $29.99, Medium $99.99 and Scale $499.99 a month, billed yearly, each with a 14-day free trial. Medium
--  adds forecasts, revenue retention and customer analysis to Startup; Scale adds subsidiaries and the group. Naira
--  prices are the dollar prices at the platform's naira rate (billing settings), rounded to the nearest thousand.
--  The Free plan is no longer offered; workspaces already on it stay on it.
--  Companies already paying keep their earlier monthly price (settings.price_override), until the Finvry team changes it.
--  Access: sign-up is by invitation (platform.settings 'access': mode invite_only | open | closed, weekly approval cap,
--  monthly cap on new service orders); people ask for access with platform.access_requests.
BEGIN;
-- Existing paying companies first, while the old prices are still on the plans.
UPDATE core.organizations o SET settings = o.settings || jsonb_build_object('price_override', jsonb_build_object(
    'amount', CASE WHEN coalesce((SELECT ws.currency FROM wallet.subscriptions ws WHERE ws.organization_id = o.id AND ws.kind = 'plan' AND ws.status <> 'cancelled' LIMIT 1),
                                 CASE WHEN o.settings->>'currency' = 'NGN' THEN 'NGN' ELSE 'USD' END) = 'NGN' THEN p.price_monthly_ngn ELSE p.price_monthly_usd END,
    'interval', 'month', 'note', 'Earlier plan price (before the October 2026 plans)', 'set_at', to_char(now(), 'YYYY-MM-DD')))
  FROM core.plans p
  WHERE p.code = o.plan_code AND o.kind = 'company' AND o.plan_code IN ('company_startup', 'company_scale') AND o.status <> 'closed'
    AND NOT (o.settings ? 'price_override');
CREATE TEMP TABLE ngn_rate ON COMMIT DROP AS SELECT coalesce((SELECT (value->>'ngn_per_usd')::numeric FROM platform.settings WHERE key = 'billing'), 1600) AS r;

INSERT INTO core.plans (code, name, description, modules, seat_limit, storage_gb, ai_runs_month, price_monthly_usd, price_annual_usd, public, active, sort)
  SELECT 'company_medium', 'Medium', 'For companies tracking growth: everything in Startup with forecasts, revenue retention and customer analysis.',
    (SELECT array(SELECT DISTINCT unnest(modules || ARRAY['forecast', 'fin_customers']::text[]) ORDER BY 1) FROM core.plans WHERE code = 'company_startup'), 10, 25, 500, 99.99, 1199.88, true, true, 23
  ON CONFLICT (code) DO NOTHING;
UPDATE core.plans SET price_monthly_usd = 29.99, price_annual_usd = 359.88, seat_limit = 5, storage_gb = 10, ai_runs_month = 200, sort = 22,
  description = 'For founders reporting to investors: financials, the annual report, cap table, investor updates, fundraising and compliance.' WHERE code = 'company_startup';
UPDATE core.plans SET price_monthly_usd = 99.99, price_annual_usd = 1199.88 WHERE code = 'company_medium';
UPDATE core.plans SET price_monthly_usd = 499.99, price_annual_usd = 5999.88, seat_limit = 25, storage_gb = 100, ai_runs_month = 1500, sort = 24,
  description = 'For groups: everything in Medium with subsidiaries, the consolidated group and group forecast, more seats, storage and AI, and priority support.' WHERE code = 'company_scale';
UPDATE core.plans SET price_monthly_ngn = round(price_monthly_usd * (SELECT r FROM ngn_rate), -3), price_annual_ngn = round(price_monthly_usd * (SELECT r FROM ngn_rate), -3) * 12
  WHERE code IN ('company_startup', 'company_medium', 'company_scale');
UPDATE core.plans SET public = false WHERE code = 'company_free';

INSERT INTO platform.settings (key, value) VALUES ('access', jsonb_build_object('mode', 'invite_only', 'weekly_cap', 25, 'services_month_cap', 20, 'demo_url', ''))
  ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform.access_requests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  email           text        NOT NULL CHECK (position('@' IN email) > 1 AND length(email) <= 254),
  company         text        NOT NULL CHECK (length(company) BETWEEN 1 AND 200),
  website         text        CHECK (length(website) <= 300),
  country         text        NOT NULL CHECK (length(country) <= 100),
  stage           text        NOT NULL CHECK (stage IN ('idea', 'pre_seed', 'seed', 'series_a', 'established')),
  team_size       text        NOT NULL CHECK (team_size IN ('1', '2-5', '6-20', '21-50', '51+')),
  needs           text[]      NOT NULL DEFAULT '{}',
  needs_note      text        CHECK (length(needs_note) <= 1000),
  source          text        CHECK (length(source) <= 60),
  community       text        CHECK (length(community) <= 120),
  want_demo       boolean     NOT NULL DEFAULT false,
  flags           text[]      NOT NULL DEFAULT '{}',
  status          text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'demo')),
  notes           text        CHECK (length(notes) <= 5000),
  invite_hash     text,
  invite_expires  timestamptz,
  invited_at      timestamptz,
  decided_by      uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  signed_up_org   uuid        REFERENCES core.organizations(id) ON DELETE SET NULL,
  signed_up_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS access_requests_email ON platform.access_requests (lower(email)) WHERE status IN ('pending', 'demo', 'approved');
CREATE INDEX IF NOT EXISTS access_requests_status ON platform.access_requests (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS access_requests_invite ON platform.access_requests (invite_hash) WHERE invite_hash IS NOT NULL;
ALTER TABLE platform.access_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_only ON platform.access_requests;
CREATE POLICY platform_only ON platform.access_requests USING (core.is_bypass()) WITH CHECK (core.is_bypass());
GRANT SELECT, INSERT, UPDATE ON platform.access_requests TO aidi_os_app;
COMMIT;
