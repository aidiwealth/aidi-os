-- Linked workbooks read with AI: the map (which tab, row and column holds which figure) is kept on the link and every
-- sync reads the cells with it. 'rows' links keep the old one-tab, months-across mapping.
ALTER TABLE financials.sheet_links ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'rows' CHECK (mode IN ('rows', 'ai')),
  ADD COLUMN IF NOT EXISTS ai_map jsonb;
