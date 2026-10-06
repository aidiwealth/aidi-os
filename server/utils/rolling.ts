// Rolling (deal-by-deal) funds: each investment carries its own terms; positions come from Investments & AUM.
export interface RollDeal { id: string; name: string; status: string; cost: number; value: number; realized: number; instrument: string | null; cap: number | null; aidi: number | null; legal: string | null; co: { name: string; email: string; amount: number }[] }
export async function rollingDeals(entityId: string): Promise<RollDeal[]> {
  const exists = (await db().query("SELECT to_regclass('wealth.holdings') IS NOT NULL AS ok")).rows[0] as { ok: boolean }
  if (!exists.ok) return []
  const r = await db().query<{ id: string; name: string; status: string; cost: string | null; current_value: string | null; realized: string | null; meta: Record<string, unknown> }>(
    "SELECT id, name, status, cost::text, current_value::text, realized::text, meta FROM wealth.holdings WHERE entity_id = $1 AND section = 'venture' ORDER BY coalesce(cost, 0) DESC", [entityId])
  return r.rows.map((h) => ({ id: h.id, name: h.name, status: h.status, cost: Number(h.cost ?? 0), value: Number(h.current_value ?? 0), realized: Number(h.realized ?? 0), instrument: (h.meta.instrument as string) ?? null,
    cap: (h.meta.post_money_cap as number) ?? null, aidi: (h.meta.aidi_angel_fund as number) ?? null, legal: (h.meta.legal_name as string) ?? null, co: ((h.meta.co_investors as { name: string; email: string; amount: number }[]) ?? []) }))
}
// One LP's participation across a rolling fund's deals (by email), with an estimate of their share of current value.
export async function lpParticipations(entityId: string, email: string | null) {
  if (!email) return []
  const deals = await rollingDeals(entityId)
  return deals.flatMap((d) => d.co.filter((c) => c.email?.toLowerCase() === email.toLowerCase()).map((c) => ({ company: d.name, legal: d.legal, instrument: d.instrument, cap: d.cap, amount: c.amount, status: d.status,
    value: d.cost > 0 ? Math.round((c.amount / d.cost) * d.value * 100) / 100 : null, realized: d.cost > 0 ? Math.round((c.amount / d.cost) * d.realized * 100) / 100 : null })))
}
