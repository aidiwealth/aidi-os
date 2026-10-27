// Staff: approve a website request (opens the account, emails the client, opens the dashboard), decline it kindly,
// retry opening the investing account, or resend the link to start.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const b = z.object({ action: z.enum(['approve', 'decline', 'open_account', 'resend']), note: z.string().trim().max(1000).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Unknown action.')
  const o = (await db().query<{ client_id: string; status: string; account_status: string | null }>('SELECT client_id, status, account_status FROM wm.onboarding WHERE id = $1', [id])).rows[0]
  if (!o) throw apiError('not_found', 'Not found', 404)
  const ip = ipOrNull(event) ?? '0.0.0.0'
  let out: Record<string, unknown> = { ok: true }
  if (b.data.action === 'approve') out = { ok: true, ...(await onboardApprove(id, user.userId, ip)) }
  else if (b.data.action === 'decline') await onboardDecline(id, user.userId, b.data.note)
  else if (b.data.action === 'open_account') { if (!['failed', 'waiting', 'held'].includes(o.account_status ?? '')) throw apiError('state', 'The account is already open or not needed.', 409); out = { ok: true, opened: await openAccount(id, o.client_id, ip) } }
  else { const c = (await db().query<{ email: string | null; contact_name: string | null; name: string }>('SELECT email, contact_name, name FROM wm.clients WHERE id = $1', [o.client_id])).rows[0]; if (!c?.email) throw apiError('invalid', 'The client has no email.'); await sendWealthStart(c.email, c.contact_name || c.name, null) }
  await audit({ event, actorUserId: user.userId, action: 'wm.onboarding_' + b.data.action, objectType: 'wm_client', objectId: o.client_id, detail: { note: b.data.note || undefined } })
  return out
})
