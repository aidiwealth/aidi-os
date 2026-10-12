import { MSG_CATEGORIES, MSG_CATEGORY_KEYS } from '~/shared/message-categories'
// The team starts a new conversation with a client: subject, type and the first message (optionally with a file).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireOperator(event)
  const b = z.object({ client_id: z.string().uuid(), subject: z.string().trim().min(1).max(120), category: z.enum(MSG_CATEGORY_KEYS).default('general'), body: z.string().trim().max(5000).default(''), document_id: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a client and write a subject.')
  if (!b.data.body && !b.data.document_id) throw apiError('invalid', 'Write a message or attach a file.')
  const c = (await db().query<{ organization_id: string; name: string; emails_muted: boolean }>('SELECT organization_id, name, emails_muted FROM services.clients WHERE id = $1', [b.data.client_id])).rows[0]
  if (!c) throw apiError('not_found', 'Client not found', 404)
  const thread = await postMessage({ orgId: c.organization_id, clientId: b.data.client_id, fromTeam: true, userId: user.userId, body: b.data.body, documentId: b.data.document_id, category: b.data.category, subject: b.data.subject })
  const to = c.emails_muted ? { emails: [] as string[], portal: false } : await clientRecipients(b.data.client_id)
  for (const e of to.emails) { try { await sendPortalMessageEmail(e, c.name, b.data.body || 'We shared a document with you.', to.portal ? await portalUrl('/messages?thread=' + thread, b.data.client_id) : null, MSG_CATEGORIES[b.data.category]) } catch (err) { console.error('[inbox] email failed', err) } }
  await audit({ event, actorUserId: user.userId, action: 'services.thread_started', objectType: 'client', objectId: b.data.client_id, detail: { thread, category: b.data.category } })
  return { ok: true, thread, emailed: to.emails.length, muted: c.emails_muted }
})
