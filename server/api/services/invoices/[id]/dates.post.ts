// Change an invoice's dates — for logging an old invoice: issue date, due date and (if paid) the date it was paid.
// Renewals set up from a paid invoice move with the paid date (rolled forward so nothing is charged for past periods).
import { z } from 'zod'
const D = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ issue_date: D, due_date: D, paid_on: D.optional().or(z.literal('').transform(() => undefined)) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Enter valid dates.')
  const d = b.data, today = new Date().toISOString().slice(0, 10)
  if (d.issue_date > today) throw apiError('invalid', 'The issue date cannot be in the future.')
  if (d.due_date < d.issue_date) throw apiError('invalid', 'The due date must be on or after the issue date.')
  if (d.paid_on && d.paid_on > today) throw apiError('invalid', 'The paid date cannot be in the future.')
  const inv = (await db().query<{ status: string; client_id: string; paid_at: string | null; lines: { code?: string; interval?: string; quantity: number }[]; workspace_id: string | null }>(
    "SELECT i.status, i.client_id, to_char(i.paid_at, 'YYYY-MM-DD') AS paid_at, i.lines, c.workspace_id FROM services.invoices i JOIN services.clients c ON c.id = i.client_id WHERE i.id = $1", [id.data])).rows[0]
  if (!inv) throw apiError('not_found', 'Invoice not found', 404)
  if (inv.status === 'void') throw apiError('state', 'This invoice is void.')
  const paidOn = inv.status === 'paid' ? (d.paid_on ?? inv.paid_at) : null
  await db().query('UPDATE services.invoices SET issue_date = $2, due_date = $3, paid_at = CASE WHEN status = \'paid\' THEN $4::date ELSE paid_at END WHERE id = $1', [id.data, d.issue_date, d.due_date, paidOn])
  // Paid date changed: move the renewals this invoice started.
  if (inv.status === 'paid' && paidOn && paidOn !== inv.paid_at && inv.workspace_id) {
    for (const l of inv.lines ?? []) {
      if (!l.code || !l.interval) continue
      const months = l.interval === 'month' ? 1 : 12
      await asPlatform(() => db().query("UPDATE wallet.subscriptions SET next_charge_at = $4 WHERE organization_id = $1 AND client_id = $2 AND code = $3 AND status = 'active'", [inv.workspace_id, inv.client_id, l.code, nextChargeFrom(paidOn, months)]))
    }
  }
  await audit({ event, actorUserId: user.userId, action: 'services.invoice_dates', objectType: 'invoice', objectId: id.data, detail: { ...d, paid_on: paidOn } })
  return { ok: true }
})
