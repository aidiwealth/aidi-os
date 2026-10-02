-- 005_modules_entities.sql — switchable modules; deals tagged to a vehicle; portfolio companies tagged to their holder.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/005_modules_entities.sql
BEGIN;

CREATE TABLE IF NOT EXISTS core.modules (
  code        text        PRIMARY KEY,
  enabled     boolean     NOT NULL DEFAULT true,
  updated_by  uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO core.modules (code) VALUES ('pitches'), ('pipeline'), ('portfolio'), ('analytics'), ('entities'), ('documents')
ON CONFLICT (code) DO NOTHING;

-- Which vehicle a deal is for (Fund I, the Angel Fund, an SPV or the balance sheet). Defaults to Fund I.
ALTER TABLE deals.deals ADD COLUMN IF NOT EXISTS vehicle_entity_id uuid REFERENCES core.entities(id) ON DELETE RESTRICT;
UPDATE deals.deals SET vehicle_entity_id = (SELECT id FROM core.entities WHERE name = 'Aidi Ventures Fund I') WHERE vehicle_entity_id IS NULL;

-- Who holds a portfolio company, and how: an investment, a subsidiary the group owns, an affiliate (strategic stake) or managed.
ALTER TABLE portfolio.companies ADD COLUMN IF NOT EXISTS holding_entity_id uuid REFERENCES core.entities(id) ON DELETE RESTRICT;
ALTER TABLE portfolio.companies ADD COLUMN IF NOT EXISTS relationship text NOT NULL DEFAULT 'investment';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_relationship_check') THEN
    ALTER TABLE portfolio.companies ADD CONSTRAINT companies_relationship_check CHECK (relationship IN ('investment','subsidiary','affiliate','managed'));
  END IF;
END $$;
UPDATE portfolio.companies c SET holding_entity_id = coalesce(
  (SELECT d.vehicle_entity_id FROM deals.deals d WHERE d.id = c.deal_id),
  (SELECT id FROM core.entities WHERE name = 'Aidi Ventures Fund I')) WHERE holding_entity_id IS NULL;

CREATE INDEX IF NOT EXISTS deals_vehicle_idx ON deals.deals (vehicle_entity_id);
CREATE INDEX IF NOT EXISTS companies_holder_idx ON portfolio.companies (holding_entity_id);
CREATE INDEX IF NOT EXISTS documents_entity_idx ON core.documents (entity_id);

GRANT SELECT, INSERT, UPDATE ON core.modules TO aidi_os_app;
GRANT INSERT, UPDATE ON core.entities TO aidi_os_app;
COMMIT;
