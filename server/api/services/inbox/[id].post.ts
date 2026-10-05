// Reply in a conversation (reopens it if closed). The client gets the reply by email.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireOperator(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ body: z.string().trim().max(5000).default(''), document_id: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!id.success || !b.success || (!b.data.body && !b.data.document_id)) throw apiError('invalid', 'Write a message or attach a file.')
  const t = (await db().query<{ client_id: string; organization_id: string; name: string }>('SELECT t.client_id, t.organization_id, c.name FROM services.threads t JOIN services.clients c ON c.id = t.client_id WHERE t.id = $1', [id.data])).rows[0]
  if (!t) throw apiError('not_found', 'Not found', 404)
  const thread = await postMessage({ orgId: t.organization_id, clientId: t.client_id, fromTeam: true, userId: user.userId, body: b.data.body, documentId: b.data.document_id, threadId: id.data })
  const to = await clientRecipients(t.client_id)
  for (const e of to.emails) { try { await sendPortalMessageEmail(e, t.name, b.data.body || 'We shared a document with you.', to.portal ? await portalUrl('/messages', t.client_id) : null) } catch (err) { console.error('[inbox] email failed', err) } }
  await audit({ event, actorUserId: user.userId, action: 'services.client_message', objectType: 'client', objectId: t.client_id })
  return { ok: true, thread }
})
