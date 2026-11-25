-- Deals added by hand to the pipeline can be screened by AI too. Screening works on pitches, so screening such a deal
-- creates a pitch from it (source 'pipeline'), which shows on the Pitches page. These have no founder email or, at
-- times, no round yet.
BEGIN;
ALTER TABLE deals.pitches ALTER COLUMN email DROP NOT NULL, ALTER COLUMN stage DROP NOT NULL;
ALTER TABLE deals.pitches DROP CONSTRAINT IF EXISTS pitches_email_needed;
ALTER TABLE deals.pitches ADD CONSTRAINT pitches_email_needed CHECK (email IS NOT NULL OR source = 'pipeline');
COMMIT;
