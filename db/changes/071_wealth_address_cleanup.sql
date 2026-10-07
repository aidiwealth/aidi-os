-- 071_wealth_address_cleanup.sql — new office address; remove the merged duplicate metal lines.
BEGIN;
UPDATE core.entities SET address = '6472 Camden Ave, Suite 204, San Jose, CA 95120, US' WHERE address ILIKE '%6203 San Ignacio%';
DELETE FROM wealth.holdings WHERE status = 'sold' AND (notes LIKE '%Merged into the APMEX holding%' OR notes LIKE '%Replaced by the itemised APMEX coins.%');
COMMIT;
