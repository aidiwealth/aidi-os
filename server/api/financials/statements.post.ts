// Save a statement (adds or replaces the one for that subject and period). Balance sheets must balance.
import { z } from 'zod'
const Body = z.object({ subject: z.string().max(80), period_type: z.enum(['month', 'quarter', 'year']), period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().regex(/^[A-Z]{3}$/), lines: z.record(z.string(), z.number().finite().nullable()), kpis: z.record(z.string().max(60), z.number().finite()).default({}),
  notes: z.string().max(1000).optional(), show_to_lps: z.boolean().default(false), document_id: z.string().uuid().optional() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the period, currency and figures.')
  const d = b.data
  const s = parseSubject(d.subject)
  if (s.kind === 'group') throw apiError('invalid', 'Choose an entity, fund or company: the group view adds them up.')
  const lines = Object.fromEntries(Object.entries(d.lines).filter(([k, v]) => LINE_KEYS.includes(k) && v !== null))
  if (!Object.keys(lines).length && !Object.keys(d.kpis).length) throw apiError('invalid', 'Enter at least one figure.')
  const bad = balanceError(lines)
  if (bad) throw apiError('unbalanced', bad, 422)
  await subjectName(d.subject)
  const col = s.kind === 'entity' ? 'entity_id' : 'company_id'
  const existing = await db().query<{ id: string }>(`SELECT id FROM financials.statements WHERE ${col} = $1 AND period_type = $2 AND period_end = $3`, [s.id, d.period_type, d.period_end])
  const args = [d.currency, JSON.stringify(lines), JSON.stringify(d.kpis), d.notes || null, d.show_to_lps, d.document_id ? 'upload' : 'manual', d.document_id ?? null]
  const id = existing.rows[0]
    ? (await one<{ id: string }>('UPDATE financials.statements SET currency = $2, lines = $3, kpis = $4, notes = $5, show_to_lps = $6, source = $7, document_id = coalesce($8, document_id), updated_at = now() WHERE id = $1 RETURNING id', [existing.rows[0].id, ...args])).id
    : (await one<{ id: string }>(`INSERT INTO financials.statements (${col}, period_type, period_end, currency, lines, kpis, notes, show_to_lps, source, document_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [s.id, d.period_type, d.period_end, ...args, user.userId])).id
  await audit({ event, actorUserId: user.userId, action: existing.rows[0] ? 'financials.update' : 'financials.create', objectType: 'statement', objectId: id, detail: { subject: d.subject, period: d.period_end } })
  return { ok: true, id, replaced: !!existing.rows[0] }
})
