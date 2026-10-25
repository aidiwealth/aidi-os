-- 163_long_notes.sql — campaign briefs and deal notes are written in the rich editor (headings, lists, tables), so they
-- may run longer than plain notes.
BEGIN;
ALTER TABLE growth.campaigns DROP CONSTRAINT IF EXISTS campaigns_notes_check;
ALTER TABLE growth.campaigns ADD CONSTRAINT campaigns_notes_check CHECK (length(notes) <= 20000);
ALTER TABLE growth.deals DROP CONSTRAINT IF EXISTS deals_notes_check;
ALTER TABLE growth.deals ADD CONSTRAINT deals_notes_check CHECK (length(notes) <= 20000);
COMMIT;
