-- 058_page_board.sql — the investor page can show a financial board.
BEGIN;
ALTER TABLE financials.public_pages ADD COLUMN IF NOT EXISTS board_id uuid REFERENCES financials.boards(id) ON DELETE SET NULL;
COMMIT;
