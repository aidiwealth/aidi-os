-- 046_entity_ids.sql — registration details on entities.
BEGIN;
ALTER TABLE core.entities ADD COLUMN IF NOT EXISTS tax_id text CHECK (length(tax_id) <= 40);
ALTER TABLE core.entities ADD COLUMN IF NOT EXISTS registration_number text CHECK (length(registration_number) <= 60);
ALTER TABLE core.entities ADD COLUMN IF NOT EXISTS formation_date date;
ALTER TABLE core.entities ADD COLUMN IF NOT EXISTS address text CHECK (length(address) <= 500);
COMMIT;
