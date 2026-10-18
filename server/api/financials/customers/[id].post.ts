// Edit a customer: name, segment, sector, country, plan, start date, acquisition cost, gross margin.
import { custKey } from '~/shared/customer-metrics'
import { z } from 'zod'
const s = (n: number) => z.string().trim().max(n).nullable().optional()
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const id = String(getRouterParam(event, 'id'))
  const b = z.object({ name: z.string().trim().min(1).max(200).optional(), segment: s(60), sector: s(80), country: s(60), plan: s(80), started_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('')), acquisition_cost: z.number().min(0).nullable().optional(), gross_margin_pct: z.number().min(-100).max(100).nullable().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the details.')
  const d = b.data, sets: string[] = [], args: unknown[] = [id]
  const put = (col: string, v: unknown) => { args.push(v === '' ? null : v); sets.push(col + ' = $' + args.length) }
  if (d.name) { put('name', d.name); put('key', custKey(d.name)) }
  for (const k of ['segment', 'sector', 'country', 'plan', 'started_on', 'acquisition_cost', 'gross_margin_pct'] as const) if (d[k] !== undefined) put(k, typeof d[k] === 'string' ? (d[k] as string).trim() || null : d[k])
  if (!sets.length) return { ok: true }
  try { await db().query('UPDATE financials.customers SET ' + sets.join(', ') + ', updated_at = now() WHERE id = $1', args) }
  catch (e) { if ((e as { code?: string }).code === '23505') throw apiError('taken', 'Another customer already has that name. Merge them instead.', 409); throw e }
  return { ok: true }
})
