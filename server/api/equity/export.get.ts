// GET /api/equity/export?ct=&version=summary|full&format=pdf|xlsx&convertibles=1&classes=1&ledger=1&grants=1&emails=1
// Download the cap table. Summary: founders and investors by name, other holders grouped, the pool, SAFEs and notes.
// Full: every holder by class, and optionally the issuance ledger and option grants. Emails only when asked for.
import { z } from 'zod'
const flag = z.enum(['0', '1']).default('0').transform((v) => v === '1')
const Q = z.object({ ct: z.string().optional(), version: z.enum(['summary', 'full']).default('summary'), format: z.enum(['pdf', 'xlsx']).default('pdf'),
  convertibles: flag, classes: flag, ledger: flag, grants: flag, emails: flag })
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'equity')
  const q = Q.safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Choose what to download.')
  const o = q.data
  const ct = await capTableId(o.ct)
  const c = (await db().query<{ name: string }>('SELECT name FROM equity.captables WHERE id = $1', [ct])).rows[0]
  if (!c) throw apiError('not_found', 'Cap table not found.', 404)
  const org = (await currentOrg())!
  const d = await loadCapTable(ct)
  const opts = { version: o.version, convertibles: o.convertibles, classes: o.classes, ledger: o.ledger, grants: o.grants, emails: o.emails }
  const file = ((o.version === 'summary' ? 'Cap table summary - ' : 'Cap table - ') + org.name + ' - ' + new Date().toISOString().slice(0, 10)).replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 120)
  setHeader(event, 'cache-control', 'private, no-store')
  if (o.format === 'xlsx') {
    setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'content-disposition', 'attachment; filename="' + file + '.xlsx"')
    return await capTableXlsx(c.name, org.name, d, opts)
  }
  const bytes = await legalPdf(org.name, [{ title: (o.version === 'summary' ? 'Cap table summary' : 'Cap table') + ' - ' + c.name, md: capTableExportMd(c.name, d, opts) }], { logo: org.settings.brand === 'aidi' ? 'aidi' : org.kind === 'company' ? null : 'aidi' })
  setHeader(event, 'content-type', 'application/pdf')
  setHeader(event, 'content-disposition', 'attachment; filename="' + file + '.pdf"')
  return Buffer.from(bytes)
})
