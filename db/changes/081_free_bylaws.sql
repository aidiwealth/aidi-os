-- 081_free_bylaws.sql — the operating agreement / bylaws is free when ordered with a new company. Only set where no price
-- was ever entered, and kept off the public price list so finvry.com is unchanged. No other price is touched.
UPDATE services.catalog SET price = 0, public = false WHERE code = 'operating_agreement' AND price IS NULL;
