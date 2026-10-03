// Add or edit an obligation. { id?, entity_id, title, category, jurisdiction?, recurrence, next_due, reminder_days, owner_id?, notes?, active? }
import { z } from 'zod'
const Body = z.object({
  id: z.string().uuid().optional(),
  entity_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  category: z.enum(CATEGORY_KEYS),
  jurisdiction: z.string().trim().max(20).optional(),
  recurrence: z.enum(RECURRENCES),
  next_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reminder_days: z.coerce.number().int().min(0).max(120).default(14),
  owner_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(3000).optional(),
  active: z.boolean().default(true)
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the entity, a title, the type, how often and the next due date.')
  const d = b.data
  const vals = [d.entity_id, d.title, d.category, d.jurisdiction || null, d.recurrence, d.next_due, d.reminder_days, d.owner_id ?? null, d.notes || null, d.active]
  if (d.id && !(await db().query('SELECT 1 FROM compliance.obligations WHERE id = $1', [d.id])).rowCount) throw apiError('not_found', 'Obligation not found', 404)
  const row = d.id
    ? await one<{ id: string }>('UPDATE compliance.obligations SET entity_id=$2, title=$3, category=$4, jurisdiction=$5, recurrence=$6, next_due=$7, reminder_days=$8, owner_id=$9, notes=$10, active=$11 WHERE id=$1 RETURNING id', [d.id, ...vals])
    : await one<{ id: string }>('INSERT INTO compliance.obligations (entity_id, title, category, jurisdiction, recurrence, next_due, reminder_days, owner_id, notes, active, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id', [...vals, user.userId])
  await audit({ event, actorUserId: user.userId, action: d.id ? 'compliance.update' : 'compliance.create', objectType: 'obligation', objectId: row.id, entityId: d.entity_id, detail: { title: d.title, next_due: d.next_due } })
  return { ok: true, id: row.id }
})
