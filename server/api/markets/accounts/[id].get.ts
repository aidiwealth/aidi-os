// One account: live positions with weights and signals, cash, the mix against target, value over the last 30 days,
// and its proposals and fills.
export default defineEventHandler(async (event) => {
  await requireMarkets(event)
  const a = await marketAccount(String(getRouterParam(event, 'id')))
  const l = (await livePositions([a.id])).get(a.id)!
  // Value over 30 days from daily closes (today's cash held flat; a guide to the trend, not a statement).
  const days = (await db().query<{ d: string; v: string }>("SELECT to_char(p.d, 'YYYY-MM-DD') AS d, sum(p.close * x.qty)::text AS v FROM markets.positions x JOIN markets.prices p ON p.symbol = x.symbol WHERE x.account_id = $1 AND x.qty > 0 AND p.d > current_date - 31 GROUP BY p.d ORDER BY p.d", [a.id])).rows
  const proposals = (await db().query("SELECT p.id, p.symbol, i.name, p.side, p.qty::float, p.limit_price::float, p.notional::float, p.reason, p.checks, p.status, p.created_at, p.expires_at, p.decided_at FROM markets.proposals p JOIN markets.instruments i ON i.symbol = p.symbol WHERE p.account_id = $1 ORDER BY p.created_at DESC LIMIT 30", [a.id])).rows
  const fills = (await db().query("SELECT f.id, f.symbol, f.side, f.qty::float, f.price::float, f.fees::float, f.filled_at, f.status, f.created_at FROM markets.fills f WHERE f.account_id = $1 ORDER BY f.created_at DESC LIMIT 30", [a.id])).rows
  return { account: { ...a, broker_name: brokerName(a) }, cash: l.cash, value: l.value, positions: l.positions, limits: RISK_LIMITS_ALL()[a.risk_level] ?? null, history: days.map((x) => ({ t: x.d, v: Number(x.v) + l.cash })), proposals, fills }
})
