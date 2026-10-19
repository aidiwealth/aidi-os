// The portfolio report on Aidi letterhead: every active company, or one (?company=), as Excel or PDF.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'admin')
  await rateLimit('portfolio_export', user.userId, 60, 60 * 60 * 1000)
  const q = z.object({ format: z.enum(['pdf', 'xlsx']).default('pdf'), company: z.string().uuid().optional() }).safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Choose PDF or Excel.')
  const list = await portfolioExportData(q.data.company)
  if (!list.length) throw apiError('not_found', 'No companies to export.', 404)
  const title = q.data.company ? list[0]!.name + ' report' : 'Aidi portfolio report'
  const bytes = q.data.format === 'xlsx' ? await portfolioXlsx(list, title) : Buffer.from(await portfolioPdf(list, title))
  const fname = (title + ' ' + new Date().toISOString().slice(0, 10)).replace(/[^A-Za-z0-9 ._()-]/g, '') + '.' + q.data.format
  await audit({ event, actorUserId: user.userId, action: 'portfolio.export', objectType: 'portfolio', detail: { format: q.data.format, company: q.data.company ?? null, companies: list.length } })
  setHeader(event, 'content-type', q.data.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf')
  setHeader(event, 'content-disposition', 'attachment; filename="' + fname + '"')
  return bytes
})
