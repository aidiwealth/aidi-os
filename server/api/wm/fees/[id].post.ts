// Staff: send (or resend) a fee's invoice, mark it paid (bank transfer / cash), waive it; returns document links.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  const b = z.object({ action: z.enum(['send', 'paid', 'waive', 'due']), method: z.string().max(30).optional(), paid_on: z.string().optional() }).safeParse(await readBody(event))
  if (!/^[0-9a-f-]{36}$/.test(id) || !b.success) throw apiError('invalid', 'Invalid request.')
  let out: Record<string, unknown> = {}
  if (b.data.action === 'send') out = await issueFee(id)
  else if (b.data.action === 'paid') out = await markFeePaid(id, b.data.method || 'transfer', b.data.paid_on)
  else { await db().query('UPDATE wm.fees SET status = $2, paid_on = NULL WHERE id = $1', [id, b.data.action === 'waive' ? 'waived' : 'due']); await db().query('DELETE FROM finance.journal WHERE wm_fee_id = $1', [id]) }
  await audit({ event, actorUserId: user.userId, action: 'wm.fee_' + b.data.action, objectType: 'wm_fee', objectId: id })
  return { ok: true, ...out }
})
