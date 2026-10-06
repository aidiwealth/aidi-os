// Update a notice: status, entity, deadline; or turn it into a compliance reminder.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  const b = z.object({ status: z.enum(['new', 'done', 'archived']).optional(), entity_id: z.string().uuid().nullable().optional(), due_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional(),
    reminder: z.object({ title: z.string().trim().min(1).max(200), entity_id: z.string().uuid(), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), recurrence: z.enum(['none', 'annual', 'quarterly', 'monthly']).default('none') }).optional() }).safeParse(await readBody(event))
  if (!/^[0-9a-f-]{36}$/.test(id) || !b.success) throw apiError('invalid', 'Invalid request.')
  const d = b.data
  if (d.status) await db().query('UPDATE inbox.notices SET status = $2, done_by = CASE WHEN $2 = \'done\' THEN $3::uuid ELSE NULL END, done_at = CASE WHEN $2 = \'done\' THEN now() ELSE NULL END WHERE id = $1', [id, d.status, user.userId])
  if (d.entity_id !== undefined) await db().query('UPDATE inbox.notices SET entity_id = $2 WHERE id = $1', [id, d.entity_id])
  if (d.due_date !== undefined) await db().query('UPDATE inbox.notices SET due_date = $2 WHERE id = $1', [id, d.due_date || null])
  if (d.reminder) {
    const n = (await db().query<{ subject: string; summary: string | null }>('SELECT subject, summary FROM inbox.notices WHERE id = $1', [id])).rows[0]
    await db().query("INSERT INTO compliance.obligations (entity_id, title, category, recurrence, next_due, reminder_days, notes) VALUES ($1,$2,'other',$3,$4,14,$5)", [d.reminder.entity_id, d.reminder.title, d.reminder.recurrence, d.reminder.due, ('From mail notice: ' + (n?.subject ?? '') + (n?.summary ? ' — ' + n.summary : '')).slice(0, 2900)])
    await db().query("UPDATE inbox.notices SET status = 'done', done_by = $2, done_at = now(), due_date = $3, entity_id = $4 WHERE id = $1", [id, user.userId, d.reminder.due, d.reminder.entity_id])
  }
  return { ok: true }
})
