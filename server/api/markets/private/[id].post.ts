// One pre-IPO deal: set its terms, ask the AI for a value range, propose commitments for accounts, record a new mark,
// or record the listing after an IPO.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found.', 404)
  const b = await readBody<Record<string, any>>(event)
  const a = String(b?.action ?? '')
  const num = (v: unknown) => (v === '' || v == null ? null : Number(v))
  if (a === 'terms') {
    const t = z.object({ offer_price: z.number().positive().nullable(), last_round_price: z.number().positive().nullable(), last_round: z.string().max(80).nullable(), fee_pct: z.number().min(0).max(20), carry_pct: z.number().min(0).max(50), lockup_days: z.number().int().min(0).max(1095), spv_name: z.string().max(200).nullable(), min_investment: z.number().min(0).nullable(), value_low: z.number().positive().nullable(), value_base: z.number().positive().nullable(), value_high: z.number().positive().nullable() })
      .safeParse({ offer_price: num(b.offer_price), last_round_price: num(b.last_round_price), last_round: b.last_round || null, fee_pct: Number(b.fee_pct ?? 0), carry_pct: Number(b.carry_pct ?? 0), lockup_days: Number(b.lockup_days ?? 180), spv_name: b.spv_name || null, min_investment: num(b.min_investment), value_low: num(b.value_low), value_base: num(b.value_base), value_high: num(b.value_high) })
    if (!t.success) throw apiError('invalid', 'Check the figures.')
    const d = t.data
    await db().query('UPDATE wm.secondaries SET offer_price = $2, last_round_price = $3, last_round = $4, fee_pct = $5, carry_pct = $6, lockup_days = $7, spv_name = $8, min_investment = $9, value_low = $10, value_base = $11, value_high = $12, updated_at = now() WHERE id = $1',
      [id, d.offer_price, d.last_round_price, d.last_round, d.fee_pct, d.carry_pct, d.lockup_days, d.spv_name, d.min_investment, d.value_low, d.value_base, d.value_high])
  } else if (a === 'value') {
    try { await aiPrivateValue(id) } catch (e) { console.error('[private] ai value', e); throw apiError('ai_failed', 'The AI could not value it just now. Try again in a minute, or enter the range yourself.', 502) }
  } else if (a === 'propose') {
    const rows = z.array(z.object({ account_id: z.string().uuid(), amount: z.number().positive() })).max(50).safeParse(b.rows)
    if (!rows.success || !rows.data.length) throw apiError('invalid', 'Choose at least one account and amount.')
    return { ok: true, proposed: await proposePrivate(id, rows.data, user.userId) }
  } else if (a === 'mark') await markPrivate(id, Number(b.price), String(b.note ?? ''))
  else if (a === 'listed') return { ok: true, accounts: await listPrivate(id, String(b.symbol ?? ''), String(b.date ?? '')) }
  else throw apiError('invalid', 'Unknown action.')
  await audit({ event, actorUserId: user.userId, action: 'markets.private_' + a, objectType: 'wm_secondary', objectId: id })
  return { ok: true }
})
