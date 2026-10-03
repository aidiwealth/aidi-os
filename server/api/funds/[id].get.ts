// One fund: terms, totals and multiples, LPs, calls and distributions, NAV history, investments.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Fund not found', 404)
  const p = await fundPosition(id.data)
  if (!p) throw apiError('not_found', 'Fund not found', 404)
  const calls = await db().query(
    `SELECT c.id, c.kind, c.number, c.purpose, c.total_amount::text, to_char(c.due_date, 'YYYY-MM-DD') AS due_date, c.status,
            (SELECT coalesce(sum(paid_amount), 0)::text FROM funds.call_lines WHERE call_id = c.id) AS paid
       FROM funds.calls c WHERE c.fund_id = $1 ORDER BY c.created_at DESC`, [id.data])
  const navs = await db().query("SELECT id, to_char(as_of, 'YYYY-MM-DD') AS as_of, nav::text, note FROM funds.navs WHERE fund_id = $1 ORDER BY as_of DESC", [id.data])
  const inv = await db().query("SELECT id, company, check_usd::text, to_char(closed_at, 'YYYY-MM-DD') AS closed_at FROM deals.deals WHERE vehicle_entity_id = $1 AND stage = 'invested' ORDER BY closed_at DESC NULLS LAST", [p.fund.entity_id])
  const lps = await db().query('SELECT id, name FROM funds.lps ORDER BY name')
  return { ...p, calls: calls.rows, navs: navs.rows, investments: inv.rows, allLps: lps.rows, required: await requiredApprovals() }
})
