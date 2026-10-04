// Create or update the round.
import { z } from 'zod'
const n = z.union([z.coerce.number().min(0), z.literal('').transform(() => null), z.null()]).optional()
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), instrument: z.enum(['safe', 'priced', 'convertible_note']), currency: z.enum(['USD', 'NGN']),
    target: n, valuation_cap: n, discount: n, pre_money: n, status: z.enum(['open', 'closed']).default('open'), target_close: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the round details.')
  const d = b.data, args = [d.name, d.instrument, d.currency, d.target ?? null, d.valuation_cap ?? null, d.discount ?? null, d.pre_money ?? null, d.status, d.target_close || null]
  const r = d.id ? await one<{ id: string }>('UPDATE fundraise.rounds SET name = $2, instrument = $3, currency = $4, target = $5, valuation_cap = $6, discount = $7, pre_money = $8, status = $9, target_close = $10 WHERE id = $1 RETURNING id', [d.id, ...args])
    : await one<{ id: string }>('INSERT INTO fundraise.rounds (name, instrument, currency, target, valuation_cap, discount, pre_money, status, target_close) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', args)
  return { ok: true, id: r.id }
})
