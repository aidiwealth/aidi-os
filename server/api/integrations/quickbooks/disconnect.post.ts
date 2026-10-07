// Disconnect QuickBooks for a subject: revoke the tokens at Intuit and forget them.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  const b = z.object({ subject: z.string().max(80) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const c = await qbConn(b.data.subject)
  if (c) { await qbRevoke(c); await db().query('DELETE FROM financials.connections WHERE id = $1', [c.id]) }
  await audit({ event, actorUserId: user.userId, action: 'integrations.quickbooks_disconnect', objectType: 'organization', objectId: user.orgId ?? undefined, detail: { subject: b.data.subject } })
  return { ok: true }
})
