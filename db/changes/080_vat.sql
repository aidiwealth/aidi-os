-- 080_vat.sql — VAT/sales tax by country, applied the same way to every invoice: service (job) invoices, Finvry
-- workspace invoices and wealth fees. Nigeria starts at 7.5% VAT. Invoices keep the subtotal, tax and country.
BEGIN;
CREATE TABLE IF NOT EXISTS core.tax_rates (
  country     text PRIMARY KEY CHECK (country ~ '^[A-Z]{2}$'),
  label       text NOT NULL DEFAULT 'VAT' CHECK (length(label) BETWEEN 1 AND 30),
  rate        numeric(5,2) NOT NULL CHECK (rate >= 0 AND rate <= 50),
  enabled     boolean NOT NULL DEFAULT true,
  applies_to  text[] NOT NULL DEFAULT '{services,platform,wealth}',
  updated_at  timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON core.tax_rates TO aidi_os_app;
INSERT INTO core.tax_rates (country, label, rate) VALUES ('NG', 'VAT', 7.5) ON CONFLICT (country) DO NOTHING;
ALTER TABLE services.invoices ADD COLUMN IF NOT EXISTS country text, ADD COLUMN IF NOT EXISTS subtotal numeric(14,2), ADD COLUMN IF NOT EXISTS tax_label text, ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2), ADD COLUMN IF NOT EXISTS tax_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE platform.invoices ADD COLUMN IF NOT EXISTS country text, ADD COLUMN IF NOT EXISTS subtotal numeric(14,2), ADD COLUMN IF NOT EXISTS tax_label text, ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2), ADD COLUMN IF NOT EXISTS tax_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE wm.fees ADD COLUMN IF NOT EXISTS country text, ADD COLUMN IF NOT EXISTS subtotal numeric(14,2), ADD COLUMN IF NOT EXISTS tax_label text, ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2), ADD COLUMN IF NOT EXISTS tax_amount numeric(14,2) NOT NULL DEFAULT 0;
UPDATE services.invoices SET country = CASE WHEN region = 'ng' THEN 'NG' ELSE 'US' END WHERE country IS NULL;
UPDATE platform.invoices SET country = CASE WHEN currency = 'NGN' THEN 'NG' ELSE 'US' END WHERE country IS NULL;
-- Existing invoices and fees keep their amounts: they are marked as already taxed (subtotal = amount, no VAT).
UPDATE services.invoices SET subtotal = amount WHERE subtotal IS NULL;
UPDATE platform.invoices SET subtotal = amount WHERE subtotal IS NULL;
UPDATE wm.fees SET subtotal = amount WHERE subtotal IS NULL;
COMMIT;
