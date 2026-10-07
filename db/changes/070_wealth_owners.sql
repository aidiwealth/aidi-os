-- 070_wealth_owners.sql — Investments & AUM holdings tied to Wealth management clients.
BEGIN;
INSERT INTO wm.clients (organization_id, name, kind, country, model, entity_id, status, tag)
SELECT o.id, 'Aidi Family', 'family', 'US', 'managed', (SELECT e.id FROM core.entities e WHERE e.organization_id = o.id AND regexp_replace(lower(e.name), '[^a-z0-9]', '', 'g') = 'aidiwealthllc' LIMIT 1), 'active', 'Aidi Family'
FROM core.organizations o WHERE o.plan_code = 'internal' AND NOT EXISTS (SELECT 1 FROM wm.clients c WHERE c.organization_id = o.id AND c.name = 'Aidi Family') ORDER BY o.created_at LIMIT 1;
-- Modtho owns the three 1 oz PAMP bars held at APMEX; the older summary line "Gold" was the same bars.
UPDATE wealth.holdings h SET wm_client_id = c.id, client_name = c.name, section = 'client', entity_id = c.entity_id, in_nav = false, in_aum = true, updated_at = now()
  FROM wm.clients c WHERE c.organization_id = h.organization_id AND c.name ILIKE 'Modtho%' AND h.name = '1 oz Gold Bar - PAMP (In Assay)' AND h.status NOT IN ('sold','written_off');
UPDATE wealth.holdings SET status = 'sold', notes = left(coalesce(notes || ' · ', '') || 'Merged into the APMEX holding "1 oz Gold Bar - PAMP (In Assay)" (same 3 bars).', 3000), updated_at = now()
  WHERE section = 'client' AND category = 'precious_metals' AND name = 'Gold' AND client_name ILIKE 'Modtho%' AND status NOT IN ('sold','written_off')
    AND EXISTS (SELECT 1 FROM wealth.holdings x WHERE x.name = '1 oz Gold Bar - PAMP (In Assay)' AND x.client_name ILIKE 'Modtho%');
-- Termii's treasuries are with Charles Schwab.
UPDATE wealth.holdings SET platform = 'Charles Schwab', updated_at = now() WHERE section = 'client' AND client_name = 'Termii Inc' AND name = 'Treasuries & bills' AND platform IS NULL;
-- The older "Gold (oz)" / "Silver (oz)" summary lines are the same coins as the APMEX Gold and Silver Eagles.
UPDATE wealth.holdings SET status = 'sold', notes = left(coalesce(notes || ' · ', '') || 'Replaced by the itemised APMEX coins.', 3000), updated_at = now()
  WHERE section = 'wealth' AND platform = 'Physical' AND name IN ('Gold (oz)', 'Silver (oz)') AND status NOT IN ('sold','written_off')
    AND EXISTS (SELECT 1 FROM wealth.holdings x WHERE x.import_key LIKE 'apmex-%' AND x.name LIKE '%Eagle%');
-- Aidi Family owns every other wealth-management holding: the Aidi Wealth (Main Fund) holdings and the APMEX coins.
UPDATE wealth.holdings h SET wm_client_id = c.id, client_name = 'Aidi Family', updated_at = now()
  FROM wm.clients c WHERE c.organization_id = h.organization_id AND c.name = 'Aidi Family' AND h.wm_client_id IS NULL AND h.status NOT IN ('sold','written_off')
    AND (h.section = 'wealth' OR (h.section = 'family' AND h.import_key LIKE 'apmex-%'));
COMMIT;
