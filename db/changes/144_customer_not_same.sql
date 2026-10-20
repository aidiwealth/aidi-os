-- 144_customer_not_same.sql — names the founder said are different customers, not duplicates.
-- A list of name groups per company's customer settings; a suggested duplicate whose names all sit in one of these
-- groups is never suggested again (on uploads and on every read of a linked sheet).
BEGIN;
ALTER TABLE financials.customer_config ADD COLUMN IF NOT EXISTS not_same jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMIT;
