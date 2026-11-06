// One forecast on its own, as a PDF or Excel file: the coming months by quarter, best and worst cases, and what it
// assumes against the company's actual figures (the same section as in the management report).
import { z } from 'zod'
import { mgmtPdf, mgmtXlsx, type MReport } from '~/server/utils/mgmt-report'
import { forecastHistory, forecastPack, forecastSection } from '~/server/utils/forecast-report'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ id: z.string().uuid(), format: z.enum(['pdf', 'xlsx']).default('pdf'), audience: z.enum(['board', 'executive', 'investor']).default('board') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a forecast.')
  const fc = await forecastPack({ id: b.data.id })
  if (!fc || !fc.months) throw apiError('not_found', 'That forecast has no months yet.', 404)
  const ent = (await db().query<{ entity_id: string | null }>('SELECT entity_id FROM financials.forecasts WHERE id = $1', [b.data.id])).rows[0]?.entity_id
  const actual = ent ? (await loadStatements('entity:' + ent, 'month', fc.currency).catch(() => [])).filter((r) => r.period_end < fc.start + '-01').slice(-12) : []
  const sec = forecastSection(fc, { audience: b.data.audience, hist: actual.length ? forecastHistory(actual as never) : null })
  const r: MReport = { audience: b.data.audience, kind: 'Forecast', company: fc.company, month: fc.start + '-01', label: fc.name, currency: fc.currency, sections: [sec], generated: true, business: null, chart: 'area', pies: true }
  const logo = await companyLogoImage()
  const bytes = b.data.format === 'xlsx' ? await mgmtXlsx(r, logo) : Buffer.from(await mgmtPdf(r, logo))
  const fname = (fc.company + ' forecast ' + fc.name).replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 150) + '.' + b.data.format
  await audit({ event, actorUserId: user.userId, action: 'forecast.export', objectType: 'forecast', objectId: b.data.id, detail: { format: b.data.format } })
  setHeader(event, 'content-type', b.data.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf')
  setHeader(event, 'content-disposition', 'attachment; filename="' + fname.replace(/"/g, '') + '"')
  return bytes
})
