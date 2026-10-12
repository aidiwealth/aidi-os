// Log or update a meeting's minutes.
import { z } from 'zod'
const Action = z.object({ text: z.string().trim().min(1).max(500), owner_id: z.string().uuid().nullable().optional(), owner: z.string().trim().max(200).nullable().optional(), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('').transform(() => null)), done: z.boolean().default(false) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'family', 'admin')
  const b = z.object({ id: z.string().uuid().optional(), title: z.string().trim().min(1).max(200), kind: z.enum(['team', 'board', 'investor', 'client', 'partner', 'one_on_one', 'other']).default('team'), entity_id: z.string().uuid().nullable().optional(),
    held_at: z.string().min(10).max(40), minutes_long: z.coerce.number().int().min(1).max(1440).nullable().optional(), location: z.string().trim().max(300).default(''), attendees: z.array(z.string().uuid()).max(100).default([]), guests: z.string().trim().max(1000).default(''),
    agenda: z.string().max(20000).default(''), summary: z.string().max(4000).default(''), notes: z.string().max(60000).default(''), decisions: z.string().max(20000).default(''), actions: z.array(Action).max(100).default([]), status: z.enum(['draft', 'final']).default('draft') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add a title and when the meeting was held.')
  const d = b.data
  const at = new Date(d.held_at); if (isNaN(at.getTime())) throw apiError('invalid', 'Choose a valid date and time.')
  if (d.entity_id && !(await db().query('SELECT 1 FROM core.entities WHERE id = $1', [d.entity_id])).rowCount) throw apiError('invalid', 'Choose one of your entities.')
  const vals = [d.title, d.kind, d.entity_id ?? null, at.toISOString(), d.minutes_long ?? null, d.location || null, d.attendees, d.guests || null, d.agenda || null, d.summary || null, d.notes || null, d.decisions || null, JSON.stringify(d.actions), d.status]
  let id = d.id
  if (id) { const r = await db().query('UPDATE core.meeting_minutes SET title = $2, kind = $3, entity_id = $4, held_at = $5, minutes_long = $6, location = $7, attendees = $8, guests = $9, agenda = $10, summary = $11, notes = $12, decisions = $13, actions = $14, status = $15, updated_at = now() WHERE id = $1', [id, ...vals]); if (!r.rowCount) throw apiError('not_found', 'Not found', 404) }
  else id = (await one<{ id: string }>('INSERT INTO core.meeting_minutes (title, kind, entity_id, held_at, minutes_long, location, attendees, guests, agenda, summary, notes, decisions, actions, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id', [...vals, user.userId])).id
  await audit({ event, actorUserId: user.userId, action: 'meetings.saved', objectType: 'meeting', objectId: id, detail: { status: d.status } })
  return { ok: true, id }
})
