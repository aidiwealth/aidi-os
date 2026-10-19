// Delete an imported report: its record, and the figures it brought in that nobody has changed since (a figure the
// founder sent later, or a team correction, stays). The file stays in Documents unless asked.
import { z } from 'zod'
import type { ExtractedReport } from '~/server/utils/portfolio-reports'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id')), rid = z.string().uuid().safeParse(getRouterParam(event, 'rid'))
  if (!id.success || !rid.success) throw apiError('not_found', 'Report not found', 404)
  const r = (await db().query<{ extracted: ExtractedReport; usd_rate: string; document_id: string | null; title: string }>('SELECT extracted, usd_rate, document_id, title FROM portfolio.report_imports WHERE id = $1 AND company_id = $2', [rid.data, id.data])).rows[0]
  if (!r) throw apiError('not_found', 'Report not found', 404)
  let removed = 0
  for (const v of toPeriods(r.extracted, Number(r.usd_rate) || 1)) {
    const d = await db().query(`UPDATE portfolio.metric_values SET founder_value = NULL, updated_at = now() WHERE company_id = $1 AND period = $2 AND metric = $3 AND founder_value = $4`, [id.data, v.period, v.metric, v.value])
    removed += d.rowCount ?? 0
  }
  await db().query('DELETE FROM portfolio.metric_values WHERE company_id = $1 AND founder_value IS NULL AND override_value IS NULL', [id.data])
  await db().query('DELETE FROM portfolio.report_imports WHERE id = $1', [rid.data])
  if (getQuery(event).file === '1' && r.document_id) await db().query('DELETE FROM core.documents WHERE id = $1', [r.document_id]).catch(() => {})
  await audit({ event, actorUserId: user.userId, action: 'portfolio.report_delete', objectType: 'company', objectId: id.data, detail: { report: rid.data, title: r.title, values: removed } })
  return { ok: true, removed }
})
