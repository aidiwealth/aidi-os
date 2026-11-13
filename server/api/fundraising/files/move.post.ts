// Move or order data room files.
//   { ids, folder_id }            into that folder (any room); out of the old room's tracked links if the room changes
//   { ids, room_id?, folder? }    into a top-level category by name (made if new)
//   { ids, order: true }          these files, in this order, within their folder
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), folder_id: z.string().uuid().optional(), room_id: z.string().uuid().optional(), folder: z.string().trim().min(1).max(60).optional(), order: z.boolean().optional() }).safeParse(await readBody(event))
  if (!b.success || (!b.data.room_id && !b.data.folder && !b.data.folder_id && !b.data.order)) throw apiError('invalid', 'Choose where to move it.')
  const d = b.data
  if (d.order) { await db().query('UPDATE fundraise.files f SET sort = o.i FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, i) WHERE f.id = o.id', [d.ids]); return { ok: true } }
  let room = d.room_id ?? null
  if (d.folder_id) {
    const f = (await db().query<{ room_id: string; link_url: string | null }>('SELECT room_id, link_url FROM fundraise.folders WHERE id = $1', [d.folder_id])).rows[0]
    if (!f || f.link_url) throw apiError('not_found', 'Choose a folder.', 404)
    room = f.room_id
  } else if (room && !(await db().query('SELECT 1 FROM fundraise.rooms WHERE id = $1', [room])).rowCount) throw apiError('not_found', 'That data room no longer exists.', 404)
  if (room) await db().query('UPDATE fundraise.links l SET file_ids = array(SELECT x FROM unnest(l.file_ids) x WHERE NOT x = ANY($1::uuid[])) WHERE l.file_ids && $1::uuid[] AND l.room_id IS DISTINCT FROM $2', [d.ids, room])
  const r = d.folder_id
    ? await db().query('UPDATE fundraise.files SET room_id = $2, folder_id = $3 WHERE id = ANY($1::uuid[]) AND NOT is_deck', [d.ids, room, d.folder_id])
    : await db().query('UPDATE fundraise.files SET room_id = coalesce($2, room_id), folder = coalesce($3, folder), folder_id = CASE WHEN $3::text IS NULL AND $2::uuid IS NULL THEN folder_id ELSE NULL END WHERE id = ANY($1::uuid[])', [d.ids, room, d.folder ?? null])
  await audit({ event, actorUserId: user.userId, action: 'fundraising.files_moved', objectType: 'data_room', objectId: room ?? undefined, detail: { files: r.rowCount, folder: d.folder ?? null, folder_id: d.folder_id ?? null } })
  return { ok: true, moved: r.rowCount }
})
