// Download the SAFE documents as a typeset PDF: ?doc=safe|mfn|pro_rata|all
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const s = (await db().query("SELECT *, amount::float AS amount, valuation_cap::float AS valuation_cap, discount::float AS discount, to_char(safe_date, 'YYYY-MM-DD') AS safe_date FROM fundraise.safes WHERE id = $1", [id.data])).rows[0] as SafeRow | undefined
  if (!s) throw apiError('not_found', 'Not found', 404)
  const which = String(getQuery(event).doc ?? 'all')
  const docs = safeDocs(s).filter((d) => which === 'all' || d.key === which)
  if (!docs.length) throw apiError('not_found', 'Not found', 404)
  const name = ((which === 'all' ? 'SAFE documents' : docs[0]!.title) + ' - ' + s.company_name).replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 120)
  setHeader(event, 'content-type', 'application/pdf'); setHeader(event, 'cache-control', 'no-store')
  setHeader(event, 'content-disposition', 'attachment; filename="' + name + '.pdf"')
  return Buffer.from(await legalPdf(s.company_name, docs))
})
