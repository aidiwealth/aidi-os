// Admins set which Gmail mailboxes send notices and which senders count as notices.
import { z } from 'zod'
const email = z.string().trim().toLowerCase().email().max(254)
const sender = z.string().trim().toLowerCase().max(254).regex(/^([a-z0-9._%+-]+@)?[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Use a domain like irs.gov or an address like notices@bank.com')
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = z.object({ mailboxes: z.array(email).min(1).max(20), senders: z.array(sender).min(1).max(100) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', b.error.issues[0]?.message.includes('@') || b.error.issues[0]?.path[0] === 'mailboxes' ? 'Check the mailbox addresses (at least one).' : 'Check the senders: use domains like irs.gov or full addresses (at least one).')
  const mailboxes = [...new Set(b.data.mailboxes)], senders = [...new Set(b.data.senders)]
  await db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('notice_mailboxes', $1::jsonb, 'notice_senders', $2::jsonb) WHERE id = core.current_org()", [JSON.stringify(mailboxes), JSON.stringify(senders)])
  await audit({ event, actorUserId: user.userId, action: 'notices.settings', objectType: 'organization', detail: { mailboxes: mailboxes.length, senders: senders.length } })
  return { ok: true, mailboxes, senders }
})
