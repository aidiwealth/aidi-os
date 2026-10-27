// Confirm a fill (writes the position, the cash, the Investments & AUM lines and, for a company account, the journal),
// or reject it (writes nothing).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  const id = String(getRouterParam(event, 'id'))
  const b = z.object({ action: z.enum(['confirm', 'reject']), note: z.string().max(500).optional() }).safeParse(await readBody(event))
  if (!b.success || !/^[0-9a-f-]{36}$/.test(id)) throw apiError('invalid', 'Say what to do.')
  const f = (await db().query<{ account_id: string; symbol: string; side: string; qty: string; price: string }>('SELECT account_id, symbol, side, qty::text, price::text FROM markets.fills WHERE id = $1', [id])).rows[0]
  if (!f) throw apiError('not_found', 'Fill not found.', 404)
  const a = await marketAccount(f.account_id)
  if (b.data.action === 'confirm') {
    const pv = await confirmFill(id, user.userId)
    await audit({ event, actorUserId: user.userId, action: 'markets.fill_confirmed', objectType: 'markets.fill', objectId: id, entityId: a.entity_id ?? undefined, detail: { account: a.name, symbol: f.symbol, side: f.side, qty: Number(f.qty), price: Number(f.price), effects: pv } })
    return { ok: true, effects: pv }
  }
  const r = await db().query("UPDATE markets.fills SET status = 'rejected', decided_by = $2, decided_at = now(), note = coalesce($3, note) WHERE id = $1 AND status = 'pending'", [id, user.userId, b.data.note ?? null])
  if (!r.rowCount) throw apiError('invalid', 'This fill was already decided.', 409)
  await audit({ event, actorUserId: user.userId, action: 'markets.fill_rejected', objectType: 'markets.fill', objectId: id, entityId: a.entity_id ?? undefined, detail: { account: a.name, symbol: f.symbol, note: b.data.note ?? null } })
  return { ok: true }
})
