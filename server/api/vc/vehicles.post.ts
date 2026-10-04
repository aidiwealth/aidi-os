// Add or rename a fund vehicle: { id?, name, kind: fund | spv, status? }
import { z } from 'zod'
const Body = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200), kind: z.enum(['fund', 'spv']).default('fund'), status: z.enum(['active', 'closed']).default('active') })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Name the fund or SPV.')
  const d = b.data
  const r = d.id
    ? await db().query<{ id: string }>("UPDATE core.entities SET name = $2, kind = $3, status = $4 WHERE id = $1 AND kind IN ('fund','spv') RETURNING id", [d.id, d.name, d.kind, d.status])
    : await db().query<{ id: string }>('INSERT INTO core.entities (name, kind, status) VALUES ($1,$2,$3) RETURNING id', [d.name, d.kind, d.status])
  if (!r.rows[0]) throw apiError('not_found', 'Fund vehicle not found', 404)
  await audit({ event, actorUserId: user.userId, action: d.id ? 'vc.vehicle_update' : 'vc.vehicle_create', objectType: 'entity', objectId: r.rows[0].id, detail: { name: d.name, kind: d.kind } })
  return { ok: true, id: r.rows[0].id }
})
