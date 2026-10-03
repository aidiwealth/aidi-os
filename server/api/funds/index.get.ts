// Funds: every fund or SPV entity, with its terms (once set up) and headline figures.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const ents = await db().query<{ id: string; name: string; fund_id: string | null }>(
    "SELECT e.id, e.name, f.id AS fund_id FROM core.entities e LEFT JOIN funds.funds f ON f.entity_id = e.id WHERE e.kind IN ('fund','spv') ORDER BY e.name")
  const out = []
  for (const e of ents.rows) {
    if (!e.fund_id) { out.push({ entity_id: e.id, name: e.name, fund_id: null }); continue }
    const p = (await fundPosition(e.fund_id))!
    out.push({ entity_id: e.id, name: e.name, fund_id: e.fund_id, currency: p.fund.currency, status: p.fund.status, vintage: p.fund.vintage, target: Number(p.fund.target_size ?? 0), totals: p.totals, m: p.m, lps: p.lps.length })
  }
  return out
})
