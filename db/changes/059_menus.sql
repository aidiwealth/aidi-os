-- 059_menus.sql — Decks and Boards as menu items; investor page for the Aidi team; a chosen deck on the investor page.
BEGIN;
UPDATE core.plans SET modules = array_append(modules, 'boards') WHERE 'financials' = ANY(modules) AND NOT ('boards' = ANY(modules));
UPDATE core.plans SET modules = array_append(modules, 'decks') WHERE ('documents' = ANY(modules) OR 'investor_page' = ANY(modules)) AND NOT ('decks' = ANY(modules));
UPDATE core.plans SET modules = array_append(modules, 'investor_page') WHERE code = 'internal' AND NOT ('investor_page' = ANY(modules));
ALTER TABLE financials.public_pages ADD COLUMN IF NOT EXISTS deck_id uuid REFERENCES fundraise.decks(id) ON DELETE SET NULL;
COMMIT;
