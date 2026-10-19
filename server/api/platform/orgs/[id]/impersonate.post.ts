// Log in as: open a Finvry customer's account as one of its users (the owner when none is chosen), with a reason.
// View only unless changes are allowed; changes need a console role that can edit customers. 30 minutes, recorded,
// and shown to the customer. Never for Aidi OS workspaces.
import { z } from 'zod'
const Body = z.object({ user_id: z.string().uuid().nullable().optional(), reason: z.string().trim().min(3, 'Say why you need access.').max(500), can_edit: z.boolean().default(false) })
export default defineEventHandler(async (event) => {
  const b = Body.safeParse(await readBody(event).catch(() => ({})))
  if (!b.success) throw apiError('invalid', b.error.issues[0]?.message ?? 'Invalid request.')
  const staff = await requirePlatform(event, b.data.can_edit)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('invalid', 'Invalid request.')
  return { ok: true, ...(await supportSignIn(event, staff.userId, id.data, { userId: b.data.user_id ?? null, reason: b.data.reason, canEdit: b.data.can_edit, minutes: 30 })) }
})
