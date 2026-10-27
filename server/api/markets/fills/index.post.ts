// Enter what filled at the broker: for a ticket, or a trade placed directly at the broker. It waits for someone to
// confirm it; nothing is written to holdings, cash or the books until then.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  const b = z.object({ account_id: z.string().uuid(), proposal_id: z.string().uuid().optional().nullable(), symbol: z.string().trim().min(1).max(12), side: z.enum(['buy', 'sell']), qty: z.number().positive().max(1e12), price: z.number().positive().max(1e9), fees: z.number().min(0).max(1e7).default(0), filled_at: z.string().min(10).max(40), note: z.string().max(500).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the fill: ' + (b.error.issues[0]?.path.join('.') ?? ''))
  const d = b.data, a = await marketAccount(d.account_id), symbol = normSymbol(d.symbol)
  const i = await ensureInstrument(symbol)
  if (!i) throw apiError('invalid', symbol + ' is not a symbol we can price.')
  const at = new Date(d.filled_at)
  if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 3600e3 || at.getTime() < Date.now() - 400 * 86400e3) throw apiError('invalid', 'Check when it filled.')
  if (d.proposal_id) {
    const p = (await db().query<{ status: string; account_id: string; symbol: string; side: string }>('SELECT status, account_id, symbol, side FROM markets.proposals WHERE id = $1', [d.proposal_id])).rows[0]
    if (!p || p.account_id !== a.id || p.symbol !== symbol || p.side !== d.side) throw apiError('invalid', 'That fill does not match the ticket.')
    if (p.status !== 'ticket') throw apiError('invalid', 'That ticket is ' + p.status + '.', 409)
  }
  // Check it would work (selling no more than is held) before saving.
  try { await previewFill({ account_id: a.id, symbol, side: d.side, qty: d.qty, price: d.price, fees: d.fees }) } catch (e) { throw apiError('invalid', (e as Error).message) }
  const id = (await db().query<{ id: string }>("INSERT INTO markets.fills (account_id, proposal_id, symbol, side, qty, price, fees, filled_at, source, entered_by, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9,$10) RETURNING id", [a.id, d.proposal_id ?? null, symbol, d.side, d.qty, d.price, d.fees, at.toISOString(), user.userId, d.note ?? null])).rows[0]!.id
  await audit({ event, actorUserId: user.userId, action: 'markets.fill_entered', objectType: 'markets.fill', objectId: id, entityId: a.entity_id ?? undefined, detail: { account: a.name, symbol, side: d.side, qty: d.qty, price: d.price, fees: d.fees } })
  return { id }
})
