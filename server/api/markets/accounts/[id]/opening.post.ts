// Set what the account holds at the broker today, and its cash (opening balances: no journals are posted).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  const a = await marketAccount(String(getRouterParam(event, 'id')))
  const b = z.object({ positions: z.array(z.object({ symbol: z.string().trim().min(1).max(12), qty: z.number().min(0).max(1e12), cost: z.number().min(0).max(1e13) })).max(200), cash: z.number().min(-1e12).max(1e13).nullable() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the positions and cash.')
  await setOpening(a, b.data.positions.map((p) => ({ ...p, symbol: normSymbol(p.symbol) })), b.data.cash)
  await audit({ event, actorUserId: user.userId, action: 'markets.opening_set', objectType: 'markets.account', objectId: a.id, detail: b.data })
  return { ok: true }
})
