// Support access: sign in to a customer workspace as its owner to fix something. The console session is kept in a
// separate cookie so "Return to console" restores it. Audited; Finvry customer workspaces only. No invite needed:
// a services client's workspace gets its owner set up quietly (no email).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('invalid', 'Invalid request.')
  return { ok: true, ...(await supportSignIn(event, staff.userId, id.data)) }
})
