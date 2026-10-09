-- 076_books_module.sql — Books is its own Financials page.
BEGIN;
UPDATE core.plans SET modules = array_append(modules, 'books') WHERE code = 'internal' AND NOT ('books' = ANY(modules));
COMMIT;
