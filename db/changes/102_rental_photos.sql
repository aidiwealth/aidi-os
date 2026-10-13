-- 102_rental_photos.sql — months covered by each import; listing photos for each room/unit (the same ones aidihaven.com shows, from its R2 bucket):
-- a main photo and two side photos; each property takes its first unit's main photo.
BEGIN;
-- An expense can be shared across all properties (no property): e.g. rent, software, bank fees from the bank.
ALTER TABLE rentals.expenses ALTER COLUMN property_id DROP NOT NULL;
-- An Airbnb CSV can cover many months (e.g. all of 2025): each import records the months it holds.
ALTER TABLE rentals.imports ADD COLUMN IF NOT EXISTS months text[] NOT NULL DEFAULT '{}';
UPDATE rentals.imports i SET months = ARRAY(SELECT DISTINCT to_char(t.txn_date, 'YYYY-MM') FROM rentals.transactions t WHERE t.import_id = i.id ORDER BY 1) WHERE months = '{}' AND status = 'saved';
ALTER TABLE rentals.units ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}';
DO $p$
DECLARE cdn text := 'https://pub-f138f42d66b748108ebf7432c7314665.r2.dev/'; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('1418768143163222496', ARRAY['873bf710-2bdb-47e9-97a8-0e7cc4b142b9', 'f8936385-f0c1-4359-92b9-01681008e39c', '91ab4dc4-c513-4c14-a31b-30b00b8458a9']),
    ('1420822398386139572', ARRAY['94a99706-bdcf-48a2-94b9-0d5590b1b55c', '3e00df88-3cc2-4d66-8d79-1b598835779a', '5aec3027-7c95-4f54-b307-d4a8aad0959d']),
    ('1435197325380944725', ARRAY['21d22495-9c19-4cfa-aa18-327be40c558f', 'ff80b87e-4dfd-47ae-8879-aabd7b086456', '19b3cd79-3627-4f61-b962-cfee600f88de']),
    ('1424119770106341445', ARRAY['9c9f6d96-d7a9-4d44-b200-f343806401f9', '044f95c0-ebd0-47b5-bc9f-5591fed2e0f8', '04fe3407-8d40-405b-9393-df3bbab200d4'])) AS v(lid, ids)
  LOOP
    UPDATE rentals.units SET images = ARRAY(SELECT cdn || i || '.avif?im_w=720' FROM unnest(r.ids) i), image_url = cdn || r.ids[1] || '.avif?im_w=720' WHERE airbnb_listing_id = r.lid;
  END LOOP;
  UPDATE rentals.properties p SET image_url = (SELECT u.image_url FROM rentals.units u WHERE u.property_id = p.id AND u.image_url IS NOT NULL ORDER BY u.sort LIMIT 1) WHERE p.image_url IS NULL;
END $p$;
-- Aidi Haven leases both properties (rental arbitrage): rent paid to the landlords is a cost, not a mortgage.
UPDATE rentals.properties SET ownership = 'leased' WHERE ownership = 'owned';
ALTER TABLE rentals.properties ALTER COLUMN ownership SET DEFAULT 'leased';
COMMIT;
