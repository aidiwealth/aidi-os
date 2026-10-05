// POST /api/v1/financials — add or replace a period's figures. Body: { period_type, period_end, currency, lines: {revenue, cogs, ...}, kpis: {...}, subject? }
import { z } from 'zod'
const Body = z.object({ subject: z.string().max(80).optional(), period_type: z.enum(['month', 'quarter', 'year']), period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), currency: z.string().regex(/^[A-Z]{3}$/),
  lines: z.record(z.string(), z.number().finite().nullable()).default({}), kpis: z.record(z.string().max(60), z.number().finite()).default({}), notes: z.string().max(1000).optional() })
export default defineEventHandler(async (event) => {
  const k = await requireApiKey(event, 'write')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check period_type, period_end (YYYY-MM-DD), currency (e.g. USD) and the figures.', 422)
  const d = b.data, s0 = parseSubject(await apiSubject(k.kind, d.subject))
  if (s0.kind === 'group') throw apiError('invalid', 'Pass an entity or company subject.', 422)
  const s = s0
  const lines = Object.fromEntries(Object.entries(d.lines).filter(([key, v]) => LINE_KEYS.includes(key) && v !== null))
  if (!Object.keys(lines).length && !Object.keys(d.kpis).length) throw apiError('invalid', 'Send at least one figure. Line keys: ' + LINE_KEYS.join(', '), 422)
  const bad = balanceError(lines); if (bad) throw apiError('unbalanced', bad, 422)
  const col = s.kind === 'entity' ? 'entity_id' : 'company_id'
  const ex = (await db().query<{ id: string }>(`SELECT id FROM financials.statements WHERE ${col} = $1 AND period_type = $2 AND period_end = $3`, [s.id, d.period_type, d.period_end])).rows[0]
  const args = [d.currency, JSON.stringify(lines), JSON.stringify(d.kpis), d.notes || null]
  const id = ex ? (await one<{ id: string }>("UPDATE financials.statements SET currency = $2, lines = $3, kpis = $4, notes = coalesce($5, notes), source = 'api', updated_at = now() WHERE id = $1 RETURNING id", [ex.id, ...args])).id
    : (await one<{ id: string }>(`INSERT INTO financials.statements (${col}, period_type, period_end, currency, lines, kpis, notes, source) VALUES ($1,$2,$3,$4,$5,$6,$7,'api') RETURNING id`, [s.id, d.period_type, d.period_end, ...args])).id
  return { ok: true, id, replaced: !!ex }
})
