// Change a wealth invoice's dates (for an old invoice being logged now): issued, due and, if paid, the paid date.
import { z } from 'zod'
const D = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  const b = z.object({ issue_date: D, due_date: D, paid_on: D.optional().or(z.literal('').transform(() => undefined)) }).safeParse(await readBody(event))
  if (!/^[0-9a-f-]{36}$/.test(id) || !b.success) throw apiError('invalid', 'Enter valid dates.')
  const d = b.data, today = new Date().toISOString().slice(0, 10)
  if (d.issue_date > today) throw apiError('invalid', 'The invoice date cannot be in the future.')
  if (d.due_date < d.issue_date) throw apiError('invalid', 'The due date must be on or after the invoice date.')
  if (d.paid_on && d.paid_on > today) throw apiError('invalid', 'The paid date cannot be in the future.')
  const f = (await db().query<{ status: string; number: string | null; receipt_doc_id: string | null }>('SELECT status, number, receipt_doc_id FROM wm.fees WHERE id = $1', [id])).rows[0]
  if (!f) throw apiError('not_found', 'Invoice not found.', 404)
  await db().query("UPDATE wm.fees SET issue_date = $2, due_date = $3, paid_on = CASE WHEN status = 'paid' AND $4::date IS NOT NULL THEN $4::date ELSE paid_on END WHERE id = $1", [id, d.issue_date, d.due_date, d.paid_on ?? null])
  if (f.status === 'paid') await bookFee(id) // the books follow the paid date
  if (f.number) await issueFee(id, false) // rebuild the invoice PDF with the new dates
  await audit({ event, actorUserId: user.userId, action: 'wm.invoice_dates', objectType: 'wm_fee', objectId: id, detail: d })
  return { ok: true }
})
