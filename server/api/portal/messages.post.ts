// The client sends a message to the team.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  rateLimit('portal_msg', u.personId, 30, 60 * 60 * 1000)
  const b = z.object({ body: z.string().trim().min(1).max(5000) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Write a message.')
  await db().query('INSERT INTO services.messages (organization_id, client_id, from_team, author_person_id, body) VALUES ($1,$2,false,$3,$4)', [u.orgId, u.clientId, u.personId, b.data.body])
  sendPortalMessageAlert(u.client, u.name, b.data.body, (await appUrl()) + '/services/clients/' + u.clientId).catch((e) => console.error('[portal] alert failed', e))
  return { ok: true }
})
