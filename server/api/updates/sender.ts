// Investor report sending address for this workspace: its own verified address (with DNS records to add), the
// reply-to address, verify and remove. Partners and admins change it; the team can see it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'admin', 'team')
  const org = (await currentOrg())!
  if (getMethod(event) === 'GET') {
    const s = await senderGet(org.id)
    return { ...(s.status === 'pending' ? await senderRefresh(org.id).catch(() => s) : s), default_from: brands()[await resolveBrand()].from }
  }
  const user = await requireRole(event, 'gp', 'admin')
  await rateLimit('update_sender', org.id, 30, 60 * 60 * 1000)
  const b = z.object({ action: z.enum(['set', 'verify', 'remove', 'reply_to']), email: z.string().max(254).optional(), reply_to: z.string().max(254).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the address.')
  let out: object = {}
  if (b.data.action === 'set') out = await senderSet(org.id, b.data.email ?? '', b.data.reply_to ?? null)
  else if (b.data.action === 'verify') out = await senderRefresh(org.id, true)
  else if (b.data.action === 'remove') await senderRemove(org.id)
  else await senderReplyTo(org.id, b.data.reply_to ?? '')
  await audit({ event, actorUserId: user.userId, action: 'updates.sender_' + b.data.action, objectType: 'organization', objectId: org.id })
  return { ok: true, ...out }
})
