// send (email it to the billing contact), mark_paid, or void.
import { z } from 'zod'
const Body = z.object({ action: z.enum(['send', 'mark_paid', 'void']), paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z.string().trim().max(500).optional() })
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid action.')
  const inv = (await asPlatform(() => db().query<{ organization_id: string; status: string; number: string }>('SELECT organization_id, status, number FROM platform.invoices WHERE id = $1', [id.data]))).rows[0]
  if (!inv) throw apiError('not_found', 'Invoice not found', 404)
  const a = b.data.action
  if (a === 'send') {
    if (inv.status === 'void' || inv.status === 'paid') throw apiError('state', 'This invoice is ' + inv.status + '.')
    const emailed = await sendInvoice(event, staff.userId, id.data)
    if (!emailed) throw apiError('email', 'The invoice email could not be sent. Check the billing contact address.', 502)
    return { ok: true }
  }
  if (a === 'mark_paid' && inv.status === 'void') throw apiError('state', 'This invoice is void.')
  if (a === 'void' && inv.status === 'paid') throw apiError('state', 'A paid invoice cannot be voided.')
  await asPlatform(() => db().query(
    a === 'mark_paid' ? "UPDATE platform.invoices SET status = 'paid', paid_at = coalesce($2::date, current_date), paid_note = $3, paid_via = 'manual' WHERE id = $1" : "UPDATE platform.invoices SET status = 'void', paid_note = coalesce($3, paid_note) WHERE id = $1 AND $2::date IS NULL",
    [id.data, a === 'mark_paid' ? (b.data.paid_on ?? null) : null, b.data.note ?? null]))
  await platformAudit(event, staff.userId, 'invoice_' + a, inv.organization_id, { number: inv.number })
  return { ok: true }
})
