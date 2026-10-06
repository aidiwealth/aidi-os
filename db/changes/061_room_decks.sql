-- 061_room_decks.sql — decks in the data room; a data room link on the investor page.
BEGIN;
ALTER TABLE fundraise.files ADD COLUMN IF NOT EXISTS deck_id uuid REFERENCES fundraise.decks(id) ON DELETE SET NULL;
ALTER TABLE financials.public_pages ADD COLUMN IF NOT EXISTS room_link_id uuid REFERENCES fundraise.links(id) ON DELETE SET NULL;
COMMIT;
