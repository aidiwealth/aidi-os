// The team writes to the client. Portal contacts (or the client's main email) get an email with a link to read it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ body: z.string().trim().max(5000).default(''), document_id: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!id.success || !b.success || (!b.data.body && !b.data.document_id)) throw apiError('invalid', 'Write a message or attach a file.')
  const c = (await db().query<{ name: string; emails_muted: boolean }>('SELECT name, emails_muted FROM services.clients WHERE id = $1', [id.data])).rows[0]
  if (!c) throw apiError('not_found', 'Client not found', 404)
  await postMessage({ orgId: (await currentOrg())!.id, clientId: id.data, fromTeam: true, userId: user.userId, body: b.data.body, documentId: b.data.document_id })
  const to = c.emails_muted ? { emails: [] as string[], portal: false } : await clientRecipients(id.data) // client emails switched off: saved, not emailed
  for (const e of to.emails) { try { await sendPortalMessageEmail(e, c.name, b.data.body || 'We shared a document with you.', to.portal ? await portalUrl('/messages', id.data) : null) } catch (err) { console.error('[portal] message email failed', err) } }
  await audit({ event, actorUserId: user.userId, action: 'services.client_message', objectType: 'client', objectId: id.data })
  return { ok: true, emailed: to.emails.length }
})
