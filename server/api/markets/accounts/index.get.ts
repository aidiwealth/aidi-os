// Brokerage accounts with live values: cash, positions, today's move, the mix against the account's target, and what
// is waiting (proposals, tickets, fills to confirm). Investments & AUM lines are revalued at most once a minute here.
let lastRevalue = 0
export default defineEventHandler(async (event) => {
  await requireMarkets(event)
  const accts = await marketAccounts()
  if (Date.now() - lastRevalue > 60e3) { lastRevalue = Date.now(); await revalueMarketHoldings().catch((e) => console.error('[markets] revalue', (e as Error).message)) }
  const live = await livePositions(accts.map((a) => a.id))
  const waiting = (await db().query<{ account_id: string; status: string; n: number }>("SELECT account_id, status, count(*)::int AS n FROM markets.proposals WHERE status IN ('waiting', 'ticket') AND expires_at > now() - interval '7 days' GROUP BY 1, 2")).rows
  const fills = (await db().query<{ account_id: string; n: number }>("SELECT account_id, count(*)::int AS n FROM markets.fills WHERE status = 'pending' GROUP BY 1")).rows
  const entities = (await db().query<{ id: string; name: string }>("SELECT id, name FROM core.entities ORDER BY name")).rows
  const clients = (await db().query<{ id: string; name: string }>("SELECT id, name FROM wm.clients WHERE status <> 'closed' ORDER BY name")).rows
  return {
    accounts: accts.map((a) => {
      const l = live.get(a.id)!, prevValue = l.positions.reduce((s, p) => s + (p.change_pct != null ? p.value / (1 + p.change_pct / 100) : p.value), 0) + l.cash
      const mix: Record<string, number> = { stocks: 0, etf: 0, crypto: 0, cash: l.value ? (l.cash / l.value) * 100 : 0 }
      for (const p of l.positions) mix[p.kind === 'stock' ? 'stocks' : p.kind] = (mix[p.kind === 'stock' ? 'stocks' : p.kind] ?? 0) + p.weight
      return { ...a, broker_name: brokerName(a), value: l.value, today_pct: prevValue ? ((l.value - prevValue) / prevValue) * 100 : null, positions: l.positions.length, mix,
        waiting: waiting.filter((w) => w.account_id === a.id && w.status === 'waiting').reduce((s, w) => s + w.n, 0), tickets: waiting.filter((w) => w.account_id === a.id && w.status === 'ticket').reduce((s, w) => s + w.n, 0), fills: fills.find((f) => f.account_id === a.id)?.n ?? 0 }
    }),
    entities, clients, risk_levels: Object.entries(RISK_LIMITS_ALL()).map(([code, l]) => ({ code, label: l.label })), brokers: BROKERS
  }
})
