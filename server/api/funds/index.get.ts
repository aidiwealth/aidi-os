// Funds: every fund or SPV entity, with its terms (once set up) and headline figures.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const ents = await db().query<{ id: string; name: string; fund_id: string | null }>(
    "SELECT e.id, e.name, f.id AS fund_id FROM core.entities e LEFT JOIN funds.funds f ON f.entity_id = e.id WHERE e.kind IN ('fund','spv') ORDER BY e.name")
  const out = []
  for (const e of ents.rows) {
    if (!e.fund_id) { out.push({ entity_id: e.id, name: e.name, fund_id: null }); continue }
    const p = (await fundPosition(e.fund_id))!
    const st = (await db().query<{ structure: string }>('SELECT structure FROM funds.funds WHERE id = $1', [e.fund_id])).rows[0]
    const rolling = st?.structure === 'rolling'
    // Deal-by-deal funds: what went into each company and what it is worth now, instead of calls against commitments.
    let deals = null as null | { companies: number; invested: number; value: number; realized: number; coInvestors: number }
    if (rolling) {
      const d = await rollingDeals(e.id)
      deals = { companies: d.length, invested: d.reduce((s, x) => s + x.cost, 0), value: d.reduce((s, x) => s + x.value, 0), realized: d.reduce((s, x) => s + x.realized, 0),
        coInvestors: new Set(d.flatMap((x) => x.co.map((c) => (c.email ?? c.name).toLowerCase()))).size }
    }
    out.push({ entity_id: e.id, name: e.name, fund_id: e.fund_id, currency: p.fund.currency, status: p.fund.status, vintage: p.fund.vintage, target: Number(p.fund.target_size ?? 0), totals: p.totals, m: p.m, lps: p.lps.length, rolling, deals, administrator: adminName(p.fund) })
  }
  return out
})
