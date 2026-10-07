// Gold and silver live prices with history, and interest rates (US and/or Nigeria) — for staff and wealth clients.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team', 'wealth_client')
  let country: 'US' | 'NG' | null = null
  if (!user.roles.some((r) => ['admin', 'gp', 'team'].includes(r))) { const id = await wmClientOfUser(user.userId); country = id ? ((await db().query<{ country: 'US' | 'NG' }>('SELECT country FROM wm.clients WHERE id = $1', [id])).rows[0]?.country ?? null) : null }
  const q = String(getQuery(event).country ?? ''); if (!country && (q === 'US' || q === 'NG')) country = q
  return { metals: await metalPrices(), rates: await ratesFor(country) }
})
