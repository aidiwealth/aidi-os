// Delete figures for a company: one period (every figure in it), or everything (figures, imported report records and,
// if asked, notes), so the data can be added again from scratch. Team corrections go too.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ period: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(), all: z.boolean().optional(), notes: z.boolean().default(false), confirm: z.string().optional() }).safeParse(await readBody(event))
  if (!id.success || !b.success || (!b.data.period && !b.data.all)) throw apiError('invalid', 'Choose the period to delete.')
  const c = (await db().query<{ name: string }>('SELECT name FROM portfolio.companies WHERE id = $1', [id.data])).rows[0]
  if (!c) throw apiError('not_found', 'Company not found', 404)
  let n = 0
  if (b.data.all) {
    if ((b.data.confirm ?? '').trim().toLowerCase() !== c.name.trim().toLowerCase()) throw apiError('invalid', 'Type the company name to confirm.')
    n = (await db().query('DELETE FROM portfolio.metric_values WHERE company_id = $1', [id.data])).rowCount ?? 0
    await db().query('DELETE FROM portfolio.report_imports WHERE company_id = $1', [id.data])
    if (b.data.notes) await db().query('DELETE FROM portfolio.updates WHERE company_id = $1', [id.data])
  } else n = (await db().query('DELETE FROM portfolio.metric_values WHERE company_id = $1 AND period = $2', [id.data, b.data.period!.slice(0, 7) + '-01'])).rowCount ?? 0
  await audit({ event, actorUserId: user.userId, action: 'portfolio.figures_delete', objectType: 'company', objectId: id.data, detail: { period: b.data.period ?? null, all: !!b.data.all, notes: b.data.notes, values: n } })
  return { ok: true, values: n }
})
