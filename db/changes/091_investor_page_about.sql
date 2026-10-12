-- 091_investor_page_about.sql — the investor page "About" holds a full page of content (tables included), up to 60,000 characters.
BEGIN;
DO $$ DECLARE c text; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'financials.public_pages'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%length(about)%' LOOP
    EXECUTE 'ALTER TABLE financials.public_pages DROP CONSTRAINT ' || quote_ident(c);
  END LOOP;
END $$;
ALTER TABLE financials.public_pages ADD CONSTRAINT public_pages_about_len CHECK (length(about) <= 60000);
COMMIT;
