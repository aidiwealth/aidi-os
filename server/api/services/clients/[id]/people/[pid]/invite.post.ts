// Give a client contact portal access. send: email them an invite link; otherwise access is simply switched on and they
// can sign in with an emailed code whenever they like (for onboarding existing clients quietly).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const cid = z.string().uuid().safeParse(getRouterParam(event, 'id')), pid = z.string().uuid().safeParse(getRouterParam(event, 'pid'))
  const b = z.object({ send: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!cid.success || !pid.success || !b.success) throw apiError('invalid', 'Invalid request.')
  const p = (await db().query<{ name: string; email: string | null; client: string }>('SELECT p.name, p.email, c.name AS client FROM services.people p JOIN services.clients c ON c.id = p.client_id WHERE p.id = $1 AND p.client_id = $2', [pid.data, cid.data])).rows[0]
  if (!p) throw apiError('not_found', 'Person not found', 404)
  if (!p.email) throw apiError('invalid', 'Add their email first: sign-in is by emailed code.')
  let link: string | null = null
  if (b.data.send) {
    const token = randomToken()
    await db().query("UPDATE services.people SET portal_access = true, invite_token_hash = $2, invite_expires = now() + interval '14 days' WHERE id = $1", [pid.data, sha256(token)])
    link = (await appUrl()) + '/client/welcome/' + token
    await sendPortalInviteEmail(p.email, p.name, p.client, link)
  } else await db().query('UPDATE services.people SET portal_access = true WHERE id = $1', [pid.data])
  await audit({ event, actorUserId: user.userId, action: 'services.portal_access', objectType: 'client', objectId: cid.data, detail: { person: p.name, invited: b.data.send } })
  return { ok: true, invited: b.data.send }
})
