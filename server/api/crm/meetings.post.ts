// Add or update a meeting with an investor.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = z.object({ id: z.string().uuid().optional(), deal_id: z.string().uuid(), title: z.string().trim().min(1).max(200), starts_at: z.string().datetime({ offset: true }), ends_at: z.string().datetime({ offset: true }),
    location: z.string().trim().max(500).default(''), notes: z.string().max(3000).default(''), remind_minutes: z.number().int().min(5).max(10080).nullable().default(60), source: z.enum(['manual', 'ics', 'calendar']).default('manual'), uid: z.string().max(300).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the meeting details.')
  const d = b.data
  if (new Date(d.ends_at) <= new Date(d.starts_at)) throw apiError('invalid', 'The meeting must end after it starts.')
  const deal = (await db().query<{ contact_id: string | null }>('SELECT contact_id FROM crm.deals WHERE id = $1', [d.deal_id])).rows[0]
  if (!deal) throw apiError('not_found', 'Investor not found', 404)
  const args = [d.deal_id, deal.contact_id, d.title, d.starts_at, d.ends_at, d.location || null, d.notes || null, d.remind_minutes]
  if (d.id) { await db().query('UPDATE crm.meetings SET deal_id = $2, contact_id = $3, title = $4, starts_at = $5, ends_at = $6, location = $7, notes = $8, remind_minutes = $9, reminded_at = NULL WHERE id = $1', [d.id, ...args]); return { ok: true, id: d.id } }
  try {
    const id = (await one<{ id: string }>('INSERT INTO crm.meetings (deal_id, contact_id, title, starts_at, ends_at, location, notes, remind_minutes, source, uid, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id', [...args, d.source, d.uid ?? null, user.userId])).id
    await db().query('UPDATE crm.deals SET updated_at = now() WHERE id = $1', [d.deal_id])
    return { ok: true, id }
  } catch (err) { if (String((err as Error).message).includes('meetings_uid')) throw apiError('exists', 'This meeting is already on your pipeline.', 409); throw err }
})
