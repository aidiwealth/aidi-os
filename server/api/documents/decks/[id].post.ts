import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  const b = z.object({ title: z.string().trim().min(1).max(200).optional(), primary: z.boolean().optional(), require_email: z.boolean().optional(), allow_download: z.boolean().optional(), archive: z.boolean().optional(), new_link: z.boolean().optional(), delete: z.boolean().optional() }).safeParse(await readBody(event))
  if (!/^[0-9a-f-]{36}$/.test(id) || !b.success) throw apiError('invalid', 'Invalid request.')
  const d = b.data
  if (d.delete) { await db().query('DELETE FROM fundraise.decks WHERE id = $1', [id]); await audit({ event, actorUserId: user.userId, action: 'deck.delete', objectType: 'deck', objectId: id }); return { ok: true, deleted: true } }
  if (d.primary) await db().query('UPDATE fundraise.decks SET primary_deck = (id = $1)', [id])
  await db().query('UPDATE fundraise.decks SET title = coalesce($2, title), require_email = coalesce($3, require_email), allow_download = coalesce($4, allow_download), active = CASE WHEN $5 THEN false ELSE active END, token = CASE WHEN $6 THEN $7 ELSE token END, updated_at = now() WHERE id = $1',
    [id, d.title ?? null, d.require_email ?? null, d.allow_download ?? null, !!d.archive, !!d.new_link, newDeckToken()])
  await audit({ event, actorUserId: user.userId, action: 'deck.update', objectType: 'deck', objectId: id })
  return { ok: true }
})
