// Move existing services clients to Finvry: each gets a company workspace (free plan) and its contacts become users.
// dry_run lists what would happen. No emails are sent; people sign in at Finvry with their email when ready.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = z.object({ dry_run: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  if (currentOrgId() !== await operatorOrgId()) throw apiError('forbidden', 'Only the services operator can do this.', 403)
  const clients = await db().query<{ id: string; name: string; email: string; contact_name: string; workspace_id: string | null }>('SELECT id, name, email, contact_name, workspace_id FROM services.clients ORDER BY name')
  const out = []
  for (const c of clients.rows) {
    const people = await db().query<{ name: string; email: string }>("SELECT name, lower(email) AS email FROM services.people WHERE client_id = $1 AND email IS NOT NULL AND portal_access", [c.id])
    const users = [{ name: c.contact_name, email: c.email.toLowerCase() }, ...people.rows.filter((p) => p.email !== c.email.toLowerCase())]
    if (b.data.dry_run || c.workspace_id) { out.push({ client: c.name, already: !!c.workspace_id, users: users.map((u) => u.email) }); continue }
    const ws = await workspaceForClient(event, c.id)
    for (const u of users.slice(1)) await addWorkspaceUser(ws.orgId, u.email, u.name, 'team')
    out.push({ client: c.name, already: false, users: users.map((u) => u.email) })
  }
  if (!b.data.dry_run) await audit({ event, actorUserId: user.userId, action: 'services.finvry_move', objectType: 'organization', objectId: currentOrgId()!, detail: { clients: out.length } })
  return { dry_run: b.data.dry_run, clients: out }
})
