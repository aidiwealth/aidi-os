// Investments & AUM: every holding with totals — family NAV (assets in NAV less liabilities), reported AUM, client assets.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'family')
  const rows = (await db().query<{ id: string; entity_id: string | null; entity: string | null; client_name: string | null; section: string; category: string; name: string; platform: string | null; currency: string; cost: string | null; current_value: string | null; realized: string | null; ownership_pct: string | null; status: string; as_of: string | null; notes: string | null; meta: Record<string, unknown>; in_nav: boolean; in_aum: boolean }>(
    "SELECT h.id, h.entity_id, e.name AS entity, h.client_name, h.section, h.category, h.name, h.platform, h.currency, h.cost::text, h.current_value::text, h.realized::text, h.ownership_pct::text, h.status, to_char(h.as_of, 'YYYY-MM-DD') AS as_of, h.notes, h.meta, h.in_nav, h.in_aum FROM wealth.holdings h LEFT JOIN core.entities e ON e.id = h.entity_id ORDER BY h.section, h.category, coalesce(h.current_value, 0) DESC")).rows
  const n = (v: string | null) => Number(v ?? 0)
  const assets = rows.filter((r) => r.in_nav && r.category !== 'liability').reduce((a, r) => a + n(r.current_value), 0)
  const liabilities = rows.filter((r) => r.category === 'liability' && r.in_nav).reduce((a, r) => a + n(r.current_value), 0)
  const mgmtAssets = rows.filter((r) => r.in_nav && r.category !== 'liability').reduce((a, r) => a + Number((r.meta?.mgmt_value as number | undefined) ?? n(r.current_value)), 0)
  const venture = rows.filter((r) => r.section === 'venture')
  const byCat: Record<string, number> = {}
  for (const r of rows) if (r.in_nav && r.category !== 'liability') byCat[r.category] = (byCat[r.category] ?? 0) + n(r.current_value)
  return { rows, totals: { assets, liabilities, nav: assets - liabilities, mgmtNav: mgmtAssets - liabilities,
    wealthAum: rows.filter((r) => (r.section === 'wealth' || r.section === 'client') && r.in_aum).reduce((a, r) => a + n(r.current_value), 0),
    clientAssets: rows.filter((r) => r.section === 'client').reduce((a, r) => a + n(r.current_value), 0),
    ventureCost: venture.reduce((a, r) => a + n(r.cost), 0), ventureValue: venture.reduce((a, r) => a + n(r.current_value), 0), ventureRealized: venture.reduce((a, r) => a + n(r.realized), 0),
    realEstate: rows.filter((r) => r.section === 'real_estate').reduce((a, r) => a + n(r.current_value), 0), flags: rows.filter((r) => /FLAG:/.test(r.notes ?? '')).length }, byCat }
})
