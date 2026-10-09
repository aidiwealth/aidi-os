-- 077_deck_notes.sql — a short note per deck (what it is for), so several decks are easy to tell apart.
ALTER TABLE fundraise.decks ADD COLUMN IF NOT EXISTS description text;
