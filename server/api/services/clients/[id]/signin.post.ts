// Set up the client's Finvry account without telling them, and sign in as its owner to prepare it (Finvry console
// staff only). The workspace is created if needed and the client's main contact becomes the owner quietly — no email.
// Invite them later from People ("Give Finvry access + email") when it's ready.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const cid = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!cid.success) throw apiError('invalid', 'Invalid request.')
  const ws = await workspaceForClient(event, cid.data)
  return { ok: true, workspace_created: ws.created, ...(await supportSignIn(event, staff.userId, ws.orgId)) }
})
