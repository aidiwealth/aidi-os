// Delete or clear figures in bulk: every period, the chosen periods or a date range, and either whole statements or
// only some lines (income statement, balance sheet, cash flow, single lines) and KPIs. Statements left with nothing
// are removed. Linked sheets can be paused so the daily sync does not bring the figures back.
import { z } from 'zod'
const Body = z.object({
  subject: z.string().max(80), scope: z.enum(['all', 'ids', 'range']), ids: z.array(z.string().uuid()).max(1000).default([]),
  from: z.string().regex(/^\d{4}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  period_types: z.array(z.enum(['month', 'quarter', 'year'])).min(1).default(['month', 'quarter', 'year']),
  lines: z.array(z.string().max(40)).max(60).default([]), kpis: z.boolean().default(false), pause_sheets: z.boolean().default(false), confirm: z.string().max(20).optional() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose what to delete.')
  const d = b.data
  const s = parseSubject(d.subject)
  if (s.kind === 'group') throw apiError('invalid', 'Choose an entity, fund or company: the group view only adds them up.')
  await subjectName(d.subject)
  const lines = d.lines.filter((k) => LINE_KEYS.includes(k))
  const whole = !lines.length && !d.kpis
  if (d.scope === 'all' && whole && d.confirm !== 'DELETE') throw apiError('confirm', 'Type DELETE to remove every figure.', 422)
  if (d.scope === 'ids' && !d.ids.length) throw apiError('invalid', 'Select the periods to delete.')
  if (d.scope === 'range' && (!d.from || !d.to || d.from > d.to)) throw apiError('invalid', 'Choose a start and end month.')
  const col = s.kind === 'entity' ? 'entity_id' : 'company_id'
  const args: unknown[] = [s.id, d.period_types]
  let where = `${col} = $1 AND period_type = ANY($2::text[])`
  if (d.scope === 'ids') { args.push(d.ids); where += ' AND id = ANY($' + args.length + '::uuid[])' }
  if (d.scope === 'range') {
    const [ty, tm] = d.to!.split('-').map(Number) as [number, number]
    args.push(d.from + '-01', new Date(Date.UTC(ty, tm, 0)).toISOString().slice(0, 10))
    where += ' AND period_end BETWEEN $' + (args.length - 1) + '::date AND $' + args.length + '::date'
  }
  let deleted = 0, cleared = 0
  if (whole) deleted = (await db().query(`DELETE FROM financials.statements WHERE ${where}`, args)).rowCount ?? 0
  else {
    const n = args.length
    cleared = (await db().query(`UPDATE financials.statements SET lines = lines - $${n + 1}::text[], kpis = CASE WHEN $${n + 2}::boolean THEN '{}'::jsonb ELSE kpis END, updated_at = now()
      WHERE ${where} AND (lines ?| $${n + 1}::text[] OR ($${n + 2}::boolean AND kpis <> '{}'::jsonb))`, [...args, lines, d.kpis])).rowCount ?? 0
    deleted = (await db().query(`DELETE FROM financials.statements WHERE ${where} AND lines = '{}'::jsonb AND kpis = '{}'::jsonb`, args)).rowCount ?? 0
  }
  let paused = 0
  if (d.pause_sheets) paused = (await db().query("UPDATE financials.sheet_links SET auto = false WHERE target = 'financials' AND subject = $1 AND auto", [d.subject])).rowCount ?? 0
  await audit({ event, actorUserId: user.userId, action: 'financials.clear', objectType: 'statement', detail: { subject: d.subject, scope: d.scope, from: d.from, to: d.to, ids: d.ids.length, period_types: d.period_types, lines, kpis: d.kpis, deleted, cleared, paused } })
  return { ok: true, deleted, cleared, paused }
})
