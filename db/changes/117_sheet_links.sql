-- Live-linked spreadsheets (Google Sheets, Excel online, Dropbox): the rows a workspace chooses feed Financials or a
-- forecast, re-read every day and on "Sync now". Statements written this way are marked source 'sheet'.
CREATE TABLE IF NOT EXISTS financials.sheet_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  url text NOT NULL CHECK (length(url) BETWEEN 10 AND 600),
  target text NOT NULL CHECK (target IN ('financials', 'forecast')),
  subject text CHECK (length(subject) <= 80),
  forecast_id uuid REFERENCES financials.forecasts(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  sheet text CHECK (length(sheet) <= 120),
  mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz, last_result jsonb, last_error text,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((target = 'financials' AND subject IS NOT NULL) OR (target = 'forecast' AND forecast_id IS NOT NULL)));
CREATE INDEX IF NOT EXISTS sheet_links_org_idx ON financials.sheet_links (organization_id);
ALTER TABLE financials.sheet_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON financials.sheet_links;
CREATE POLICY tenant_isolation ON financials.sheet_links USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON financials.sheet_links TO aidi_os_app;

ALTER TABLE financials.statements DROP CONSTRAINT IF EXISTS statements_source_check;
ALTER TABLE financials.statements ADD CONSTRAINT statements_source_check CHECK (source IN ('manual', 'upload', 'api', 'sheet'));

-- Fundraising: a closed investor added to a cap table remembers the record it became (no double entries).
ALTER TABLE crm.deals ADD COLUMN IF NOT EXISTS equity_ref uuid, ADD COLUMN IF NOT EXISTS equity_kind text CHECK (equity_kind IN ('convertible', 'issuance')), ADD COLUMN IF NOT EXISTS equity_at timestamptz;

-- Several data rooms per company (e.g. Seed round, Board, Bank). Files and links belong to one room; written
-- documents keep their text so they can be edited (the room shares them as PDFs).
CREATE TABLE IF NOT EXISTS fundraise.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text CHECK (length(description) <= 500),
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE fundraise.rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fundraise.rooms;
CREATE POLICY tenant_isolation ON fundraise.rooms USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON fundraise.rooms TO aidi_os_app;
ALTER TABLE fundraise.files ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES fundraise.rooms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS body text CHECK (length(body) <= 200000), ADD COLUMN IF NOT EXISTS written boolean NOT NULL DEFAULT false;
ALTER TABLE fundraise.links ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES fundraise.rooms(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS files_room_idx ON fundraise.files (room_id);
-- Every company that already has a data room gets it as its first room.
INSERT INTO fundraise.rooms (organization_id, name)
  SELECT DISTINCT x.o, 'Data room' FROM (SELECT organization_id AS o FROM fundraise.files UNION SELECT organization_id FROM fundraise.links) x
  WHERE NOT EXISTS (SELECT 1 FROM fundraise.rooms r WHERE r.organization_id = x.o);
UPDATE fundraise.files f SET room_id = (SELECT r.id FROM fundraise.rooms r WHERE r.organization_id = f.organization_id ORDER BY r.created_at LIMIT 1) WHERE f.room_id IS NULL;
UPDATE fundraise.links l SET room_id = (SELECT r.id FROM fundraise.rooms r WHERE r.organization_id = l.organization_id ORDER BY r.created_at LIMIT 1) WHERE l.room_id IS NULL;
