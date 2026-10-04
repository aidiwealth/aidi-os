// The team writes to the client. Portal contacts (or the client's main email) get an email with a link to read it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ body: z.string().trim().min(1).max(5000) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Write a message.')
  const c = (await db().query<{ name: string }>('SELECT name FROM services.clients WHERE id = $1', [id.data])).rows[0]
  if (!c) throw apiError('not_found', 'Client not found', 404)
  await db().query('INSERT INTO services.messages (client_id, from_team, author_user_id, body) VALUES ($1,true,$2,$3)', [id.data, user.userId, b.data.body])
  const to = await clientRecipients(id.data)
  for (const e of to.emails) { try { await sendPortalMessageEmail(e, c.name, b.data.body, to.portal ? await portalUrl('/messages', id.data) : null) } catch (err) { console.error('[portal] message email failed', err) } }
  await audit({ event, actorUserId: user.userId, action: 'services.client_message', objectType: 'client', objectId: id.data })
  return { ok: true, emailed: to.emails.length }
})
