// resend (a fresh link replaces the old one) or cancel a tax information request.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ action: z.enum(['resend', 'cancel']) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid action.')
  const r = (await db().query<{ status: string; sent_to: string; tax_year: number; client: string; company: string | null }>(
    'SELECT r.status, r.sent_to, r.tax_year, c.name AS client, co.name AS company FROM services.info_requests r JOIN services.clients c ON c.id = r.client_id LEFT JOIN services.companies co ON co.id = r.company_id WHERE r.id = $1', [id.data])).rows[0]
  if (!r) throw apiError('not_found', 'Not found', 404)
  if (b.data.action === 'cancel') { await db().query("UPDATE services.info_requests SET status = 'cancelled' WHERE id = $1", [id.data]); await audit({ event, actorUserId: user.userId, action: 'services.info_request_cancel', objectType: 'info_request', objectId: id.data }); return { ok: true } }
  if (r.status === 'submitted' || r.status === 'cancelled') throw apiError('state', 'This request is ' + r.status + '.')
  const link = await issueInfoLink(id.data)
  await sendInfoRequestEmail(r.sent_to, r.client, r.company ?? r.client, r.tax_year, link)
  await audit({ event, actorUserId: user.userId, action: 'services.info_request_resend', objectType: 'info_request', objectId: id.data })
  return { ok: true, link }
})
