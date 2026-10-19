// Bring in the figures from an uploaded workbook that was read with AI (a one-time import: uploads do not sync).
import { z } from 'zod'
import { AiMap, guardMap, readWithMap, writePeriods, previewOf } from '~/server/utils/sheet-ai'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  await requireModule(event, 'financials')
  const b = z.object({ document_id: z.string().uuid(), subject: z.string().max(80), currency: z.string().regex(/^[A-Z]{3}$/), map: AiMap }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Read the file with AI first.')
  const d = (await db().query<{ storage_key: string; mime_type: string }>("SELECT storage_key, mime_type FROM core.documents WHERE id = $1 AND title LIKE 'Financial model — %'", [b.data.document_id])).rows[0]
  if (!d) throw apiError('not_found', 'That upload was not found. Upload the file again.', 404)
  const grids = await readGrids(Buffer.from(await getObject(d.storage_key)), d.mime_type === 'text/csv' ? 'csv' : 'xlsx', AI_GRID)
  const r = readWithMap(grids, guardMap(grids, b.data.map).map)
  if (!r.periods.length) throw apiError('empty', 'No figures were found where the tables were mapped. Untick fewer tables or read the file again.', 422)
  const w = await writePeriods(b.data.subject, r.periods, b.data.currency, user.userId)
  await audit({ event, actorUserId: user.userId, action: 'financials.model_import', objectType: 'document', objectId: b.data.document_id, detail: { periods: w.written } })
  return { ok: true, ...previewOf(r), months: w.written, skipped: w.skipped }
})
