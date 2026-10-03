// A call or distribution: its lines per LP, approvals and progress.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const c = await db().query(
    `SELECT c.id, c.fund_id, e.name AS fund, f.currency, c.kind, c.number, c.purpose, c.total_amount::text, to_char(c.due_date, 'YYYY-MM-DD') AS due_date, c.status, c.required_approvals, c.created_at, c.sent_at, p.full_name AS created_by
       FROM funds.calls c JOIN funds.funds f ON f.id = c.fund_id JOIN core.entities e ON e.id = f.entity_id LEFT JOIN core.users u ON u.id = c.created_by LEFT JOIN core.people p ON p.id = u.person_id WHERE c.id = $1`, [id.data])
  if (!c.rows[0]) throw apiError('not_found', 'Not found', 404)
  const lines = await db().query(
    `SELECT l.id, l.lp_id, lp.name, lp.email, l.amount::text, l.paid_amount::text, to_char(l.paid_on, 'YYYY-MM-DD') AS paid_on FROM funds.call_lines l JOIN funds.lps lp ON lp.id = l.lp_id WHERE l.call_id = $1 ORDER BY l.amount DESC`, [id.data])
  const appr = await db().query(`SELECT a.user_id, p.full_name AS name, a.decided_at FROM funds.call_approvals a JOIN core.users u ON u.id = a.user_id JOIN core.people p ON p.id = u.person_id WHERE a.call_id = $1 ORDER BY a.decided_at`, [id.data])
  return { call: c.rows[0], lines: lines.rows, approvals: appr.rows, iAmGp: user.roles.includes('gp'), iApproved: appr.rows.some((a: { user_id: string }) => a.user_id === user.userId) }
})
