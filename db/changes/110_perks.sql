-- Finvry perks: partner offers for Finvry companies (credits, discounts, free months), managed by Finvry staff in the
-- console. Public ones show on app.finvry.com/rewards; signed-in companies see the details and claim them in the app.
BEGIN;
CREATE TABLE IF NOT EXISTS core.perks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner text NOT NULL CHECK (length(partner) BETWEEN 1 AND 120),
  logo_url text CHECK (length(logo_url) <= 1000),
  website text CHECK (length(website) <= 500),
  category text NOT NULL DEFAULT 'other' CHECK (category ~ '^[a-z_]{2,30}$'),
  headline text NOT NULL CHECK (length(headline) BETWEEN 1 AND 120),
  summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 400),
  details text CHECK (length(details) <= 6000),
  redeem text CHECK (length(redeem) <= 4000),
  code text CHECK (length(code) <= 80),
  claim_url text CHECK (length(claim_url) <= 1000),
  value_usd numeric(12,2) CHECK (value_usd >= 0),
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'paid')),
  public boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  expires_on date,
  sort int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON core.perks TO aidi_os_app;
CREATE TABLE IF NOT EXISTS core.perk_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perk_id uuid NOT NULL REFERENCES core.perks(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES core.users(id) ON DELETE SET NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (perk_id, organization_id));
ALTER TABLE core.perk_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.perk_claims;
CREATE POLICY tenant_isolation ON core.perk_claims USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON core.perk_claims TO aidi_os_app;
COMMIT;
