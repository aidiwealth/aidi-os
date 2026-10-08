-- 075_service_cost_fee.sql — service prices as provider/government cost + Finvry processing fee; public flag.
BEGIN;
ALTER TABLE services.catalog ADD COLUMN IF NOT EXISTS cost numeric(12,2), ADD COLUMN IF NOT EXISTS fee numeric(12,2), ADD COLUMN IF NOT EXISTS cost_ngn numeric(14,2), ADD COLUMN IF NOT EXISTS fee_ngn numeric(14,2),
  ADD COLUMN IF NOT EXISTS cost_label text, ADD COLUMN IF NOT EXISTS public boolean NOT NULL DEFAULT true;
COMMIT;
