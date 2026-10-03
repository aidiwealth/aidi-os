import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'family')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const o = await db().query(
    `SELECT o.*, to_char(o.next_due, 'YYYY-MM-DD') AS next_due, e.name AS entity, (o.next_due - current_date)::int AS days_left
       FROM compliance.obligations o JOIN core.entities e ON e.id = o.entity_id WHERE o.id = $1`, [id.data])
  if (o.rowCount !== 1) throw apiError('not_found', 'Not found', 404)
  const levels = visibleLevels(user.roles)
  const h = await db().query(
    `SELECT c.id, to_char(c.due_date, 'YYYY-MM-DD') AS due_date, to_char(c.completed_on, 'YYYY-MM-DD') AS completed_on, c.note, p.full_name AS by_name,
            CASE WHEN d.sensitivity = ANY($2::text[]) THEN d.id END AS document_id, d.title AS document_title
       FROM compliance.completions c LEFT JOIN core.users u ON u.id = c.completed_by LEFT JOIN core.people p ON p.id = u.person_id
       LEFT JOIN core.documents d ON d.id = c.document_id WHERE c.obligation_id = $1 ORDER BY c.due_date DESC`, [id.data, levels])
  return { obligation: o.rows[0], history: h.rows }
})
