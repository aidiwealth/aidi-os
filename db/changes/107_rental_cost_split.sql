-- How shared rental costs are split across rooms/units (mixed model):
--   weight = by a size weight set per unit (rent, insurance, repairs, furniture, landscaping)
--   nights = by nights booked in the period (utilities, cleaning, supplies)
--   equal  = the same share per unit (software, office and bank fees, travel, other)
-- Each category has a default; a single expense can override it, or be charged to one property or unit.
BEGIN;
ALTER TABLE rentals.units ADD COLUMN IF NOT EXISTS cost_weight numeric(8,2) NOT NULL DEFAULT 1 CHECK (cost_weight >= 0);
ALTER TABLE rentals.expense_categories ADD COLUMN IF NOT EXISTS split text NOT NULL DEFAULT 'equal' CHECK (split IN ('weight', 'nights', 'equal'));
ALTER TABLE rentals.expenses ADD COLUMN IF NOT EXISTS split text CHECK (split IN ('weight', 'nights', 'equal'));
UPDATE rentals.expense_categories SET split = 'weight' WHERE code IN ('rent_fees', 'repairs', 'furniture', 'landscaping');
UPDATE rentals.expense_categories SET split = 'nights' WHERE code IN ('utilities', 'cleaning', 'supplies');
COMMIT;
