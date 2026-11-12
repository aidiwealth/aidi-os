// Fold one data room into another: { from, into, as_category }. Its files move across, either all under one
// category named after the old room (as_category) or keeping their own categories; its tracked links move too and
// keep working. If the old room received cap table documents, the new one does from now on.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ from: z.string().uuid(), into: z.string().uuid(), as_category: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!b.success || b.data.from === b.data.into) throw apiError('invalid', 'Choose a different data room to move it into.')
  const d = b.data
  const rs = (await db().query<{ id: string; name: string; financing: boolean; financing_folder: string | null }>('SELECT id, name, financing, financing_folder FROM fundraise.rooms WHERE id = ANY($1::uuid[])', [[d.from, d.into]])).rows
  const from = rs.find((r) => r.id === d.from), into = rs.find((r) => r.id === d.into)
  if (!from || !into) throw apiError('not_found', 'That data room no longer exists.', 404)
  const cat = from.name.slice(0, 60)
  await db().query('UPDATE fundraise.files SET room_id = $2, folder = CASE WHEN $3 AND NOT is_deck THEN $4 ELSE folder END WHERE room_id = $1', [d.from, d.into, d.as_category, cat])
  await db().query('UPDATE fundraise.links SET room_id = $2 WHERE room_id = $1', [d.from, d.into])
  if (from.financing || from.name.toLowerCase() === 'financing') await db().query('UPDATE fundraise.rooms SET financing = (id = $1), financing_folder = CASE WHEN id = $1 THEN $2 ELSE financing_folder END', [d.into, d.as_category ? cat : from.financing_folder])
  await db().query('DELETE FROM fundraise.rooms WHERE id = $1', [d.from])
  await audit({ event, actorUserId: user.userId, action: 'fundraising.room_merged', objectType: 'data_room', objectId: d.into, detail: { from: from.name, as_category: d.as_category } })
  return { ok: true, id: d.into }
})
