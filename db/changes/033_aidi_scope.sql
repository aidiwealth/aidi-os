-- 033_aidi_scope.sql — Aidi OS keeps its own tools; founder features stay in Finvry company plans only.
BEGIN;
UPDATE core.plans SET modules = array_remove(array_remove(array_remove(array_remove(array_remove(modules, 'wallet'), 'investor_page'), 'updates'), 'fundraising'), 'company_services') WHERE code = 'internal';
COMMIT;
