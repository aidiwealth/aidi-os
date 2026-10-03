// One LP: details and their position in each fund.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'LP not found', 404)
  const lp = await db().query("SELECT id, name, kind, contact_name, email, country, kyc_status, notes, (portal_token_expires > now()) AS portal, to_char(portal_token_expires, 'YYYY-MM-DD') AS portal_expires FROM funds.lps WHERE id = $1", [id.data])
  if (!lp.rows[0]) throw apiError('not_found', 'LP not found', 404)
  const funds = await db().query<{ fund_id: string }>('SELECT fund_id FROM funds.commitments WHERE lp_id = $1', [id.data])
  const positions = []
  for (const f of funds.rows) {
    const p = await fundPosition(f.fund_id)
    const mine = p?.lps.find((x) => x.lp_id === id.data)
    if (p && mine) positions.push({ fund_id: f.fund_id, fund: p.fund.name, currency: p.fund.currency, ...mine })
  }
  const history = await db().query(
    `SELECT c.id, e.name AS fund, f.currency, c.kind, c.number, to_char(c.due_date, 'YYYY-MM-DD') AS due_date, c.status, l.amount::text, l.paid_amount::text, to_char(l.paid_on, 'YYYY-MM-DD') AS paid_on
       FROM funds.call_lines l JOIN funds.calls c ON c.id = l.call_id JOIN funds.funds f ON f.id = c.fund_id JOIN core.entities e ON e.id = f.entity_id
      WHERE l.lp_id = $1 AND c.status IN ('sent','completed') ORDER BY c.due_date DESC`, [id.data])
  return { lp: lp.rows[0], positions, history: history.rows }
})
