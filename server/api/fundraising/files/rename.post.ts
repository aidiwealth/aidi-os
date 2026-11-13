// Rename a data room file: { id, title }. The name investors see; the document itself is unchanged.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Give the file a name.')
  const r = await db().query('UPDATE fundraise.files SET title = $2 WHERE id = $1', [b.data.id, b.data.title])
  if (!r.rowCount) throw apiError('not_found', 'That file no longer exists.', 404)
  await audit({ event, actorUserId: user.userId, action: 'fundraising.file_renamed', objectType: 'data_room', objectId: b.data.id, detail: { title: b.data.title } })
  return { ok: true }
})
