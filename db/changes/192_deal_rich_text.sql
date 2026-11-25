-- A pipeline deal's About and Traction are written in the editor (formatting, links, video links), so they get more room.
BEGIN;
DO $c$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'deals.deals'::regclass AND contype = 'c'
            AND (pg_get_constraintdef(oid) ~ 'length\(description\)' OR pg_get_constraintdef(oid) ~ 'length\(traction\)') LOOP
    EXECUTE format('ALTER TABLE deals.deals DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $c$;
ALTER TABLE deals.deals
  ADD CONSTRAINT deals_description_len CHECK (length(description) <= 10000),
  ADD CONSTRAINT deals_traction_len CHECK (length(traction) <= 5000);
COMMIT;
