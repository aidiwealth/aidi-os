// Add or update an entity (admins). { id?, name, legal_name?, kind, jurisdiction?, status, parent_id? }
import { z } from 'zod'
const Body = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  legal_name: z.string().trim().max(300).optional(),
  kind: z.enum(['holding', 'operating', 'fund', 'gp', 'management_company', 'trust', 'household', 'spv', 'other']),
  jurisdiction: z.string().trim().max(20).optional(),
  status: z.enum(['active', 'forming', 'dormant', 'closed']),
  parent_id: z.string().uuid().nullable().optional()
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add a name, type and status.')
  const d = b.data
  if (d.id && d.parent_id === d.id) throw apiError('invalid', 'An entity cannot be its own parent.')
  if (d.id && !(await db().query('SELECT 1 FROM core.entities WHERE id = $1', [d.id])).rowCount) throw apiError('not_found', 'Entity not found', 404)
  const row = d.id
    ? await one<{ id: string }>('UPDATE core.entities SET name=$2, legal_name=$3, kind=$4, jurisdiction=$5, status=$6, parent_id=$7 WHERE id=$1 RETURNING id',
        [d.id, d.name, d.legal_name || null, d.kind, d.jurisdiction || null, d.status, d.parent_id ?? null])
    : await one<{ id: string }>('INSERT INTO core.entities (name, legal_name, kind, jurisdiction, status, parent_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [d.name, d.legal_name || null, d.kind, d.jurisdiction || null, d.status, d.parent_id ?? null])
  await audit({ event, actorUserId: user.userId, action: d.id ? 'entity.update' : 'entity.create', objectType: 'entity', objectId: row.id, entityId: row.id, detail: { name: d.name } })
  return { ok: true, id: row.id }
})
