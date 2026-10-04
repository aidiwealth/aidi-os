-- 030_fundraising.sql — data room files, tracked links and views; rounds and investors; deal memos; SAFEs.
BEGIN;
CREATE SCHEMA IF NOT EXISTS fundraise;
GRANT USAGE ON SCHEMA fundraise TO aidi_os_app;
CREATE TABLE IF NOT EXISTS fundraise.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES core.documents(id) ON DELETE CASCADE, title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  folder text NOT NULL DEFAULT 'General' CHECK (length(folder) BETWEEN 1 AND 60), is_deck boolean NOT NULL DEFAULT false, sort integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS fundraise.links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200), file_ids uuid[] NOT NULL DEFAULT '{}', token_hash text NOT NULL UNIQUE,
  require_email boolean NOT NULL DEFAULT true, allow_download boolean NOT NULL DEFAULT false, expires_at timestamptz, revoked boolean NOT NULL DEFAULT false,
  views integer NOT NULL DEFAULT 0, last_viewed_at timestamptz, created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS fundraise.views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES fundraise.links(id) ON DELETE CASCADE, file_id uuid REFERENCES fundraise.files(id) ON DELETE CASCADE,
  viewer_email text, seconds integer NOT NULL DEFAULT 0, started_at timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS fundraise.rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120), instrument text NOT NULL DEFAULT 'safe' CHECK (instrument IN ('safe','priced','convertible_note')),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','NGN')), target numeric(16,2), valuation_cap numeric(16,2), discount numeric(5,2), pre_money numeric(16,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')), target_close date, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS fundraise.round_investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES fundraise.rounds(id) ON DELETE CASCADE, name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200), firm text, email text,
  stage text NOT NULL DEFAULT 'contacted' CHECK (stage IN ('contacted','meeting','diligence','committed','signed','wired','passed')),
  amount numeric(16,2), notes text CHECK (length(notes) <= 2000), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS fundraise.memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200), notes jsonb NOT NULL DEFAULT '{}'::jsonb, body text CHECK (length(body) <= 40000), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS fundraise.safes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  round_id uuid REFERENCES fundraise.rounds(id) ON DELETE SET NULL, company_name text NOT NULL, company_state text NOT NULL, investor_name text NOT NULL, investor_email text,
  amount numeric(16,2) NOT NULL CHECK (amount > 0), currency text NOT NULL DEFAULT 'USD', valuation_cap numeric(16,2), discount numeric(5,2), mfn boolean NOT NULL DEFAULT false, pro_rata boolean NOT NULL DEFAULT false,
  signatory_name text NOT NULL, signatory_title text NOT NULL, safe_date date NOT NULL DEFAULT current_date, created_at timestamptz NOT NULL DEFAULT now());
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fundraise.files','fundraise.links','fundraise.views','fundraise.rounds','fundraise.round_investors','fundraise.memos','fundraise.safes'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP;
END $rls$;
UPDATE core.plans SET modules = array_append(modules, 'fundraising') WHERE code IN ('company_startup','company_scale','internal') AND NOT ('fundraising' = ANY(modules));
COMMIT;
