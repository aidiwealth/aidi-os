// A category (folder) in a data room: { room_id, folder, rename? } renames it for every file in it;
// { room_id, folder, to_room } moves its files to another room (same category there); to_room 'new' makes it a
// data room of its own, named after it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ room_id: z.string().uuid(), folder: z.string().trim().min(1).max(60), rename: z.string().trim().min(1).max(60).optional(), to_room: z.union([z.string().uuid(), z.literal('new')]).optional() }).safeParse(await readBody(event))
  if (!b.success || (!b.data.rename && !b.data.to_room)) throw apiError('invalid', 'Give the category a name, or choose a data room.')
  const d = b.data
  const ids = (await db().query<{ id: string }>('SELECT id FROM fundraise.files WHERE room_id = $1 AND folder = $2 AND NOT is_deck', [d.room_id, d.folder])).rows.map((r) => r.id)
  if (!ids.length) throw apiError('not_found', 'That category is empty.', 404)
  let room = d.room_id
  if (d.to_room === 'new') room = (await one<{ id: string }>('INSERT INTO fundraise.rooms (name, created_by) VALUES ($1, $2) RETURNING id', [d.folder, user.userId])).id
  else if (d.to_room) { if (!(await db().query('SELECT 1 FROM fundraise.rooms WHERE id = $1', [d.to_room])).rowCount) throw apiError('not_found', 'That data room no longer exists.', 404); room = d.to_room }
  if (room !== d.room_id) await db().query('UPDATE fundraise.links l SET file_ids = array(SELECT x FROM unnest(l.file_ids) x WHERE NOT x = ANY($1::uuid[])) WHERE l.file_ids && $1::uuid[] AND l.room_id IS DISTINCT FROM $2', [ids, room])
  await db().query('UPDATE fundraise.files SET room_id = $2, folder = $3 WHERE id = ANY($1::uuid[])', [ids, room, d.to_room === 'new' ? 'General' : (d.rename ?? d.folder)])
  // A room set to file cap table documents under this category follows the new name.
  if (d.rename) await db().query('UPDATE fundraise.rooms SET financing_folder = $3 WHERE id = $1 AND financing_folder = $2', [d.room_id, d.folder, d.rename])
  await audit({ event, actorUserId: user.userId, action: 'fundraising.folder_changed', objectType: 'data_room', objectId: room, detail: { folder: d.folder, rename: d.rename ?? null, files: ids.length } })
  return { ok: true, room_id: room }
})
