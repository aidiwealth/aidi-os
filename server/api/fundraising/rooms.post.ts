// Create or rename a data room: { id?, name, description?, financing?, financing_folder? }. financing: cap table
// documents are filed in this room (only one room at a time), under financing_folder or else by funding round.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default(''), financing: z.boolean().optional(), financing_folder: z.string().trim().max(60).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Name the data room.')
  const d = b.data
  const id = d.id
    ? (await db().query<{ id: string }>('UPDATE fundraise.rooms SET name = $2, description = nullif($3, \'\') WHERE id = $1 RETURNING id', [d.id, d.name, d.description])).rows[0]?.id
    : (await one<{ id: string }>("INSERT INTO fundraise.rooms (name, description, created_by) VALUES ($1, nullif($2, ''), $3) RETURNING id", [d.name, d.description, user.userId])).id
  if (!id) throw apiError('not_found', 'Not found', 404)
  if (d.financing !== undefined) {
    if (d.financing) await db().query('UPDATE fundraise.rooms SET financing = (id = $1)', [id])
    else await db().query('UPDATE fundraise.rooms SET financing = false WHERE id = $1', [id])
    await db().query("UPDATE fundraise.rooms SET financing_folder = nullif($2, '') WHERE id = $1", [id, d.financing_folder ?? ''])
  }
  await audit({ event, actorUserId: user.userId, action: d.id ? 'fundraising.room_renamed' : 'fundraising.room_created', objectType: 'data_room', objectId: id })
  return { ok: true, id }
})
