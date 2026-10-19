// Brings in the rows chosen from an uploaded workbook, once (an uploaded file does not stay in step: upload it again,
// or link the sheet, to bring in later months). Read by fixed rules, with no AI: the rows go where the founder chose.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  await requireModule(event, 'financials')
  const b = z.object({ document_id: z.string().uuid(), subject: z.string().max(80), currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), sheet: z.string().max(120).default(''),
    mapping: z.array(z.object({ label: z.string().max(90), to: z.string().max(140) })).max(150) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Upload the file and choose where its rows go.')
  const d = b.data
  if (!d.subject || d.subject === 'group') throw apiError('invalid', 'Choose the company or entity.')
  await subjectName(d.subject)
  const keys = new Set(TARGET_KEYS.financials().map((k) => k.key))
  const mapping = d.mapping.filter((m) => m.to && (keys.has(m.to) || !!catOf(m.to)))
  if (!mapping.length) throw apiError('invalid', 'Choose at least one row to use.')
  const src = await loadSheetUpload(d.document_id)
  const l: LinkRow = { id: '', name: 'Upload', url: 'upload:' + d.document_id, target: 'financials', subject: d.subject, forecast_id: null, currency: d.currency, sheet: d.sheet || null, mapping, mode: 'rows' }
  const res = await syncLink(l, user.userId, src)
  await audit({ event, actorUserId: user.userId, action: 'financials.sheet_upload_import', objectType: 'document', objectId: d.document_id, detail: { rows: mapping.length, months: res.months } })
  return { ok: true, ...res }
})
