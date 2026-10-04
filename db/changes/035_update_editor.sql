-- 035_update_editor.sql — block content, cover, sender, recipients, pin, templates and send summary for updates.
BEGIN;
ALTER TABLE financials.updates ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE financials.updates ADD COLUMN IF NOT EXISTS cover_id uuid REFERENCES core.documents(id) ON DELETE SET NULL;
ALTER TABLE financials.updates ADD COLUMN IF NOT EXISTS from_name text CHECK (length(from_name) <= 120);
ALTER TABLE financials.updates ADD COLUMN IF NOT EXISTS recipients jsonb NOT NULL DEFAULT '{"lists":[],"stages":[],"contacts":[],"emails":[]}'::jsonb;
ALTER TABLE financials.updates ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE financials.updates ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;
ALTER TABLE financials.updates ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE financials.updates ADD COLUMN IF NOT EXISTS sent_count integer NOT NULL DEFAULT 0;
ALTER TABLE financials.updates ADD COLUMN IF NOT EXISTS sent_to text[] NOT NULL DEFAULT '{}';
UPDATE financials.updates SET blocks = jsonb_build_array(jsonb_build_object('type', 'text', 'md', body)) WHERE body IS NOT NULL AND body <> '' AND blocks = '[]'::jsonb;
UPDATE financials.updates u SET sent_count = (SELECT count(*) FROM financials.update_sends s WHERE s.update_id = u.id), sent_at = (SELECT min(sent_at) FROM financials.update_sends s WHERE s.update_id = u.id) WHERE sent_count = 0;
COMMIT;
