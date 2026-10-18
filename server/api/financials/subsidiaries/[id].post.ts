// Rename a Financials page (the company or a subsidiary) or change a subsidiary's currency.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  const b = z.object({ name: z.string().trim().min(2).max(120).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional() }).safeParse(await readBody(event))
  if (!b.success || !/^[0-9a-f-]{36}$/.test(id)) throw apiError('invalid', 'Check the name.')
  const e = (await db().query<{ parent_id: string | null }>("SELECT parent_id FROM core.entities WHERE id = $1 AND kind = 'operating'", [id])).rows[0]
  if (!e) throw apiError('not_found', 'Not found', 404)
  if (b.data.name) {
    const dup = await db().query('SELECT 1 FROM core.entities WHERE lower(name) = lower($1) AND id <> $2', [b.data.name, id])
    if (dup.rowCount) throw apiError('taken', 'You already have an entity with that name.', 409)
  }
  await db().query('UPDATE core.entities SET name = coalesce($2, name), currency = CASE WHEN $3::text IS NOT NULL AND parent_id IS NOT NULL THEN $3 ELSE currency END WHERE id = $1', [id, b.data.name ?? null, b.data.currency ?? null])
  await audit({ event, actorUserId: user.userId, action: 'financials.entity_rename', objectType: 'entity', objectId: id, detail: b.data })
  return { ok: true }
})
