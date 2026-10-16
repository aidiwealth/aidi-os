// Mark several notices done, archived or new at once.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(200), status: z.enum(['new', 'done', 'archived']) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose notices.')
  const r = await db().query("UPDATE inbox.notices SET status = $2, done_by = CASE WHEN $2 = 'done' THEN $3::uuid ELSE NULL END, done_at = CASE WHEN $2 = 'done' THEN now() ELSE NULL END WHERE id = ANY($1::uuid[])", [b.data.ids, b.data.status, user.userId])
  return { ok: true, count: r.rowCount ?? 0 }
})
