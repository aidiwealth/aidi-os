-- 052_creditchek.sql — CreditChek position counts only what was invested through Aidi ($40,000).
BEGIN;
UPDATE wealth.holdings SET cost = 40000, current_value = round(40000 * coalesce((meta->>'last_valuation')::numeric, 5000000) / 1300000, 2),
  meta = meta || jsonb_build_object('aidi_share_pct', 22.5, 'excluded_direct', jsonb_build_object('name', 'Adamantium Fund', 'amount', 25000)), updated_at = now()
  WHERE section = 'venture' AND name = 'CreditChek' AND cost = 65000;
UPDATE wealth.holdings n SET meta = n.meta || jsonb_build_object('mgmt_value', s.mgmt), current_value = round(s.mgmt * 0.7, 2), as_of = current_date, updated_at = now()
  FROM (SELECT organization_id, round(sum(coalesce((meta->>'aidi_share_pct')::numeric, 0) / 100 * coalesce(current_value, 0)), 2) AS mgmt FROM wealth.holdings WHERE section = 'venture' AND status IN ('active', 'at_cost') GROUP BY organization_id) s
  WHERE n.organization_id = s.organization_id AND n.name = 'Aidi Angel Fund portfolio: Aidi (firm) share, unrealized';
COMMIT;
