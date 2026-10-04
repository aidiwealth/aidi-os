// Create (with standard stages) or update a pipeline.
import { z } from 'zod'
const n = z.union([z.coerce.number().min(0), z.literal('').transform(() => null), z.null()]).optional()
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), currency: z.enum(['USD', 'NGN']), target: n, instrument: z.enum(['safe', 'priced', 'convertible_note']).default('safe'),
    valuation_cap: n, discount: n, pre_money: n, status: z.enum(['open', 'closed']).default('open'), target_close: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the pipeline details.')
  const d = b.data, args = [d.name, d.currency, d.target ?? null, d.instrument, d.valuation_cap ?? null, d.discount ?? null, d.pre_money ?? null, d.status, d.target_close || null]
  if (d.id) { await db().query('UPDATE crm.pipelines SET name = $2, currency = $3, target = $4, instrument = $5, valuation_cap = $6, discount = $7, pre_money = $8, status = $9, target_close = $10 WHERE id = $1', [d.id, ...args]); return { ok: true, id: d.id } }
  const id = (await one<{ id: string }>('INSERT INTO crm.pipelines (name, currency, target, instrument, valuation_cap, discount, pre_money, status, target_close) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', args)).id
  const STD: [string, string, string][] = [['Contacted', 'grey', 'open'], ['Meeting', 'blue', 'open'], ['Diligence', 'purple', 'open'], ['Term sheet', 'teal', 'committed'], ['Committed', 'amber', 'committed'], ['Closed', 'green', 'won'], ['Passed', 'red', 'lost']]
  for (const [i, s] of STD.entries()) await db().query('INSERT INTO crm.stages (pipeline_id, name, color, kind, sort) VALUES ($1,$2,$3,$4,$5)', [id, s[0], s[1], s[2], i])
  return { ok: true, id }
})
