-- Which data room cap table documents (SAFEs, notes, share purchase agreements, certificates) are filed in, and
-- under which category: a fixed one (e.g. 'Financing'), or one per funding round when left empty.
ALTER TABLE fundraise.rooms ADD COLUMN IF NOT EXISTS financing boolean NOT NULL DEFAULT false;
ALTER TABLE fundraise.rooms ADD COLUMN IF NOT EXISTS financing_folder text CHECK (financing_folder IS NULL OR length(financing_folder) BETWEEN 1 AND 60);
-- Rooms already receiving them keep doing so.
UPDATE fundraise.rooms r SET financing = true WHERE lower(r.name) = 'financing' AND NOT EXISTS (SELECT 1 FROM fundraise.rooms x WHERE x.organization_id = r.organization_id AND x.financing);
