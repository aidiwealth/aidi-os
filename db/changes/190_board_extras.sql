-- Boards: optional sections (the forecast with its full monthly breakdown, the financial statements) and reports
-- attached to a board (PDF or Excel documents, e.g. the management report). The CFO board shows both sections.
BEGIN;
ALTER TABLE financials.boards
  ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS documents uuid[] NOT NULL DEFAULT '{}';
UPDATE financials.boards SET sections = '{"forecast": true, "statements": true}'::jsonb WHERE audience = 'cfo' AND sections = '{}'::jsonb;
COMMIT;
