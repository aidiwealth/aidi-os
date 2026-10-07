// Wealth management at a glance: clients, assets under advice, fees, statements, signatures, top clients.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const clients = (await db().query<{ id: string; name: string; country: string; model: string; status: string; kyc_status: string }>('SELECT id, name, country, model, status, kyc_status FROM wm.clients ORDER BY name')).rows
  const per = [] as { id: string; name: string; country: string; model: string; net_worth: number; invested: number; cash: number }[]
  for (const c of clients) { const s = await clientSummary(c.id); per.push({ id: c.id, name: c.name, country: c.country, model: c.model, net_worth: s.totals.net_worth, invested: s.totals.invested, cash: s.totals.cash }) }
  const sum = (f: (x: typeof per[number]) => boolean, k: 'net_worth' | 'invested' | 'cash' = 'net_worth') => Math.round(per.filter(f).reduce((a, x) => a + x[k], 0))
  const usdOf = async (v: string, c: string) => Number(v) * (c === 'USD' ? 1 : (await fxRate(c, 'USD')) ?? 0)
  let feesYtd = 0, feesDue = 0; const byKind: Record<string, number> = {}
  for (const f of (await db().query<{ kind: string; amount: string; currency: string; status: string; paid_on: string | null }>("SELECT kind, amount::text, currency, status, to_char(paid_on, 'YYYY-MM-DD') AS paid_on FROM wm.fees WHERE status IN ('paid','due')")).rows) {
    const v = await usdOf(f.amount, f.currency)
    if (f.status === 'paid' && f.paid_on && f.paid_on >= new Date().getUTCFullYear() + '-01-01') { feesYtd += v; byKind[f.kind] = (byKind[f.kind] ?? 0) + v } else if (f.status === 'due') feesDue += v
  }
  const one = async (q: string) => Number((await db().query<{ n: string }>(q).catch(() => ({ rows: [{ n: '0' }] }))).rows[0]?.n ?? 0)
  const history = (await db().query<{ m: string; v: string }>("SELECT to_char(date_trunc('month', as_of), 'YYYY-MM') AS m, sum(net_worth)::text AS v FROM (SELECT DISTINCT ON (client_id, date_trunc('month', as_of)) client_id, as_of, net_worth FROM wm.snapshots ORDER BY client_id, date_trunc('month', as_of), as_of DESC) x GROUP BY 1 ORDER BY 1")).rows.map((r) => ({ m: r.m, v: Math.round(Number(r.v)) }))
  return {
    clients: { total: clients.length, active: clients.filter((c) => c.status === 'active').length, us: clients.filter((c) => c.country === 'US').length, ng: clients.filter((c) => c.country === 'NG').length, kyc_pending: clients.filter((c) => c.kyc_status !== 'verified').length },
    assets: { total: sum(() => true), us: sum((x) => x.country === 'US'), ng: sum((x) => x.country === 'NG'), invested: sum(() => true, 'invested'), cash: sum(() => true, 'cash'),
      by_model: (['managed', 'advisor', 'self_directed'] as const).map((m) => ({ label: m === 'managed' ? 'Managed' : m === 'advisor' ? 'Adviser-connected' : 'Self-directed', value: sum((x) => x.model === m) })).filter((x) => x.value > 0) },
    fees: { ytd: Math.round(feesYtd), due: Math.round(feesDue), by_kind: Object.entries(byKind).map(([label, value]) => ({ label: label[0]!.toUpperCase() + label.slice(1), value: Math.round(value) })) },
    statements_quarter: await one("SELECT count(*) AS n FROM wm.statements WHERE published_at >= date_trunc('quarter', now())"),
    statements_unseen: await one("SELECT count(*) AS n FROM wm.statements s WHERE NOT EXISTS (SELECT 1 FROM wm.statement_events e WHERE e.statement_id = s.id)"),
    awaiting_signature: await one("SELECT count(*) AS n FROM wm.client_docs WHERE status = 'sent'"),
    top: per.sort((a, b) => b.net_worth - a.net_worth).slice(0, 6).map((x) => ({ id: x.id, name: x.name, country: x.country, net_worth: Math.round(x.net_worth) })), history }
})
