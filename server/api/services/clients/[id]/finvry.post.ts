// Give a client contact a Finvry account in the client's company workspace (created if needed). send: email them now.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const cid = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ person_id: z.string().uuid(), send: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!cid.success || !b.success) throw apiError('invalid', 'Invalid request.')
  const p = (await db().query<{ name: string; email: string | null }>('SELECT name, email FROM services.people WHERE id = $1 AND client_id = $2', [b.data.person_id, cid.data])).rows[0]
  if (!p) throw apiError('not_found', 'Person not found', 404)
  if (!p.email) throw apiError('invalid', 'Add their email first: sign-in is by emailed code.')
  const op = currentOrgId()
  const ws = await workspaceForClient(event, cid.data)
  const added = await addWorkspaceUser(ws.orgId, p.email, p.name, ws.created ? 'admin' : 'team')
  await db().query('UPDATE services.people SET portal_access = true WHERE id = $1', [b.data.person_id])
  let emailed = false
  if (b.data.send) { setOrgContext(ws.orgId); try { await sendInviteEmail(p.email, p.name, 'the Aidi team'); emailed = true } catch (err) { console.error('[services] finvry invite failed', err) } finally { setOrgContext(op) } }
  await audit({ event, actorUserId: user.userId, action: 'services.finvry_access', objectType: 'client', objectId: cid.data, detail: { person: p.name, added, emailed } })
  return { ok: true, added, emailed, workspace_created: ws.created }
})
