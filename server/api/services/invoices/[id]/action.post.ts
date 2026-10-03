// send (email with pay link and bank details), mark_paid (bank transfer received), void.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ action: z.enum(['send', 'mark_paid', 'void']), paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid action.')
  const inv = await loadCsInvoice(id.data)
  if (!inv) throw apiError('not_found', 'Invoice not found', 404)
  const a = b.data.action
  if (a === 'send') { if (!(await sendCsInvoice(id.data))) throw apiError('state', 'This invoice is ' + inv.status + '.') }
  else if (a === 'mark_paid') { if (inv.status === 'void') throw apiError('state', 'This invoice is void.'); await db().query("UPDATE services.invoices SET status = 'paid', paid_at = coalesce($2::date, current_date), paid_via = 'manual' WHERE id = $1", [id.data, b.data.paid_on ?? null]) }
  else { if (inv.status === 'paid') throw apiError('state', 'A paid invoice cannot be voided.'); await db().query("UPDATE services.invoices SET status = 'void' WHERE id = $1", [id.data]) }
  await audit({ event, actorUserId: user.userId, action: 'services.invoice_' + a, objectType: 'invoice', objectId: id.data, detail: { number: inv.number } })
  return { ok: true }
})
