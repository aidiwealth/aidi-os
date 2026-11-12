// Move data room files: { ids, room_id?, folder? }. A file moved to another room drops out of the old room's
// tracked links that listed it; the category (folder) is set as given.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), room_id: z.string().uuid().optional(), folder: z.string().trim().min(1).max(60).optional() }).safeParse(await readBody(event))
  if (!b.success || (!b.data.room_id && !b.data.folder)) throw apiError('invalid', 'Choose a data room or a category.')
  const d = b.data
  if (d.room_id && !(await db().query('SELECT 1 FROM fundraise.rooms WHERE id = $1', [d.room_id])).rowCount) throw apiError('not_found', 'That data room no longer exists.', 404)
  if (d.room_id) await db().query('UPDATE fundraise.links l SET file_ids = array(SELECT x FROM unnest(l.file_ids) x WHERE NOT x = ANY($1::uuid[])) WHERE l.file_ids && $1::uuid[] AND l.room_id IS DISTINCT FROM $2', [d.ids, d.room_id])
  const r = await db().query('UPDATE fundraise.files SET room_id = coalesce($2, room_id), folder = coalesce($3, folder) WHERE id = ANY($1::uuid[])', [d.ids, d.room_id ?? null, d.folder ?? null])
  await audit({ event, actorUserId: user.userId, action: 'fundraising.files_moved', objectType: 'data_room', objectId: d.room_id, detail: { files: r.rowCount, folder: d.folder ?? null } })
  return { ok: true, moved: r.rowCount }
})
