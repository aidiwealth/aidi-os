// Desk: update the program, add/edit/remove investors, schedule or cancel meetings.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireOperator(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const money = z.union([z.coerce.number().min(0).max(1e12), z.literal('').transform(() => null), z.null()]).optional()
  const b = z.object({
    program: z.object({ status: z.enum(['intake', 'active', 'paused', 'closed']).optional(), target: money, fee_pct: z.coerce.number().min(0).max(30).optional() }).optional(),
    investor: z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), name: z.string().trim().min(1).max(200).optional(), firm: z.string().trim().max(200).optional(), email: z.string().trim().max(254).optional(),
      ticket: money, committed: money, status: z.enum(['target', 'contacted', 'meeting', 'diligence', 'term_sheet', 'committed', 'closed', 'passed']).optional(), next_step: z.string().max(500).optional(), notes: z.string().max(5000).optional(), terms: z.string().max(5000).optional(), visible: z.boolean().optional() }).optional(),
    meeting: z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), investor_id: z.string().uuid().nullable().optional(), title: z.string().trim().min(1).max(200).optional(), starts_at: z.string().optional(), minutes: z.number().int().min(15).max(480).optional(), location: z.string().max(500).optional(), agenda: z.string().max(3000).optional() }).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the details.')
  const d = b.data
  if (d.program) await db().query('UPDATE services.raise_programs SET status = coalesce($2, status), target = CASE WHEN $3 THEN $4 ELSE target END, fee_pct = coalesce($5, fee_pct), updated_at = now() WHERE id = $1', [id, d.program.status ?? null, d.program.target !== undefined, d.program.target ?? null, d.program.fee_pct ?? null])
  if (d.investor) {
    const i = d.investor
    if (i.id && i.delete) await db().query('DELETE FROM services.raise_investors WHERE id = $1 AND program_id = $2', [i.id, id])
    else if (i.id) await db().query(`UPDATE services.raise_investors SET name = coalesce($3, name), firm = CASE WHEN $4::text IS NULL THEN firm ELSE nullif($4, '') END, email = CASE WHEN $5::text IS NULL THEN email ELSE nullif($5, '') END,
        ticket = CASE WHEN $6 THEN $7 ELSE ticket END, committed = CASE WHEN $8 THEN $9 ELSE committed END, status = coalesce($10, status), next_step = coalesce($11, next_step), notes = coalesce($12, notes), terms = coalesce($13, terms), visible = coalesce($14, visible), updated_at = now() WHERE id = $1 AND program_id = $2`,
      [i.id, id, i.name ?? null, i.firm ?? null, i.email ?? null, i.ticket !== undefined, i.ticket ?? null, i.committed !== undefined, i.committed ?? null, i.status ?? null, i.next_step ?? null, i.notes ?? null, i.terms ?? null, i.visible ?? null])
    else if (i.name) await db().query('INSERT INTO services.raise_investors (program_id, name, firm, email, ticket, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, i.name, i.firm || null, i.email || null, i.ticket ?? null, i.status ?? 'target', i.notes || null])
  }
  if (d.meeting) {
    const m = d.meeting
    if (m.id && m.delete) await db().query('DELETE FROM services.raise_meetings WHERE id = $1 AND program_id = $2', [m.id, id])
    else if (m.title && m.starts_at) {
      const at = new Date(m.starts_at); if (isNaN(at.getTime())) throw apiError('invalid', 'Choose a valid date and time.')
      const row = await one<{ id: string }>('INSERT INTO services.raise_meetings (program_id, investor_id, title, starts_at, minutes, location, agenda) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [id, m.investor_id ?? null, m.title, at.toISOString(), m.minutes ?? 30, m.location || null, m.agenda || null])
      if (m.investor_id) await db().query("UPDATE services.raise_investors SET status = CASE WHEN status IN ('target','contacted') THEN 'meeting' ELSE status END, updated_at = now() WHERE id = $1", [m.investor_id])
      const v = (await db().query<{ client: string; email: string | null; investor: string | null }>('SELECT c.name AS client, c.email, i.name AS investor FROM services.raise_programs p JOIN services.clients c ON c.id = p.client_id LEFT JOIN services.raise_investors i ON i.id = $2 WHERE p.id = $1', [id, m.investor_id ?? null])).rows[0]
      if (v?.email && at > new Date()) { try { await emailRaiseMeeting(v.email, v.client, { title: m.title, starts_at: at.toISOString(), minutes: m.minutes ?? 30, location: m.location || null, agenda: m.agenda || null, investor: v.investor }, 'new') } catch (err) { console.error('[raise] meeting email', err) } }
      void row
    }
  }
  await audit({ event, actorUserId: user.userId, action: 'services.raise_update', objectType: 'raise_program', objectId: id })
  return { ok: true }
})
