-- 034_crm.sql — contacts, lists, custom fields, activity, notes; pipelines, stages and deals. Existing investors and
-- rounds are copied in. Contacts stay in step with the investor-updates recipient list.
BEGIN;
CREATE SCHEMA IF NOT EXISTS crm;
GRANT USAGE ON SCHEMA crm TO aidi_os_app;
CREATE TABLE IF NOT EXISTS crm.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200), email text NOT NULL CHECK (position('@' IN email) > 1), firm text, title text, phone text,
  custom jsonb NOT NULL DEFAULT '{}'::jsonb, subscribed boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, email));
CREATE TABLE IF NOT EXISTS crm.lists (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, name));
CREATE TABLE IF NOT EXISTS crm.list_members (organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  list_id uuid NOT NULL REFERENCES crm.lists(id) ON DELETE CASCADE, contact_id uuid NOT NULL REFERENCES crm.contacts(id) ON DELETE CASCADE, PRIMARY KEY (list_id, contact_id));
CREATE TABLE IF NOT EXISTS crm.fields (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,40}$'), label text NOT NULL CHECK (length(label) BETWEEN 1 AND 60), type text NOT NULL DEFAULT 'text' CHECK (type IN ('text','number','date','select','url')),
  options text[] NOT NULL DEFAULT '{}', sort integer NOT NULL DEFAULT 0, UNIQUE (organization_id, key));
CREATE TABLE IF NOT EXISTS crm.activity (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES crm.contacts(id) ON DELETE CASCADE, kind text NOT NULL CHECK (kind IN ('update_opened','update_sent','file_viewed','deck_viewed','note')),
  label text NOT NULL, ref_id uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS crm_activity_contact ON crm.activity (contact_id, created_at DESC);
CREATE TABLE IF NOT EXISTS crm.notes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES crm.contacts(id) ON DELETE CASCADE, body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000), created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS crm.pipelines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120), currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','NGN')), target numeric(16,2), instrument text NOT NULL DEFAULT 'safe' CHECK (instrument IN ('safe','priced','convertible_note')),
  valuation_cap numeric(16,2), discount numeric(5,2), pre_money numeric(16,2), status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')), target_close date, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS crm.stages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES crm.pipelines(id) ON DELETE CASCADE, name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60), color text NOT NULL DEFAULT 'blue', kind text NOT NULL DEFAULT 'open' CHECK (kind IN ('open','committed','won','lost')), sort integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS crm.deals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES crm.pipelines(id) ON DELETE CASCADE, stage_id uuid NOT NULL REFERENCES crm.stages(id), investor text NOT NULL CHECK (length(investor) BETWEEN 1 AND 200),
  contact_id uuid REFERENCES crm.contacts(id) ON DELETE SET NULL, amount numeric(16,2), notes text CHECK (length(notes) <= 3000), updated_at timestamptz NOT NULL DEFAULT now());
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm.contacts','crm.lists','crm.list_members','crm.fields','crm.activity','crm.notes','crm.pipelines','crm.stages','crm.deals'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP;
END $rls$;
-- contacts feed the investor-updates recipient list
CREATE OR REPLACE FUNCTION crm.sync_investor() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $f$
BEGIN
  INSERT INTO financials.investors (organization_id, name, email, firm) VALUES (NEW.organization_id, NEW.name, NEW.email, NEW.firm)
  ON CONFLICT (organization_id, email) DO UPDATE SET name = EXCLUDED.name, firm = EXCLUDED.firm;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS contacts_sync_investor ON crm.contacts;
CREATE TRIGGER contacts_sync_investor AFTER INSERT OR UPDATE OF name, email, firm ON crm.contacts FOR EACH ROW EXECUTE FUNCTION crm.sync_investor();
-- copy existing investors and rounds
INSERT INTO crm.contacts (organization_id, name, email, firm) SELECT organization_id, name, lower(email), firm FROM financials.investors ON CONFLICT DO NOTHING;
INSERT INTO crm.lists (organization_id, name) SELECT DISTINCT organization_id, 'Investors' FROM financials.investors ON CONFLICT DO NOTHING;
INSERT INTO crm.list_members (organization_id, list_id, contact_id) SELECT c.organization_id, l.id, c.id FROM crm.contacts c JOIN crm.lists l ON l.organization_id = c.organization_id AND l.name = 'Investors' ON CONFLICT DO NOTHING;
INSERT INTO crm.pipelines (id, organization_id, name, currency, target, instrument, valuation_cap, discount, pre_money, status, target_close, created_at)
  SELECT id, organization_id, name, currency, target, instrument, valuation_cap, discount, pre_money, status, target_close, created_at FROM fundraise.rounds ON CONFLICT DO NOTHING;
INSERT INTO crm.stages (organization_id, pipeline_id, name, color, kind, sort)
  SELECT p.organization_id, p.id, s.name, s.color, s.kind, s.sort FROM crm.pipelines p CROSS JOIN (VALUES ('Contacted','grey','open',1),('Meeting','blue','open',2),('Diligence','purple','open',3),('Committed','amber','committed',4),('Signed','teal','committed',5),('Wired','green','won',6),('Passed','red','lost',7)) AS s(name, color, kind, sort)
  WHERE NOT EXISTS (SELECT 1 FROM crm.stages x WHERE x.pipeline_id = p.id);
INSERT INTO crm.contacts (organization_id, name, email, firm) SELECT organization_id, name, lower(email), firm FROM fundraise.round_investors WHERE email IS NOT NULL AND position('@' IN email) > 1 ON CONFLICT DO NOTHING;
INSERT INTO crm.deals (organization_id, pipeline_id, stage_id, investor, contact_id, amount, notes, updated_at)
  SELECT r.organization_id, r.round_id, s.id, coalesce(nullif(r.firm, ''), r.name), c.id, r.amount, r.notes, r.updated_at
  FROM fundraise.round_investors r JOIN crm.stages s ON s.pipeline_id = r.round_id AND lower(s.name) = CASE r.stage WHEN 'contacted' THEN 'contacted' WHEN 'meeting' THEN 'meeting' WHEN 'diligence' THEN 'diligence' WHEN 'committed' THEN 'committed' WHEN 'signed' THEN 'signed' WHEN 'wired' THEN 'wired' ELSE 'passed' END
  LEFT JOIN crm.contacts c ON c.organization_id = r.organization_id AND c.email = lower(r.email)
  WHERE NOT EXISTS (SELECT 1 FROM crm.deals d WHERE d.pipeline_id = r.round_id);
UPDATE core.plans SET modules = array_append(modules, 'contacts') WHERE code IN ('company_startup','company_scale') AND NOT ('contacts' = ANY(modules));
COMMIT;
